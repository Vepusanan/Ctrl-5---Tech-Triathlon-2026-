import type { Database } from '@waypoint/database';
import {
  type ErrorCode,
  notificationPriorityByType,
  type StopEventInput,
  type SyncEventResult,
  type SyncEventsRequest,
  type SyncEventsResponse,
  type SyncRouteStop,
  type SyncTripDelta,
  type User,
} from '@waypoint/shared';
import { sql } from 'drizzle-orm';
import type { AuditRecorder } from '../../plugins/audit.ts';
import type { OperatingClock } from '../../plugins/clock.ts';
import type {
  DeliveryDomainEvent,
  DomainEventBus,
  SyncConflictDomainEvent,
} from '../../plugins/domain-events.ts';
import { ApiError } from '../../plugins/errors.ts';
import { scope } from '../../plugins/rbac.ts';
import {
  applyStopEvent,
  sameRecordedStopEvent,
  stopEventClockSkewed,
} from '../deliveries/apply.ts';
import {
  createDeliveryRepo,
  type DeliveryDb,
  type DeliveryRepo,
  type DeliveryStopRow,
  type StopEventRow,
} from '../deliveries/repo.ts';
import { formatColomboTimestamp } from '../orders/cutoff.ts';
import { createTripRepo, type StopRow, type TripRepo } from '../trips/repo.ts';
import { diffRoute, stopIdsAtVersion } from './delta.ts';
import { createSyncRepo, type SyncRepo } from './repo.ts';
import { offlinePlanMovedPast } from './versions.ts';

const MISSING_TRIP = 'Trip not found';
const MISSING_STOP = 'Stop not found';
const STALE_EVENT = 'This client event id was already recorded';
const AHEAD = 'Sync version is newer than the trip';
const CONFLICT_REASON = 'Stop was removed or reassigned';

const allow = sql`true`;

const REJECTION_CODES = new Set<ErrorCode>([
  'NOT_FOUND',
  'CONSTRAINT_VIOLATION',
  'VALIDATION_ERROR',
  'FORBIDDEN',
  'VERSION_CONFLICT',
]);

type Driver = Extract<User, { role: 'driver' }>;

interface EventOutcome {
  result: SyncEventResult;
  domainEvents: DeliveryDomainEvent[];
  syncConflict: SyncConflictDomainEvent | null;
}

export interface SyncService {
  ingest(user: User | null, request: SyncEventsRequest): Promise<SyncEventsResponse>;
  tripDelta(user: User | null, tripId: string, since: number): Promise<SyncTripDelta>;
}

export function createSyncService(
  db: Database,
  audit: AuditRecorder,
  events: DomainEventBus,
  clock: OperatingClock,
  deliveryRepo: DeliveryRepo = createDeliveryRepo(),
  syncRepo: SyncRepo = createSyncRepo(),
  tripRepo: TripRepo = createTripRepo(),
): SyncService {
  return {
    // SYSTEM_DESIGN §8.3. One transaction per event, so a rejection does not
    // roll back the other events in the batch.
    async ingest(user, request) {
      const driver = assertDriver(user);
      const results: SyncEventResult[] = [];
      for (const event of request.events) {
        results.push(
          await ingestOne(db, deliveryRepo, syncRepo, audit, events, clock, driver, event),
        );
      }
      return { results };
    },

    async tripDelta(user, tripId, since) {
      const driver = assertDriver(user);
      return db.transaction(async (tx) => {
        const bundle = await tripRepo.findBundle(tx, scope(driver).trips, tripId);
        if (bundle === null) throw new ApiError('NOT_FOUND', MISSING_TRIP);
        if (since > bundle.trip.version) throw new ApiError('VERSION_CONFLICT', AHEAD);
        if (since === bundle.trip.version) {
          return { changed: false as const, tripId: bundle.trip.id, version: bundle.trip.version };
        }
        const current = bundle.stops.map(toRouteStop);
        const audits = await syncRepo.listRouteAudits(tx, bundle.trip.id);
        const previousIds = stopIdsAtVersion(
          audits,
          since,
          current.map((stop) => stop.id),
        );
        const diff = diffRoute(previousIds, current);
        return {
          changed: true as const,
          tripId: bundle.trip.id,
          since,
          version: bundle.trip.version,
          added: diff.added,
          removed: diff.removed,
          reordered: diff.reordered,
          acknowledgementRequired: true as const,
        };
      });
    },
  };
}

async function ingestOne(
  db: Database,
  deliveryRepo: DeliveryRepo,
  syncRepo: SyncRepo,
  audit: AuditRecorder,
  events: DomainEventBus,
  clock: OperatingClock,
  driver: Driver,
  input: StopEventInput,
): Promise<SyncEventResult> {
  try {
    const outcome = await db.transaction((tx) =>
      applyOne(tx, deliveryRepo, syncRepo, audit, clock, driver, input),
    );
    for (const event of outcome.domainEvents) events.publish(event);
    if (outcome.syncConflict !== null) events.publish(outcome.syncConflict);
    return outcome.result;
  } catch (error) {
    if (error instanceof ApiError && REJECTION_CODES.has(error.code)) {
      return eventResult(input.clientEventId, 'rejected', error.message);
    }
    throw error;
  }
}

async function applyOne(
  tx: DeliveryDb,
  deliveryRepo: DeliveryRepo,
  syncRepo: SyncRepo,
  audit: AuditRecorder,
  clock: OperatingClock,
  driver: Driver,
  input: StopEventInput,
): Promise<EventOutcome> {
  const existing = await deliveryRepo.findEvent(tx, input.clientEventId);
  if (existing !== null) return replay(tx, syncRepo, existing, input);

  const scoped = await deliveryRepo.lockStop(tx, scope(driver).trips, input.stopId);
  if (scoped !== null) {
    // Arrival, delivery, failure, and the POD a delivery references are facts
    // about the past. A newer trip version does not reject them while the stop
    // is still on this vehicle (SYSTEM_DESIGN §8.3).
    const applied = await applyStopEvent(
      tx,
      deliveryRepo,
      audit,
      clock,
      driver,
      input.stopId,
      input,
    );
    return {
      result: eventResult(input.clientEventId, applied.outcome),
      domainEvents: applied.domainEvents,
      syncConflict: null,
    };
  }

  const located = await deliveryRepo.lockStop(tx, allow, input.stopId);
  if (located === null) throw new ApiError('NOT_FOUND', MISSING_STOP);
  const driverVersions = await syncRepo.listVehicleTripVersions(tx, driver.vehicleId);
  if (!offlinePlanMovedPast(input.tripVersion, located.tripVersion, driverVersions)) {
    throw new ApiError('NOT_FOUND', MISSING_STOP);
  }
  const recorded = await recordConflict(
    tx,
    deliveryRepo,
    syncRepo,
    audit,
    clock,
    driver,
    located,
    input,
  );
  return { result: recorded.result, domainEvents: [], syncConflict: recorded.event };
}

async function replay(
  tx: DeliveryDb,
  syncRepo: SyncRepo,
  existing: StopEventRow,
  input: StopEventInput,
): Promise<EventOutcome> {
  if (!sameRecordedStopEvent(existing, input)) {
    throw new ApiError('CONSTRAINT_VIOLATION', STALE_EVENT);
  }
  const conflict = await syncRepo.findConflict(tx, existing.id);
  if (conflict !== null) {
    return {
      result: eventResult(input.clientEventId, 'conflict', conflict.reason),
      domainEvents: [],
      syncConflict: null,
    };
  }
  return {
    result: eventResult(input.clientEventId, 'duplicate'),
    domainEvents: [],
    syncConflict: null,
  };
}

async function recordConflict(
  tx: DeliveryDb,
  deliveryRepo: DeliveryRepo,
  syncRepo: SyncRepo,
  audit: AuditRecorder,
  clock: OperatingClock,
  driver: Driver,
  located: DeliveryStopRow,
  input: StopEventInput,
): Promise<{ result: SyncEventResult; event: SyncConflictDomainEvent | null }> {
  const serverTime = clock.now();
  const clientTime = new Date(input.clientTime);
  const inserted = await deliveryRepo.insertEvent(tx, {
    clientEventId: input.clientEventId,
    stopId: input.stopId,
    type: input.type,
    payload: input.payload,
    clientTime,
    serverTime,
    tripVersion: input.tripVersion,
  });
  if (inserted === null) {
    const raced = await deliveryRepo.findEvent(tx, input.clientEventId);
    if (raced === null || !sameRecordedStopEvent(raced, input)) {
      throw new ApiError('CONSTRAINT_VIOLATION', STALE_EVENT);
    }
    const conflict = await syncRepo.findConflict(tx, raced.id);
    if (conflict !== null) {
      return { result: eventResult(input.clientEventId, 'conflict', conflict.reason), event: null };
    }
    return { result: eventResult(input.clientEventId, 'duplicate'), event: null };
  }

  const conflict = await syncRepo.insertConflict(tx, inserted.id, CONFLICT_REASON, serverTime);
  const assignment = {
    stopId: located.id,
    tripId: located.tripId,
    status: located.status,
    orderStatus: located.orderStatus,
    tripVersion: located.tripVersion,
  };
  await audit.record(tx, {
    actorId: driver.id,
    role: driver.role,
    action: 'sync.conflict',
    entityType: 'sync_conflict',
    entityId: conflict.id,
    before: assignment,
    after: {
      ...assignment,
      clientEventId: input.clientEventId,
      eventId: inserted.id,
      conflictId: conflict.id,
      reason: CONFLICT_REASON,
      clientTime: input.clientTime,
      serverTime: formatColomboTimestamp(serverTime),
      clockSkew: stopEventClockSkewed(clientTime, serverTime),
      eventTripVersion: input.tripVersion,
    },
    createdAt: serverTime,
  });
  const dispatchers = await deliveryRepo.listDispatchers(tx, located.depotId);
  const recipientIds = new Set<string>([
    driver.id,
    ...dispatchers.map((dispatcher) => dispatcher.id),
  ]);
  await deliveryRepo.insertNotifications(
    tx,
    [...recipientIds].map((recipientId) => ({
      recipientId,
      type: 'sync_conflict' as const,
      priority: notificationPriorityByType.sync_conflict,
      entityType: 'sync_conflict' as const,
      entityId: conflict.id,
      createdAt: serverTime,
    })),
  );
  return {
    result: eventResult(input.clientEventId, 'conflict', CONFLICT_REASON),
    event: {
      type: 'sync.conflict',
      actorId: driver.id,
      occurredAt: formatColomboTimestamp(serverTime),
      conflictId: conflict.id,
      stopId: located.id,
      tripId: located.tripId,
      depotId: located.depotId,
    },
  };
}

function eventResult(
  clientEventId: string,
  status: SyncEventResult['status'],
  detail?: string,
): SyncEventResult {
  if (detail === undefined) return { clientEventId, status };
  return { clientEventId, status, detail };
}

function toRouteStop(stop: StopRow): SyncRouteStop {
  return {
    id: stop.id,
    orderId: stop.orderId,
    seq: stop.seq,
    plannedArrival: formatColomboTimestamp(stop.plannedArrival),
    status: stop.status,
  };
}

function assertDriver(user: User | null): Driver {
  if (user === null) throw new ApiError('UNAUTHENTICATED', 'Sign in required');
  if (user.role !== 'driver') {
    throw new ApiError('FORBIDDEN', 'You do not have access to this action');
  }
  return user;
}
