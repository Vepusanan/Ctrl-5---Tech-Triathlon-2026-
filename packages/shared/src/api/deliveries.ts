import { z } from 'zod';
import { podSchema } from '../entities/field.ts';
import { stopStatusSchema, tripStatusSchema } from '../enums.ts';
import { timeOfDaySchema, timestampSchema, uuidSchema, versionSchema } from '../primitives.ts';
import { tripOrderSummarySchema } from './trips.ts';

// Multipart text fields. Signature and photo travel as files, not JSON.
export const podUploadFieldsSchema = z.object({
  recipientName: z
    .string()
    .trim()
    .min(1, 'Recipient name is required')
    .max(120, 'Recipient name is too long'),
  clientTime: timestampSchema,
});
export type PodUploadFields = z.infer<typeof podUploadFieldsSchema>;

export const deliveryStopSchema = z.object({
  id: uuidSchema,
  tripId: uuidSchema,
  tripStatus: tripStatusSchema,
  tripVersion: versionSchema,
  seq: z.int().positive(),
  plannedArrival: timestampSchema,
  eta: timestampSchema,
  status: stopStatusSchema,
  late: z.boolean(),
  windowClose: timeOfDaySchema,
  failureReason: z.string().min(1).nullable(),
  order: tripOrderSummarySchema,
  pod: podSchema.nullable(),
});
export type DeliveryStop = z.infer<typeof deliveryStopSchema>;
