import { z } from 'zod';

const text = (max) => z.string().trim().min(1).max(max);
const optionalNullableUrl = z.union([z.url().max(2048), z.null()]).optional();
const currency = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, 'Currency must be an ISO 4217 three-letter code');
const phone = z
  .string()
  .trim()
  .min(5)
  .max(32)
  .regex(/^[+0-9()\- .]+$/, 'Invalid phone number');

export const createRestaurantSchema = z
  .object({
    name: text(160),
    description: text(2000),
    phone,
    email: z.email().max(254),
    address: text(500),
    city: text(120),
    country: text(120),
    currency: currency.default('MYR'),
    logo_url: optionalNullableUrl,
    cover_image_url: optionalNullableUrl,
  })
  .strict();

export const updateRestaurantSchema = createRestaurantSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const statusSchema = z
  .object({ status: z.enum(['active', 'suspended', 'disabled']) })
  .strict();
export const slugParamsSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(180)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  })
  .strict();
export const idParamsSchema = z.object({ id: z.uuid() }).strict();
export const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    status: z.enum(['active', 'suspended', 'disabled']).optional(),
  })
  .strict();
