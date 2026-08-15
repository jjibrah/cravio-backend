import { createReadStream, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { AppError } from '../shared/errors.js';

const unavailable = () =>
  new AppError(503, 'MEDIA_STORAGE_UNAVAILABLE', 'Media storage is not configured');

export function createMediaStorage(config) {
  const ready =
    config.bucket && config.accessKeyId && config.secretAccessKey && config.publicBaseUrl;
  if (!ready && config.required)
    throw new Error(
      'Media storage configuration is incomplete; configure bucket, credentials, and public base URL',
    );
  if (!ready)
    return {
      health: async () => false,
      createUpload: async () => {
        throw unavailable();
      },
      inspect: async () => {
        throw unavailable();
      },
      downloadToFile: async () => {
        throw unavailable();
      },
      uploadFile: async () => {
        throw unavailable();
      },
      delete: async () => {
        throw unavailable();
      },
    };
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: Boolean(config.endpoint),
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
  const publicBase = config.publicBaseUrl.replace(/\/$/, '');
  return {
    async health() {
      return true;
    },
    async createUpload({ key, contentType }) {
      const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: contentType,
      });
      return {
        url: await getSignedUrl(client, command, { expiresIn: config.uploadExpiresSeconds }),
        method: 'PUT',
        headers: { 'content-type': contentType },
        expires_in: config.uploadExpiresSeconds,
      };
    },
    async inspect(key) {
      const result = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
      return {
        size: Number(result.ContentLength || 0),
        contentType: result.ContentType,
        url: `${publicBase}/${key.split('/').map(encodeURIComponent).join('/')}`,
      };
    },
    async downloadToFile(key, destination) {
      const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      if (!result.Body)
        throw new AppError(502, 'MEDIA_STORAGE_ERROR', 'Storage returned an empty object');
      await pipeline(
        Readable.fromWeb(result.Body.transformToWebStream()),
        createWriteStream(destination),
      );
    },
    async uploadFile({ key, filePath, contentType }) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: createReadStream(filePath),
          ContentType: contentType,
        }),
      );
      return { key, url: `${publicBase}/${key.split('/').map(encodeURIComponent).join('/')}` };
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
