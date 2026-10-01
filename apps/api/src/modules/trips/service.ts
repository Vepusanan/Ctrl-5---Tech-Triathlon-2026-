import type { Database } from '@waypoint/database';
import {
  describeAssignment,
  InfeasiblePlanError,
  PlanningInputError,
  type TripDraft,
  type ValidatorInput,
  validatePlan,
} from '@waypoint/planning';
import type {
  ListTripsQuery,
  PlanInput,
  ResequenceTripRequest,
  ServiceAllowanceKey,
  Trip,
  TripDetail,
  TripListResponse,
  TripNo,
  TripStatus,
  User,
  VehicleAvailabilityStatus,
  Violation,
} from '@waypoint/shared';
import {
  defaultPriorityWeights,
  loadingStateMachine,
  notificationPriorityByType,
  orderStateMachine,
  tripStateMachine,
} from '@waypoint/shared';
import type { SQL } from 'drizzle-orm';
import type { AuditRecorder } from '../../plugins/audit.ts';
import type { OperatingClock } from '../../plugins/clock.ts';
import type { DomainEventBus, TripDomainEvent } from '../../plugins/domain-events.ts';
import { ApiError } from '../../plugins/errors.ts';
import { scope } from '../../plugins/rbac.ts';
import { formatColomboTimestamp } from '../orders/cutoff.ts';
import {
  createTripRepo,
  type PlanningOrderRow,
  type StopRow,
  type TripBundle,
  type TripDb,
  type TripRepo,
  type TripRow,
  type VehicleTripRow,
} from './repo.ts';

const MISSING = 'Trip not found';
const STALE = 'Trip version is stale';
const SEQUENCE = 'Stop list must include every stop on the trip once';
const SEQUENCE_CLOSED = 'Trip sequence can only change before departure';
const NOT_READY = 'Trip cannot depart before it is ready';
const UNPUBLISHED = 'Trip has not been published';
const LOADING = 'Loading is not ready for departure';
const ORDER = 'Order is not ready to dispatch';

const OPEN_SEQUENCE: readonly TripStatus[] = ['planned', 'published', 'loading', 'ready'];

export interface TripService {
  list(user: User | null, query: ListTripsQuery): Promise<TripListResponse>;
  get(user: User | null, id: string): Promise<TripDetail>;
  resequence(
    user: User | null,
    id: string,
    version: number,
    input: ResequenceTripRequest,
  ): Promise<TripDetail>;
  depart(user: User | null, id: string, version: number): Promise<TripDetail>;
}

export function createTripService(
  db: Database,
  audit: AuditRecorder,
  events: DomainEventBus,
  clock: OperatingClock,
  repo: TripRepo = createTripRepo(),
): TripService {
  return {
    async list(user, query) {
      const reader = assertReader(user);
      const bundles = await repo.list(db, scope(reader).trips, query);
      return {
        items: bundles.map(toDetail),
        total: bundles.length,
      };
    },

    async get(user, id) {
      const reader = assertReader(user);
      const bundle = await repo.findBundle(db, scope(reader).trips, id);
      if (bundle === null) throw new ApiError('NOT_FOUND', MISSING);
      return toDetail(bundle);
    },

    async resequence(user, id, version, input) {
      const dispatcher = assertDispatcher(user);
      const pending: TripDomainEvent[] = [];
      const detail = await db.transaction(async (tx) => {
        const trip = await lockedTrip(repo, tx, scope(dispatcher).trips, id);
        if (trip.version !== version) throw new ApiError('VERSION_CONFLICT', STALE);
        if (!OPEN_SEQUENCE.includes(trip.status)) {
          throw new ApiError('CONSTRAINT_VIOLATION', SEQUENCE_CLOSED);
        }
        const current = await repo.findBundle(tx, scope(dispatcher).trips, id);
        if (current === null) throw new ApiError('NOT_FOUND', MISSING);
        const ordered = orderStops(current.stops, input.stopIds);
        const siblings = await repo.listVehicleTrips(tx, trip.runId, trip.vehicleId);
        const drafts = draftsWith(
          siblings,
          trip.id,
          trip.vehicleId,
          ordered.map((stop) => stop.orderId),
        );
        const plan = await planFor(
          repo,
          tx,
          current,
          drafts,
          siblings.map((sibling) => sibling.id),
        );
        const violations = validatePlan(validatorInput(plan), drafts);
        if (violations.length > 0) throw constraint(violations);
        const described = describe(plan, drafts);
        const next = described.trips.find(
          (item) => item.vehicleId === trip.vehicleId && item.tripNo === tripNo(trip.tripNo),
        );
        if (next === undefined) throw new ApiError('INTERNAL_ERROR', 'Resequenced trip is missing');
        const byOrder = new Map(ordered.map((stop) => [stop.orderId, stop]));
        await repo.shiftStopSequences(tx, trip.id);
        for (const stop of next.stops) {
          const row = byOrder.get(stop.orderId);
          if (row === undefined)
            throw new ApiError('INTERNAL_ERROR', 'Resequenced stop is missing');
          await repo.updateStop(tx, row.id, stop.seq, arrivalDate(stop.plannedArrival));
        }
        const saved = await repo.saveResequence(
          tx,
          trip.id,
          version,
          next.minutes,
          next.km,
          next.litres,
        );
        if (saved === null) throw new ApiError('VERSION_CONFLICT', STALE);
        const now = clock.now();
        await audit.record(tx, {
          actorId: dispatcher.id,
          role: dispatcher.role,
          action: 'trip.resequenced',
          entityType: 'trip',
          entityId: trip.id,
          before: {
            version: trip.version,
            stopIds: current.stops.map((stop) => stop.id),
            plannedMinutes: trip.plannedMinutes,
            plannedKm: trip.plannedKm,
          },
          after: {
            version: saved.version,
            stopIds: sequencedStopIds(next.stops, byOrder),
            plannedMinutes: saved.plannedMinutes,
            plannedKm: saved.plannedKm,
          },
          createdAt: now,
        });
        pending.push(tripEvent('trip.changed', dispatcher.id, now, current.run.depotId, saved));
        if (trip.status !== 'planned') {
          await notifyPlanChanged(repo, tx, current.run.depotId, saved, now);
        }
        const updated = await repo.findBundle(tx, scope(dispatcher).trips, id);
        if (updated === null)
          throw new ApiError('INTERNAL_ERROR', 'Trip disappeared after resequence');
        return toDetail(updated);
      });
      publish(events, pending);
      return detail;
    },

    async depart(user, id, version) {
      const actor = assertReader(user);
      const pending: TripDomainEvent[] = [];
      const detail = await db.transaction(async (tx) => {
        const trip = await lockedTrip(repo, tx, scope(actor).trips, id);
        if (trip.version !== version) throw new ApiError('VERSION_CONFLICT', STALE);
        if (!tripStateMachine.canTransition(trip.status, 'departed')) {
          throw new ApiError('CONSTRAINT_VIOLATION', NOT_READY);
        }
        tripStateMachine.assertTransition(trip.status, 'departed');
        const current = await repo.findBundle(tx, scope(actor).trips, id);
        if (current === null) throw new ApiError('NOT_FOUND', MISSING);
        if (current.run.status !== 'published')
          throw new ApiError('CONSTRAINT_VIOLATION', UNPUBLISHED);
        const loading = await repo.lockLoading(tx, trip.id);
        if (loading === null || !loadingStateMachine.canTransition(loading, 'departed')) {
          throw new ApiError('CONSTRAINT_VIOLATION', LOADING);
        }
        loadingStateMachine.assertTransition(loading, 'departed');
        const vehicleStatus = await repo.lockAvailability(
          tx,
          trip.vehicleId,
          current.run.serviceDate,
        );
        if (vehicleStatus === 'in_workshop') {
          throw constraint([
            {
              rule: 'VEHICLE_UNAVAILABLE',
              vehicleId: trip.vehicleId,
              tripKey: `${trip.vehicleId}-${tripNo(trip.tripNo)}`,
              detail: `Vehicle ${trip.vehicleId} is not available on ${current.run.serviceDate}`,
            },
          ]);
        }
        const orderIds = current.stops.map((stop) => stop.orderId);
        const lockedOrders = await repo.lockOrders(tx, orderIds);
        if (lockedOrders.length !== orderIds.length) {
          throw new ApiError('CONSTRAINT_VIOLATION', ORDER);
        }
        for (const order of lockedOrders) {
          if (!orderStateMachine.canTransition(order.status, 'dispatched')) {
            throw new ApiError('CONSTRAINT_VIOLATION', ORDER);
          }
          orderStateMachine.assertTransition(order.status, 'dispatched');
        }
        for (const orderId of orderIds) {
          const dispatched = await repo.dispatchOrder(tx, orderId);
          if (!dispatched) throw new ApiError('VERSION_CONFLICT', 'Order changed during departure');
        }
        const loadingDeparted = await repo.markLoadingDeparted(tx, trip.id);
        if (!loadingDeparted) throw new ApiError('CONSTRAINT_VIOLATION', LOADING);
        const saved = await repo.markDeparted(tx, trip.id, version);
        if (saved === null) throw new ApiError('VERSION_CONFLICT', STALE);
        const now = clock.now();
        const departedAt = formatColomboTimestamp(now);
        await audit.record(tx, {
          actorId: actor.id,
          role: actor.role,
          action: 'trip.departed',
          entityType: 'trip',
          entityId: trip.id,
          before: { status: trip.status, version: trip.version },
          after: { status: saved.status, version: saved.version, departedAt },
          createdAt: now,
        });
        pending.push(tripEvent('trip.departed', actor.id, now, current.run.depotId, saved));
        const updated = await repo.findBundle(tx, scope(actor).trips, id);
        if (updated === null)
          throw new ApiError('INTERNAL_ERROR', 'Trip disappeared after departure');
        return toDetail(updated);
      });
      publish(events, pending);
      return detail;
    },
  };
}

function assertReader(user: User | null): User {
  if (user === null) throw new ApiError('UNAUTHENTICATED', 'Sign in required');
  if (user.role === 'store_manager') {
    throw new ApiError('FORBIDDEN', 'You do not have access to this action');
  }
  return user;
}

function assertDispatcher(user: User | null): User {
  if (user === null) throw new ApiError('UNAUTHENTICATED', 'Sign in required');
  if (user.role !== 'dispatcher') {
    throw new ApiError('FORBIDDEN', 'You do not have access to this action');
  }
  return user;
}

async function lockedTrip(
  repo: TripRepo,
  db: TripDb,
  userScope: SQL,
  id: string,
): Promise<TripRow> {
  const trip = await repo.lock(db, userScope, id);
  if (trip === null) throw new ApiError('NOT_FOUND', MISSING);
  return trip;
}

function orderStops(stops: readonly StopRow[], stopIds: readonly string[]): StopRow[] {
  const byId = new Map(stops.map((stop) => [stop.id, stop]));
  if (stopIds.length !== stops.length || stopIds.some((id) => !byId.has(id))) {
    throw new ApiError('VALIDATION_ERROR', SEQUENCE);
  }
  return stopIds.map((id) => {
    const stop = byId.get(id);
    if (stop === undefined) throw new ApiError('VALIDATION_ERROR', SEQUENCE);
    return stop;
  });
}

function draftsWith(
  siblings: readonly VehicleTripRow[],
  tripId: string,
  vehicleId: string,
  orderIds: readonly string[],
): TripDraft[] {
  const drafts: TripDraft[] = [];
  for (const sibling of siblings) {
    const ids = sibling.id === tripId ? orderIds : sibling.orderIds;
    if (ids.length === 0) continue;
    drafts.push({ vehicleId, tripNo: tripNo(sibling.tripNo), orderIds: ids });
  }
  return drafts;
}

async function planFor(
  repo: TripRepo,
  db: TripDb,
  current: TripBundle,
  drafts: readonly TripDraft[],
  bookedTripIds: readonly string[],
): Promise<PlanInput & { availability: VehicleAvailabilityStatus }> {
  const orderIds = drafts.flatMap((draft) => draft.orderIds);
  const orders = await repo.listPlanningOrders(db, orderIds);
  if (orders.length !== new Set(orderIds).size) {
    throw new ApiError('INTERNAL_ERROR', 'Trip orders are incomplete');
  }
  const vehicle = await repo.findVehicle(db, current.trip.vehicleId);
  if (vehicle === null) throw new ApiError('INTERNAL_ERROR', 'Trip vehicle is missing');
  const calendar = await repo.findCalendar(db, current.run.serviceDate);
  if (calendar === null)
    throw new ApiError('INTERNAL_ERROR', 'Service date is not on the calendar');
  const districts = [...new Set(orders.map((order) => order.district))];
  const travelRows = await repo.listTravel(db, districts);
  const districtTravel: PlanInput['districtTravel'] = {};
  for (const row of travelRows) districtTravel[row.district] = row;
  for (const district of districts) {
    if (districtTravel[district] === undefined) {
      throw new ApiError('INTERNAL_ERROR', `No district travel for ${district}`);
    }
  }
  const serviceAllowance = {} as PlanInput['serviceAllowance'];
  for (const row of await repo.listAllowances(db)) {
    const key: ServiceAllowanceKey = `${row.brand}:${row.dockType}`;
    serviceAllowance[key] = row.minutes;
  }
  const outlets: PlanInput['outlets'] = {};
  for (const order of orders) {
    if (outlets[order.outletId] === undefined) outlets[order.outletId] = toOutlet(order);
    const key: ServiceAllowanceKey = `${order.brand}:${order.dockType}`;
    if (serviceAllowance[key] === undefined) {
      throw new ApiError('INTERNAL_ERROR', `No service allowance for ${key}`);
    }
  }
  const recorded = await repo.lockAvailability(db, vehicle.id, current.run.serviceDate);
  const availability: VehicleAvailabilityStatus = recorded ?? 'available';
  const used = await repo.fuelUsedLitres(db, vehicle.id, calendar.isoYear, calendar.isoWeek);
  const booked = await repo.fuelForTrips(db, bookedTripIds);
  // Ledger litres for these trips are added back so the validator does not count them twice.
  const fuelRemainingL = vehicle.weeklyFuelQuotaL - used + booked;
  return {
    serviceDate: current.run.serviceDate,
    depotId: current.run.depotId,
    orders: orders.map((order) => ({
      id: order.id,
      outletId: order.outletId,
      brand: order.brand,
      temp: order.temp,
      weightKg: order.weightKg,
      volumeM3: order.volumeM3,
      deferredYesterday: false,
      daysSinceLastServed: 0,
    })),
    vehicles: [
      {
        id: vehicle.id,
        type: vehicle.type,
        temp: vehicle.temp,
        weightCapKg: vehicle.weightCapKg,
        volumeCapM3: vehicle.volumeCapM3,
        kmPerL: vehicle.kmPerL,
        depotId: vehicle.depotId,
      },
    ],
    outlets,
    districtTravel,
    serviceAllowance,
    fuelRemainingL: { [vehicle.id]: fuelRemainingL },
    policy: defaultPriorityWeights,
    availability,
  };
}

function validatorInput(
  plan: PlanInput & { availability: VehicleAvailabilityStatus },
): ValidatorInput {
  const availability: Record<string, VehicleAvailabilityStatus> = {};
  for (const vehicle of plan.vehicles) availability[vehicle.id] = plan.availability;
  return {
    serviceDate: plan.serviceDate,
    orders: plan.orders,
    vehicles: plan.vehicles,
    outlets: plan.outlets,
    districtTravel: plan.districtTravel,
    serviceAllowance: plan.serviceAllowance,
    fuelRemainingL: plan.fuelRemainingL,
    availability,
  };
}

function describe(plan: PlanInput, drafts: readonly TripDraft[]) {
  try {
    return describeAssignment(plan, drafts);
  } catch (error) {
    if (error instanceof InfeasiblePlanError) throw constraint(error.violations);
    if (error instanceof PlanningInputError) throw new ApiError('INTERNAL_ERROR', error.message);
    throw error;
  }
}

function toOutlet(order: PlanningOrderRow): PlanInput['outlets'][string] {
  const mallOpen = order.mallWindowOpen;
  const mallClose = order.mallWindowClose;
  return {
    id: order.outletId,
    brand: order.outletBrand,
    district: order.district,
    depotId: order.depotId,
    dockType: order.dockType,
    parkingConstraint: order.parkingConstraint,
    window: { open: timeOfDay(order.windowOpen), close: timeOfDay(order.windowClose) },
    mallWindow:
      mallOpen !== null && mallClose !== null
        ? { open: timeOfDay(mallOpen), close: timeOfDay(mallClose) }
        : null,
  };
}

function timeOfDay(value: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value);
  const hour = match?.[1];
  const minute = match?.[2];
  if (hour === undefined || minute === undefined) {
    throw new ApiError('INTERNAL_ERROR', 'Stored window is invalid');
  }
  return `${hour}:${minute}`;
}

function toTrip(row: TripRow): Trip {
  return {
    id: row.id,
    runId: row.runId,
    vehicleId: row.vehicleId,
    tripNo: tripNo(row.tripNo),
    brand: row.brand,
    district: row.district,
    status: row.status,
    version: row.version,
    plannedMinutes: row.plannedMinutes,
    plannedKm: row.plannedKm,
  };
}

function toDetail(bundle: TripBundle): TripDetail {
  return {
    ...toTrip(bundle.trip),
    run: {
      id: bundle.run.id,
      depotId: bundle.run.depotId,
      serviceDate: bundle.run.serviceDate,
      status: bundle.run.status,
      planVersion: bundle.run.planVersion,
    },
    vehicle: {
      id: bundle.vehicle.id,
      type: bundle.vehicle.type,
      temp: bundle.vehicle.temp,
      depotId: bundle.vehicle.depotId,
    },
    stops: bundle.stops.map((stop) => ({
      id: stop.id,
      tripId: stop.tripId,
      orderId: stop.orderId,
      seq: stop.seq,
      plannedArrival: formatColomboTimestamp(stop.plannedArrival),
      status: stop.status,
      order: {
        id: stop.orderId,
        outletId: stop.outletId,
        brand: stop.brand,
        temp: stop.temp,
        requestedDate: stop.requestedDate,
        units: stop.units,
        weightKg: stop.weightKg,
        volumeM3: stop.volumeM3,
        status: stop.orderStatus,
      },
    })),
    loadingStatus: bundle.loadingStatus ?? 'not_started',
    exceptions: bundle.exceptions.map((issue) => ({
      id: issue.id,
      tripId: issue.tripId,
      orderId: issue.orderId,
      type: issue.type,
      qty: issue.qty,
      note: issue.note,
      loaderId: issue.loaderId,
      acknowledgedBy: issue.acknowledgedBy,
      acknowledgedAt:
        issue.acknowledgedAt === null ? null : formatColomboTimestamp(issue.acknowledgedAt),
      createdAt: formatColomboTimestamp(issue.createdAt),
    })),
    lastEvent:
      bundle.lastEvent === null
        ? null
        : {
            serverTime: formatColomboTimestamp(bundle.lastEvent.serverTime),
            tripVersion: bundle.lastEvent.tripVersion,
          },
  };
}

function sequencedStopIds(
  stops: readonly { orderId: string }[],
  byOrder: ReadonlyMap<string, StopRow>,
): string[] {
  return stops.map((stop) => {
    const row = byOrder.get(stop.orderId);
    if (row === undefined) throw new ApiError('INTERNAL_ERROR', 'Resequenced stop is missing');
    return row.id;
  });
}

function tripNo(value: number): TripNo {
  if (value === 1 || value === 2) return value;
  throw new ApiError('INTERNAL_ERROR', 'Trip number is invalid');
}

function arrivalDate(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError('INTERNAL_ERROR', 'Planned arrival is invalid');
  }
  return parsed;
}

function constraint(violations: readonly Violation[]): ApiError {
  return new ApiError('CONSTRAINT_VIOLATION', 'Trip breaks a planning constraint', violations);
}

async function notifyPlanChanged(
  repo: TripRepo,
  db: TripDb,
  depotId: string,
  trip: TripRow,
  now: Date,
): Promise<void> {
  const loaders = await repo.listLoaders(db, depotId);
  const drivers = await repo.listDrivers(db, trip.vehicleId);
  const notes: Parameters<TripRepo['insertNotifications']>[1][number][] = [];
  for (const recipient of [...loaders, ...drivers]) {
    notes.push({
      recipientId: recipient.id,
      type: 'plan_changed',
      priority: notificationPriorityByType.plan_changed,
      entityType: 'trip',
      entityId: trip.id,
      createdAt: now,
    });
  }
  await repo.insertNotifications(db, notes);
}

function tripEvent(
  type: TripDomainEvent['type'],
  actorId: string,
  now: Date,
  depotId: string,
  trip: TripRow,
): TripDomainEvent {
  return {
    type,
    actorId,
    occurredAt: formatColomboTimestamp(now),
    tripId: trip.id,
    vehicleId: trip.vehicleId,
    depotId,
    version: trip.version,
  };
}

function publish(events: DomainEventBus, pending: readonly TripDomainEvent[]): void {
  for (const event of pending) events.publish(event);
}
