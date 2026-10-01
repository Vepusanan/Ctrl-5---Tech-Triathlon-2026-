import type {
  Brand,
  DistrictTravel,
  OrderLite,
  Outlet,
  ReasonCode,
  ServiceAllowanceKey,
  TripNo,
  VehicleLite,
  Violation,
} from '@waypoint/shared';
import {
  calculateFirstTripStartMin,
  calculateFuelLitres,
  calculateNextTripStartMin,
  calculatePlannedArrivals,
  calculateTripDistance,
  calculateTripMinutes,
  calculateUtilization,
} from './calculations.ts';
import { DAY_TIME_BUDGET_MIN, FRESH_TIME_BUDGET_MIN, MAX_TRIPS_PER_VEHICLE } from './constants.ts';
import { PlanningInputError } from './errors.ts';
import { exceedsLimit, formatClock, formatQuantity, parseTimeOfDay } from './schedule.ts';
import type { TripDraft, ValidatorInput } from './types.ts';

type StopInfo = {
  order: OrderLite;
  outlet: Outlet;
  allowanceMin: number;
};

type ResolvedTrip = {
  trip: TripDraft;
  tripKey: string;
  vehicle: VehicleLite | undefined;
  available: boolean;
  stops: readonly StopInfo[];
  brands: readonly string[];
  districts: readonly string[];
  /** False when the trip mixes brands or districts. Those trips are omitted from time budgets. */
  uniform: boolean;
  primaryBrand: Brand;
  travel: DistrictTravel;
  minutes: number;
  outboundMin: number;
  litres: number | null;
  weightKg: number;
  volumeM3: number;
};

type ScheduledTrip = {
  resolved: ResolvedTrip;
  startMin: number;
};

type ViolationFields = {
  rule: ReasonCode;
  detail: string;
  orderId?: string;
  tripKey?: string;
  vehicleId?: string;
  actual?: number;
  limit?: number;
};

function violation(fields: ViolationFields): Violation {
  const result: Violation = { rule: fields.rule, detail: fields.detail };
  if (fields.orderId !== undefined) result.orderId = fields.orderId;
  if (fields.tripKey !== undefined) result.tripKey = fields.tripKey;
  if (fields.vehicleId !== undefined) result.vehicleId = fields.vehicleId;
  if (fields.actual !== undefined) result.actual = fields.actual;
  if (fields.limit !== undefined) result.limit = fields.limit;
  return result;
}

function tripKeyOf(vehicleId: string, tripNo: TripNo): string {
  return `${vehicleId}-${tripNo}`;
}

function uniqueInOrder(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique;
}

function indexOrders(orders: readonly OrderLite[]): Map<string, OrderLite> {
  const indexed = new Map<string, OrderLite>();
  for (const order of orders) {
    if (indexed.has(order.id)) {
      throw new PlanningInputError(`Duplicate order ${order.id}`);
    }
    indexed.set(order.id, order);
  }
  return indexed;
}

function remainingFuel(input: ValidatorInput, vehicleId: string): number {
  return input.fuelRemainingL[vehicleId] ?? 0;
}

function resolveTrip(
  input: ValidatorInput,
  orders: ReadonlyMap<string, OrderLite>,
  trip: TripDraft,
): ResolvedTrip {
  const tripKey = tripKeyOf(trip.vehicleId, trip.tripNo);
  if (trip.orderIds.length === 0) {
    throw new PlanningInputError(`Trip ${tripKey} has no stops`);
  }

  const vehicle = input.vehicles.find((item) => item.id === trip.vehicleId);
  const available = input.availability[trip.vehicleId] === 'available';
  if (!vehicle && available) {
    throw new PlanningInputError(`Unknown vehicle ${trip.vehicleId}`);
  }

  const stops: StopInfo[] = [];
  for (const orderId of trip.orderIds) {
    const order = orders.get(orderId);
    if (!order) throw new PlanningInputError(`Unknown order ${orderId}`);
    const outlet = input.outlets[order.outletId];
    if (!outlet) {
      throw new PlanningInputError(`Unknown outlet ${order.outletId} for order ${orderId}`);
    }
    const allowanceKey: ServiceAllowanceKey = `${order.brand}:${outlet.dockType}`;
    const allowanceMin = input.serviceAllowance[allowanceKey];
    if (allowanceMin === undefined) {
      throw new PlanningInputError(`No service allowance for ${allowanceKey}`);
    }
    stops.push({ order, outlet, allowanceMin });
  }

  const first = stops[0];
  if (!first) throw new PlanningInputError(`Trip ${tripKey} has no stops`);

  const travel = input.districtTravel[first.outlet.district];
  if (!travel) {
    throw new PlanningInputError(`No district travel for ${first.outlet.district}`);
  }

  const brands = uniqueInOrder(stops.map((stop) => stop.order.brand));
  const districts = uniqueInOrder(stops.map((stop) => stop.outlet.district));
  const serviceMinutes = stops.map((stop) => stop.allowanceMin);
  let weightKg = 0;
  let volumeM3 = 0;
  for (const stop of stops) {
    weightKg += stop.order.weightKg;
    volumeM3 += stop.order.volumeM3;
  }

  return {
    trip,
    tripKey,
    vehicle,
    available,
    stops,
    brands,
    districts,
    uniform: brands.length === 1 && districts.length === 1,
    primaryBrand: first.order.brand,
    travel,
    minutes: calculateTripMinutes({
      depotToDistrictMin: travel.depotToDistrictMin,
      interStopMin: travel.interStopMin,
      serviceAllowanceMin: serviceMinutes,
    }),
    outboundMin: travel.depotToDistrictMin,
    litres: vehicle
      ? calculateFuelLitres(
          calculateTripDistance({
            depotToDistrictKm: travel.depotToDistrictKm,
            interStopKm: travel.interStopKm,
            stopCount: stops.length,
          }),
          vehicle.kmPerL,
        )
      : null,
    weightKg,
    volumeM3,
  };
}

function windowViolations(resolved: ResolvedTrip, startMin: number): Violation[] {
  const violations: Violation[] = [];
  const vehicleId = resolved.trip.vehicleId;
  const arrivals = calculatePlannedArrivals({
    startMin,
    depotToDistrictMin: resolved.outboundMin,
    interStopMin: resolved.travel.interStopMin,
    stops: resolved.stops.map((stop) => ({
      serviceAllowanceMin: stop.allowanceMin,
      windowOpenMin: parseTimeOfDay(stop.outlet.window.open),
    })),
  });

  for (let index = 0; index < resolved.stops.length; index += 1) {
    const stop = resolved.stops[index];
    const planned = arrivals[index];
    if (!stop || !planned) continue;
    const base = planned.rawMin;
    const windowOpen = parseTimeOfDay(stop.outlet.window.open);
    const windowClose = parseTimeOfDay(stop.outlet.window.close);
    const deliveryArrival = planned.arrivalMin;
    let deliveryMiss = exceedsLimit(deliveryArrival, windowClose);

    const mall = stop.outlet.mallWindow;
    let mallMiss = false;
    let mallArrival = deliveryArrival;
    let mallClose = windowClose;
    if (mall) {
      const mallOpen = parseTimeOfDay(mall.open);
      mallClose = parseTimeOfDay(mall.close);
      mallArrival = Math.max(base, mallOpen);
      mallMiss = exceedsLimit(mallArrival, mallClose);
      if (!deliveryMiss && !mallMiss) {
        const sharedOpen = Math.max(base, windowOpen, mallOpen);
        const sharedClose = Math.min(windowClose, mallClose);
        if (exceedsLimit(sharedOpen, sharedClose)) {
          deliveryMiss = true;
          mallMiss = true;
          violations.push(
            violation({
              rule: 'WINDOW_MISSED',
              orderId: stop.order.id,
              tripKey: resolved.tripKey,
              vehicleId,
              detail: `Delivery window ${stop.outlet.window.open}-${stop.outlet.window.close} does not overlap mall window ${mall.open}-${mall.close}`,
              actual: sharedOpen,
              limit: sharedClose,
            }),
            violation({
              rule: 'WINDOW_MISSED',
              orderId: stop.order.id,
              tripKey: resolved.tripKey,
              vehicleId,
              detail: `Mall window ${mall.open}-${mall.close} does not overlap delivery window ${stop.outlet.window.open}-${stop.outlet.window.close}`,
              actual: sharedOpen,
              limit: sharedClose,
            }),
          );
          continue;
        }
      }
    }

    if (deliveryMiss) {
      violations.push(
        violation({
          rule: 'WINDOW_MISSED',
          orderId: stop.order.id,
          tripKey: resolved.tripKey,
          vehicleId,
          detail: `Planned arrival ${formatClock(deliveryArrival)} is after window close ${stop.outlet.window.close}`,
          actual: deliveryArrival,
          limit: windowClose,
        }),
      );
    }
    if (mall && mallMiss) {
      violations.push(
        violation({
          rule: 'WINDOW_MISSED',
          orderId: stop.order.id,
          tripKey: resolved.tripKey,
          vehicleId,
          detail: `Planned arrival ${formatClock(mallArrival)} is outside mall window ${mall.open}-${mall.close}`,
          actual: mallArrival,
          limit: mallClose,
        }),
      );
    }
  }

  return violations;
}

function tripViolations(
  input: ValidatorInput,
  resolved: ResolvedTrip,
  startMin: number,
): Violation[] {
  const violations: Violation[] = [];
  const { trip, tripKey, vehicle } = resolved;
  const vehicleId = trip.vehicleId;

  if (!resolved.available) {
    violations.push(
      violation({
        rule: 'VEHICLE_UNAVAILABLE',
        tripKey,
        vehicleId,
        detail: `Vehicle ${vehicleId} is not available on ${input.serviceDate}`,
      }),
    );
  }

  if (resolved.brands.length > 1) {
    violations.push(
      violation({
        rule: 'MIXED_BRAND_DISTRICT',
        tripKey,
        vehicleId,
        detail: `Trip ${tripKey} mixes brands (${resolved.brands.join(', ')})`,
      }),
    );
  }
  if (resolved.districts.length > 1) {
    violations.push(
      violation({
        rule: 'MIXED_BRAND_DISTRICT',
        tripKey,
        vehicleId,
        detail: `Trip ${tripKey} mixes districts (${resolved.districts.join(', ')})`,
      }),
    );
  }

  for (const stop of resolved.stops) {
    if (vehicle && stop.order.temp === 'chilled' && vehicle.temp !== 'reefer') {
      violations.push(
        violation({
          rule: 'REEFER_REQUIRED',
          orderId: stop.order.id,
          tripKey,
          vehicleId,
          detail: `Chilled order on ambient vehicle ${vehicleId}`,
        }),
      );
    }
    if (vehicle && stop.outlet.parkingConstraint === 'van_only' && vehicle.type !== 'van') {
      violations.push(
        violation({
          rule: 'VAN_REQUIRED',
          orderId: stop.order.id,
          tripKey,
          vehicleId,
          detail: `van_only outlet ${stop.outlet.id} requires a van`,
        }),
      );
    }
    if (vehicle && stop.outlet.depotId !== vehicle.depotId) {
      violations.push(
        violation({
          rule: 'WRONG_DEPOT',
          orderId: stop.order.id,
          tripKey,
          vehicleId,
          detail: `Vehicle ${vehicleId} is based at ${vehicle.depotId} but outlet ${stop.outlet.id} is served from ${stop.outlet.depotId}`,
        }),
      );
    }
  }

  violations.push(...windowViolations(resolved, startMin));

  if (vehicle) {
    const utilization = calculateUtilization({
      weightKg: resolved.weightKg,
      weightCapKg: vehicle.weightCapKg,
      volumeM3: resolved.volumeM3,
      volumeCapM3: vehicle.volumeCapM3,
    });
    if (exceedsLimit(utilization.weight, 1)) {
      violations.push(
        violation({
          rule: 'WEIGHT_CAP',
          tripKey,
          vehicleId,
          detail: `Weight ${formatQuantity(resolved.weightKg)} kg exceeds capacity ${formatQuantity(vehicle.weightCapKg)} kg`,
          actual: resolved.weightKg,
          limit: vehicle.weightCapKg,
        }),
      );
    }
    if (exceedsLimit(utilization.volume, 1)) {
      violations.push(
        violation({
          rule: 'VOLUME_CAP',
          tripKey,
          vehicleId,
          detail: `Volume ${formatQuantity(resolved.volumeM3)} m3 exceeds capacity ${formatQuantity(vehicle.volumeCapM3)} m3`,
          actual: resolved.volumeM3,
          limit: vehicle.volumeCapM3,
        }),
      );
    }
  }
  if (resolved.litres !== null && exceedsLimit(resolved.litres, remainingFuel(input, vehicleId))) {
    const remaining = remainingFuel(input, vehicleId);
    violations.push(
      violation({
        rule: 'FUEL_QUOTA',
        tripKey,
        vehicleId,
        detail: `Trip ${tripKey} uses ${formatQuantity(resolved.litres)} L; weekly fuel remaining is ${formatQuantity(remaining)} L`,
        actual: resolved.litres,
        limit: remaining,
      }),
    );
  }

  return violations;
}

function scheduleTrips(
  input: ValidatorInput,
  orders: ReadonlyMap<string, OrderLite>,
  trips: readonly TripDraft[],
): ScheduledTrip[] {
  const ordered = trips
    .map((trip, index) => ({ trip, index }))
    .sort((left, right) => left.trip.tripNo - right.trip.tripNo || left.index - right.index);

  const scheduled: ScheduledTrip[] = [];
  for (const { trip } of ordered) {
    const resolved = resolveTrip(input, orders, trip);
    const previous = scheduled.at(-1);
    const startMin = previous
      ? calculateNextTripStartMin({
          startMin: previous.startMin,
          tripMinutes: previous.resolved.minutes,
          outboundMin: previous.resolved.outboundMin,
        })
      : calculateFirstTripStartMin(resolved.primaryBrand);
    scheduled.push({ resolved, startMin });
  }
  return scheduled;
}

function vehicleDayViolations(
  input: ValidatorInput,
  vehicleId: string,
  scheduled: readonly ScheduledTrip[],
): Violation[] {
  const violations: Violation[] = [];
  if (scheduled.length > MAX_TRIPS_PER_VEHICLE) {
    violations.push(
      violation({
        rule: 'TRIP_LIMIT',
        vehicleId,
        detail: `Vehicle ${vehicleId} has ${scheduled.length} trips; the daily limit is ${MAX_TRIPS_PER_VEHICLE}`,
        actual: scheduled.length,
        limit: MAX_TRIPS_PER_VEHICLE,
      }),
    );
  }

  let freshMin = 0;
  let dayMin = 0;
  let fuelSum = 0;
  let fuelTrips = 0;
  for (const { resolved } of scheduled) {
    if (resolved.uniform && resolved.primaryBrand === 'Fresh') freshMin += resolved.minutes;
    else if (resolved.uniform) dayMin += resolved.minutes;
    if (resolved.litres !== null) {
      fuelSum += resolved.litres;
      fuelTrips += 1;
    }
  }

  if (exceedsLimit(freshMin, FRESH_TIME_BUDGET_MIN)) {
    violations.push(
      violation({
        rule: 'FRESH_TIME_BUDGET',
        vehicleId,
        detail: `Fresh trips total ${formatQuantity(freshMin)} min; the pre-dawn budget is ${FRESH_TIME_BUDGET_MIN} min`,
        actual: freshMin,
        limit: FRESH_TIME_BUDGET_MIN,
      }),
    );
  }
  if (exceedsLimit(dayMin, DAY_TIME_BUDGET_MIN)) {
    violations.push(
      violation({
        rule: 'DAY_TIME_BUDGET',
        vehicleId,
        detail: `Style and Tech trips total ${formatQuantity(dayMin)} min; the daytime budget is ${DAY_TIME_BUDGET_MIN} min`,
        actual: dayMin,
        limit: DAY_TIME_BUDGET_MIN,
      }),
    );
  }

  const remaining = remainingFuel(input, vehicleId);
  if (scheduled.length > 1 && fuelTrips === scheduled.length && exceedsLimit(fuelSum, remaining)) {
    violations.push(
      violation({
        rule: 'FUEL_QUOTA',
        vehicleId,
        detail: `Vehicle ${vehicleId} trips use ${formatQuantity(fuelSum)} L; weekly fuel remaining is ${formatQuantity(remaining)} L`,
        actual: fuelSum,
        limit: remaining,
      }),
    );
  }

  return violations;
}

/**
 * Checks one trip on its own. A lone trip leaves at 03:30 when it is Fresh and at 08:00 otherwise.
 * Trip 2's start depends on trip 1, so call `validateVehicleDay` or `validatePlan` for a full day.
 */
export function validateTrip(input: ValidatorInput, trip: TripDraft): Violation[] {
  const resolved = resolveTrip(input, indexOrders(input.orders), trip);
  return tripViolations(input, resolved, calculateFirstTripStartMin(resolved.primaryBrand));
}

/** Trip rules for one vehicle, with trip 2 chained after trip 1 returns, plus the daily limits. */
export function validateVehicleDay(
  input: ValidatorInput,
  vehicleId: string,
  trips: readonly TripDraft[],
): Violation[] {
  const own = trips.filter((trip) => trip.vehicleId === vehicleId);
  const scheduled = scheduleTrips(input, indexOrders(input.orders), own);
  const violations: Violation[] = [];
  for (const item of scheduled) {
    violations.push(...tripViolations(input, item.resolved, item.startMin));
  }
  violations.push(...vehicleDayViolations(input, vehicleId, scheduled));
  return violations;
}

/** Every trip violation and every vehicle-day violation. Does not stop at the first breach. */
export function validatePlan(input: ValidatorInput, trips: readonly TripDraft[]): Violation[] {
  const grouped = new Map<string, TripDraft[]>();
  for (const trip of trips) {
    const existing = grouped.get(trip.vehicleId);
    if (existing) existing.push(trip);
    else grouped.set(trip.vehicleId, [trip]);
  }

  const violations: Violation[] = [];
  for (const vehicleId of [...grouped.keys()].sort()) {
    const vehicleTrips = grouped.get(vehicleId);
    if (!vehicleTrips) continue;
    violations.push(...validateVehicleDay(input, vehicleId, vehicleTrips));
  }
  return violations;
}
