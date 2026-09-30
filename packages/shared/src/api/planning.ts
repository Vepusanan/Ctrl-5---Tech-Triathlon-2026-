import { z } from 'zod';
import { orderSchema } from '../entities/order.ts';
import { deferralSchema } from '../entities/planning.ts';
import { deferralTypeSchema, reasonCodeSchema } from '../enums.ts';
import { orderLiteSchema, planResultSchema, violationSchema } from '../planning.ts';
import {
  depotIdSchema,
  isoDateSchema,
  outletIdSchema,
  timestampSchema,
  tripNoSchema,
  uuidSchema,
  vehicleIdSchema,
  versionSchema,
} from '../primitives.ts';
import { listResponseSchema } from './common.ts';

export const planningRunParamsSchema = z.object({ date: isoDateSchema });
export type PlanningRunParams = z.infer<typeof planningRunParamsSchema>;

// Queue rows carry the deferral-history indicators the dispatcher needs (SRS FR-DEF-003).
export const planningQueueItemSchema = orderSchema.extend(
  orderLiteSchema.pick({ deferredYesterday: true, daysSinceLastServed: true }).shape,
);
export type PlanningQueueItem = z.infer<typeof planningQueueItemSchema>;

export const planningQueueResponseSchema = listResponseSchema(planningQueueItemSchema);
export type PlanningQueueResponse = z.infer<typeof planningQueueResponseSchema>;

export const autoAllocateResponseSchema = planResultSchema;
export type AutoAllocateResponse = z.infer<typeof autoAllocateResponseSchema>;

export const proposedTripSchema = z.object({
  vehicleId: vehicleIdSchema,
  tripNo: tripNoSchema,
  orderIds: z.array(uuidSchema).min(1),
});
export type ProposedTrip = z.infer<typeof proposedTripSchema>;

export const validatePlanRequestSchema = z.object({
  serviceDate: isoDateSchema,
  depotId: depotIdSchema,
  trips: z.array(proposedTripSchema),
});
export type ValidatePlanRequest = z.infer<typeof validatePlanRequestSchema>;

export const validatePlanResponseSchema = z.object({ violations: z.array(violationSchema) });
export type ValidatePlanResponse = z.infer<typeof validatePlanResponseSchema>;

// target null returns the order to the unallocated queue.
export const moveAllocationRequestSchema = z.object({
  orderId: uuidSchema,
  target: z.object({ vehicleId: vehicleIdSchema, tripNo: tripNoSchema }).nullable(),
});
export type MoveAllocationRequest = z.infer<typeof moveAllocationRequestSchema>;

export const publishPlanResponseSchema = z.object({
  planVersion: versionSchema,
  publishedAt: timestampSchema,
});
export type PublishPlanResponse = z.infer<typeof publishPlanResponseSchema>;

export const createDeferralRequestSchema = z.object({
  orderId: uuidSchema,
  serviceDate: isoDateSchema,
  reasonCode: reasonCodeSchema,
  type: deferralTypeSchema,
  note: z.string().trim().min(1).optional(),
});
export type CreateDeferralRequest = z.infer<typeof createDeferralRequestSchema>;

export const listDeferralsQuerySchema = z.object({ outlet: outletIdSchema.optional() });
export type ListDeferralsQuery = z.infer<typeof listDeferralsQuerySchema>;

export const deferralListResponseSchema = listResponseSchema(deferralSchema);
export type DeferralListResponse = z.infer<typeof deferralListResponseSchema>;
