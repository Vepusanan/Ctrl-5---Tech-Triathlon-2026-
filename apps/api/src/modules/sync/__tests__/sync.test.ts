import { randomBytes, randomUUID } from 'node:crypto';
import {
  auditLog,
  depots,
  districtTravel,
  notifications,
  orders,
  outlets,
  planningRuns,
  pods,
  stopEvents,
  syncConflicts,
  tripStops,
  trips,
  users,
  vehicles,
} from '@waypoint/database';
import {
  currentUserResponseSchema,
  podSchema,
  SYNC_BATCH_LIMIT,
  syncEventsResponseSchema,
  syncTripDeltaSchema,
  type User,
} from '@waypoint/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import { argon2id } from 'hash-wasm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client, cookiePair, logCapture, SESSION_SECRET } from '../../../../test/http.ts';
import { createMigratedDatabase } from '../../../../test/postgres.ts';
import { buildApp } from '../../../app.ts';
import type { DomainEvent } from '../../../plugins/domain-events.ts';
import { STOP_EVENT_CLOCK_SKEW_MS } from '../../deliveries/apply.ts';
import { formatColomboTimestamp } from '../../orders/cutoff.ts';

const SERVICE_DATE = '2026-10-09';
const PINNED = '2026-10-09T07:00:00.000+05:30';
const ON_TIME = '2026-10-09T07:20:00.000+05:30';
const LATE = '2026-10-09T08:30:00.000+05:30';
const ARRIVAL = '2026-10-09T07:10:00.000+05:30';
const PASSWORD = 'waypoint-demo';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const CONFLICT = 'Stop was removed or reassigned';

describe('offline sync', () => {
  const logs = logCapture();
  const published: DomainEvent[] = [];
  let app: Awaited<ReturnType<typeof buildApp>>;
  let database: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let unsubscribe: () => void = () => undefined;
  let dispatcher: { cookie: string; user: User };
  let driver: { cookie: string; user: User };
  let otherDriver: { cookie: string; user: User };
  let loaderCookie: string;
  let store: { cookie: string; user: User };
  const tripNos = new Map<string, number>();

  beforeAll(async () => {
    database = await createMigratedDatabase();
    const passwordHash = await hashPassword(PASSWORD);
    await seedReference(passwordHash);
    app = await buildApp({
      db: database.db,
      logger: logs.logger,
      sessionSecret: SESSION_SECRET,
      secureCookies: false,
    });
    unsubscribe = app.domainEvents.subscribe((event) => {
      published.push(event);
    });
    dispatcher = await login('sync.dispatcher@waypoint.test');
    driver = await login('sync.driver@waypoint.test');
    otherDriver = await login('sync.other-driver@waypoint.test');
    loaderCookie = (await login('sync.loader@waypoint.test')).cookie;
    store = await login('sync.store@waypoint.test');
    app.clock.pin(new Date(PINNED));
  });

  afterAll(async () => {
    unsubscribe();
    await app.close();
    await database.close();
  });

  beforeEach(async () => {
    published.length = 0;
    logs.lines.length = 0;
    tripNos.clear();
    await database.db.delete(notifications);
    await database.db.delete(syncConflicts);
    await database.db.delete(stopEvents);
    await database.db.delete(pods);
    await database.db.delete(tripStops);
    await database.db.delete(trips);
    await database.db.delete(orders);
    await database.db.delete(planningRuns);
    app.clock.pin(new Date(PINNED));
  });

  it('applies the first offline event', async () => {
    const trip = await insertTrip();
    const stopId = trip.stopIds[0] ?? missing('stop');
    const event = arrived(stopId);
    const response = await postSync(driver.cookie, [event]);
    const body = syncEventsResponseSchema.parse(json(response, 200));
    expect(body.results).toEqual([{ clientEventId: event.clientEventId, status: 'applied' }]);

    const stored = await database.db.select().from(stopEvents);
    expect(stored).toHaveLength(1);
    const row = stored[0] ?? missing('event');
    expect(formatColomboTimestamp(row.clientTime)).toBe(ON_TIME);
    expect(formatColomboTimestamp(row.serverTime)).toBe(PINNED);
    expect(row.tripVersion).toBe(0);
    const stop = await stopRow(stopId);
    expect(stop).toMatchObject({ status: 'arrived', late: false });
    expect(logs.lines.some((line) => line.includes('sync.batch'))).toBe(true);
  });

  it('returns duplicate for the same event and does not repeat side effects', async () => {
    const trip = await insertTrip();
    const stopId = trip.stopIds[0] ?? missing('stop');
    const arrival = arrived(stopId);
    expect((await postSync(driver.cookie, [arrival])).statusCode).toBe(200);

    const failure = failed(stopId);
    const first = syncEventsResponseSchema.parse(
      json(await postSync(driver.cookie, [failure]), 200),
    );
    expect(first.results).toEqual([{ clientEventId: failure.clientEventId, status: 'applied' }]);

    const second = syncEventsResponseSchema.parse(
      json(await postSync(driver.cookie, [failure]), 200),
    );
    expect(second.results).toEqual([{ clientEventId: failure.clientEventId, status: 'duplicate' }]);

    const mismatched = syncEventsResponseSchema.parse(
      json(await postSync(driver.cookie, [{ ...failure, clientTime: LATE }]), 200),
    );
    expect(mismatched.results).toEqual([
      {
        clientEventId: failure.clientEventId,
        status: 'rejected',
        detail: 'This client event id was already recorded',
      },
    ]);

    const events = await database.db.select().from(stopEvents);
    expect(events.filter((event) => event.clientEventId === failure.clientEventId)).toHaveLength(1);
    expect(events).toHaveLength(2);
    expect(await stopRow(stopId)).toMatchObject({ status: 'failed' });
    const order = await database.db.select().from(orders);
    expect(order[0]?.status).toBe('failed');

    const notes = await database.db.select().from(notifications);
    expect(notes).toHaveLength(2);
    expect(notes.map((note) => note.recipientId).sort()).toEqual(
      [dispatcher.user.id, store.user.id].sort(),
    );
    expect(notes.every((note) => note.type === 'delivery_failed')).toBe(true);

    const audits = await database.db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, 'stop.failed'), eq(auditLog.entityId, stopId)));
    expect(audits).toHaveLength(1);
    expect(published.filter((event) => event.type === 'stop.failed')).toHaveLength(1);
    expect(published.filter((event) => event.type === 'stop.arrived')).toHaveLength(1);
  });

  it('accepts a batch of 100 events in that order', async () => {
    const trip = await insertTrip({
      stops: Array.from({ length: SYNC_BATCH_LIMIT }, (_, index) => ({
        seq: index + 1,
        plannedArrival: '07:10:00',
      })),
    });
    const events = trip.stopIds.map((stopId) => arrived(stopId));
    const response = await postSync(driver.cookie, events);
    const body = syncEventsResponseSchema.parse(json(response, 200));
    expect(body.results.map((result) => result.clientEventId)).toEqual(
      events.map((event) => event.clientEventId),
    );
    expect(body.results.every((result) => result.status === 'applied')).toBe(true);

    const stored = await database.db.select().from(stopEvents).orderBy(asc(stopEvents.id));
    expect(stored.map((event) => event.clientEventId)).toEqual(
      events.map((event) => event.clientEventId),
    );
    const stops = await database.db.select().from(tripStops);
    expect(stops).toHaveLength(SYNC_BATCH_LIMIT);
    expect(stops.every((stop) => stop.status === 'arrived')).toBe(true);
  }, 60_000);

  it('applies a batch in order and keeps a later sibling when one event is rejected', async () => {
    const trip = await insertTrip({
      stops: [
        { seq: 1, plannedArrival: '07:10:00' },
        { seq: 2, plannedArrival: '07:40:00' },
      ],
    });
    const first = trip.stopIds[0] ?? missing('stop');
    const second = trip.stopIds[1] ?? missing('stop');
    const pod = podSchema.parse(json(await postPod(driver.cookie, first), 201));
    const arrival = arrived(first);
    const delivery = delivered(first, pod.id);
    const ordered = syncEventsResponseSchema.parse(
      json(await postSync(driver.cookie, [arrival, delivery, arrival]), 200),
    );
    expect(ordered.results.map((result) => result.status)).toEqual([
      'applied',
      'applied',
      'duplicate',
    ]);
    expect(await stopRow(first)).toMatchObject({ status: 'delivered', late: false });

    const early = delivered(second, pod.id);
    const sibling = arrived(second);
    const mixed = syncEventsResponseSchema.parse(
      json(await postSync(driver.cookie, [early, sibling]), 200),
    );
    expect(mixed.results).toEqual([
      {
        clientEventId: early.clientEventId,
        status: 'rejected',
        detail: 'Stop cannot move from pending to delivered',
      },
      { clientEventId: sibling.clientEventId, status: 'applied' },
    ]);
    expect(await stopRow(second)).toMatchObject({ status: 'arrived' });
    const rejected = await database.db
      .select()
      .from(stopEvents)
      .where(eq(stopEvents.clientEventId, early.clientEventId));
    expect(rejected).toHaveLength(0);
  });

  it('accepts stale trip versions for arrival, delivery, and failure', async () => {
    const trip = await insertTrip({
      version: 4,
      stops: [
        { seq: 1, plannedArrival: '07:10:00' },
        { seq: 2, plannedArrival: '07:40:00' },
      ],
    });
    const deliveredStop = trip.stopIds[0] ?? missing('stop');
    const failedStop = trip.stopIds[1] ?? missing('stop');
    const pod = podSchema.parse(json(await postPod(driver.cookie, deliveredStop), 201));
    const response = await postSync(driver.cookie, [
      arrived(deliveredStop, { tripVersion: 0 }),
      delivered(deliveredStop, pod.id, { tripVersion: 0 }),
      arrived(failedStop, { tripVersion: 0 }),
      failed(failedStop, { tripVersion: 0 }),
    ]);
    const body = syncEventsResponseSchema.parse(json(response, 200));
    expect(body.results.map((result) => result.status)).toEqual([
      'applied',
      'applied',
      'applied',
      'applied',
    ]);
    expect(await stopRow(deliveredStop)).toMatchObject({ status: 'delivered' });
    expect(await stopRow(failedStop)).toMatchObject({ status: 'failed' });
    const savedTrip = await database.db.select().from(trips);
    expect(savedTrip[0]?.version).toBe(4);
    const conflicts = await database.db.select().from(syncConflicts);
    expect(conflicts).toHaveLength(0);
    const ordersSaved = await database.db.select().from(orders);
    expect(ordersSaved.map((order) => order.status).sort()).toEqual(['delivered', 'failed']);
  });

  it('preserves a removed stop as a conflict without changing the assignment', async () => {
    const own = await insertTrip();
    const other = await insertTrip({ vehicleId: 'VEH502' });
    const stopId = own.stopIds[0] ?? missing('stop');
    const orderId = own.orderIds[0] ?? missing('order');
    await database.db
      .update(tripStops)
      .set({ tripId: other.tripId, seq: 2 })
      .where(eq(tripStops.id, stopId));
    await database.db.update(trips).set({ version: 1 }).where(eq(trips.id, own.tripId));

    const event = arrived(stopId, { tripVersion: 0 });
    const first = syncEventsResponseSchema.parse(json(await postSync(driver.cookie, [event]), 200));
    expect(first.results).toEqual([
      { clientEventId: event.clientEventId, status: 'conflict', detail: CONFLICT },
    ]);
    expect(published).toEqual([
      expect.objectContaining({
        type: 'sync.conflict',
        actorId: driver.user.id,
        occurredAt: PINNED,
        stopId,
        tripId: other.tripId,
        depotId: 'Peliyagoda',
      }),
    ]);

    const again = syncEventsResponseSchema.parse(json(await postSync(driver.cookie, [event]), 200));
    expect(again.results).toEqual([
      { clientEventId: event.clientEventId, status: 'conflict', detail: CONFLICT },
    ]);
    expect(published).toHaveLength(1);

    const stored = await database.db.select().from(stopEvents);
    expect(stored).toHaveLength(1);
    const row = stored[0] ?? missing('event');
    expect(formatColomboTimestamp(row.clientTime)).toBe(ON_TIME);
    expect(formatColomboTimestamp(row.serverTime)).toBe(PINNED);
    expect(row.tripVersion).toBe(0);

    const conflicts = await database.db.select().from(syncConflicts);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ eventId: row.id, reason: CONFLICT, resolvedBy: null });

    expect(await stopRow(stopId)).toMatchObject({
      tripId: other.tripId,
      status: 'pending',
      late: false,
    });
    const order = await database.db.select().from(orders).where(eq(orders.id, orderId));
    expect(order[0]?.status).toBe('dispatched');
    const versions = await database.db.select({ id: trips.id, version: trips.version }).from(trips);
    expect(versions.find((trip) => trip.id === own.tripId)?.version).toBe(1);
    expect(versions.find((trip) => trip.id === other.tripId)?.version).toBe(0);

    const audits = await database.db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, 'sync.conflict'),
          sql`${auditLog.after}->>'clientEventId' = ${event.clientEventId}`,
        ),
      );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorId: driver.user.id,
      role: 'driver',
      before: { tripId: other.tripId, status: 'pending', tripVersion: 0 },
      after: {
        tripId: other.tripId,
        status: 'pending',
        tripVersion: 0,
        clientTime: ON_TIME,
        serverTime: PINNED,
        eventTripVersion: 0,
      },
    });
    const notes = await database.db.select().from(notifications);
    expect(notes).toHaveLength(2);
    expect(notes.map((note) => note.recipientId).sort()).toEqual(
      [dispatcher.user.id, driver.user.id].sort(),
    );
    expect(notes.every((note) => note.type === 'sync_conflict')).toBe(true);
    expect(notes.every((note) => note.entityId === conflicts[0]?.id)).toBe(true);
    expect(logs.lines.some((line) => line.includes('sync.conflict'))).toBe(true);
    expect(logs.lines.some((line) => line.includes('sync.batch'))).toBe(true);
  });

  it("rejects another driver's stop and hides another driver's trip", async () => {
    const own = await insertTrip({ vehicleId: 'VEH501' });
    const foreign = await insertTrip({ vehicleId: 'VEH502' });
    const ownStop = own.stopIds[0] ?? missing('stop');
    const foreignStop = foreign.stopIds[0] ?? missing('stop');
    const ownEvent = arrived(ownStop);
    const foreignEvent = arrived(foreignStop);
    const response = await postSync(driver.cookie, [foreignEvent, ownEvent]);
    const body = syncEventsResponseSchema.parse(json(response, 200));
    expect(body.results).toEqual([
      { clientEventId: foreignEvent.clientEventId, status: 'rejected', detail: 'Stop not found' },
      { clientEventId: ownEvent.clientEventId, status: 'applied' },
    ]);
    expect(await stopRow(foreignStop)).toMatchObject({ status: 'pending', tripId: foreign.tripId });
    expect(await stopRow(ownStop)).toMatchObject({ status: 'arrived', tripId: own.tripId });
    expect(await database.db.select().from(syncConflicts)).toHaveLength(0);
    expect(await database.db.select().from(stopEvents)).toHaveLength(1);

    const otherView = syncEventsResponseSchema.parse(
      json(await postSync(otherDriver.cookie, [arrived(ownStop)]), 200),
    );
    expect(otherView.results[0]).toMatchObject({ status: 'rejected', detail: 'Stop not found' });
    expect(await database.db.select().from(stopEvents)).toHaveLength(1);

    const hidden = await getDelta(driver.cookie, foreign.tripId, 0);
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });

    const forbidden = await postSync(loaderCookie, [arrived(ownStop)]);
    expect(forbidden.statusCode).toBe(403);
    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/v1/sync/events',
      payload: { events: [arrived(ownStop)] },
    });
    expect(anonymous.statusCode).toBe(401);
  });

  it('uses client time for lateness and flags a clock more than 12 hours off', async () => {
    const trip = await insertTrip({
      stops: [
        { seq: 1, plannedArrival: '07:10:00' },
        { seq: 2, plannedArrival: '07:40:00' },
        { seq: 3, plannedArrival: '08:10:00' },
      ],
    });
    const lateStop = trip.stopIds[0] ?? missing('stop');
    const skewedStop = trip.stopIds[1] ?? missing('stop');
    const boundaryStop = trip.stopIds[2] ?? missing('stop');
    const skewedAt = formatColomboTimestamp(
      new Date(new Date(PINNED).getTime() - STOP_EVENT_CLOCK_SKEW_MS - 1),
    );
    const boundaryAt = formatColomboTimestamp(
      new Date(new Date(PINNED).getTime() - STOP_EVENT_CLOCK_SKEW_MS),
    );
    const response = await postSync(driver.cookie, [
      arrived(lateStop, { clientTime: LATE }),
      arrived(skewedStop, { clientTime: skewedAt }),
      arrived(boundaryStop, { clientTime: boundaryAt }),
    ]);
    expect(
      syncEventsResponseSchema.parse(json(response, 200)).results.map((result) => result.status),
    ).toEqual(['applied', 'applied', 'applied']);
    expect(await stopRow(lateStop)).toMatchObject({ status: 'arrived', late: true });

    const audits = await database.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, 'stop.arrived'));
    const lateAudit = audits.find((audit) => audit.entityId === lateStop);
    const skewedAudit = audits.find((audit) => audit.entityId === skewedStop);
    const boundaryAudit = audits.find((audit) => audit.entityId === boundaryStop);
    expect(lateAudit?.after).toMatchObject({
      clientTime: LATE,
      serverTime: PINNED,
      clockSkew: false,
    });
    expect(skewedAudit?.after).toMatchObject({
      clientTime: skewedAt,
      serverTime: PINNED,
      clockSkew: true,
    });
    expect(boundaryAudit?.after).toMatchObject({ clockSkew: false });
  });

  it('returns no change when the trip version matches', async () => {
    const trip = await insertTrip();
    const before = await database.db.select().from(trips).where(eq(trips.id, trip.tripId));
    const response = await getDelta(driver.cookie, trip.tripId, 0);
    expect(syncTripDeltaSchema.parse(json(response, 200))).toEqual({
      changed: false,
      tripId: trip.tripId,
      version: 0,
    });
    const after = await database.db.select().from(trips).where(eq(trips.id, trip.tripId));
    expect(after).toEqual(before);
    const audits = await database.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, trip.tripId));
    expect(audits).toHaveLength(0);

    const missingSince = await app.inject({
      method: 'GET',
      url: `/api/v1/sync/trips/${trip.tripId}`,
      headers: { cookie: driver.cookie },
    });
    expect(missingSince.statusCode).toBe(400);
  });

  it('returns added, removed, and reordered stops when the version moved', async () => {
    const trip = await insertTrip({
      stops: [
        { seq: 1, plannedArrival: '07:10:00' },
        { seq: 2, plannedArrival: '07:20:00' },
        { seq: 3, plannedArrival: '07:30:00' },
      ],
    });
    const first = trip.stopIds[0] ?? missing('stop');
    const second = trip.stopIds[1] ?? missing('stop');
    const third = trip.stopIds[2] ?? missing('stop');
    const firstOrder = trip.orderIds[0] ?? missing('order');
    const secondOrder = trip.orderIds[1] ?? missing('order');
    await database.db
      .update(tripStops)
      .set({ seq: sql`${tripStops.seq} + 1000` })
      .where(eq(tripStops.tripId, trip.tripId));
    await database.db.delete(tripStops).where(eq(tripStops.id, third));
    await database.db.update(tripStops).set({ seq: 1 }).where(eq(tripStops.id, second));
    await database.db.update(tripStops).set({ seq: 3 }).where(eq(tripStops.id, first));
    const insertedOrder = await database.db
      .insert(orders)
      .values({
        outletId: 'OUT501',
        brand: 'Fresh',
        temp: 'ambient',
        requestedDate: SERVICE_DATE,
        units: 4,
        weightKg: 12,
        volumeM3: 0.4,
        status: 'dispatched',
      })
      .returning({ id: orders.id });
    const addedOrder = insertedOrder[0]?.id ?? missing('order');
    const insertedStop = await database.db
      .insert(tripStops)
      .values({
        tripId: trip.tripId,
        orderId: addedOrder,
        seq: 2,
        plannedArrival: new Date(`${SERVICE_DATE}T07:40:00.000+05:30`),
        status: 'pending',
      })
      .returning({ id: tripStops.id });
    const addedStop = insertedStop[0]?.id ?? missing('stop');
    await database.db.update(trips).set({ version: 1 }).where(eq(trips.id, trip.tripId));
    await database.db.insert(auditLog).values({
      actorId: dispatcher.user.id,
      role: 'dispatcher',
      action: 'trip.resequenced',
      entityType: 'trip',
      entityId: trip.tripId,
      before: { version: 0, stopIds: [first, second, third] },
      after: { version: 1, stopIds: [second, addedStop, first] },
      createdAt: new Date(PINNED),
    });

    const response = await getDelta(driver.cookie, trip.tripId, 0);
    expect(syncTripDeltaSchema.parse(json(response, 200))).toEqual({
      changed: true,
      tripId: trip.tripId,
      since: 0,
      version: 1,
      added: [
        {
          id: addedStop,
          orderId: addedOrder,
          seq: 2,
          plannedArrival: '2026-10-09T07:40:00.000+05:30',
          status: 'pending',
        },
      ],
      removed: [{ id: third }],
      reordered: [
        {
          id: second,
          orderId: secondOrder,
          seq: 1,
          plannedArrival: '2026-10-09T07:20:00.000+05:30',
          status: 'pending',
        },
        {
          id: first,
          orderId: firstOrder,
          seq: 3,
          plannedArrival: ARRIVAL,
          status: 'pending',
        },
      ],
      acknowledgementRequired: true,
    });

    const current = await getDelta(driver.cookie, trip.tripId, 1);
    expect(syncTripDeltaSchema.parse(json(current, 200))).toEqual({
      changed: false,
      tripId: trip.tripId,
      version: 1,
    });
    const ahead = await getDelta(driver.cookie, trip.tripId, 2);
    expect(ahead.statusCode).toBe(409);
    const saved = await database.db.select().from(trips).where(eq(trips.id, trip.tripId));
    expect(saved[0]?.version).toBe(1);
    const stops = await database.db
      .select({ id: tripStops.id, seq: tripStops.seq })
      .from(tripStops)
      .where(eq(tripStops.tripId, trip.tripId))
      .orderBy(asc(tripStops.seq));
    expect(stops.map((stop) => stop.id)).toEqual([second, addedStop, first]);
    const audits = await database.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, trip.tripId));
    expect(audits).toHaveLength(1);
  });

  it('rejects a batch that fails the shared schema', async () => {
    const empty = await postSync(driver.cookie, []);
    expect(empty.statusCode).toBe(400);
    const tooMany = Array.from({ length: SYNC_BATCH_LIMIT + 1 }, () => arrived(randomUUID()));
    const oversized = await postSync(driver.cookie, tooMany);
    expect(oversized.statusCode).toBe(400);
  });

  async function postSync(cookie: string, events: readonly unknown[]) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/sync/events',
      headers: { cookie },
      payload: { events },
    });
  }

  async function getDelta(cookie: string, tripId: string, since: number) {
    return app.inject({
      method: 'GET',
      url: `/api/v1/sync/trips/${tripId}?since=${since}`,
      headers: { cookie },
    });
  }

  async function postPod(cookie: string, stopId: string) {
    const body = multipartBody({ recipientName: 'K. Silva', clientTime: ON_TIME }, [
      {
        name: 'signature',
        filename: 'signature.png',
        contentType: 'image/png',
        data: PNG,
      },
    ]);
    return app.inject({
      method: 'POST',
      url: `/api/v1/stops/${stopId}/pod`,
      headers: { cookie, 'content-type': body.contentType },
      payload: body.payload,
    });
  }

  async function stopRow(stopId: string) {
    const rows = await database.db.select().from(tripStops).where(eq(tripStops.id, stopId));
    return rows[0] ?? missing('stop');
  }

  async function insertTrip(
    options: {
      vehicleId?: string;
      version?: number;
      stops?: { seq: number; plannedArrival: string }[];
    } = {},
  ): Promise<{ tripId: string; orderIds: string[]; stopIds: string[] }> {
    const vehicleId = options.vehicleId ?? 'VEH501';
    const tripNo = nextTripNo(vehicleId);
    const runId = await ensureRun();
    const created = await database.db
      .insert(trips)
      .values({
        runId,
        vehicleId,
        tripNo,
        brand: 'Fresh',
        district: 'Colombo',
        status: 'departed',
        version: options.version ?? 0,
        plannedMinutes: 40,
        plannedKm: 12,
      })
      .returning({ id: trips.id });
    const tripId = created[0]?.id;
    if (tripId === undefined) throw new Error('Expected a trip id');
    const plan = options.stops ?? [{ seq: 1, plannedArrival: '07:10:00' }];
    const orderIds: string[] = [];
    const stopIds: string[] = [];
    for (const stop of plan) {
      const order = await database.db
        .insert(orders)
        .values({
          outletId: 'OUT501',
          brand: 'Fresh',
          temp: 'ambient',
          requestedDate: SERVICE_DATE,
          units: 4,
          weightKg: 12,
          volumeM3: 0.4,
          status: 'dispatched',
        })
        .returning({ id: orders.id });
      const orderId = order[0]?.id;
      if (orderId === undefined) throw new Error('Expected an order id');
      const inserted = await database.db
        .insert(tripStops)
        .values({
          tripId,
          orderId,
          seq: stop.seq,
          plannedArrival: new Date(`${SERVICE_DATE}T${stop.plannedArrival}.000+05:30`),
          status: 'pending',
        })
        .returning({ id: tripStops.id });
      const stopId = inserted[0]?.id;
      if (stopId === undefined) throw new Error('Expected a stop id');
      orderIds.push(orderId);
      stopIds.push(stopId);
    }
    return { tripId, orderIds, stopIds };
  }

  function nextTripNo(vehicleId: string): 1 | 2 {
    const next = (tripNos.get(vehicleId) ?? 0) + 1;
    if (next !== 1 && next !== 2) throw new Error('A vehicle can only have two trips');
    tripNos.set(vehicleId, next);
    return next;
  }

  async function ensureRun(): Promise<string> {
    const existing = await database.db
      .select({ id: planningRuns.id })
      .from(planningRuns)
      .where(eq(planningRuns.depotId, 'Peliyagoda'));
    const found = existing[0]?.id;
    if (found !== undefined) return found;
    const inserted = await database.db
      .insert(planningRuns)
      .values({
        depotId: 'Peliyagoda',
        serviceDate: SERVICE_DATE,
        status: 'published',
        publishedAt: new Date(PINNED),
        publishedBy: dispatcher.user.id,
        planVersion: 1,
      })
      .returning({ id: planningRuns.id });
    const id = inserted[0]?.id;
    if (id === undefined) throw new Error('Expected a planning run');
    return id;
  }

  async function login(email: string): Promise<{ cookie: string; user: User }> {
    const response = await app.inject({
      ...client(),
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    expect(response.statusCode).toBe(200);
    return {
      cookie: cookiePair(response),
      user: currentUserResponseSchema.parse(response.json()).user,
    };
  }

  async function seedReference(passwordHash: string): Promise<void> {
    await database.db.insert(depots).values([
      { id: 'Peliyagoda', name: 'Peliyagoda' },
      { id: 'Kandy', name: 'Kandy' },
    ]);
    await database.db.insert(districtTravel).values({
      district: 'Colombo',
      depotId: 'Peliyagoda',
      roadClass: 'urban',
      depotToDistrictKm: 12,
      depotToDistrictMin: 24,
      interStopKm: 4,
      interStopMin: 8,
    });
    await database.db.insert(outlets).values({
      id: 'OUT501',
      brand: 'Fresh',
      district: 'Colombo',
      depotId: 'Peliyagoda',
      dockType: 'street',
      parkingConstraint: 'normal',
      windowOpen: '05:00:00',
      windowClose: '08:00:00',
    });
    await database.db
      .insert(vehicles)
      .values([vehicle('VEH501', 'Peliyagoda'), vehicle('VEH502', 'Peliyagoda')]);
    await database.db.insert(users).values([
      {
        name: 'Peliyagoda Dispatcher',
        email: 'sync.dispatcher@waypoint.test',
        passwordHash,
        role: 'dispatcher',
        depotId: 'Peliyagoda',
      },
      {
        name: 'Peliyagoda Loader',
        email: 'sync.loader@waypoint.test',
        passwordHash,
        role: 'loader',
        depotId: 'Peliyagoda',
      },
      {
        name: 'Van Driver',
        email: 'sync.driver@waypoint.test',
        passwordHash,
        role: 'driver',
        vehicleId: 'VEH501',
      },
      {
        name: 'Other Driver',
        email: 'sync.other-driver@waypoint.test',
        passwordHash,
        role: 'driver',
        vehicleId: 'VEH502',
      },
      {
        name: 'Store Manager',
        email: 'sync.store@waypoint.test',
        passwordHash,
        role: 'store_manager',
        outletId: 'OUT501',
      },
    ]);
  }
});

function arrived(
  stopId: string,
  extra: { clientEventId?: string; clientTime?: string; tripVersion?: number } = {},
) {
  return {
    clientEventId: extra.clientEventId ?? randomUUID(),
    stopId,
    type: 'arrived' as const,
    payload: {},
    clientTime: extra.clientTime ?? ON_TIME,
    tripVersion: extra.tripVersion ?? 0,
  };
}

function delivered(
  stopId: string,
  podId: string,
  extra: { clientEventId?: string; clientTime?: string; tripVersion?: number } = {},
) {
  return {
    clientEventId: extra.clientEventId ?? randomUUID(),
    stopId,
    type: 'delivered' as const,
    payload: { podId },
    clientTime: extra.clientTime ?? ON_TIME,
    tripVersion: extra.tripVersion ?? 0,
  };
}

function failed(
  stopId: string,
  extra: { clientEventId?: string; clientTime?: string; tripVersion?: number } = {},
) {
  return {
    clientEventId: extra.clientEventId ?? randomUUID(),
    stopId,
    type: 'failed' as const,
    payload: { reason: 'Closed' },
    clientTime: extra.clientTime ?? ON_TIME,
    tripVersion: extra.tripVersion ?? 0,
  };
}

function multipartBody(
  fields: Record<string, string>,
  files: { name: string; filename: string; contentType: string; data: Buffer }[],
): { payload: Buffer; contentType: string } {
  const boundary = '----WaypointPod';
  const chunks: Buffer[] = [];
  const push = (value: string) => {
    chunks.push(Buffer.from(value));
  };
  for (const [name, value] of Object.entries(fields)) {
    push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
  }
  for (const file of files) {
    push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    );
    chunks.push(file.data);
    push('\r\n');
  }
  push(`--${boundary}--\r\n`);
  return {
    payload: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function json(response: { statusCode: number; json: () => unknown }, status: number): unknown {
  expect(response.statusCode).toBe(status);
  return response.json();
}

function missing(label: string): never {
  throw new Error(`Expected a ${label}`);
}

function vehicle(id: string, depotId: string) {
  return {
    id,
    type: 'van' as const,
    temp: 'reefer' as const,
    weightCapKg: 1500,
    volumeCapM3: 8,
    fuelType: 'diesel',
    kmPerL: 10,
    weeklyFuelQuotaL: 200,
    depotId,
  };
}

async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: randomBytes(16),
    parallelism: 1,
    iterations: 2,
    memorySize: 19_456,
    hashLength: 32,
    outputType: 'encoded',
  });
}
