import { z } from 'zod';
import {
  brandSchema,
  deferralTypeSchema,
  planningRunStatusSchema,
  reasonCodeSchema,
  stopStatusSchema,
  tripStatusSchema,
} from '../enums.ts';
import {
  depotIdSchema,
  districtSchema,
  isoDateSchema,
  timestampSchema,
  tripNoSchema,
  uuidSchema,
  vehicleIdSchema,
  versionSchema,
} from '../primitives.ts';

export const planningRunSchema = z.object({
  id: uuidSchema,
  depotId: depotIdSchema,
  serviceDate: isoDateSchema,
  status: planningRunStatusSchema,
  publishedAt: timestampSchema.nullable(),
  publishedBy: uuidSchema.nullable(),
  planVersion: versionSchema,
});
export type PlanningRun = z.infer<typeof planningRunSchema>;

export const tripSchema = z.object({
  id: uuidSchema,
  runId: uuidSchema,
  vehicleId: vehicleIdSchema,
  tripNo: tripNoSchema,
  brand: brandSchema,
  district: districtSchema,
  status: tripStatusSchema,
  version: versionSchema,
  plannedMinutes: z.number().nonnegative(),
  plannedKm: z.number().nonnegative(),
});
export type Trip = z.infer<typeof tripSchema>;

export const tripStopSchema = z.object({
  id: uuidSchema,
  tripId: uuidSchema,
  orderId: uuidSchema,
  seq: z.int().positive(),
  plannedArrival: timestampSchema,
  status: stopStatusSchema,
});
export type TripStop = z.infer<typeof tripStopSchema>;

export const deferralSchema = z.object({
  id: uuidSchema,
  orderId: uuidSchema,
  runId: uuidSchema,
  reasonCode: reasonCodeSchema,
  type: deferralTypeSchema,
  note: z.string().trim().min(1).nullable(),
  actorId: uuidSchema,
  createdAt: timestampSchema,
});
export type Deferral = z.infer<typeof deferralSchema>;
