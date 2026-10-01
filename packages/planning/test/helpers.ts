import type { PlanInput, PlanResult, ServiceAllowanceKey } from '@waypoint/shared';
import { planResultSchema } from '@waypoint/shared';
import { expect } from 'vitest';
import { type ValidatorInput, validatePlan } from '../src/index.ts';

const BRANDS = ['Fresh', 'Style', 'Tech'] as const;
const DOCKS = ['street', 'rear_dock', 'mall_bay'] as const;

export function allServiceAllowances(minutes = 15): PlanInput['serviceAllowance'] {
  const allowances = {} as PlanInput['serviceAllowance'];
  for (const brand of BRANDS) {
    for (const dock of DOCKS) {
      const key: ServiceAllowanceKey = `${brand}:${dock}`;
      allowances[key] = minutes;
    }
  }
  return allowances;
}

export function toValidatorInput(input: PlanInput): ValidatorInput {
  const availability: Record<string, 'available'> = {};
  for (const vehicle of input.vehicles) availability[vehicle.id] = 'available';
  return {
    serviceDate: input.serviceDate,
    orders: input.orders,
    vehicles: input.vehicles,
    outlets: input.outlets,
    districtTravel: input.districtTravel,
    serviceAllowance: input.serviceAllowance,
    fuelRemainingL: input.fuelRemainingL,
    availability,
  };
}

/** Feasibility, partition, trip limit, and same-group stops. */
export function assertAllocatorResult(input: PlanInput, result: PlanResult): void {
  expect(planResultSchema.safeParse(result).success).toBe(true);
  const drafts = result.trips.map((trip) => ({
    vehicleId: trip.vehicleId,
    tripNo: trip.tripNo,
    orderIds: trip.stops.map((stop) => stop.orderId),
  }));
  expect(validatePlan(toValidatorInput(input), drafts)).toEqual([]);

  const served: string[] = [];
  const perVehicle = new Map<string, number>();
  const tripKeys = new Set<string>();
  for (const trip of result.trips) {
    const key = `${trip.vehicleId}-${trip.tripNo}`;
    expect(tripKeys.has(key)).toBe(false);
    tripKeys.add(key);
    perVehicle.set(trip.vehicleId, (perVehicle.get(trip.vehicleId) ?? 0) + 1);
    expect(trip.stops.length).toBeGreaterThan(0);
    trip.stops.forEach((stop, index) => {
      expect(stop.seq).toBe(index + 1);
      served.push(stop.orderId);
    });
    const brands = new Set<string>();
    const districts = new Set<string>();
    const temps = new Set<string>();
    const access = new Set<string>();
    for (const stop of trip.stops) {
      const order = input.orders.find((item) => item.id === stop.orderId);
      const outlet = order ? input.outlets[order.outletId] : undefined;
      expect(order).toBeDefined();
      if (!order || !outlet) continue;
      expect(order.brand).toBe(trip.brand);
      expect(outlet.district).toBe(trip.district);
      brands.add(order.brand);
      districts.add(outlet.district);
      temps.add(order.temp);
      access.add(outlet.parkingConstraint === 'van_only' ? 'van_only' : 'standard');
    }
    expect(brands.size).toBe(1);
    expect(districts.size).toBe(1);
    expect(temps.size).toBe(1);
    expect(access.size).toBe(1);
  }
  for (const count of perVehicle.values()) expect(count).toBeLessThanOrEqual(2);

  const deferred = result.deferred.map((item) => item.orderId);
  expect(new Set(served).size).toBe(served.length);
  expect(new Set(deferred).size).toBe(deferred.length);
  expect([...served, ...deferred].sort()).toEqual(input.orders.map((order) => order.id).sort());
  expect(result.metrics.servedOrders).toBe(served.length);
  expect(result.metrics.deferredOrders).toBe(deferred.length);
}
