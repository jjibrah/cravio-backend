import { z } from 'zod';
import { eventTypes } from './analytics.repository.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'Invalid date');
export const sessionSchema = z.object({ qr_token: uuid }).strict();
const metadata = z.object({ selected_item_count: z.number().int().min(0).max(100).optional(), video_progress_percent: z.number().min(0).max(100).optional(), frontend_version: z.string().trim().max(50).optional() }).strict().refine((value) => JSON.stringify(value).length <= 1024, 'Metadata is too large');
export const eventSchema = z.object({ session_id: uuid, event_type: z.enum(eventTypes), menu_item_id: uuid.optional(), watch_duration_seconds: z.number().min(0).max(120).optional(), metadata: metadata.optional() }).strict();
export const rangeSchema = z.object({ from: date.optional(), to: date.optional() }).strict();
export const itemListSchema = rangeSchema.extend({ sort: z.enum(['video_opens', 'selection_rate', 'impressions', 'adds_to_selection']).default('video_opens') }).strict();
export const itemParamsSchema = z.object({ id: uuid }).strict();
