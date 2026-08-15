import { z } from 'zod';

export const qrParamsSchema = z.object({ qrToken: z.string().uuid() }).strict();
export const publicMenuQuerySchema = z.object({ available: z.literal('true').transform(() => true).optional() }).strict();
