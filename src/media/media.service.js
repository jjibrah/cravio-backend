import { randomUUID } from 'node:crypto';
import { AppError, notFound } from '../shared/errors.js';

const missing = () => notFound('MEDIA_NOT_FOUND', 'Media not found');
const allowedVideo = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const allowedImage = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class MediaService {
  constructor({ media, menus, restaurants, storage, limits }) {
    this.media = media; this.menus = menus; this.restaurants = restaurants; this.storage = storage; this.limits = limits;
  }
  async context(userId, itemId) {
    const restaurant = await this.restaurants.findByOwnerUserId(userId);
    if (!restaurant) throw notFound('RESTAURANT_NOT_FOUND', 'Restaurant not found for this owner');
    if (restaurant.status !== 'active') throw new AppError(403, 'RESTAURANT_INACTIVE', 'Restaurant is not active');
    const item = await this.menus.findItem(itemId, restaurant.id);
    if (!item) throw notFound('MENU_ITEM_NOT_FOUND', 'Menu item not found');
    return { restaurant, item };
  }
  async owned(userId, mediaId) {
    const restaurant = await this.restaurants.findByOwnerUserId(userId);
    if (!restaurant) throw notFound('RESTAURANT_NOT_FOUND', 'Restaurant not found for this owner');
    if (restaurant.status !== 'active') throw new AppError(403, 'RESTAURANT_INACTIVE', 'Restaurant is not active');
    const asset = await this.media.findOwned(mediaId, restaurant.id);
    if (!asset) throw missing();
    return { restaurant, asset };
  }
  async createVideoUpload(userId, itemId, mimeType) {
    if (!allowedVideo.has(mimeType)) throw new AppError(400, 'INVALID_MEDIA_TYPE', 'Unsupported video type');
    const { restaurant } = await this.context(userId, itemId);
    const key = `restaurants/${restaurant.id}/menu-items/${itemId}/videos/${randomUUID()}`;
    const upload = await this.storage.createUpload({ key, contentType: mimeType, maxBytes: this.limits.maxVideoBytes });
    const asset = await this.media.createPending(restaurant.id, itemId, key, mimeType);
    return { asset, upload, max_bytes: this.limits.maxVideoBytes };
  }
  async completeVideo(userId, mediaId, durationMs) {
    const { restaurant, asset } = await this.owned(userId, mediaId);
    if (asset.status !== 'pending') throw new AppError(409, 'MEDIA_STATE_CONFLICT', 'Media upload is not pending');
    const previous = await this.media.findCurrentForItem(asset.menu_item_id, restaurant.id);
    const object = await this.storage.inspect(asset.video_storage_key);
    if (!allowedVideo.has(object.contentType) || object.contentType !== asset.mime_type) throw new AppError(422, 'INVALID_MEDIA_TYPE', 'Uploaded object type does not match');
    if (!object.size || object.size > this.limits.maxVideoBytes) throw new AppError(422, 'INVALID_MEDIA_SIZE', 'Uploaded video size is invalid');
    const completed = await this.media.completeVideo(asset.id, restaurant.id, { ...object, durationMs });
    if (!completed) throw new AppError(409, 'MEDIA_STATE_CONFLICT', 'Media upload state changed');
    if (previous && previous.id !== completed.id) {
      const deletions = [this.storage.delete(previous.video_storage_key)];
      if (previous.thumbnail_storage_key) deletions.push(this.storage.delete(previous.thumbnail_storage_key));
      await Promise.allSettled(deletions);
      await this.media.markDeleted(previous.id, restaurant.id);
    }
    return completed;
  }
  async getForItem(userId, itemId) { const { restaurant } = await this.context(userId, itemId); return this.media.findCurrentForItem(itemId, restaurant.id); }
  async createThumbnailUpload(userId, mediaId, mimeType) {
    if (!allowedImage.has(mimeType)) throw new AppError(400, 'INVALID_MEDIA_TYPE', 'Unsupported thumbnail type');
    const { restaurant, asset } = await this.owned(userId, mediaId);
    if (asset.status !== 'ready') throw new AppError(409, 'MEDIA_STATE_CONFLICT', 'Video must be ready before adding a thumbnail');
    const key = `restaurants/${restaurant.id}/menu-items/${asset.menu_item_id}/thumbnails/${randomUUID()}`;
    const upload = await this.storage.createUpload({ key, contentType: mimeType, maxBytes: this.limits.maxThumbnailBytes });
    await this.media.setThumbnailKey(asset.id, restaurant.id, key);
    return { upload, max_bytes: this.limits.maxThumbnailBytes };
  }
  async completeThumbnail(userId, mediaId) {
    const { restaurant, asset } = await this.owned(userId, mediaId);
    if (!asset.thumbnail_storage_key) throw new AppError(409, 'MEDIA_STATE_CONFLICT', 'Thumbnail upload was not initialized');
    const object = await this.storage.inspect(asset.thumbnail_storage_key);
    if (!allowedImage.has(object.contentType) || !object.size || object.size > this.limits.maxThumbnailBytes) throw new AppError(422, 'INVALID_THUMBNAIL', 'Uploaded thumbnail is invalid');
    const completed = await this.media.completeThumbnail(asset.id, restaurant.id, object.url);
    if (!completed) throw new AppError(409, 'MEDIA_STATE_CONFLICT', 'Thumbnail upload state changed');
    return completed;
  }
  async remove(userId, mediaId) {
    const { restaurant, asset } = await this.owned(userId, mediaId);
    const deletions = [this.storage.delete(asset.video_storage_key)];
    if (asset.thumbnail_storage_key) deletions.push(this.storage.delete(asset.thumbnail_storage_key));
    await Promise.all(deletions);
    return this.media.markDeleted(asset.id, restaurant.id);
  }
}
