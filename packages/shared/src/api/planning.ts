import { z } from 'zod';
import { orderSchema } from '../entities/order.ts';
import { deferralSchema } from '../entities/planning.ts';
import { timeWindowSchema } from '../entities/reference.ts';
import { deferralTypeSchema, parkingConstraintSchema, reasonCodeSchema } from '../enums.ts';
import {
  orderLiteSchema,
  planMetricsSchema,
  planResultSchema,
  violationSchema,
} from '../planning.ts';
import {
  depotIdSchema,
  districtSchema,
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

const planningQueueOutletSchema = z.object({
  id: outletIdSchema,
  district: districtSchema,
  depotId: depotIdSchema,
  parkingConstraint: parkingConstraintSchema,
  window: timeWindowSchema,
  mallWindow: timeWindowSchema.nullable(),
});

const previousDeferralSchema = z.object({
  reasonCode: reasonCodeSchema,
  type: deferralTypeSchema,
  serviceDate: isoDateSchema,
});

// Queue rows carry outlet access, windows and deferral history (SRS FR-DEF-003).
export const planningQueueItemSchema = orderSchema
  .extend(orderLiteSchema.pick({ deferredYesterday: true, daysSinceLastServed: true }).shape)
  .extend({
    outlet: planningQueueOutletSchema,
    previousDeferral: previousDeferralSchema.nullable(),
  });
export type PlanningQueueItem = z.infer<typeof planningQueueItemSchema>;

export const planningQueueResponseSchema = listResponseSchema(planningQueueItemSchema).extend({
  depotId: depotIdSchema,
  planVersion: versionSchema,
});
export type PlanningQueueResponse = z.infer<typeof planningQueueResponseSchema>;

export const draftPlanResponseSchema = planResultSchema.extend({
  planVersion: versionSchema,
});
export type DraftPlanResponse = z.infer<typeof draftPlanResponseSchema>;

export const autoAllocateResponseSchema = draftPlanResponseSchema.extend({});
export type AutoAllocateResponse = z.infer<typeof autoAllocateResponseSchema>;

export const allocationResponseSchema = draftPlanResponseSchema.extend({});
export type AllocationResponse = z.infer<typeof allocationResponseSchema>;

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

export const simulateChangeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('vehicle_unavailable'), vehicleId: vehicleIdSchema }),
  z.object({ type: z.literal('extra_reefer') }),
  z.object({ type: z.literal('fresh_demand'), factor: z.number().gt(1) }),
]);
export type SimulateChange = z.infer<typeof simulateChangeSchema>;

export const simulatePlanRequestSchema = z.object({
  changes: z.array(simulateChangeSchema).min(1),
});
export type SimulatePlanRequest = z.infer<typeof simulatePlanRequestSchema>;

export const simulatePlanResponseSchema = z.object({
  baseline: planMetricsSchema,
  scenario: planMetricsSchema,
});
export type SimulatePlanResponse = z.infer<typeof simulatePlanResponseSchema>;

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
