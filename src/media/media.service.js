import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { AppError, notFound } from '../shared/errors.js';

const missing = () => notFound('MEDIA_NOT_FOUND', 'Media not found');
const videoTypes = new Map([['video/mp4', '.mp4'], ['video/webm', '.webm']]);
const allowedImage = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class MediaService {
  constructor({ media, menus, restaurants, storage, processor, limits, logger = console }) { this.media = media; this.menus = menus; this.restaurants = restaurants; this.storage = storage; this.processor = processor; this.limits = limits; this.logger = logger; }
  async context(userId, itemId) { const restaurant = await this.restaurants.findByOwnerUserId(userId); if (!restaurant) throw notFound('RESTAURANT_NOT_FOUND', 'Restaurant not found for this owner'); if (restaurant.status !== 'active') throw new AppError(403, 'RESTAURANT_INACTIVE', 'Restaurant is not active'); const item = await this.menus.findItem(itemId, restaurant.id); if (!item) throw notFound('MENU_ITEM_NOT_FOUND', 'Menu item not found'); return { restaurant, item }; }
  async owned(userId, mediaId) { const restaurant = await this.restaurants.findByOwnerUserId(userId); if (!restaurant) throw notFound('RESTAURANT_NOT_FOUND', 'Restaurant not found for this owner'); if (restaurant.status !== 'active') throw new AppError(403, 'RESTAURANT_INACTIVE', 'Restaurant is not active'); const asset = await this.media.findOwned(mediaId, restaurant.id); if (!asset) throw missing(); return { restaurant, asset }; }
  async cleanup(keys) { const results = await Promise.allSettled(keys.filter(Boolean).map((key) => this.storage.delete(key))); for (const result of results) if (result.status === 'rejected') this.logger.error?.('Media storage cleanup failed'); }
  async createVideoUpload(userId, itemId, data) {
    const extension = videoTypes.get(data.mime_type); if (!extension) throw new AppError(415, 'UNSUPPORTED_VIDEO_FORMAT', 'Only MP4 and WebM videos are supported');
    const { restaurant } = await this.context(userId, itemId); const key = `restaurants/${restaurant.id}/menu-items/${itemId}/videos/${randomUUID()}${extension}`;
    let asset;
    try { asset = await this.media.createPending(restaurant.id, itemId, key, data.mime_type, data.original_filename || null); const upload = await this.storage.createUpload({ key, contentType: data.mime_type, maxBytes: this.limits.maxVideoBytes }); return { asset, upload, max_bytes: this.limits.maxVideoBytes, max_duration_seconds: this.limits.maxVideoDurationSeconds }; }
    catch (error) { if (asset) await this.media.markFailed(asset.id, restaurant.id).catch(() => {}); throw error instanceof AppError ? error : new AppError(502, 'MEDIA_UPLOAD_FAILED', 'Could not initialize media upload'); }
  }
  async completeVideo(userId, mediaId) {
    const { restaurant, asset } = await this.owned(userId, mediaId); if (asset.status !== 'processing') throw new AppError(409, 'MEDIA_STATE_CONFLICT', 'Media upload is not processing');
    let thumbnailKey;
    try {
      const object = await this.storage.inspect(asset.video_storage_key);
      if (!videoTypes.has(object.contentType) || object.contentType !== asset.mime_type) throw new AppError(415, 'UNSUPPORTED_VIDEO_FORMAT', 'Uploaded object type does not match the requested video format');
      if (!object.size) throw new AppError(422, 'INVALID_VIDEO', 'Uploaded video is empty');
      if (object.size > this.limits.maxVideoBytes) throw new AppError(413, 'VIDEO_TOO_LARGE', 'Uploaded video exceeds the configured size limit');
      const finalized = await this.processor.withWorkspace(async (directory) => {
        const videoPath = path.join(directory, `source${videoTypes.get(asset.mime_type)}`); const thumbnailPath = path.join(directory, 'thumbnail.jpg');
        await this.storage.downloadToFile(asset.video_storage_key, videoPath); const metadata = await this.processor.inspect(videoPath);
        if (metadata.durationSeconds > this.limits.maxVideoDurationSeconds) throw new AppError(422, 'VIDEO_TOO_LONG', 'Uploaded video exceeds the configured duration limit');
        await this.processor.thumbnail(videoPath, thumbnailPath, metadata.durationSeconds);
        thumbnailKey = `restaurants/${restaurant.id}/menu-items/${asset.menu_item_id}/thumbnails/${randomUUID()}.jpg`;
        const thumbnail = await this.storage.uploadFile({ key: thumbnailKey, filePath: thumbnailPath, contentType: 'image/jpeg' });
        return this.media.finalizeReplacement(asset.id, restaurant.id, { videoUrl: object.url, thumbnailKey, thumbnailUrl: thumbnail.url, size: object.size, durationSeconds: metadata.durationSeconds, width: metadata.width, height: metadata.height });
      });
      if (!finalized) throw new AppError(409, 'MEDIA_STATE_CONFLICT', 'Media upload state changed');
      if (finalized.previous) await this.cleanup([finalized.previous.video_storage_key, finalized.previous.thumbnail_storage_key]);
      return finalized.asset;
    } catch (error) {
      await this.cleanup([asset.video_storage_key, thumbnailKey]); await this.media.markFailed(asset.id, restaurant.id).catch(() => {});
      if (error instanceof AppError) throw error; this.logger.error?.('Media processing failed'); throw new AppError(500, 'MEDIA_PROCESSING_FAILED', 'Could not validate or process the uploaded video');
    }
  }
  async getForItem(userId, itemId) { const { restaurant } = await this.context(userId, itemId); return this.media.findCurrentForItem(itemId, restaurant.id); }
  async createThumbnailUpload(userId, mediaId, mimeType) { if (!allowedImage.has(mimeType)) throw new AppError(415, 'UNSUPPORTED_THUMBNAIL_FORMAT', 'Unsupported thumbnail type'); const { restaurant, asset } = await this.owned(userId, mediaId); if (asset.status !== 'ready') throw new AppError(409, 'MEDIA_STATE_CONFLICT', 'Video must be ready before adding a thumbnail'); const key = `restaurants/${restaurant.id}/menu-items/${asset.menu_item_id}/thumbnails/${randomUUID()}`; const upload = await this.storage.createUpload({ key, contentType: mimeType, maxBytes: this.limits.maxThumbnailBytes }); await this.media.setThumbnailKey(asset.id, restaurant.id, key); return { upload, max_bytes: this.limits.maxThumbnailBytes }; }
  async completeThumbnail(userId, mediaId) { const { restaurant, asset } = await this.owned(userId, mediaId); if (!asset.thumbnail_storage_key) throw new AppError(409, 'MEDIA_STATE_CONFLICT', 'Thumbnail upload was not initialized'); const object = await this.storage.inspect(asset.thumbnail_storage_key); if (!allowedImage.has(object.contentType) || !object.size || object.size > this.limits.maxThumbnailBytes) throw new AppError(422, 'INVALID_THUMBNAIL', 'Uploaded thumbnail is invalid'); const completed = await this.media.completeThumbnail(asset.id, restaurant.id, object.url); if (!completed) throw new AppError(409, 'MEDIA_STATE_CONFLICT', 'Thumbnail upload state changed'); return completed; }
  async remove(userId, mediaId) { const { restaurant, asset } = await this.owned(userId, mediaId); const deleted = await this.media.markDeleted(asset.id, restaurant.id); if (!deleted) throw missing(); await this.cleanup([asset.video_storage_key, asset.thumbnail_storage_key]); return deleted; }
}
