import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { MemoryUsers } from '../helpers/test-app.js';
import { menuApp, owner, restaurantA, restaurantB, validItem } from '../menu/menu-test-helpers.js';
import { createMediaUploadLimiter } from '../../src/media/media.routes.js';
import { MediaRepository } from '../../src/media/media.repository.js';
import { createMediaStorage } from '../../src/media/media.storage.js';

class MemoryMedia {
  constructor() { this.rows = []; }
  async createPending(restaurantId, menuItemId, key, mimeType, originalFilename = null) { const row = { id: randomUUID(), restaurant_id: restaurantId, menu_item_id: menuItemId, media_type: 'video', status: 'processing', video_storage_key: key, video_url: null, thumbnail_storage_key: null, thumbnail_url: null, original_filename: originalFilename, mime_type: mimeType }; this.rows.push(row); return row; }
  async findOwned(id, restaurantId) { return this.rows.find((x) => x.id === id && x.restaurant_id === restaurantId && x.status !== 'deleted') || null; }
  async findCurrentForItem(itemId, restaurantId) { return [...this.rows].reverse().find((x) => x.menu_item_id === itemId && x.restaurant_id === restaurantId && x.status === 'ready') || null; }
  async finalizeReplacement(id, restaurantId, data) { const row = await this.findOwned(id, restaurantId); if (!row || row.status !== 'processing') return null; const previous = this.rows.find((x) => x.menu_item_id === row.menu_item_id && x.restaurant_id === restaurantId && x.status === 'ready') || null; if (previous) { previous.status = 'deleted'; previous.video_url = null; previous.thumbnail_url = null; } Object.assign(row, { status: 'ready', video_url: data.videoUrl, thumbnail_storage_key: data.thumbnailKey, thumbnail_url: data.thumbnailUrl, size_bytes: data.size, duration_seconds: data.durationSeconds, width: data.width, height: data.height }); return { asset: row, previous }; }
  async markFailed(id, restaurantId) { const row = await this.findOwned(id, restaurantId); if (row?.status === 'processing') row.status = 'failed'; return row; }
  async setThumbnailKey(id, restaurantId, key) { const row = await this.findOwned(id, restaurantId); if (!row || row.status !== 'ready') return null; row.thumbnail_storage_key = key; row.thumbnail_url = null; return row; }
  async completeThumbnail(id, restaurantId, url) { const row = await this.findOwned(id, restaurantId); if (!row?.thumbnail_storage_key) return null; row.thumbnail_url = url; return row; }
  async markDeleted(id, restaurantId) { const row = await this.findOwned(id, restaurantId); if (!row) return null; row.status = 'deleted'; row.video_url = null; row.thumbnail_url = null; return row; }
}

class MemoryStorage {
  constructor() { this.objects = new Map(); this.deleted = []; }
  async createUpload({ key, contentType }) { this.objects.set(key, { size: 1024, contentType, url: `https://cdn.test/${key}` }); return { url: `https://upload.test/${key}`, method: 'PUT', headers: { 'content-type': contentType }, expires_in: 900 }; }
  async inspect(key) { const object = this.objects.get(key); if (!object) throw new Error('missing object'); return object; }
  async downloadToFile(key) { if (!this.objects.has(key)) throw new Error('missing object'); }
  async uploadFile({ key, contentType }) { const object = { size: 500, contentType, url: `https://cdn.test/${key}` }; this.objects.set(key, object); return { key, url: object.url }; }
  async delete(key) { this.deleted.push(key); this.objects.delete(key); }
}

async function setupMedia(options = {}) {
  const media = new MemoryMedia(); const storage = new MemoryStorage();
  const processor = options.mediaProcessor || { withWorkspace: async (work) => work('C:/temp'), inspect: async () => ({ durationSeconds: 25, width: 1080, height: 1920, format: 'mp4' }), thumbnail: async (_video, output) => output };
  const setup = menuApp({ ...options, mediaRepository: media, mediaStorage: storage, mediaProcessor: processor, mediaUploadLimiter: options.mediaUploadLimiter || ((_req, _res, next) => next()), mediaLimits: { maxVideoBytes: 10000, maxThumbnailBytes: 5000, maxVideoDurationSeconds: 45 } });
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
  const complete = await request(setup.app).post(`/api/media/${id}/complete`).send({});
  assert.equal(complete.status, 200); assert.equal(complete.body.data.status, 'ready'); assert.equal(complete.body.data.duration_seconds, 25); assert.equal(complete.body.data.width, 1080); assert.match(complete.body.data.thumbnail_url, /^https:\/\/cdn\.test\//);
  const current = await request(setup.app).get(`/api/media/menu-items/${setup.item.id}`);
  assert.equal(current.body.data.id, id);
});
test('completion rejects mismatched type, oversized object, and repeated completion', async () => {
  const setup = await setupMedia();
  const invalid = (await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/mp4' })).body.data.asset;
  setup.storage.objects.set(invalid.video_storage_key, { size: 1, contentType: 'image/png', url: 'https://cdn.test/bad' });
  assert.equal((await request(setup.app).post(`/api/media/${invalid.id}/complete`).send({})).status, 415); assert.equal(setup.media.rows.find((x) => x.id === invalid.id).status, 'failed');
  const oversized = (await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/mp4' })).body.data.asset;
  setup.storage.objects.set(oversized.video_storage_key, { size: 20000, contentType: 'video/mp4', url: 'https://cdn.test/large' });
  assert.equal((await request(setup.app).post(`/api/media/${oversized.id}/complete`).send({})).status, 413);
  const valid = (await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/mp4' })).body.data.asset;
  await request(setup.app).post(`/api/media/${valid.id}/complete`).send({});
  assert.equal((await request(setup.app).post(`/api/media/${valid.id}/complete`).send({})).status, 409);
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

test('corrupt and over-duration videos fail, clean candidate storage, and create no ready record', async () => {
  for (const processor of [
    { withWorkspace: async (work) => work('C:/temp'), inspect: async () => { throw new Error('corrupt'); }, thumbnail: async () => {} },
    { withWorkspace: async (work) => work('C:/temp'), inspect: async () => ({ durationSeconds: 46, width: 100, height: 100 }), thumbnail: async () => {} }
  ]) {
    const setup = await setupMedia({ mediaProcessor: processor }); const asset = (await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/mp4' })).body.data.asset;
    const response = await request(setup.app).post(`/api/media/${asset.id}/complete`).send({});
    assert.ok([422, 500].includes(response.status)); assert.equal(setup.media.rows.find((x) => x.id === asset.id).status, 'failed'); assert.ok(setup.storage.deleted.includes(asset.video_storage_key)); assert.equal(await setup.media.findCurrentForItem(setup.item.id, restaurantA.id), null);
  }
});

test('thumbnail failure during replacement preserves the old ready video and removes the candidate', async () => {
  let failThumbnail = false; const processor = { withWorkspace: async (work) => work('C:/temp'), inspect: async () => ({ durationSeconds: 20, width: 720, height: 1280 }), thumbnail: async (_video, output) => { if (failThumbnail) throw new Error('thumbnail failed'); return output; } };
  const setup = await setupMedia({ mediaProcessor: processor }); const first = (await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/mp4' })).body.data.asset; assert.equal((await request(setup.app).post(`/api/media/${first.id}/complete`).send({})).status, 200);
  failThumbnail = true; const candidate = (await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/webm' })).body.data.asset; assert.equal((await request(setup.app).post(`/api/media/${candidate.id}/complete`).send({})).status, 500);
  assert.equal(setup.media.rows.find((x) => x.id === first.id).status, 'ready'); assert.equal(setup.media.rows.find((x) => x.id === candidate.id).status, 'failed'); assert.equal((await request(setup.app).get(`/api/media/menu-items/${setup.item.id}`)).body.data.id, first.id); assert.ok(setup.storage.deleted.includes(candidate.video_storage_key)); assert.ok(!setup.storage.deleted.includes(first.video_storage_key));
});

test('delete hides media even when obsolete object cleanup fails', async () => {
  const setup = await setupMedia(); const asset = (await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/mp4' })).body.data.asset; await request(setup.app).post(`/api/media/${asset.id}/complete`).send({}); setup.storage.delete = async () => { throw new Error('provider unavailable'); };
  const response = await request(setup.app).delete(`/api/media/${asset.id}`); assert.equal(response.status, 200); assert.equal(response.body.data.status, 'deleted'); assert.equal(await setup.media.findCurrentForItem(setup.item.id, restaurantA.id), null);
});

test('video upload validates safe filenames and applies an expensive-operation rate limit', async () => {
  const setup = await setupMedia({ mediaUploadLimiter: createMediaUploadLimiter({ limit: 1 }) });
  const valid = await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/mp4', original_filename: 'dish.mp4' }); assert.equal(valid.status, 201); assert.equal(valid.body.data.asset.original_filename, 'dish.mp4');
  const limited = await request(setup.app).post(`/api/media/menu-items/${setup.item.id}/video-upload`).send({ mime_type: 'video/mp4' }); assert.equal(limited.status, 429); assert.equal(limited.body.error.code, 'RATE_LIMITED');
  const other = await setupMedia(); assert.equal((await request(other.app).post(`/api/media/menu-items/${other.item.id}/video-upload`).send({ mime_type: 'video/mp4', original_filename: '../evil.mp4' })).status, 400); assert.equal((await request(other.app).post(`/api/media/menu-items/${other.item.id}/video-upload`).send({ mime_type: 'video/quicktime' })).status, 400);
});

test('replacement repository rolls back and releases when the atomic switch fails', async () => {
  const calls = []; const client = { query: async (sql) => { calls.push(sql); if (sql === 'BEGIN') return {}; if (sql.includes("status='processing' FOR UPDATE")) return { rowCount: 1, rows: [{ id: randomUUID(), menu_item_id: validItem }] }; if (sql.includes("status='ready' FOR UPDATE")) return { rowCount: 0, rows: [] }; throw new Error('update failed'); }, release: () => calls.push('RELEASE') };
  const repository = new MediaRepository({ connect: async () => client }); await assert.rejects(repository.finalizeReplacement(randomUUID(), restaurantA.id, {}), /update failed/); assert.ok(calls.includes('ROLLBACK')); assert.ok(calls.includes('RELEASE'));
});

test('storage configuration fails fast in production and returns a safe development error', async () => {
  assert.throws(() => createMediaStorage({ required: true }), /configuration is incomplete/);
  const storage = createMediaStorage({ required: false }); await assert.rejects(storage.createUpload({ key: 'x', contentType: 'video/mp4' }), { code: 'MEDIA_STORAGE_UNAVAILABLE', status: 503 });
});
