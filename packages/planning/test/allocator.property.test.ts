import type {
  DockType,
  OrderLite,
  Outlet,
  ParkingConstraint,
  PlanInput,
  VehicleLite,
  VehicleTemperature,
  VehicleType,
} from '@waypoint/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { allocate, validateTrip } from '../src/index.ts';
import { allServiceAllowances, assertAllocatorResult, toValidatorInput } from './helpers.ts';

const SERVICE_DATE = '2026-10-03';
const DEPOT = 'Peliyagoda';

function hhmm(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function clockWindow(openMin: number, spanMin: number): { open: string; close: string } {
  const closeMin = Math.min(Math.max(openMin + spanMin, openMin + 1), 23 * 60 + 59);
  return { open: hhmm(openMin), close: hhmm(closeMin) };
}

function orderUuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

const outletAttrArb = fc.record({
  brand: fc.constantFrom('Fresh' as const, 'Style' as const, 'Tech' as const),
  district: fc.constantFrom('Colombo', 'Gampaha'),
  dockType: fc.constantFrom('street' as const, 'rear_dock' as const, 'mall_bay' as const),
  parkingConstraint: fc.constantFrom(
    'normal' as const,
    'normal' as const,
    'van_only' as const,
    'mall_dock' as const,
  ),
  wideWindow: fc.boolean(),
  openMin: fc.integer({ min: 0, max: 18 * 60 }),
  spanMin: fc.integer({ min: 30, max: 6 * 60 }),
  withMall: fc.boolean(),
  mallOpenMin: fc.integer({ min: 0, max: 18 * 60 }),
  mallSpanMin: fc.integer({ min: 30, max: 4 * 60 }),
});

const vehicleAttrArb = fc.record({
  type: fc.constantFrom('truck' as const, 'van' as const),
  temp: fc.constantFrom('ambient' as const, 'reefer' as const),
  weightCapKg: fc.integer({ min: 200, max: 4_000 }),
  volumeCapM3: fc.integer({ min: 4, max: 30 }),
  kmPerL: fc.integer({ min: 4, max: 12 }),
  fuel: fc.integer({ min: 0, max: 80 }),
});

const orderAttrArb = fc.record({
  outletIndex: fc.integer({ min: 0, max: 7 }),
  temp: fc.constantFrom('ambient' as const, 'chilled' as const),
  weightKg: fc.integer({ min: 1, max: 2_500 }),
  volumeM3: fc.integer({ min: 1, max: 40 }),
  deferredYesterday: fc.boolean(),
  daysSinceLastServed: fc.integer({ min: 0, max: 40 }),
});

const planInputArb: fc.Arbitrary<PlanInput> = fc
  .record({
    outlets: fc.array(outletAttrArb, { minLength: 1, maxLength: 3 }),
    vehicles: fc.array(vehicleAttrArb, { minLength: 1, maxLength: 3 }),
    orders: fc.array(orderAttrArb, { minLength: 1, maxLength: 5 }),
    depotMin: fc.integer({ min: 5, max: 160 }),
    depotKm: fc.integer({ min: 1, max: 40 }),
    interMin: fc.integer({ min: 1, max: 20 }),
    interKm: fc.integer({ min: 1, max: 8 }),
    allowance: fc.integer({ min: 5, max: 40 }),
    policy: fc.record({
      deferredYesterday: fc.integer({ min: 0, max: 40 }),
      perDaySinceLastServed: fc.integer({ min: 0, max: 10 }),
      daysSinceLastServedMax: fc.integer({ min: 0, max: 30 }),
      chilled: fc.integer({ min: 0, max: 20 }),
      freshBefore8: fc.integer({ min: 0, max: 20 }),
      tightWindowMax: fc.integer({ min: 0, max: 10 }),
    }),
  })
  .map((raw): PlanInput => {
    const outlets: Record<string, Outlet> = {};
    raw.outlets.forEach((attr, index) => {
      const id = `OUT${String(index + 1).padStart(3, '0')}`;
      const window = attr.wideWindow
        ? { open: '00:00', close: '23:59' }
        : clockWindow(attr.openMin, attr.spanMin);
      const mallWindow =
        attr.wideWindow || !attr.withMall ? null : clockWindow(attr.mallOpenMin, attr.mallSpanMin);
      const outlet: Outlet = {
        id,
        brand: attr.brand,
        district: attr.district,
        depotId: DEPOT,
        dockType: attr.dockType satisfies DockType,
        parkingConstraint: attr.parkingConstraint satisfies ParkingConstraint,
        window,
        mallWindow,
      };
      outlets[id] = outlet;
    });

    const vehicles: VehicleLite[] = raw.vehicles.map((attr, index) => ({
      id: `VEH${String(index + 1).padStart(3, '0')}`,
      type: attr.type satisfies VehicleType,
      temp: attr.temp satisfies VehicleTemperature,
      weightCapKg: attr.weightCapKg,
      volumeCapM3: attr.volumeCapM3,
      kmPerL: attr.kmPerL,
      depotId: DEPOT,
    }));
    const fuelRemainingL: Record<string, number> = {};
    vehicles.forEach((vehicle, index) => {
      fuelRemainingL[vehicle.id] = raw.vehicles[index]?.fuel ?? 0;
    });

    const outletIds = Object.keys(outlets);
    const orders: OrderLite[] = raw.orders.map((attr, index) => {
      const outletId = outletIds[attr.outletIndex % outletIds.length] ?? 'OUT001';
      const outlet = outlets[outletId];
      return {
        id: orderUuid(index + 1),
        outletId,
        brand: outlet?.brand ?? 'Fresh',
        temp: attr.temp,
        weightKg: attr.weightKg,
        volumeM3: attr.volumeM3,
        deferredYesterday: attr.deferredYesterday,
        daysSinceLastServed: attr.daysSinceLastServed,
      };
    });

    const districtTravel: PlanInput['districtTravel'] = {};
    for (const district of ['Colombo', 'Gampaha']) {
      districtTravel[district] = {
        district,
        depotId: DEPOT,
        roadClass: 'urban',
        depotToDistrictKm: raw.depotKm,
        depotToDistrictMin: raw.depotMin,
        interStopKm: raw.interKm,
        interStopMin: raw.interMin,
      };
    }

    return {
      serviceDate: SERVICE_DATE,
      depotId: DEPOT,
      orders,
      vehicles,
      outlets,
      districtTravel,
      serviceAllowance: allServiceAllowances(raw.allowance),
      fuelRemainingL,
      policy: raw.policy,
    };
  });

describe('allocate properties', () => {
  it('keeps every generated plan feasible, complete, and unsplittable', {
    timeout: 120_000,
  }, () => {
    fc.assert(
      fc.property(planInputArb, (input) => {
        const result = allocate(input);
        assertAllocatorResult(input, result);

        const validatorInput = toValidatorInput(input);
        for (const deferral of result.deferred) {
          expect(deferral.explain.length).toBeGreaterThan(0);
          const soloFeasible = input.vehicles.some(
            (vehicle) =>
              validateTrip(validatorInput, {
                vehicleId: vehicle.id,
                tripNo: 1,
                orderIds: [deferral.orderId],
              }).length === 0,
          );
          expect(deferral.type === 'prioritized').toBe(soloFeasible);
        }

        const servedIds = result.trips.flatMap((trip) => trip.stops.map((stop) => stop.orderId));
        const orderById = new Map(input.orders.map((order) => [order.id, order]));
        let servedVolume = 0;
        for (const orderId of servedIds) servedVolume += orderById.get(orderId)?.volumeM3 ?? 0;
        let deferredVolume = 0;
        let repeats = 0;
        for (const item of result.deferred) {
          const order = orderById.get(item.orderId);
          deferredVolume += order?.volumeM3 ?? 0;
          if (order?.deferredYesterday) repeats += 1;
        }
        expect(result.metrics.servedVolumeM3).toBeCloseTo(servedVolume);
        expect(result.metrics.deferredVolumeM3).toBeCloseTo(deferredVolume);
        expect(result.metrics.repeatDeferrals).toBe(repeats);
        expect(result.metrics.fuelUsedL).toBeCloseTo(
          result.trips.reduce((sum, trip) => sum + trip.litres, 0),
        );
        if (result.trips.length === 0) {
          expect(result.metrics.avgWeightUtilization).toBe(0);
          expect(result.metrics.avgVolumeUtilization).toBe(0);
        }
      }),
      { numRuns: 500 },
    );
  });
});
