import { z } from 'zod';
import { stopEventInputSchema } from '../entities/field.ts';
import { stopStatusSchema, syncEventResultStatusSchema } from '../enums.ts';
import { timestampSchema, uuidSchema, versionSchema } from '../primitives.ts';

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

// Enough for the driver to render a route-changed notice (SYSTEM_DESIGN §8.4).
export const syncRouteStopSchema = z.object({
  id: uuidSchema,
  orderId: uuidSchema,
  seq: z.int().positive(),
  plannedArrival: timestampSchema,
  status: stopStatusSchema,
});
export type SyncRouteStop = z.infer<typeof syncRouteStopSchema>;

export const syncRemovedStopSchema = z.object({ id: uuidSchema });
export type SyncRemovedStop = z.infer<typeof syncRemovedStopSchema>;

export const syncTripUnchangedSchema = z.object({
  changed: z.literal(false),
  tripId: uuidSchema,
  version: versionSchema,
});
export type SyncTripUnchanged = z.infer<typeof syncTripUnchangedSchema>;

export const syncTripChangedSchema = z.object({
  changed: z.literal(true),
  tripId: uuidSchema,
  since: versionSchema,
  version: versionSchema,
  added: z.array(syncRouteStopSchema),
  removed: z.array(syncRemovedStopSchema),
  reordered: z.array(syncRouteStopSchema),
  // The cached trip stays until the driver acknowledges this notice.
  acknowledgementRequired: z.literal(true),
});
export type SyncTripChanged = z.infer<typeof syncTripChangedSchema>;

export const syncTripDeltaSchema = z.discriminatedUnion('changed', [
  syncTripUnchangedSchema,
  syncTripChangedSchema,
]);
export type SyncTripDelta = z.infer<typeof syncTripDeltaSchema>;
