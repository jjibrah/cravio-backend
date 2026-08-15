import { z } from 'zod';

const id = z.string().uuid();
export const itemParamsSchema = z.object({ itemId: id }).strict();
export const mediaParamsSchema = z.object({ id }).strict();
export const uploadSchema = z
  .object({
    mime_type: z.enum(['video/mp4', 'video/webm']),
    original_filename: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .refine((value) => !/[\\/]/.test(value), 'Filename must not contain a path')
      .optional(),
  })
  .strict();
export const thumbnailUploadSchema = z
  .object({ mime_type: z.enum(['image/jpeg', 'image/png', 'image/webp']) })
  .strict();
export const completeVideoSchema = z.object({}).strict();
export const emptySchema = z.object({}).strict();
