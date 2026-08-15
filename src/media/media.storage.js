import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '../shared/errors.js';

const unavailable = () => new AppError(503, 'MEDIA_STORAGE_UNAVAILABLE', 'Media storage is not configured');

export function createMediaStorage(config) {
  const ready = config.bucket && config.accessKeyId && config.secretAccessKey && config.publicBaseUrl;
  if (!ready) return { createUpload: async () => { throw unavailable(); }, inspect: async () => { throw unavailable(); }, delete: async () => { throw unavailable(); } };
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: Boolean(config.endpoint),
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
  });
  const publicBase = config.publicBaseUrl.replace(/\/$/, '');
  return {
    async createUpload({ key, contentType }) {
      const command = new PutObjectCommand({ Bucket: config.bucket, Key: key, ContentType: contentType });
      return { url: await getSignedUrl(client, command, { expiresIn: config.uploadExpiresSeconds }), method: 'PUT', headers: { 'content-type': contentType }, expires_in: config.uploadExpiresSeconds };
    },
    async inspect(key) {
      const result = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
      return { size: Number(result.ContentLength || 0), contentType: result.ContentType, url: `${publicBase}/${key.split('/').map(encodeURIComponent).join('/')}` };
    },
    async delete(key) { await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key })); }
  };
}
