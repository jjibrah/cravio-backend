import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 3000),
  publicAppUrl: process.env.PUBLIC_APP_URL || 'http://localhost:3000',
  databaseUrl: process.env.DATABASE_URL,
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  clerkWebhookSigningSecret: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
  media: {
    bucket: process.env.MEDIA_STORAGE_BUCKET,
    region: process.env.MEDIA_STORAGE_REGION || 'auto',
    endpoint: process.env.MEDIA_STORAGE_ENDPOINT,
    accessKeyId: process.env.MEDIA_STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY,
    publicBaseUrl: process.env.MEDIA_PUBLIC_BASE_URL,
    uploadExpiresSeconds: Number(process.env.MEDIA_UPLOAD_EXPIRES_SECONDS || 900),
    maxVideoBytes: Number(process.env.MEDIA_MAX_VIDEO_BYTES || 104857600),
    maxThumbnailBytes: Number(process.env.MEDIA_MAX_THUMBNAIL_BYTES || 5242880)
  },
  nodeEnv: process.env.NODE_ENV || 'development'
};
