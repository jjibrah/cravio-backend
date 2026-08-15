import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import request from 'supertest';

import { admin, owner, testApp } from '../helpers/test-app.js';

const complete = {
  name: 'The Urban Fork',
  description: 'Modern casual dining',
  phone: '+60123456789',
  email: 'hello@urban.test',
  address: '1 Main Street',
  city: 'Kuala Lumpur',
  country: 'Malaysia',
  currency: 'MYR',
};
class RestaurantsMemory {
  constructor() {
    this.rows = [];
    this.ready = true;
  }
  async findByOwnerId(id) {
    return this.rows.find((x) => x.owner_id === id) || null;
  }
  async findByOwnerUserId(id) {
    return this.findByOwnerId(id);
  }
  async findById(id) {
    return this.rows.find((x) => x.id === id) || null;
  }
  async findPublishedById(id) {
    const row = await this.findById(id);
    return row?.status === 'active' && row.is_published ? row : null;
  }
  async findPublicBySlug(slug) {
    return (
      this.rows.find((x) => x.slug === slug && x.status === 'active' && x.is_published) || null
    );
  }
  async create(ownerId, slug, data) {
    if (this.rows.some((x) => x.owner_id === ownerId)) {
      const error = Object.assign(new Error('duplicate'), {
        code: '23505',
        constraint: 'restaurants_owner_id_key',
      });
      throw error;
    }
    if (this.rows.some((x) => x.slug === slug)) {
      const error = Object.assign(new Error('duplicate'), {
        code: '23505',
        constraint: 'restaurants_slug_key',
      });
      throw error;
    }
    const row = {
      id: randomUUID(),
      owner_id: ownerId,
      slug,
      status: 'active',
      is_published: false,
      published_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      logo_url: null,
      cover_image_url: null,
      ...data,
    };
    this.rows.push(row);
    return row;
  }
  async update(id, data) {
    const row = await this.findById(id);
    Object.assign(row, data);
    return row;
  }
  async publicationReadiness() {
    return { has_category: this.ready, has_item: this.ready };
  }
  async publish(id) {
    const row = await this.findById(id);
    row.is_published = true;
    row.published_at ||= new Date().toISOString();
    return row;
  }
  async unpublish(id) {
    const row = await this.findById(id);
    row.is_published = false;
    return row;
  }
}
const setup = (options = {}) => {
  const restaurants = options.restaurants || new RestaurantsMemory();
  return {
    restaurants,
    app: testApp({ restaurantRepository: restaurants, authUserId: options.authUserId }).app,
  };
};

test('active owner creates one unpublished restaurant with a collision-safe slug and server-derived owner', async () => {
  const x = setup();
  x.restaurants.rows.push({ id: randomUUID(), owner_id: randomUUID(), slug: 'the-urban-fork' });
  const response = await request(x.app)
    .post('/api/restaurants')
    .send({ ...complete, owner_id: randomUUID() });
  assert.equal(response.status, 400);
  const created = await request(x.app).post('/api/restaurants').send(complete);
  assert.equal(created.status, 201);
  assert.equal(created.body.data.slug, 'the-urban-fork-2');
  assert.equal(created.body.data.owner_id, owner.id);
  assert.equal(created.body.data.is_published, false);
  assert.equal((await request(x.app).post('/api/restaurants').send(complete)).status, 409);
});

test('restaurant management requires an authenticated active owner and rejects protected fields', async () => {
  assert.equal(
    (
      await request(setup({ authUserId: null }).app)
        .post('/api/restaurants')
        .send(complete)
    ).status,
    401,
  );
  assert.equal(
    (
      await request(setup({ authUserId: admin.clerk_user_id }).app)
        .post('/api/restaurants')
        .send(complete)
    ).status,
    403,
  );
  const x = setup();
  await request(x.app).post('/api/restaurants').send(complete);
  assert.equal(
    (await request(x.app).patch('/api/restaurants/me').send({ status: 'disabled' })).status,
    400,
  );
  const updated = await request(x.app)
    .patch('/api/restaurants/me')
    .send({ name: 'Updated Fork', logo_url: 'https://cdn.test/logo.webp' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.name, 'Updated Fork');
});

test('publish requires a complete profile and an active category with an available active item', async () => {
  const x = setup();
  await request(x.app).post('/api/restaurants').send(complete);
  x.restaurants.ready = false;
  const blocked = await request(x.app).post('/api/restaurants/me/publish');
  assert.equal(blocked.status, 422);
  assert.equal(blocked.body.error.code, 'RESTAURANT_MENU_INCOMPLETE');
  x.restaurants.ready = true;
  const published = await request(x.app).post('/api/restaurants/me/publish');
  assert.equal(published.status, 200);
  const firstTimestamp = published.body.data.published_at;
  const unpublished = await request(x.app).post('/api/restaurants/me/unpublish');
  assert.equal(unpublished.body.data.is_published, false);
  const republished = await request(x.app).post('/api/restaurants/me/publish');
  assert.equal(republished.body.data.published_at, firstTimestamp);
});

test('public restaurant lookup exposes only public profile fields and hides unpublished or inactive restaurants', async () => {
  const x = setup();
  const created = (await request(x.app).post('/api/restaurants').send(complete)).body.data;
  await request(x.app).post('/api/restaurants/me/publish');
  const visible = await request(x.app).get(`/api/public/restaurants/${created.slug}`);
  assert.equal(visible.status, 200);
  for (const field of ['owner_id', 'status', 'is_published', 'created_at', 'updated_at'])
    assert.equal(visible.body.data[field], undefined);
  await request(x.app).post('/api/restaurants/me/unpublish');
  assert.equal((await request(x.app).get(`/api/public/restaurants/${created.slug}`)).status, 404);
});
