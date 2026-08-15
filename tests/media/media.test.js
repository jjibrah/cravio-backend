import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { MemoryUsers } from '../helpers/test-app.js';
import { menuApp, owner, restaurantA, restaurantB, validItem } from '../menu/menu-test-helpers.js';

class MemoryMedia {
  constructor() { this.rows = []; }
  async createPending(restaurantId, menuItemId, key, mimeType) { const row = { id: randomUUID(), restaurant_id: restaurantId, menu_item_id: menuItemId, status: 'pending', video_storage_key: key, video_url: null, thumbnail_storage_key: null, thumbnail_url: null, mime_type: mimeType }; this.rows.push(row); return row; }
  async findOwned(id, restaurantId) { return this.rows.find((x) => x.id === id && x.restaurant_id === restaurantId && x.status !== 'deleted') || null; }
  async findCurrentForItem(itemId, restaurantId) { return [...this.rows].reverse().find((x) => x.menu_item_id === itemId && x.restaurant_id === restaurantId && x.status === 'ready') || null; }
  async completeVideo(id, restaurantId, data) { const row = await this.findOwned(id, restaurantId); if (!row || row.status !== 'pending') return null; Object.assign(row, { status: 'ready', video_url: data.url, size_bytes: data.size, duration_ms: data.durationMs }); return row; }
  async setThumbnailKey(id, restaurantId, key) { const row = await this.findOwned(id, restaurantId); if (!row || row.status !== 'ready') return null; row.thumbnail_storage_key = key; row.thumbnail_url = null; return row; }
  async completeThumbnail(id, restaurantId, url) { const row = await this.findOwned(id, restaurantId); if (!row?.thumbnail_storage_key) return null; row.thumbnail_url = url; return row; }
  async markDeleted(id, restaurantId) { const row = await this.findOwned(id, restaurantId); if (!row) return null; row.status = 'deleted'; row.video_url = null; row.thumbnail_url = null; return row; }
}

class MemoryStorage {
  constructor() { this.objects = new Map(); this.deleted = []; }
  async createUpload({ key, contentType }) { this.objects.set(key, { size: 1024, contentType, url: `https://cdn.test/${key}` }); return { url: `https://upload.test/${key}`, method: 'PUT', headers: { 'content-type': contentType }, expires_in: 900 }; }
  async inspect(key) { const object = this.objects.get(key); if (!object) throw new Error('missing object'); return object; }
  async delete(key) { this.deleted.push(key); this.objects.delete(key); }
}

async function setupMedia(options = {}) {
  const media = new MemoryMedia(); const storage = new MemoryStorage();
  const setup = menuApp({ ...options, mediaRepository: media, mediaStorage: storage, mediaLimits: { maxVideoBytes: 10000, maxThumbnailBytes: 5000 } });
  const category = await setup.menus.createCategory(restaurantA.id, { name: 'Mains' });
  const item = await setup.menus.createItem(restaurantA.id, validItem(category.id));
  return { ...setup, media, storage, item };
}

test('owner receives a direct video upload URL for their menu item', async () => {
  const setup = await setupMedia();
  const response = await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/mp4' });
  assert.equal(response.status, 201); assert.equal(response.body.data.asset.restaurant_id, restaurantA.id); assert.equal(response.body.data.upload.method, 'PUT');
});
test('media upload requires an active owner and valid media type', async () => {
  const unauthenticated = await setupMedia({ authUserId: null });
  assert.equal((await request(unauthenticated.app).post(`/api/media/menu-items/${unauthenticated.item.id}/video-upload`).send({ mime_type: 'video/mp4' })).status, 401);
  const suspendedUsers = new MemoryUsers([{ ...owner, status: 'suspended' }]); const suspended = await setupMedia({ users: suspendedUsers });
  assert.equal((await request(suspended.app).post(`/api/media/menu-items/${suspended.item.id}/video-upload`).send({ mime_type: 'video/mp4' })).status, 403);
  const normal = await setupMedia();
  assert.equal((await request(normal.app).post(`/api/media/menu-items/${normal.item.id}/video-upload`).send({ mime_type: 'application/octet-stream' })).status, 400);
});
test('owner cannot create or access media for another restaurant item', async () => {
  const setup = await setupMedia(); const foreignCategory = await setup.menus.createCategory(restaurantB.id, { name: 'Foreign' }); const foreignItem = await setup.menus.createItem(restaurantB.id, validItem(foreignCategory.id));
  assert.equal((await request(setup.app).post(`/api/media/menu-items/${foreignItem.id}/video-upload`).send({ mime_type: 'video/mp4' })).status, 404);
  const foreignAsset = await setup.media.createPending(restaurantB.id, foreignItem.id, 'foreign', 'video/mp4');
  assert.equal((await request(setup.app).post(`/api/media/${foreignAsset.id}/complete`).send({})).status, 404);
  assert.equal((await request(setup.app).delete(`/api/media/${foreignAsset.id}`)).status, 404);
});
test('completion inspects storage metadata and exposes ready media', async () => {
  const setup = await setupMedia();
  const upload = await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/webm' });
  const id = upload.body.data.asset.id;
  const complete = await request(setup.app).post(`/api/media/${id}/complete`).send({ duration_ms: 25000 });
  assert.equal(complete.status, 200); assert.equal(complete.body.data.status, 'ready'); assert.equal(complete.body.data.duration_ms, 25000);
  const current = await request(setup.app).get(`/api/media/menu-items/${setup.item.id}`);
  assert.equal(current.body.data.id, id);
});
test('completion rejects mismatched type, oversized object, and repeated completion', async () => {
  const setup = await setupMedia(); const upload = await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/mp4' }); const asset = upload.body.data.asset;
  setup.storage.objects.set(asset.video_storage_key, { size: 1, contentType: 'image/png', url: 'https://cdn.test/bad' });
  assert.equal((await request(setup.app).post(`/api/media/${asset.id}/complete`).send({})).status, 422);
  setup.storage.objects.set(asset.video_storage_key, { size: 20000, contentType: 'video/mp4', url: 'https://cdn.test/large' });
  assert.equal((await request(setup.app).post(`/api/media/${asset.id}/complete`).send({})).status, 422);
  setup.storage.objects.set(asset.video_storage_key, { size: 1000, contentType: 'video/mp4', url: 'https://cdn.test/good' });
  await request(setup.app).post(`/api/media/${asset.id}/complete`).send({});
  assert.equal((await request(setup.app).post(`/api/media/${asset.id}/complete`).send({})).status, 409);
});
test('owner can upload and complete a validated thumbnail', async () => {
  const setup = await setupMedia(); const upload = await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/mp4' }); const id = upload.body.data.asset.id; await request(setup.app).post(`/api/media/${id}/complete`).send({});
  const thumbnail = await request(setup.app).post(`/api/media/${id}/thumbnail-upload`).send({ mime_type: 'image/webp' });
  assert.equal(thumbnail.status, 201);
  const completed = await request(setup.app).post(`/api/media/${id}/thumbnail-complete`).send({});
  assert.match(completed.body.data.thumbnail_url, /^https:\/\/cdn\.test\//);
});
test('deleting media removes storage objects and hides metadata', async () => {
  const setup = await setupMedia(); const upload = await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/mp4' }); const asset = upload.body.data.asset;
  await request(setup.app).post(`/api/media/${asset.id}/complete`).send({});
  const response = await request(setup.app).delete(`/api/media/${asset.id}`);
  assert.equal(response.status, 200); assert.equal(response.body.data.status, 'deleted'); assert.ok(setup.storage.deleted.includes(asset.video_storage_key));
  assert.equal((await request(setup.app).get(`/api/media/menu-items/${setup.item.id}`)).body.data, null);
});
test('completing a replacement retires the previous ready asset', async () => {
  const setup = await setupMedia();
  const firstUpload = await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/mp4' });
  const first = firstUpload.body.data.asset; await request(setup.app).post(`/api/media/${first.id}/complete`).send({});
  const secondUpload = await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/webm' });
  const second = secondUpload.body.data.asset; await request(setup.app).post(`/api/media/${second.id}/complete`).send({});
  assert.equal(setup.media.rows.find((x) => x.id === first.id).status, 'deleted');
  assert.ok(setup.storage.deleted.includes(first.video_storage_key));
  assert.equal((await request(setup.app).get(`/api/media/menu-items/${setup.item.id}`)).body.data.id, second.id);
});
