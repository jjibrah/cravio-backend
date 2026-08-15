import { z } from 'zod';

const id = z.string().uuid();
const name = z.string().trim().min(1).max(100);
const code = z.string().trim().toUpperCase().min(1).max(20).regex(/^[A-Z0-9_-]+$/);
export const createTableSchema = z.object({ name, code }).strict();
export const bulkTableSchema = z.object({ count: z.number().int().min(1).max(50), prefix: z.string().trim().min(1).max(50).default('Table'), code_prefix: z.string().trim().toUpperCase().min(1).max(10).regex(/^[A-Z0-9_-]+$/).default('T') }).strict();
export const updateTableSchema = z.object({ name: name.optional(), code: code.optional(), is_active: z.boolean().optional() }).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export const idParamsSchema = z.object({ id }).strict();
export const tokenParamsSchema = z.object({ token: z.string().uuid() }).strict();
export const qrQuerySchema = z.object({ format: z.enum(['png', 'svg']).default('png') }).strict();
