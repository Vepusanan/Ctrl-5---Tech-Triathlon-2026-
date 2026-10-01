import type {
  PlanInput,
  ServiceAllowanceKey,
  TripNo,
  VehicleAvailabilityStatus,
} from '@waypoint/shared';

/**
 * One proposed vehicle-trip. Stop order is the order of `orderIds`.
 * Trip numbers are 1 or 2; a third draft for the same vehicle still counts toward the daily limit.
 */
export type TripDraft = {
  vehicleId: string;
  tripNo: TripNo;
  orderIds: readonly string[];
};

/**
 * Reference data for one service date. Clock times are Asia/Colombo wall times on `serviceDate`;
 * the validator never reads the system clock. `availability` is that date's fleet status.
 * Vehicles omitted from the map are not available.
 */
export type ValidatorInput = Pick<
  PlanInput,
  'serviceDate' | 'orders' | 'vehicles' | 'outlets' | 'districtTravel' | 'fuelRemainingL'
> & {
  /** Present pairs only. A missing pair for a stop is a broken input, not a soft violation. */
  serviceAllowance: Partial<Record<ServiceAllowanceKey, number>>;
  availability: Readonly<Record<string, VehicleAvailabilityStatus>>;
};
