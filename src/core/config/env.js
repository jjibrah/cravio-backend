import { z } from 'zod';

const optionalUrl = z
  .string()
  .url()
  .optional()
  .or(z.literal('').transform(() => undefined));
const positiveInt = (fallback) => z.coerce.number().int().positive().default(fallback);
const baseSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: positiveInt(3000),
    DATABASE_URL: z.string().optional(),
    DATABASE_POOL_MAX: positiveInt(10),
    DATABASE_CONNECT_TIMEOUT_MS: positiveInt(5000),
    DATABASE_QUERY_TIMEOUT_MS: positiveInt(10000),
    DATABASE_SSL: z.enum(['true', 'false']).default('false'),
    CLERK_SECRET_KEY: z.string().optional(),
    CLERK_PUBLISHABLE_KEY: z.string().optional(),
    CLERK_WEBHOOK_SIGNING_SECRET: z.string().optional(),
    FRONTEND_URL: optionalUrl,
    ADMIN_APP_URL: optionalUrl,
    PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    TRUST_PROXY: z.enum(['false', 'loopback', 'linklocal', 'uniquelocal']).default('false'),
    JSON_BODY_LIMIT: z
      .string()
      .regex(/^\d+(kb|mb)$/i)
      .default('100kb'),
    STORAGE_PROVIDER: z.enum(['s3']).default('s3'),
    MEDIA_STORAGE_BUCKET: z.string().optional(),
    MEDIA_STORAGE_REGION: z.string().default('auto'),
    MEDIA_STORAGE_ENDPOINT: optionalUrl,
    MEDIA_STORAGE_ACCESS_KEY_ID: z.string().optional(),
    MEDIA_STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
    MEDIA_PUBLIC_BASE_URL: optionalUrl,
    MEDIA_UPLOAD_EXPIRES_SECONDS: positiveInt(900),
    MEDIA_MAX_VIDEO_BYTES: positiveInt(104857600),
    MEDIA_MAX_THUMBNAIL_BYTES: positiveInt(5242880),
    MEDIA_MAX_VIDEO_DURATION_SECONDS: positiveInt(45),
    FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
    FFPROBE_PATH: z.string().min(1).default('ffprobe'),
    RATE_LIMIT_GENERAL_PER_MINUTE: positiveInt(600),
    RATE_LIMIT_PUBLIC_MENU_PER_MINUTE: positiveInt(120),
    RATE_LIMIT_ANALYTICS_SESSION_PER_MINUTE: positiveInt(30),
    RATE_LIMIT_ANALYTICS_EVENTS_PER_MINUTE: positiveInt(300),
    RATE_LIMIT_MEDIA_PER_HOUR: positiveInt(20),
    RATE_LIMIT_ADMIN_PER_MINUTE: positiveInt(120),
    HEALTH_TIMEOUT_MS: positiveInt(2000),
  })
  .passthrough();

export function parseEnvironment(env = process.env) {
  const value = baseSchema.parse(env);
  if (value.NODE_ENV === 'production') {
    const required = [
      'DATABASE_URL',
      'CLERK_SECRET_KEY',
      'CLERK_PUBLISHABLE_KEY',
      'CLERK_WEBHOOK_SIGNING_SECRET',
      'MEDIA_STORAGE_BUCKET',
      'MEDIA_STORAGE_ACCESS_KEY_ID',
      'MEDIA_STORAGE_SECRET_ACCESS_KEY',
      'MEDIA_PUBLIC_BASE_URL',
      'FRONTEND_URL',
    ];
    const missing = required.filter((key) => !value[key]);
    if (missing.length)
      throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
  }
  return value;
}

export function buildConfig(env = process.env) {
  const value = parseEnvironment(env);
  const production = value.NODE_ENV === 'production';
  return {
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    publicAppUrl: value.PUBLIC_APP_URL,
    clerkSecretKey: value.CLERK_SECRET_KEY,
    clerkPublishableKey: value.CLERK_PUBLISHABLE_KEY,
    clerkWebhookSigningSecret: value.CLERK_WEBHOOK_SIGNING_SECRET,
    corsOrigins: [value.FRONTEND_URL, value.ADMIN_APP_URL, value.PUBLIC_APP_URL].filter(Boolean),
    trustProxy: value.TRUST_PROXY === 'false' ? false : value.TRUST_PROXY,
    jsonBodyLimit: value.JSON_BODY_LIMIT,
    databaseUrl: value.DATABASE_URL,
    database: {
      url: value.DATABASE_URL,
      max: value.DATABASE_POOL_MAX,
      connectionTimeoutMillis: value.DATABASE_CONNECT_TIMEOUT_MS,
      queryTimeout: value.DATABASE_QUERY_TIMEOUT_MS,
      ssl: value.DATABASE_SSL === 'true' || production ? { rejectUnauthorized: production } : false,
    },
    media: {
      provider: value.STORAGE_PROVIDER,
      bucket: value.MEDIA_STORAGE_BUCKET,
      region: value.MEDIA_STORAGE_REGION,
      endpoint: value.MEDIA_STORAGE_ENDPOINT,
      accessKeyId: value.MEDIA_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: value.MEDIA_STORAGE_SECRET_ACCESS_KEY,
      publicBaseUrl: value.MEDIA_PUBLIC_BASE_URL,
      uploadExpiresSeconds: value.MEDIA_UPLOAD_EXPIRES_SECONDS,
      maxVideoBytes: value.MEDIA_MAX_VIDEO_BYTES,
      maxThumbnailBytes: value.MEDIA_MAX_THUMBNAIL_BYTES,
      maxVideoDurationSeconds: value.MEDIA_MAX_VIDEO_DURATION_SECONDS,
      ffmpegPath: value.FFMPEG_PATH,
      ffprobePath: value.FFPROBE_PATH,
      required: production,
    },
    rateLimits: {
      general: value.RATE_LIMIT_GENERAL_PER_MINUTE,
      publicMenu: value.RATE_LIMIT_PUBLIC_MENU_PER_MINUTE,
      analyticsSessions: value.RATE_LIMIT_ANALYTICS_SESSION_PER_MINUTE,
      analyticsEvents: value.RATE_LIMIT_ANALYTICS_EVENTS_PER_MINUTE,
      media: value.RATE_LIMIT_MEDIA_PER_HOUR,
      admin: value.RATE_LIMIT_ADMIN_PER_MINUTE,
    },
    healthTimeoutMs: value.HEALTH_TIMEOUT_MS,
  };
}
