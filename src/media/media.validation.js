import { z } from 'zod';

const id = z.string().uuid();
export const itemParamsSchema = z.object({ itemId: id }).strict();
export const mediaParamsSchema = z.object({ id }).strict();
export const uploadSchema = z.object({ mime_type: z.enum(['video/mp4', 'video/webm', 'video/quicktime']) }).strict();
export const thumbnailUploadSchema = z.object({ mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']) }).strict();
export const completeVideoSchema = z.object({ duration_ms: z.number().int().positive().max(3600000).optional() }).strict();
export const emptySchema = z.object({}).strict();
