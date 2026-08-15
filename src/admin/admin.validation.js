import { z } from 'zod';

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};
const search = z.string().trim().min(1).max(100).optional();
const status = z.enum(['active', 'suspended', 'disabled']);
export const restaurantListSchema = z
  .object({
    ...pagination,
    status: status.optional(),
    published: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    search,
  })
  .strict();
export const ownerListSchema = z
  .object({ ...pagination, status: status.optional(), search })
  .strict();
export const userListSchema = z.object(pagination).strict();
export const idParamsSchema = z.object({ id: z.string().uuid() }).strict();
export const statusSchema = z.object({ status }).strict();
export const roleSchema = z.object({ role: z.enum(['owner', 'admin']) }).strict();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const dashboardSchema = z.object({ from: date.optional(), to: date.optional() }).strict();
