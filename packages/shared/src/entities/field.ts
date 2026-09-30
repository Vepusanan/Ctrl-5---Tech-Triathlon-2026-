import { z } from 'zod';
import { type StopEventType, type StopStatus, stopEventTypeSchema } from '../enums.ts';
import { timestampSchema, uuidSchema, versionSchema } from '../primitives.ts';

export const stopStatusAfterEvent = {
  arrived: 'arrived',
  delivered: 'delivered',
  failed: 'failed',
} as const satisfies Record<StopEventType, StopStatus>;

const stopEventBase = {
  clientEventId: uuidSchema,
  stopId: uuidSchema,
  clientTime: timestampSchema,
  tripVersion: versionSchema,
};

// What the driver app writes to its outbox and sends, online or via sync (SYSTEM_DESIGN §8.2).
export const stopEventInputSchema = z.discriminatedUnion('type', [
  z.object({
    ...stopEventBase,
    type: z.literal(stopEventTypeSchema.enum.arrived),
    payload: z.strictObject({}),
  }),
  z.object({
    ...stopEventBase,
    type: z.literal(stopEventTypeSchema.enum.delivered),
    // The POD is uploaded first; a delivery cannot complete without it (SRS AC-12).
    payload: z.strictObject({ podId: uuidSchema }),
  }),
  z.object({
    ...stopEventBase,
    type: z.literal(stopEventTypeSchema.enum.failed),
    payload: z.strictObject({ reason: z.string().trim().min(1).max(200) }),
  }),
]);
export type StopEventInput = z.infer<typeof stopEventInputSchema>;

const stopEventStored = { id: uuidSchema, serverTime: timestampSchema };

export const stopEventSchema = z.discriminatedUnion('type', [
  stopEventInputSchema.options[0].extend(stopEventStored),
  stopEventInputSchema.options[1].extend(stopEventStored),
  stopEventInputSchema.options[2].extend(stopEventStored),
]);
export type StopEvent = z.infer<typeof stopEventSchema>;

// Signature and photo images travel as multipart uploads, not JSON.
export const podSchema = z.object({
  id: uuidSchema,
  stopId: uuidSchema,
  recipientName: z.string().trim().min(1).max(120),
  hasPhoto: z.boolean(),
  clientTime: timestampSchema,
});
export type Pod = z.infer<typeof podSchema>;
