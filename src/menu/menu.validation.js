import { z } from 'zod';

const id = z.string().uuid();
const name = z.string().trim().min(1).max(120);
const description = z.string().trim().max(2000).nullable().optional();
const boolean = z.boolean();
const price = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const text = typeof value === 'number' ? String(value) : value.trim();
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(text)) {
    ctx.addIssue({ code: 'custom', message: 'Price must be a non-negative decimal with at most two decimal places' });
    return z.NEVER;
  }
  return Number(text).toFixed(2);
});

export const createCategorySchema = z.object({
  name,
  description,
  is_active: boolean.optional()
}).strict();

export const updateCategorySchema = z.object({
  name: name.optional(),
  description,
  is_active: boolean.optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const reorderCategoriesSchema = z.object({
  category_ids: z.array(id).min(1).refine((ids) => new Set(ids).size === ids.length, 'Duplicate category IDs are not allowed')
}).strict();

export const createMenuItemSchema = z.object({
  category_id: id,
  name,
  description,
  price,
  is_available: boolean.optional(),
  is_active: boolean.optional()
}).strict();

export const updateMenuItemSchema = z.object({
  category_id: id.optional(),
  name: name.optional(),
  description,
  price: price.optional(),
  is_available: boolean.optional(),
  is_active: boolean.optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required');

export const updateAvailabilitySchema = z.object({ is_available: boolean }).strict();

export const reorderItemsSchema = z.object({
  category_id: id,
  item_ids: z.array(id).min(1).refine((ids) => new Set(ids).size === ids.length, 'Duplicate menu item IDs are not allowed')
}).strict();

export const menuItemQuerySchema = z.object({
  category_id: id.optional(),
  available: z.enum(['true', 'false']).transform((value) => value === 'true').optional()
}).strict();

export const idParamsSchema = z.object({ id }).strict();
