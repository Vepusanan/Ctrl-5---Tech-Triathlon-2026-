import { z } from 'zod';
import { loadingIssueSchema } from '../entities/loading.ts';
import { tripSchema, tripStopSchema } from '../entities/planning.ts';
import { isoDateSchema, uuidSchema, vehicleIdSchema } from '../primitives.ts';
import { listResponseSchema } from './common.ts';

export const listTripsQuerySchema = z.object({
  date: isoDateSchema.optional(),
  vehicle: vehicleIdSchema.optional(),
});
export type ListTripsQuery = z.infer<typeof listTripsQuerySchema>;

export const tripListResponseSchema = listResponseSchema(tripSchema);
export type TripListResponse = z.infer<typeof tripListResponseSchema>;

export const tripDetailSchema = tripSchema.extend({ stops: z.array(tripStopSchema) });
export type TripDetail = z.infer<typeof tripDetailSchema>;

export const resequenceTripRequestSchema = z.object({
  stopIds: z
    .array(uuidSchema)
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Stop ids must be unique' }),
});
export type ResequenceTripRequest = z.infer<typeof resequenceTripRequestSchema>;

export const createLoadingIssueRequestSchema = loadingIssueSchema
  .pick({ orderId: true, type: true, qty: true })
  .extend({ note: z.string().trim().min(1).optional() });
export type CreateLoadingIssueRequest = z.infer<typeof createLoadingIssueRequestSchema>;
