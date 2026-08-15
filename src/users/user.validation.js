import { z } from 'zod';

const name = z.string().trim().min(1).max(100).nullable();
export const profileSchema = z.object({ first_name: name.optional(), last_name: name.optional() }).strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one profile field is required');
export const idParamsSchema = z.object({ id: z.string().uuid() }).strict();
export const statusSchema = z.object({ status: z.enum(['active', 'suspended', 'disabled']) }).strict();
export const roleSchema = z.object({ role: z.enum(['owner', 'admin']) }).strict();
export const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
}).strict();
