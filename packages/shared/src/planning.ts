import { z } from 'zod';
import { orderSchema } from './entities/order.ts';
import { districtTravelSchema, outletSchema, vehicleSchema } from './entities/reference.ts';
import { brandSchema, deferralTypeSchema, dockTypeSchema, reasonCodeSchema } from './enums.ts';
import {
  depotIdSchema,
  districtSchema,
  isoDateSchema,
  outletIdSchema,
  timestampSchema,
  tripKeySchema,
  tripNoSchema,
  uuidSchema,
  vehicleIdSchema,
} from './primitives.ts';

// Planning engine contract (SYSTEM_DESIGN §7.1). The engine is pure: callers build PlanInput.

export const violationSchema = z.object({
  rule: reasonCodeSchema,
  orderId: uuidSchema.optional(),
  tripKey: tripKeySchema.optional(),
  detail: z.string().min(1),
});
export type Violation = z.infer<typeof violationSchema>;

export const priorityWeightsSchema = z.object({
  deferredYesterday: z.number().nonnegative(),
  perDaySinceLastServed: z.number().nonnegative(),
  daysSinceLastServedMax: z.number().nonnegative(),
  chilled: z.number().nonnegative(),
  freshBefore8: z.number().nonnegative(),
  tightWindowMax: z.number().nonnegative(),
});
export type PriorityWeights = z.infer<typeof priorityWeightsSchema>;

// SYSTEM_DESIGN §7.4 defaults; the dispatcher UI shows and may change them.
export const defaultPriorityWeights: PriorityWeights = {
  deferredYesterday: 40,
  perDaySinceLastServed: 5,
  daysSinceLastServedMax: 30,
  chilled: 10,
  freshBefore8: 10,
  tightWindowMax: 10,
};

export const orderLiteSchema = orderSchema
  .pick({ id: true, outletId: true, brand: true, temp: true, weightKg: true, volumeM3: true })
  .extend({
    deferredYesterday: z.boolean(),
    daysSinceLastServed: z.int().nonnegative(),
  });
export type OrderLite = z.infer<typeof orderLiteSchema>;

export const vehicleLiteSchema = vehicleSchema.pick({
  id: true,
  type: true,
  temp: true,
  weightCapKg: true,
  volumeCapM3: true,
  kmPerL: true,
  depotId: true,
});
export type VehicleLite = z.infer<typeof vehicleLiteSchema>;

export const serviceAllowanceKeySchema = z.templateLiteral([brandSchema, ':', dockTypeSchema]);
export type ServiceAllowanceKey = z.infer<typeof serviceAllowanceKeySchema>;

export const planInputSchema = z.object({
  serviceDate: isoDateSchema,
  depotId: depotIdSchema,
  orders: z.array(orderLiteSchema),
  vehicles: z.array(vehicleLiteSchema),
  outlets: z.record(outletIdSchema, outletSchema),
  districtTravel: z.record(districtSchema, districtTravelSchema),
  serviceAllowance: z.record(serviceAllowanceKeySchema, z.number().nonnegative()),
  fuelRemainingL: z.record(vehicleIdSchema, z.number()),
  policy: priorityWeightsSchema,
});
export type PlanInput = z.infer<typeof planInputSchema>;

export const plannedStopSchema = z.object({
  orderId: uuidSchema,
  seq: z.int().positive(),
  plannedArrival: timestampSchema,
});
export type PlannedStop = z.infer<typeof plannedStopSchema>;

const ratioSchema = z.number().min(0);

export const tripPlanSchema = z.object({
  vehicleId: vehicleIdSchema,
  tripNo: tripNoSchema,
  brand: brandSchema,
  district: districtSchema,
  stops: z.array(plannedStopSchema).min(1),
  minutes: z.number().nonnegative(),
  km: z.number().nonnegative(),
  litres: z.number().nonnegative(),
  utilization: z.object({ weight: ratioSchema, volume: ratioSchema }),
});
export type TripPlan = z.infer<typeof tripPlanSchema>;

export const plannedDeferralSchema = z.object({
  orderId: uuidSchema,
  reason: reasonCodeSchema,
  type: deferralTypeSchema,
  explain: z.string().min(1),
});
export type PlannedDeferral = z.infer<typeof plannedDeferralSchema>;

// Plan scorecard (SYSTEM_DESIGN §7.6).
export const planMetricsSchema = z.object({
  servedOrders: z.int().nonnegative(),
  servedVolumeM3: z.number().nonnegative(),
  deferredOrders: z.int().nonnegative(),
  deferredVolumeM3: z.number().nonnegative(),
  repeatDeferrals: z.int().nonnegative(),
  avgWeightUtilization: ratioSchema,
  avgVolumeUtilization: ratioSchema,
  reeferUtilization: ratioSchema,
  vanUtilization: ratioSchema,
  fuelUsedL: z.number().nonnegative(),
  tightWindowStops: z.int().nonnegative(),
});
export type PlanMetrics = z.infer<typeof planMetricsSchema>;

export const planResultSchema = z.object({
  trips: z.array(tripPlanSchema),
  deferred: z.array(plannedDeferralSchema),
  metrics: planMetricsSchema,
});
export type PlanResult = z.infer<typeof planResultSchema>;
