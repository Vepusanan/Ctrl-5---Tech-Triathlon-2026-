import { z } from 'zod';
import { stopEventInputSchema } from '../entities/field.ts';
import { syncEventResultStatusSchema } from '../enums.ts';
import { uuidSchema } from '../primitives.ts';

export const SYNC_BATCH_LIMIT = 100;

export const syncEventsRequestSchema = z.object({
  events: z.array(stopEventInputSchema).min(1).max(SYNC_BATCH_LIMIT),
});
export type SyncEventsRequest = z.infer<typeof syncEventsRequestSchema>;

export const syncEventResultSchema = z.object({
  clientEventId: uuidSchema,
  status: syncEventResultStatusSchema,
  detail: z.string().min(1).optional(),
});
export type SyncEventResult = z.infer<typeof syncEventResultSchema>;

export const syncEventsResponseSchema = z.object({ results: z.array(syncEventResultSchema) });
export type SyncEventsResponse = z.infer<typeof syncEventsResponseSchema>;
