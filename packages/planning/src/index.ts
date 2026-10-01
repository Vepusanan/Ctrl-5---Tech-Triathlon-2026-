// Pure planning engine: import only @waypoint/shared; the caller supplies the current time.

export { allocate, describeAssignment } from './allocator.ts';
export type {
  PlannedArrival,
  PlannedStopTiming,
  TripDistanceInput,
  TripTimingInput,
  TripUtilization,
} from './calculations.ts';
export {
  calculateFirstTripStartMin,
  calculateFuelLitres,
  calculateNextTripStartMin,
  calculatePlannedArrivals,
  calculateTripDistance,
  calculateTripMinutes,
  calculateUtilization,
} from './calculations.ts';
export { TIGHT_WINDOW_SLACK_MIN, WIDE_DELIVERY_WINDOW_MIN } from './constants.ts';
export { InfeasiblePlanError, PlanningInputError } from './errors.ts';
export type {
  DeferralExplanation,
  Explanation,
  PlacementExplanation,
  ResourceKind,
} from './explain.ts';
export { explain } from './explain.ts';
export { buildPlanMetrics } from './metrics.ts';
export type { PriorityScore } from './priority.ts';
export { scoreOrder } from './priority.ts';
export type { TripDraft, ValidatorInput } from './types.ts';
export { validatePlan, validateTrip, validateVehicleDay } from './validator.ts';
