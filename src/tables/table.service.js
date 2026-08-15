import { randomUUID } from 'node:crypto';

import { AppError, notFound } from '../shared/errors.js';

const tableMissing = () => notFound('TABLE_NOT_FOUND', 'Table not found');
const qrMissing = () => notFound('QR_NOT_FOUND', 'QR code is not available');
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );

export class TableService {
  constructor({ tables, restaurants, qr, publicAppUrl }) {
    this.tables = tables;
    this.restaurants = restaurants;
    this.qr = qr;
    this.publicAppUrl = publicAppUrl.replace(/\/$/, '');
  }
  async restaurant(userId) {
    const restaurant = await this.restaurants.findByOwnerUserId(userId);
    if (!restaurant) throw notFound('RESTAURANT_NOT_FOUND', 'Restaurant not found for this owner');
    if (restaurant.status !== 'active')
      throw new AppError(403, 'RESTAURANT_INACTIVE', 'Restaurant is not active');
    return restaurant;
  }
  qrUrl(token) {
    return `${this.publicAppUrl}/q/${token}`;
  }
  mapConflict(error) {
    if (error.code === '23505')
      return new AppError(
        409,
        'TABLE_ALREADY_EXISTS',
        'Table name, code, or QR token already exists',
      );
    return error;
  }
  async create(userId, data) {
    const restaurant = await this.restaurant(userId);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const table = await this.tables.create(restaurant.id, { ...data, qrToken: randomUUID() });
        return { ...table, qr_url: this.qrUrl(table.qr_token) };
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'restaurant_tables_qr_token_key')
          continue;
        throw this.mapConflict(error);
      }
    }
    throw new AppError(409, 'QR_TOKEN_CONFLICT', 'Could not generate a unique QR token');
  }
  async bulkCreate(userId, data) {
    const restaurant = await this.restaurant(userId);
    const width = Math.max(2, String(data.count).length);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const entries = Array.from({ length: data.count }, (_, index) => ({
        name: `${data.prefix} ${index + 1}`,
        code: `${data.code_prefix}${String(index + 1).padStart(width, '0')}`,
        qrToken: randomUUID(),
      }));
      try {
        return (await this.tables.createBulk(restaurant.id, entries)).map((table) => ({
          ...table,
          qr_url: this.qrUrl(table.qr_token),
        }));
      } catch (error) {
        if (error.code === '23505' && error.constraint === 'restaurant_tables_qr_token_key')
          continue;
        throw this.mapConflict(error);
      }
    }
    throw new AppError(409, 'QR_TOKEN_CONFLICT', 'Could not generate unique QR tokens');
  }
  async list(userId, activeOnly = false) {
    const restaurant = await this.restaurant(userId);
    return this.tables.list(restaurant.id, activeOnly);
  }
  async owned(userId, id) {
    const restaurant = await this.restaurant(userId);
    const table = await this.tables.findOwned(id, restaurant.id);
    if (!table) throw tableMissing();
    return { restaurant, table };
  }
  async get(userId, id) {
    return (await this.owned(userId, id)).table;
  }
  async update(userId, id, data) {
    const { restaurant } = await this.owned(userId, id);
    try {
      return await this.tables.update(id, restaurant.id, data);
    } catch (error) {
      throw this.mapConflict(error);
    }
  }
  async deactivate(userId, id) {
    const { restaurant } = await this.owned(userId, id);
    return this.tables.deactivate(id, restaurant.id);
  }
  async regenerate(userId, id) {
    const { restaurant } = await this.owned(userId, id);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const table = await this.tables.regenerate(id, restaurant.id, randomUUID());
        return { ...table, qr_url: this.qrUrl(table.qr_token) };
      } catch (error) {
        if (error.code !== '23505') throw error;
      }
    }
    throw new AppError(409, 'QR_TOKEN_CONFLICT', 'Could not generate a unique QR token');
  }
  async renderQr(userId, id, format) {
    const { table } = await this.owned(userId, id);
    const url = this.qrUrl(table.qr_token);
    return {
      table,
      url,
      body: await this.qr[format](url),
      contentType: format === 'png' ? 'image/png' : 'image/svg+xml',
    };
  }
  printHtml(restaurant, entries) {
    const cards = entries
      .map(
        ({ table, svg }) =>
          `<section><h2>${escapeHtml(table.name)}</h2>${svg}<p>Scan to view menu</p><small>${escapeHtml(table.code)}</small></section>`,
      )
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(restaurant.name)} table QR codes</title><style>body{font-family:Arial,sans-serif;text-align:center}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}section{border:1px solid #ddd;padding:24px;break-inside:avoid}svg{max-width:240px;height:auto}@media print{section{page-break-inside:avoid}}</style></head><body><h1>${escapeHtml(restaurant.name)}</h1><main>${cards}</main></body></html>`;
  }
  async printOne(userId, id) {
    const { restaurant, table } = await this.owned(userId, id);
    return this.printHtml(restaurant, [
      { table, svg: await this.qr.svg(this.qrUrl(table.qr_token)) },
    ]);
  }
  async printAll(userId) {
    const restaurant = await this.restaurant(userId);
    const tables = await this.tables.list(restaurant.id, true);
    const entries = await Promise.all(
      tables.map(async (table) => ({ table, svg: await this.qr.svg(this.qrUrl(table.qr_token)) })),
    );
    return this.printHtml(restaurant, entries);
  }
  async resolveQrToken(token) {
    const context = await this.tables.resolve(token);
    if (!context) throw qrMissing();
    return {
      restaurant: {
        id: context.restaurant_id,
        name: context.restaurant_name,
        slug: context.restaurant_slug,
      },
      table: { id: context.table_id, name: context.table_name },
    };
  }
}
