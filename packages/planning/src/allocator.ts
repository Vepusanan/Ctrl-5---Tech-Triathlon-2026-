import type {
  Brand,
  OrderLite,
  Outlet,
  PlanInput,
  PlannedDeferral,
  PlannedStop,
  PlanResult,
  ReasonCode,
  ServiceAllowanceKey,
  TripNo,
  TripPlan,
  VehicleAvailabilityStatus,
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
import { LIMIT_EPSILON, MAX_TRIPS_PER_VEHICLE, TIGHT_WINDOW_SLACK_MIN } from './constants.ts';
import { InfeasiblePlanError, PlanningInputError } from './errors.ts';
import { type DeferralExplanation, explain, type ResourceKind } from './explain.ts';
import { buildPlanMetrics } from './metrics.ts';
import { type PriorityScore, scoreOrder } from './priority.ts';
import { exceedsLimit, formatColomboTimestamp, parseTimeOfDay } from './schedule.ts';
import type { TripDraft, ValidatorInput } from './types.ts';
import { validatePlan, validateTrip, validateVehicleDay } from './validator.ts';

type Needs = {
  chilled: boolean;
  vanOnly: boolean;
};

type RankedOrder = {
  order: OrderLite;
  outlet: Outlet;
  needs: Needs;
  score: PriorityScore;
  groupKey: string;
  scarcity: number;
};

type MutableTrip = {
  vehicleId: string;
  tripNo: TripNo;
  groupKey: string;
  brand: Brand;
  district: string;
  orderIds: string[];
};

type Prepared = {
  input: PlanInput;
  validatorInput: ValidatorInput;
  fleet: VehicleLite[];
  orderById: Map<string, OrderLite>;
  vehicleById: Map<string, VehicleLite>;
};

type Placement =
  | { kind: 'existing'; index: number; position: number }
  | { kind: 'new'; vehicleId: string; tripNo: TripNo }
  | { kind: 'reject'; reason: ReasonCode };

type Rejection = {
  distance: number;
  reason: ReasonCode;
};

const REASON_ORDER: readonly ReasonCode[] = [
  'MIXED_BRAND_DISTRICT',
  'REEFER_REQUIRED',
  'VAN_REQUIRED',
  'WRONG_DEPOT',
  'VEHICLE_UNAVAILABLE',
  'WEIGHT_CAP',
  'VOLUME_CAP',
  'TRIP_LIMIT',
  'FRESH_TIME_BUDGET',
  'DAY_TIME_BUDGET',
  'WINDOW_MISSED',
  'FUEL_QUOTA',
];

/**
 * Transparent greedy allocator (SYSTEM_DESIGN §7.4).
 * Every kept placement has already passed the validator. The returned trips pass `validatePlan`.
 */
export function allocate(input: PlanInput): PlanResult {
  const prepared = prepare(input);
  const ranked = rankOrders(prepared);
  const trips: MutableTrip[] = [];
  const placed = new Set<string>();
  const blockReason = new Map<string, ReasonCode>();

  for (const item of ranked) {
    const placement = seekPlacement(prepared, trips, item);
    if (placement.kind === 'reject') {
      blockReason.set(item.order.id, placement.reason);
      continue;
    }
    commitPlacement(trips, item, placement);
    placed.add(item.order.id);
  }

  exchangeLowerScoreOrders(prepared, trips, ranked, placed, blockReason);
  return finish(prepared, ranked, trips, placed, blockReason);
}

/**
 * Runs the §7.4 exchange on a hand-built assignment.
 * Greedy placement would not produce a lower score in a slot a higher score can take;
 * tests use this to show the exchange itself.
 */
export function repairAssignment(input: PlanInput, drafts: readonly TripDraft[]): TripDraft[] {
  const prepared = prepare(input);
  const ranked = rankOrders(prepared);
  const trips = draftsToMutable(ranked, drafts);
  const placed = new Set<string>();
  for (const trip of trips) {
    for (const orderId of trip.orderIds) placed.add(orderId);
  }
  exchangeLowerScoreOrders(prepared, trips, ranked, placed, new Map());
  return trips.map((trip) => ({
    vehicleId: trip.vehicleId,
    tripNo: trip.tripNo,
    orderIds: trip.orderIds.slice(),
  }));
}

/**
 * Turns a dispatcher-built assignment into the same plan shape as `allocate`.
 * Trip minutes, fuel, arrivals, deferral class and the scorecard all come from this package.
 * Infeasible drafts throw `InfeasiblePlanError` with every violation.
 */
export function describeAssignment(input: PlanInput, drafts: readonly TripDraft[]): PlanResult {
  const prepared = prepare(input);
  const violations = validatePlan(prepared.validatorInput, drafts);
  if (violations.length > 0) throw new InfeasiblePlanError(violations);
  const seenKeys = new Set<string>();
  for (const draft of drafts) {
    const key = `${draft.vehicleId}-${draft.tripNo}`;
    if (seenKeys.has(key)) throw new PlanningInputError(`Duplicate trip ${key}`);
    seenKeys.add(key);
  }
  const ranked = rankOrders(prepared);
  const trips = draftsToTrips(ranked, drafts);
  const placed = new Set<string>();
  for (const trip of trips) {
    for (const orderId of trip.orderIds) placed.add(orderId);
  }
  return finish(prepared, ranked, trips, placed, new Map());
}

function finish(
  prepared: Prepared,
  ranked: readonly RankedOrder[],
  trips: readonly MutableTrip[],
  placed: ReadonlySet<string>,
  blockReason: ReadonlyMap<string, ReasonCode>,
): PlanResult {
  const rankedById = new Map(ranked.map((item) => [item.order.id, item]));
  const deferred: PlannedDeferral[] = [];
  for (const item of ranked) {
    if (placed.has(item.order.id)) continue;
    deferred.push(classifyDeferral(prepared, trips, item, blockReason));
  }
  deferred.sort((left, right) => {
    const leftScore = rankedById.get(left.orderId)?.score.total ?? 0;
    const rightScore = rankedById.get(right.orderId)?.score.total ?? 0;
    if (leftScore !== rightScore) return rightScore - leftScore;
    return compareId(left.orderId, right.orderId);
  });

  const { plans, tightWindowStops } = materialize(prepared, trips);
  const metrics = buildPlanMetrics({
    orders: prepared.input.orders,
    servedOrderIds: placed,
    deferredOrderIds: deferred.map((item) => item.orderId),
    trips: plans,
    fleet: prepared.fleet,
    tightWindowStops,
  });

  const violations = validatePlan(prepared.validatorInput, toDrafts(plans));
  if (violations.length > 0) throw new InfeasiblePlanError(violations);
  assertPartition(prepared.input.orders, plans, deferred);

  return { trips: plans, deferred, metrics };
}

function prepare(input: PlanInput): Prepared {
  const orderById = new Map<string, OrderLite>();
  for (const order of input.orders) {
    if (orderById.has(order.id)) throw new PlanningInputError(`Duplicate order ${order.id}`);
    if (!Number.isFinite(order.weightKg) || order.weightKg <= 0) {
      throw new PlanningInputError(`Order ${order.id} weight must be positive`);
    }
    if (!Number.isFinite(order.volumeM3) || order.volumeM3 <= 0) {
      throw new PlanningInputError(`Order ${order.id} volume must be positive`);
    }
    const outlet = input.outlets[order.outletId];
    if (!outlet) {
      throw new PlanningInputError(`Unknown outlet ${order.outletId} for order ${order.id}`);
    }
    if (!input.districtTravel[outlet.district]) {
      throw new PlanningInputError(`No district travel for ${outlet.district}`);
    }
    const allowanceKey: ServiceAllowanceKey = `${order.brand}:${outlet.dockType}`;
    if (input.serviceAllowance[allowanceKey] === undefined) {
      throw new PlanningInputError(`No service allowance for ${allowanceKey}`);
    }
    parseClock(outlet.window.open, `window open for ${outlet.id}`);
    parseClock(outlet.window.close, `window close for ${outlet.id}`);
    if (outlet.mallWindow) {
      parseClock(outlet.mallWindow.open, `mall open for ${outlet.id}`);
      parseClock(outlet.mallWindow.close, `mall close for ${outlet.id}`);
    }
    orderById.set(order.id, order);
  }

  const vehicleById = new Map<string, VehicleLite>();
  for (const vehicle of input.vehicles) {
    if (vehicleById.has(vehicle.id)) {
      throw new PlanningInputError(`Duplicate vehicle ${vehicle.id}`);
    }
    if (!Number.isFinite(vehicle.weightCapKg) || vehicle.weightCapKg <= 0) {
      throw new PlanningInputError(`Vehicle ${vehicle.id} weight capacity must be positive`);
    }
    if (!Number.isFinite(vehicle.volumeCapM3) || vehicle.volumeCapM3 <= 0) {
      throw new PlanningInputError(`Vehicle ${vehicle.id} volume capacity must be positive`);
    }
    if (!Number.isFinite(vehicle.kmPerL) || vehicle.kmPerL <= 0) {
      throw new PlanningInputError(`Vehicle ${vehicle.id} km per litre must be positive`);
    }
    vehicleById.set(vehicle.id, vehicle);
  }

  const availability: Record<string, VehicleAvailabilityStatus> = {};
  for (const vehicle of input.vehicles) availability[vehicle.id] = 'available';

  return {
    input,
    validatorInput: {
      serviceDate: input.serviceDate,
      orders: input.orders,
      vehicles: input.vehicles,
      outlets: input.outlets,
      districtTravel: input.districtTravel,
      serviceAllowance: input.serviceAllowance,
      fuelRemainingL: input.fuelRemainingL,
      availability,
    },
    fleet: input.vehicles.filter((vehicle) => vehicle.depotId === input.depotId),
    orderById,
    vehicleById,
  };
}

function parseClock(value: string, label: string): void {
  try {
    parseTimeOfDay(value);
  } catch {
    throw new PlanningInputError(`Invalid ${label}: ${value}`);
  }
}

function rankOrders(prepared: Prepared): RankedOrder[] {
  const ranked: RankedOrder[] = [];
  for (const order of prepared.input.orders) {
    const outlet = prepared.input.outlets[order.outletId];
    if (!outlet) throw new PlanningInputError(`Unknown outlet ${order.outletId}`);
    const needs: Needs = {
      chilled: order.temp === 'chilled',
      vanOnly: outlet.parkingConstraint === 'van_only',
    };
    ranked.push({
      order,
      outlet,
      needs,
      score: scoreOrder(order, outlet, prepared.input.policy),
      groupKey: groupKey(order.brand, outlet.district, needs),
      scarcity: scarcityRank(needs),
    });
  }
  ranked.sort(compareRanked);
  return ranked;
}

function compareRanked(left: RankedOrder, right: RankedOrder): number {
  if (left.scarcity !== right.scarcity) return left.scarcity - right.scarcity;
  if (left.score.total !== right.score.total) return right.score.total - left.score.total;
  return compareId(left.order.id, right.order.id);
}

/** Van-only chilled, then van-only ambient, then chilled, then ambient (§7.4). */
function scarcityRank(needs: Needs): number {
  if (needs.vanOnly && needs.chilled) return 0;
  if (needs.vanOnly) return 1;
  if (needs.chilled) return 2;
  return 3;
}

function groupKey(brand: Brand, district: string, needs: Needs): string {
  const temp = needs.chilled ? 'chilled' : 'ambient';
  const access = needs.vanOnly ? 'van_only' : 'standard';
  return `${brand}\u0000${district}\u0000${temp}\u0000${access}`;
}

function seekPlacement(
  prepared: Prepared,
  trips: readonly MutableTrip[],
  item: RankedOrder,
): Placement {
  const rejections: Rejection[] = [];
  let bestExisting: { index: number; position: number; binding: number } | null = null;

  for (let index = 0; index < trips.length; index += 1) {
    const trip = trips[index];
    if (!trip || trip.groupKey !== item.groupKey) continue;
    const vehicle = prepared.vehicleById.get(trip.vehicleId);
    if (!vehicle || !isSuitable(vehicle, item.outlet, item.needs)) continue;

    const load = tripLoad(prepared.orderById, trip.orderIds);
    const nextWeight = load.weightKg + item.order.weightKg;
    const nextVolume = load.volumeM3 + item.order.volumeM3;
    if (exceedsLimit(nextWeight, vehicle.weightCapKg)) {
      rejections.push({ distance: 2, reason: 'WEIGHT_CAP' });
      continue;
    }
    if (exceedsLimit(nextVolume, vehicle.volumeCapM3)) {
      rejections.push({ distance: 2, reason: 'VOLUME_CAP' });
      continue;
    }

    const position = firstFeasiblePosition(prepared, trips, index, item.order.id, rejections);
    if (position === null) continue;
    const binding = Math.max(nextWeight / vehicle.weightCapKg, nextVolume / vehicle.volumeCapM3);
    if (!bestExisting || binding > bestExisting.binding) {
      bestExisting = { index, position, binding };
    }
  }

  if (bestExisting) {
    return { kind: 'existing', index: bestExisting.index, position: bestExisting.position };
  }

  const choices = prepared.fleet.filter((vehicle) => isSuitable(vehicle, item.outlet, item.needs));
  choices.sort((left, right) => compareVehicleChoice(item.order, left, right));

  for (const vehicle of choices) {
    const tripNo = nextTripNo(trips, vehicle.id);
    if (tripNo === null) continue;
    if (exceedsLimit(item.order.weightKg, vehicle.weightCapKg)) {
      rejections.push({ distance: 2, reason: 'WEIGHT_CAP' });
      continue;
    }
    if (exceedsLimit(item.order.volumeM3, vehicle.volumeCapM3)) {
      rejections.push({ distance: 2, reason: 'VOLUME_CAP' });
      continue;
    }
    const drafts = vehicleDrafts(trips, vehicle.id);
    drafts.push({ vehicleId: vehicle.id, tripNo, orderIds: [item.order.id] });
    const violations = validateVehicleDay(prepared.validatorInput, vehicle.id, drafts);
    if (violations.length === 0) return { kind: 'new', vehicleId: vehicle.id, tripNo };
    rejections.push({
      distance: 1 + violations.length / 100,
      reason: dominantReason(violations),
    });
  }

  const reason = bestRejection(rejections);
  if (reason) return { kind: 'reject', reason };
  if (choices.length === 0) {
    return { kind: 'reject', reason: structuralReason(prepared.fleet, item.outlet, item.needs) };
  }
  return { kind: 'reject', reason: 'TRIP_LIMIT' };
}

function firstFeasiblePosition(
  prepared: Prepared,
  trips: readonly MutableTrip[],
  tripIndex: number,
  orderId: string,
  rejections: Rejection[],
): number | null {
  const target = trips[tripIndex];
  if (!target) return null;
  let bestFailure: Rejection | null = null;
  for (let position = 0; position <= target.orderIds.length; position += 1) {
    const drafts = draftsWithInsertion(trips, tripIndex, position, orderId);
    if (!drafts) continue;
    const violations = validateVehicleDay(prepared.validatorInput, target.vehicleId, drafts);
    if (violations.length === 0) return position;
    const rejection = {
      distance: 1 + violations.length / 100,
      reason: dominantReason(violations),
    };
    if (!bestFailure || rejection.distance < bestFailure.distance) bestFailure = rejection;
  }
  if (bestFailure) rejections.push(bestFailure);
  return null;
}

/** Ambient truck, then reefer truck, then ambient van, then reefer van. Tighter fit breaks ties. */
function compareVehicleChoice(order: OrderLite, left: VehicleLite, right: VehicleLite): number {
  const rank = capabilityRank(left) - capabilityRank(right);
  if (rank !== 0) return rank;
  const leftFit = orderFitsVehicle(order, left) ? 0 : 1;
  const rightFit = orderFitsVehicle(order, right) ? 0 : 1;
  if (leftFit !== rightFit) return leftFit - rightFit;
  const slack = leftoverRatio(order, left) - leftoverRatio(order, right);
  if (slack !== 0) return slack;
  return compareId(left.id, right.id);
}

function capabilityRank(vehicle: VehicleLite): number {
  const typeRank = vehicle.type === 'van' ? 2 : 0;
  const tempRank = vehicle.temp === 'reefer' ? 1 : 0;
  return typeRank + tempRank;
}

function orderFitsVehicle(order: OrderLite, vehicle: VehicleLite): boolean {
  return (
    !exceedsLimit(order.weightKg, vehicle.weightCapKg) &&
    !exceedsLimit(order.volumeM3, vehicle.volumeCapM3)
  );
}

function leftoverRatio(order: OrderLite, vehicle: VehicleLite): number {
  const weightSlack = (vehicle.weightCapKg - order.weightKg) / vehicle.weightCapKg;
  const volumeSlack = (vehicle.volumeCapM3 - order.volumeM3) / vehicle.volumeCapM3;
  return Math.min(weightSlack, volumeSlack);
}

function isSuitable(vehicle: VehicleLite, outlet: Outlet, needs: Needs): boolean {
  if (vehicle.depotId !== outlet.depotId) return false;
  if (needs.chilled && vehicle.temp !== 'reefer') return false;
  if (needs.vanOnly && vehicle.type !== 'van') return false;
  return true;
}

function structuralReason(fleet: readonly VehicleLite[], outlet: Outlet, needs: Needs): ReasonCode {
  const atDepot = fleet.filter((vehicle) => vehicle.depotId === outlet.depotId);
  if (atDepot.length === 0) return 'WRONG_DEPOT';
  if (needs.chilled && !atDepot.some((vehicle) => vehicle.temp === 'reefer')) {
    return 'REEFER_REQUIRED';
  }
  if (needs.vanOnly && !atDepot.some((vehicle) => vehicle.type === 'van')) return 'VAN_REQUIRED';
  return 'VEHICLE_UNAVAILABLE';
}

function resourceKind(needs: Needs): ResourceKind {
  if (needs.chilled && needs.vanOnly) return 'reefer_van';
  if (needs.chilled) return 'reefer';
  if (needs.vanOnly) return 'van';
  return 'vehicle';
}

function nextTripNo(trips: readonly MutableTrip[], vehicleId: string): TripNo | null {
  let hasOne = false;
  let hasTwo = false;
  let count = 0;
  for (const trip of trips) {
    if (trip.vehicleId !== vehicleId) continue;
    count += 1;
    if (trip.tripNo === 1) hasOne = true;
    if (trip.tripNo === 2) hasTwo = true;
  }
  if (count >= MAX_TRIPS_PER_VEHICLE) return null;
  if (!hasOne) return 1;
  if (!hasTwo) return 2;
  return null;
}

function commitPlacement(
  trips: MutableTrip[],
  item: RankedOrder,
  placement: Exclude<Placement, { kind: 'reject' }>,
): void {
  for (const trip of trips) {
    if (trip.orderIds.includes(item.order.id)) {
      throw new Error(`Order ${item.order.id} is already on a trip`);
    }
  }
  if (placement.kind === 'existing') {
    const trip = trips[placement.index];
    if (!trip) throw new Error(`Missing trip index ${placement.index}`);
    trip.orderIds.splice(placement.position, 0, item.order.id);
    return;
  }
  trips.push({
    vehicleId: placement.vehicleId,
    tripNo: placement.tripNo,
    groupKey: item.groupKey,
    brand: item.order.brand,
    district: item.outlet.district,
    orderIds: [item.order.id],
  });
}

/**
 * One pass: a higher-scored deferred order takes a lower-scored stop in the same group
 * when the validator accepts the exchange. The displaced order is placed again only when
 * another feasible slot remains.
 */
function exchangeLowerScoreOrders(
  prepared: Prepared,
  trips: MutableTrip[],
  ranked: readonly RankedOrder[],
  placed: Set<string>,
  blockReason: Map<string, ReasonCode>,
): void {
  const queue = ranked
    .filter((item) => !placed.has(item.order.id))
    .sort((left, right) => {
      if (left.score.total !== right.score.total) return right.score.total - left.score.total;
      return compareId(left.order.id, right.order.id);
    });

  for (const candidate of queue) {
    if (placed.has(candidate.order.id)) continue;
    const victims = ranked
      .filter(
        (item) =>
          placed.has(item.order.id) &&
          item.groupKey === candidate.groupKey &&
          item.score.total < candidate.score.total,
      )
      .sort((left, right) => {
        if (left.score.total !== right.score.total) return left.score.total - right.score.total;
        return compareId(left.order.id, right.order.id);
      });

    for (const victim of victims) {
      if (!placed.has(victim.order.id)) continue;
      const snapshot = cloneTrips(trips);
      removeOrder(trips, victim.order.id);
      renumberVehicleTrips(trips);
      const placement = seekPlacement(prepared, trips, candidate);
      if (placement.kind === 'reject') {
        restoreTrips(trips, snapshot);
        continue;
      }
      commitPlacement(trips, candidate, placement);
      renumberVehicleTrips(trips);
      placed.add(candidate.order.id);
      blockReason.delete(candidate.order.id);

      const victimPlacement = seekPlacement(prepared, trips, victim);
      if (victimPlacement.kind === 'reject') {
        placed.delete(victim.order.id);
        blockReason.set(victim.order.id, victimPlacement.reason);
      } else {
        commitPlacement(trips, victim, victimPlacement);
        renumberVehicleTrips(trips);
      }
      break;
    }
  }
}

function classifyDeferral(
  prepared: Prepared,
  trips: readonly MutableTrip[],
  item: RankedOrder,
  blockReason: ReadonlyMap<string, ReasonCode>,
): PlannedDeferral {
  const suitable = prepared.fleet.filter((vehicle) => isSuitable(vehicle, item.outlet, item.needs));
  let soloFeasible = false;
  const soloReasons: ReasonCode[] = [];
  for (const vehicle of suitable) {
    const violations = validateTrip(prepared.validatorInput, {
      vehicleId: vehicle.id,
      tripNo: 1,
      orderIds: [item.order.id],
    });
    if (violations.length === 0) {
      soloFeasible = true;
      break;
    }
    soloReasons.push(dominantReason(violations));
  }

  const reason = soloFeasible
    ? (blockReason.get(item.order.id) ?? 'VOLUME_CAP')
    : suitable.length === 0
      ? structuralReason(prepared.fleet, item.outlet, item.needs)
      : dominantCode(soloReasons);

  let fullness: DeferralExplanation['fullness'] = null;
  if (reason === 'VOLUME_CAP' || reason === 'WEIGHT_CAP') {
    const levels = fleetFullness(trips, suitable, prepared.orderById);
    if (levels) {
      fullness = {
        kind: reason === 'WEIGHT_CAP' ? 'weight' : 'volume',
        ratio: reason === 'WEIGHT_CAP' ? levels.weight : levels.volume,
      };
    }
  }

  const explanation: DeferralExplanation = {
    kind: 'deferral',
    orderId: item.order.id,
    outletId: item.outlet.id,
    depotId: item.outlet.depotId,
    type: soloFeasible ? 'prioritized' : 'unavoidable',
    reason,
    deferredYesterday: item.order.deferredYesterday,
    suitableVehicleCount: suitable.length,
    resource: resourceKind(item.needs),
    fullness,
  };

  return {
    orderId: item.order.id,
    reason,
    type: explanation.type,
    explain: explain(explanation),
  };
}

function fleetFullness(
  trips: readonly MutableTrip[],
  suitable: readonly VehicleLite[],
  orderById: ReadonlyMap<string, OrderLite>,
): { weight: number; volume: number } | null {
  if (suitable.length === 0) return null;
  let minWeight = Number.POSITIVE_INFINITY;
  let minVolume = Number.POSITIVE_INFINITY;
  for (const vehicle of suitable) {
    const own = trips.filter((trip) => trip.vehicleId === vehicle.id);
    if (own.length === 0) return null;
    let maxWeight = 0;
    let maxVolume = 0;
    for (const trip of own) {
      const load = tripLoad(orderById, trip.orderIds);
      const utilization = calculateUtilization({
        weightKg: load.weightKg,
        weightCapKg: vehicle.weightCapKg,
        volumeM3: load.volumeM3,
        volumeCapM3: vehicle.volumeCapM3,
      });
      maxWeight = Math.max(maxWeight, utilization.weight);
      maxVolume = Math.max(maxVolume, utilization.volume);
    }
    minWeight = Math.min(minWeight, maxWeight);
    minVolume = Math.min(minVolume, maxVolume);
  }
  return { weight: minWeight, volume: minVolume };
}

function materialize(
  prepared: Prepared,
  trips: readonly MutableTrip[],
): { plans: TripPlan[]; tightWindowStops: number } {
  const grouped = new Map<string, MutableTrip[]>();
  for (const trip of trips) {
    const list = grouped.get(trip.vehicleId);
    if (list) list.push(trip);
    else grouped.set(trip.vehicleId, [trip]);
  }

  const plans: TripPlan[] = [];
  let tightWindowStops = 0;
  for (const vehicleId of [...grouped.keys()].sort()) {
    const own = grouped.get(vehicleId);
    if (!own) continue;
    const ordered = own.slice().sort((left, right) => left.tripNo - right.tripNo);
    let previous: { startMin: number; tripMinutes: number; outboundMin: number } | null = null;
    for (const trip of ordered) {
      const startMin: number = previous
        ? calculateNextTripStartMin(previous)
        : calculateFirstTripStartMin(trip.brand);
      const built = buildTrip(prepared, trip, startMin);
      plans.push(built.plan);
      tightWindowStops += built.tight;
      previous = {
        startMin,
        tripMinutes: built.minutes,
        outboundMin: built.outboundMin,
      };
    }
  }
  return { plans, tightWindowStops };
}

function buildTrip(
  prepared: Prepared,
  trip: MutableTrip,
  startMin: number,
): { plan: TripPlan; minutes: number; outboundMin: number; tight: number } {
  const vehicle = prepared.vehicleById.get(trip.vehicleId);
  if (!vehicle) throw new PlanningInputError(`Unknown vehicle ${trip.vehicleId}`);
  const firstOrderId = trip.orderIds[0];
  const firstOrder = firstOrderId ? prepared.orderById.get(firstOrderId) : undefined;
  if (!firstOrder)
    throw new PlanningInputError(`Trip ${trip.vehicleId}-${trip.tripNo} has no stops`);
  const firstOutlet = prepared.input.outlets[firstOrder.outletId];
  if (!firstOutlet) throw new PlanningInputError(`Unknown outlet ${firstOrder.outletId}`);
  const travel = prepared.input.districtTravel[firstOutlet.district];
  if (!travel) throw new PlanningInputError(`No district travel for ${firstOutlet.district}`);

  const allowances: number[] = [];
  const arrivalStops: { serviceAllowanceMin: number; windowOpenMin: number }[] = [];
  let weightKg = 0;
  let volumeM3 = 0;
  for (const orderId of trip.orderIds) {
    const order = prepared.orderById.get(orderId);
    if (!order) throw new PlanningInputError(`Unknown order ${orderId}`);
    const outlet = prepared.input.outlets[order.outletId];
    if (!outlet) throw new PlanningInputError(`Unknown outlet ${order.outletId}`);
    const allowanceKey: ServiceAllowanceKey = `${order.brand}:${outlet.dockType}`;
    const allowance = prepared.input.serviceAllowance[allowanceKey];
    if (allowance === undefined) {
      throw new PlanningInputError(`No service allowance for ${allowanceKey}`);
    }
    allowances.push(allowance);
    arrivalStops.push({
      serviceAllowanceMin: allowance,
      windowOpenMin: parseTimeOfDay(outlet.window.open),
    });
    weightKg += order.weightKg;
    volumeM3 += order.volumeM3;
  }

  const minutes = calculateTripMinutes({
    depotToDistrictMin: travel.depotToDistrictMin,
    interStopMin: travel.interStopMin,
    serviceAllowanceMin: allowances,
  });
  const km = calculateTripDistance({
    depotToDistrictKm: travel.depotToDistrictKm,
    interStopKm: travel.interStopKm,
    stopCount: trip.orderIds.length,
  });
  const arrivals = calculatePlannedArrivals({
    startMin,
    depotToDistrictMin: travel.depotToDistrictMin,
    interStopMin: travel.interStopMin,
    stops: arrivalStops,
  });

  const stops: PlannedStop[] = [];
  let tight = 0;
  for (let index = 0; index < trip.orderIds.length; index += 1) {
    const orderId = trip.orderIds[index];
    const arrival = arrivals[index];
    if (!orderId || !arrival) continue;
    const order = prepared.orderById.get(orderId);
    const outlet = order ? prepared.input.outlets[order.outletId] : undefined;
    if (outlet && stopIsTight(outlet, arrival.rawMin, arrival.arrivalMin)) tight += 1;
    stops.push({
      orderId,
      seq: index + 1,
      plannedArrival: formatColomboTimestamp(prepared.input.serviceDate, arrival.arrivalMin),
    });
  }

  return {
    plan: {
      vehicleId: trip.vehicleId,
      tripNo: trip.tripNo,
      brand: trip.brand,
      district: trip.district,
      stops,
      minutes,
      km,
      litres: calculateFuelLitres(km, vehicle.kmPerL),
      utilization: calculateUtilization({
        weightKg,
        weightCapKg: vehicle.weightCapKg,
        volumeM3,
        volumeCapM3: vehicle.volumeCapM3,
      }),
    },
    minutes,
    outboundMin: travel.depotToDistrictMin,
    tight,
  };
}

function stopIsTight(outlet: Outlet, rawMin: number, arrivalMin: number): boolean {
  if (withinSlack(parseTimeOfDay(outlet.window.close) - arrivalMin)) return true;
  if (!outlet.mallWindow) return false;
  const mallArrival = Math.max(rawMin, parseTimeOfDay(outlet.mallWindow.open));
  return withinSlack(parseTimeOfDay(outlet.mallWindow.close) - mallArrival);
}

function withinSlack(slack: number): boolean {
  return slack >= -LIMIT_EPSILON && !exceedsLimit(slack, TIGHT_WINDOW_SLACK_MIN);
}

/** Manual assignments may mix temperature on a reefer. Brand and district still come from the first stop. */
function draftsToTrips(
  ranked: readonly RankedOrder[],
  drafts: readonly TripDraft[],
): MutableTrip[] {
  const rankedById = new Map(ranked.map((item) => [item.order.id, item]));
  const seen = new Set<string>();
  const trips: MutableTrip[] = [];
  for (const draft of drafts) {
    const firstId = draft.orderIds[0];
    if (!firstId) throw new PlanningInputError('Preset trip has no stops');
    const first = rankedById.get(firstId);
    if (!first) throw new PlanningInputError(`Unknown order ${firstId}`);
    for (const orderId of draft.orderIds) {
      if (seen.has(orderId)) throw new PlanningInputError(`Order ${orderId} is split across trips`);
      seen.add(orderId);
      const item = rankedById.get(orderId);
      if (!item) throw new PlanningInputError(`Unknown order ${orderId}`);
    }
    trips.push({
      vehicleId: draft.vehicleId,
      tripNo: draft.tripNo,
      groupKey: first.groupKey,
      brand: first.order.brand,
      district: first.outlet.district,
      orderIds: [...draft.orderIds],
    });
  }
  return trips;
}

function draftsToMutable(
  ranked: readonly RankedOrder[],
  drafts: readonly TripDraft[],
): MutableTrip[] {
  const rankedById = new Map(ranked.map((item) => [item.order.id, item]));
  const seen = new Set<string>();
  const trips: MutableTrip[] = [];
  for (const draft of drafts) {
    const firstId = draft.orderIds[0];
    if (!firstId) throw new PlanningInputError('Preset trip has no stops');
    const first = rankedById.get(firstId);
    if (!first) throw new PlanningInputError(`Unknown order ${firstId}`);
    for (const orderId of draft.orderIds) {
      if (seen.has(orderId)) throw new PlanningInputError(`Order ${orderId} is split across trips`);
      seen.add(orderId);
      const item = rankedById.get(orderId);
      if (!item) throw new PlanningInputError(`Unknown order ${orderId}`);
      if (item.groupKey !== first.groupKey) {
        throw new PlanningInputError(`Preset trip mixes groups at ${orderId}`);
      }
    }
    trips.push({
      vehicleId: draft.vehicleId,
      tripNo: draft.tripNo,
      groupKey: first.groupKey,
      brand: first.order.brand,
      district: first.outlet.district,
      orderIds: [...draft.orderIds],
    });
  }
  return trips;
}

function toDrafts(trips: readonly TripPlan[]): TripDraft[] {
  return trips.map((trip) => ({
    vehicleId: trip.vehicleId,
    tripNo: trip.tripNo,
    orderIds: trip.stops.map((stop) => stop.orderId),
  }));
}

function vehicleDrafts(trips: readonly MutableTrip[], vehicleId: string): TripDraft[] {
  const drafts: TripDraft[] = [];
  for (const trip of trips) {
    if (trip.vehicleId !== vehicleId) continue;
    drafts.push({
      vehicleId: trip.vehicleId,
      tripNo: trip.tripNo,
      orderIds: trip.orderIds.slice(),
    });
  }
  return drafts;
}

function draftsWithInsertion(
  trips: readonly MutableTrip[],
  tripIndex: number,
  position: number,
  orderId: string,
): TripDraft[] | null {
  const target = trips[tripIndex];
  if (!target) return null;
  const drafts: TripDraft[] = [];
  for (let index = 0; index < trips.length; index += 1) {
    const trip = trips[index];
    if (!trip || trip.vehicleId !== target.vehicleId) continue;
    const orderIds =
      index === tripIndex ? insertAt(trip.orderIds, position, orderId) : trip.orderIds.slice();
    drafts.push({ vehicleId: trip.vehicleId, tripNo: trip.tripNo, orderIds });
  }
  return drafts;
}

function insertAt(orderIds: readonly string[], position: number, orderId: string): string[] {
  const next = orderIds.slice();
  next.splice(position, 0, orderId);
  return next;
}

function tripLoad(
  orderById: ReadonlyMap<string, OrderLite>,
  orderIds: readonly string[],
): { weightKg: number; volumeM3: number } {
  let weightKg = 0;
  let volumeM3 = 0;
  for (const orderId of orderIds) {
    const order = orderById.get(orderId);
    if (!order) continue;
    weightKg += order.weightKg;
    volumeM3 += order.volumeM3;
  }
  return { weightKg, volumeM3 };
}

function removeOrder(trips: MutableTrip[], orderId: string): void {
  for (let index = 0; index < trips.length; index += 1) {
    const trip = trips[index];
    if (!trip) continue;
    const position = trip.orderIds.indexOf(orderId);
    if (position < 0) continue;
    if (trip.orderIds.length === 1) trips.splice(index, 1);
    else trip.orderIds.splice(position, 1);
    return;
  }
}

function renumberVehicleTrips(trips: MutableTrip[]): void {
  const grouped = new Map<string, MutableTrip[]>();
  for (const trip of trips) {
    const list = grouped.get(trip.vehicleId);
    if (list) list.push(trip);
    else grouped.set(trip.vehicleId, [trip]);
  }
  for (const own of grouped.values()) {
    own.sort((left, right) => left.tripNo - right.tripNo);
    const first = own[0];
    const second = own[1];
    if (first) first.tripNo = 1;
    if (second) second.tripNo = 2;
  }
}

function cloneTrips(trips: readonly MutableTrip[]): MutableTrip[] {
  return trips.map((trip) => ({
    vehicleId: trip.vehicleId,
    tripNo: trip.tripNo,
    groupKey: trip.groupKey,
    brand: trip.brand,
    district: trip.district,
    orderIds: trip.orderIds.slice(),
  }));
}

function restoreTrips(trips: MutableTrip[], snapshot: MutableTrip[]): void {
  trips.splice(0, trips.length, ...snapshot);
}

function dominantReason(violations: readonly Violation[]): ReasonCode {
  for (const rule of REASON_ORDER) {
    if (violations.some((item) => item.rule === rule)) return rule;
  }
  return 'VOLUME_CAP';
}

function dominantCode(reasons: readonly ReasonCode[]): ReasonCode {
  if (reasons.length === 0) return 'VOLUME_CAP';
  const counts = new Map<ReasonCode, number>();
  for (const reason of reasons) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  let best: ReasonCode = reasons[0] ?? 'VOLUME_CAP';
  let bestCount = 0;
  for (const rule of REASON_ORDER) {
    const count = counts.get(rule) ?? 0;
    if (count > bestCount) {
      best = rule;
      bestCount = count;
    }
  }
  return best;
}

function bestRejection(rejections: readonly Rejection[]): ReasonCode | null {
  let best: Rejection | null = null;
  for (const rejection of rejections) {
    if (!best || rejection.distance < best.distance) {
      best = rejection;
      continue;
    }
    if (
      rejection.distance === best.distance &&
      reasonIndex(rejection.reason) < reasonIndex(best.reason)
    ) {
      best = rejection;
    }
  }
  return best?.reason ?? null;
}

function reasonIndex(reason: ReasonCode): number {
  const index = REASON_ORDER.indexOf(reason);
  return index < 0 ? REASON_ORDER.length : index;
}

function compareId(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function assertPartition(
  orders: readonly OrderLite[],
  trips: readonly TripPlan[],
  deferred: readonly PlannedDeferral[],
): void {
  const seen = new Set<string>();
  const tripKeys = new Set<string>();
  const perVehicle = new Map<string, number>();
  for (const trip of trips) {
    const key = `${trip.vehicleId}-${trip.tripNo}`;
    if (tripKeys.has(key)) throw new Error(`Duplicate trip ${key}`);
    tripKeys.add(key);
    perVehicle.set(trip.vehicleId, (perVehicle.get(trip.vehicleId) ?? 0) + 1);
    for (const stop of trip.stops) {
      if (seen.has(stop.orderId)) throw new Error(`Order ${stop.orderId} is split across trips`);
      seen.add(stop.orderId);
    }
  }
  for (const [vehicleId, count] of perVehicle) {
    if (count > MAX_TRIPS_PER_VEHICLE) {
      throw new Error(`Vehicle ${vehicleId} has ${count} trips`);
    }
  }
  for (const item of deferred) {
    if (seen.has(item.orderId)) {
      throw new Error(`Order ${item.orderId} is both served and deferred`);
    }
    seen.add(item.orderId);
  }
  if (seen.size !== orders.length) {
    throw new Error('Not every order is served or deferred exactly once');
  }
}
