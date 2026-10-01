import { randomBytes, randomUUID } from 'node:crypto';
import {
  auditLog,
  calendarDays,
  depots,
  districtTravel,
  fuelLedger,
  loadingIssues,
  loadingRecords,
  orders,
  outlets,
  planningRuns,
  serviceAllowances,
  stopEvents,
  tripStops,
  trips,
  users,
  vehicleAvailability,
  vehicles,
} from '@waypoint/database';
import {
  currentUserResponseSchema,
  tripDetailSchema,
  tripListResponseSchema,
  type User,
} from '@waypoint/shared';
import { eq } from 'drizzle-orm';
import { argon2id } from 'hash-wasm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { client, cookiePair, SESSION_SECRET } from '../../../../test/http.ts';
import { createMigratedDatabase } from '../../../../test/postgres.ts';
import { buildApp } from '../../../app.ts';
import type { DomainEvent } from '../../../plugins/domain-events.ts';

const SERVICE_DATE = '2026-10-07';
const PINNED = '2026-10-06T10:00:00.000+05:30';
const PASSWORD = 'waypoint-demo';

describe('trips', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let database: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let dispatcher: { cookie: string; user: User };
  let loader: { cookie: string; user: User };
  let driver: { cookie: string; user: User };
  let otherDriver: { cookie: string; user: User };
  let storeCookie: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
    const passwordHash = await hashPassword(PASSWORD);
    await seedReference(passwordHash);
    app = await buildApp({
      db: database.db,
      logger: false,
      sessionSecret: SESSION_SECRET,
      secureCookies: false,
    });
    dispatcher = await login('trips.dispatcher@waypoint.test');
    loader = await login('trips.loader@waypoint.test');
    driver = await login('trips.driver@waypoint.test');
    otherDriver = await login('trips.other-driver@waypoint.test');
    storeCookie = (await login('trips.store@waypoint.test')).cookie;
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  beforeEach(async () => {
    await database.db.delete(loadingIssues);
    await database.db.delete(loadingRecords);
    await database.db.delete(fuelLedger);
    await database.db.delete(stopEvents);
    await database.db.delete(tripStops);
    await database.db.delete(trips);
    await database.db.delete(orders);
    await database.db.delete(planningRuns);
    await database.db.delete(vehicleAvailability);
    app.clock.pin(new Date(PINNED));
  });

  it('gives the dispatcher trips in the depot', async () => {
    const own = await insertTrip();
    const other = await insertTrip({ vehicleId: 'VEH311', outletId: 'OUT311', district: 'Kandy' });
    await database.db.insert(loadingIssues).values({
      tripId: own.tripId,
      orderId: own.orderIds[0] ?? missing('order'),
      type: 'short',
      qty: 1,
      note: 'One crate short',
      loaderId: loader.user.id,
      createdAt: new Date(PINNED),
    });
    await database.db.insert(stopEvents).values({
      clientEventId: randomUUID(),
      stopId: own.stopIds[0] ?? missing('stop'),
      type: 'arrived',
      payload: {},
      clientTime: new Date(PINNED),
      serverTime: new Date(PINNED),
      tripVersion: 0,
    });

    const listed = await app.inject({
      method: 'GET',
      url: `/api/v1/trips?date=${SERVICE_DATE}`,
      headers: { cookie: dispatcher.cookie },
    });
    const list = tripListResponseSchema.parse(json(listed, 200));
    expect(list.total).toBe(list.items.length);
    expect(list.items.map((trip) => trip.id)).toEqual([own.tripId]);
    expect(list.items[0]?.run).toMatchObject({ depotId: 'Peliyagoda', serviceDate: SERVICE_DATE });
    expect(list.items[0]?.vehicle.id).toBe('VEH301');
    expect(list.items[0]?.stops.map((stop) => stop.order.id)).toEqual(own.orderIds);
    expect(list.items[0]?.loadingStatus).toBe('not_started');
    expect(list.items[0]?.exceptions.map((issue) => issue.type)).toEqual(['short']);
    expect(list.items[0]?.lastEvent).toEqual({ serverTime: PINNED, tripVersion: 0 });

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/trips/${own.tripId}`,
      headers: { cookie: dispatcher.cookie },
    });
    const detail = tripDetailSchema.parse(json(response, 200));
    expect(detail.vehicle.id).toBe('VEH301');
    expect(detail.run).toMatchObject({ depotId: 'Peliyagoda', serviceDate: SERVICE_DATE });
    expect(detail.stops.map((stop) => stop.seq)).toEqual([1]);
    expect(detail.stops[0]?.order.id).toBe(own.orderIds[0]);
    expect(detail.loadingStatus).toBe('not_started');
    expect(detail.exceptions.map((issue) => issue.type)).toEqual(['short']);
    expect(detail.lastEvent).toEqual({ serverTime: PINNED, tripVersion: 0 });

    const hidden = await app.inject({
      method: 'GET',
      url: `/api/v1/trips/${other.tripId}`,
      headers: { cookie: dispatcher.cookie },
    });
    expect(hidden.statusCode).toBe(404);

    const store = await app.inject({
      method: 'GET',
      url: `/api/v1/trips/${own.tripId}`,
      headers: { cookie: storeCookie },
    });
    expect(store.statusCode).toBe(403);
    const storeList = await app.inject({
      method: 'GET',
      url: '/api/v1/trips',
      headers: { cookie: storeCookie },
    });
    expect(storeList.statusCode).toBe(403);
    const anonymous = await app.inject({ method: 'GET', url: '/api/v1/trips' });
    expect(anonymous.statusCode).toBe(401);
  });

  it('lets a loader see only trips at the home depot', async () => {
    const own = await insertTrip();
    const other = await insertTrip({ vehicleId: 'VEH311', outletId: 'OUT311', district: 'Kandy' });
    const visible = await app.inject({
      method: 'GET',
      url: `/api/v1/trips/${own.tripId}`,
      headers: { cookie: loader.cookie },
    });
    expect(visible.statusCode).toBe(200);
    const hidden = await app.inject({
      method: 'GET',
      url: `/api/v1/trips/${other.tripId}`,
      headers: { cookie: loader.cookie },
    });
    expect(hidden.statusCode).toBe(404);
    const listed = tripListResponseSchema.parse(
      json(
        await app.inject({
          method: 'GET',
          url: `/api/v1/trips?date=${SERVICE_DATE}`,
          headers: { cookie: loader.cookie },
        }),
        200,
      ),
    );
    expect(listed.items.map((trip) => trip.id)).toEqual([own.tripId]);
  });

  it('lets a driver see only the assigned vehicle', async () => {
    const own = await insertTrip();
    const other = await insertTrip({ vehicleId: 'VEH311', outletId: 'OUT311', district: 'Kandy' });
    const visible = await app.inject({
      method: 'GET',
      url: `/api/v1/trips/${own.tripId}`,
      headers: { cookie: driver.cookie },
    });
    expect(tripDetailSchema.parse(json(visible, 200)).vehicle.id).toBe('VEH301');
    const hidden = await app.inject({
      method: 'GET',
      url: `/api/v1/trips/${other.tripId}`,
      headers: { cookie: driver.cookie },
    });
    expect(hidden.statusCode).toBe(404);
    const listed = tripListResponseSchema.parse(
      json(
        await app.inject({
          method: 'GET',
          url: '/api/v1/trips',
          headers: { cookie: driver.cookie },
        }),
        200,
      ),
    );
    expect(listed.items.map((trip) => trip.vehicleId)).toEqual(['VEH301']);
    const assigned = await app.inject({
      method: 'GET',
      url: `/api/v1/trips/${other.tripId}`,
      headers: { cookie: otherDriver.cookie },
    });
    expect(assigned.statusCode).toBe(200);
  });

  it('resequences a trip when the new order still meets the windows', async () => {
    const trip = await insertTrip({
      outlets: [
        { outletId: 'OUT301', seq: 1 },
        { outletId: 'OUT302', seq: 2 },
      ],
    });
    const tight = trip.stopIds[1];
    const wide = trip.stopIds[0];
    if (tight === undefined || wide === undefined) throw new Error('Expected two stops');
    const seen: DomainEvent[] = [];
    const stop = app.domainEvents.subscribe((event) => {
      seen.push(event);
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/resequence`,
      headers: { cookie: dispatcher.cookie, 'if-match': '0' },
      payload: { stopIds: [tight, wide] },
    });
    stop();
    const detail = tripDetailSchema.parse(json(response, 200));
    expect(detail.version).toBe(1);
    expect(detail.stops.map((stopRow) => stopRow.order.outletId)).toEqual(['OUT302', 'OUT301']);
    expect(detail.stops[0]?.plannedArrival.startsWith(`${SERVICE_DATE}T03:54:00`)).toBe(true);
    expect(detail.plannedMinutes).toBe(62);
    expect(detail.plannedKm).toBe(28);
    expect(seen).toEqual([
      expect.objectContaining({ type: 'trip.changed', tripId: trip.tripId, version: 1 }),
    ]);
    const loaderCall = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/resequence`,
      headers: { cookie: loader.cookie, 'if-match': '1' },
      payload: { stopIds: [tight, wide] },
    });
    expect(loaderCall.statusCode).toBe(403);
    const driverCall = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/resequence`,
      headers: { cookie: driver.cookie, 'if-match': '1' },
      payload: { stopIds: [tight, wide] },
    });
    expect(driverCall.statusCode).toBe(403);
    const missingVersion = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/resequence`,
      headers: { cookie: dispatcher.cookie },
      payload: { stopIds: [tight, wide] },
    });
    expect(missingVersion.statusCode).toBe(400);
    expect(missingVersion.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('rejects a stop list that drops or repeats a stop', async () => {
    const trip = await insertTrip({
      outlets: [
        { outletId: 'OUT302', seq: 1 },
        { outletId: 'OUT301', seq: 2 },
      ],
    });
    const first = trip.stopIds[0];
    const second = trip.stopIds[1];
    if (first === undefined || second === undefined) throw new Error('Expected two stops');
    const missingStop = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/resequence`,
      headers: { cookie: dispatcher.cookie, 'if-match': '0' },
      payload: { stopIds: [first] },
    });
    expect(missingStop.statusCode).toBe(400);
    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/resequence`,
      headers: { cookie: dispatcher.cookie, 'if-match': '0' },
      payload: { stopIds: [first, first] },
    });
    expect(duplicate.statusCode).toBe(400);
    const unknown = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/resequence`,
      headers: { cookie: dispatcher.cookie, 'if-match': '0' },
      payload: { stopIds: [first, '00000000-0000-4000-8000-000000000099'] },
    });
    expect(unknown.statusCode).toBe(400);
    const row = await database.db.select().from(trips).where(eq(trips.id, trip.tripId));
    expect(row[0]?.version).toBe(0);
  });

  it('rejects a resequence that misses a delivery window', async () => {
    const trip = await insertTrip({
      outlets: [
        { outletId: 'OUT302', seq: 1 },
        { outletId: 'OUT301', seq: 2 },
      ],
    });
    const tight = trip.stopIds[0];
    const wide = trip.stopIds[1];
    if (tight === undefined || wide === undefined) throw new Error('Expected two stops');
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/resequence`,
      headers: { cookie: dispatcher.cookie, 'if-match': '0' },
      payload: { stopIds: [wide, tight] },
    });
    expectViolation(response, 'WINDOW_MISSED');
    const row = await database.db.select().from(trips).where(eq(trips.id, trip.tripId));
    expect(row[0]?.version).toBe(0);
    const stops = await database.db
      .select({ seq: tripStops.seq, id: tripStops.id })
      .from(tripStops)
      .where(eq(tripStops.tripId, trip.tripId));
    expect(stops.find((stop) => stop.id === tight)?.seq).toBe(1);
  });

  it('returns 409 when the trip version is stale', async () => {
    const trip = await insertTrip({
      outlets: [
        { outletId: 'OUT302', seq: 1 },
        { outletId: 'OUT301', seq: 2 },
      ],
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/resequence`,
      headers: { cookie: dispatcher.cookie, 'if-match': '4' },
      payload: { stopIds: trip.stopIds },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'VERSION_CONFLICT' } });
    const row = await database.db.select().from(trips).where(eq(trips.id, trip.tripId));
    expect(row[0]?.version).toBe(0);
  });

  it('departs a ready published trip and dispatches its orders', async () => {
    const trip = await insertTrip({
      tripStatus: 'ready',
      orderStatus: 'loading',
      loading: 'ready',
    });
    // A shortfall warns the dispatcher. It does not hard-block departure (assumption A5).
    await database.db.insert(loadingIssues).values({
      tripId: trip.tripId,
      orderId: trip.orderIds[0] ?? missing('order'),
      type: 'missing',
      qty: 1,
      note: 'Missing crate',
      loaderId: loader.user.id,
      createdAt: new Date(PINNED),
    });
    const seen: DomainEvent[] = [];
    const stop = app.domainEvents.subscribe((event) => {
      seen.push(event);
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/depart`,
      headers: { cookie: dispatcher.cookie, 'if-match': '0' },
    });
    stop();
    const detail = tripDetailSchema.parse(json(response, 200));
    expect(detail.status).toBe('departed');
    expect(detail.version).toBe(1);
    expect(detail.loadingStatus).toBe('departed');
    expect(detail.stops[0]?.order.status).toBe('dispatched');
    expect(seen).toEqual([
      expect.objectContaining({
        type: 'trip.departed',
        tripId: trip.tripId,
        version: 1,
        occurredAt: PINNED,
      }),
    ]);
  });

  it('rejects departure before the trip and its load are ready', async () => {
    const trip = await insertTrip({ tripStatus: 'published' });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/depart`,
      headers: { cookie: dispatcher.cookie, 'if-match': '0' },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ error: { code: 'CONSTRAINT_VIOLATION' } });
    const row = await database.db.select().from(trips).where(eq(trips.id, trip.tripId));
    expect(row[0]?.status).toBe('published');
    const missingVersion = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/depart`,
      headers: { cookie: dispatcher.cookie },
    });
    expect(missingVersion.statusCode).toBe(400);
    expect(missingVersion.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('returns 409 when departure uses a stale trip version', async () => {
    const trip = await insertTrip({
      tripStatus: 'ready',
      orderStatus: 'loading',
      loading: 'ready',
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/depart`,
      headers: { cookie: dispatcher.cookie, 'if-match': '4' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'VERSION_CONFLICT' } });
    const row = await database.db.select().from(trips).where(eq(trips.id, trip.tripId));
    expect(row[0]?.status).toBe('ready');
    expect(row[0]?.version).toBe(0);
    const hidden = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/depart`,
      headers: { cookie: driver.cookie, 'if-match': '0' },
    });
    expect(hidden.statusCode).toBe(200);
  });

  it('rolls departure back when the run is unpublished or an order is not loading', async () => {
    const unpublished = await insertTrip({
      tripStatus: 'ready',
      orderStatus: 'loading',
      loading: 'ready',
      runStatus: 'open',
    });
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${unpublished.tripId}/depart`,
      headers: { cookie: dispatcher.cookie, 'if-match': '0' },
    });
    expect(blocked.statusCode).toBe(422);
    const run = await database.db.select().from(planningRuns);
    expect(run[0]?.status).toBe('open');
    const trip = await database.db.select().from(trips).where(eq(trips.id, unpublished.tripId));
    expect(trip[0]?.status).toBe('ready');
    const loading = await database.db.select().from(loadingRecords);
    expect(loading[0]?.status).toBe('ready');

    await database.db.delete(loadingRecords);
    await database.db.delete(tripStops);
    await database.db.delete(trips);
    await database.db.delete(orders);
    await database.db.delete(planningRuns);
    const waiting = await insertTrip({ tripStatus: 'ready', loading: 'ready' });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${waiting.tripId}/depart`,
      headers: { cookie: dispatcher.cookie, 'if-match': '0' },
    });
    expect(response.statusCode).toBe(422);
    const unchanged = await database.db.select().from(trips).where(eq(trips.id, waiting.tripId));
    expect(unchanged[0]?.status).toBe('ready');
    const order = await database.db.select().from(orders);
    expect(order[0]?.status).toBe('allocated');
    const store = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${waiting.tripId}/depart`,
      headers: { cookie: storeCookie, 'if-match': '0' },
    });
    expect(store.statusCode).toBe(403);
  });

  it('rejects departure when the vehicle is in the workshop', async () => {
    const trip = await insertTrip({
      tripStatus: 'ready',
      orderStatus: 'loading',
      loading: 'ready',
    });
    await database.db.insert(vehicleAvailability).values({
      vehicleId: 'VEH301',
      date: SERVICE_DATE,
      status: 'in_workshop',
    });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${trip.tripId}/depart`,
      headers: { cookie: dispatcher.cookie, 'if-match': '0' },
    });
    expectViolation(response, 'VEHICLE_UNAVAILABLE');
    const row = await database.db.select().from(trips).where(eq(trips.id, trip.tripId));
    expect(row[0]?.status).toBe('ready');
    const order = await database.db.select().from(orders);
    expect(order[0]?.status).toBe('loading');
  });

  it('writes audit events for resequence and departure', async () => {
    const existing = await database.db.select({ id: auditLog.id }).from(auditLog);
    const seen = new Set(existing.map((row) => row.id));
    const sequenced = await insertTrip({
      outlets: [
        { outletId: 'OUT301', seq: 1 },
        { outletId: 'OUT302', seq: 2 },
      ],
    });
    const tight = sequenced.stopIds[1];
    const wide = sequenced.stopIds[0];
    if (tight === undefined || wide === undefined) throw new Error('Expected two stops');
    const resequenced = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${sequenced.tripId}/resequence`,
      headers: { cookie: dispatcher.cookie, 'if-match': '0' },
      payload: { stopIds: [tight, wide] },
    });
    expect(resequenced.statusCode).toBe(200);
    const departing = await insertTrip({
      tripNo: 2,
      tripStatus: 'ready',
      orderStatus: 'loading',
      loading: 'ready',
    });
    const departed = await app.inject({
      method: 'POST',
      url: `/api/v1/trips/${departing.tripId}/depart`,
      headers: { cookie: dispatcher.cookie, 'if-match': '0' },
    });
    expect(departed.statusCode).toBe(200);
    const rows = (await database.db.select().from(auditLog)).filter((row) => !seen.has(row.id));
    const actions = rows.map((row) => row.action);
    expect(actions).toContain('trip.resequenced');
    expect(actions).toContain('trip.departed');
    for (const row of rows) {
      expect(row.actorId).toBe(dispatcher.user.id);
      expect(row.role).toBe('dispatcher');
      expect(row.entityType).toBe('trip');
      expect(row.createdAt?.getTime()).toBe(new Date(PINNED).getTime());
    }
    const departure = rows.find((row) => row.action === 'trip.departed');
    expect(departure?.entityId).toBe(departing.tripId);
    expect(departure?.before).toMatchObject({ status: 'ready', version: 0 });
    expect(departure?.after).toMatchObject({
      status: 'departed',
      version: 1,
      departedAt: PINNED,
    });
  });

  async function insertTrip(
    options: {
      vehicleId?: string;
      outletId?: string;
      district?: string;
      tripNo?: 1 | 2;
      tripStatus?: 'planned' | 'published' | 'ready';
      orderStatus?: 'allocated' | 'loading';
      runStatus?: 'open' | 'published';
      loading?: 'ready';
      outlets?: { outletId: string; seq: number }[];
    } = {},
  ): Promise<{ tripId: string; stopIds: string[]; orderIds: string[] }> {
    const vehicleId = options.vehicleId ?? 'VEH301';
    const district = options.district ?? 'Colombo';
    const depotId = vehicleId === 'VEH311' ? 'Kandy' : 'Peliyagoda';
    const runId = await ensureRun(depotId, options.runStatus ?? 'published');
    const created = await database.db
      .insert(trips)
      .values({
        runId,
        vehicleId,
        tripNo: options.tripNo ?? 1,
        brand: 'Fresh',
        district,
        status: options.tripStatus ?? 'published',
        version: 0,
        plannedMinutes: 60,
        plannedKm: 20,
      })
      .returning({ id: trips.id });
    const tripId = created[0]?.id;
    if (tripId === undefined) throw new Error('Expected a trip id');
    const plan = options.outlets ?? [{ outletId: options.outletId ?? 'OUT301', seq: 1 }];
    const stopIds: string[] = [];
    const orderIds: string[] = [];
    for (const stop of plan) {
      const order = await database.db
        .insert(orders)
        .values({
          outletId: stop.outletId,
          brand: 'Fresh',
          temp: 'ambient',
          requestedDate: SERVICE_DATE,
          units: 4,
          weightKg: 100,
          volumeM3: 1,
          status: options.orderStatus ?? 'allocated',
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
          plannedArrival: new Date(`${SERVICE_DATE}T05:00:00.000+05:30`),
          status: 'pending',
        })
        .returning({ id: tripStops.id });
      const stopId = inserted[0]?.id;
      if (stopId === undefined) throw new Error('Expected a stop id');
      orderIds.push(orderId);
      stopIds.push(stopId);
    }
    if (options.loading !== undefined) {
      await database.db.insert(loadingRecords).values({
        tripId,
        status: options.loading,
        loaderId: loader.user.id,
      });
    }
    return { tripId, stopIds, orderIds };
  }

  async function ensureRun(depotId: string, status: 'open' | 'published'): Promise<string> {
    const existing = await database.db
      .select({ id: planningRuns.id })
      .from(planningRuns)
      .where(eq(planningRuns.depotId, depotId));
    const found = existing[0]?.id;
    if (found !== undefined) return found;
    const inserted = await database.db
      .insert(planningRuns)
      .values({
        depotId,
        serviceDate: SERVICE_DATE,
        status,
        ...(status === 'published'
          ? { publishedAt: new Date(PINNED), publishedBy: dispatcher.user.id, planVersion: 1 }
          : {}),
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
    await database.db.insert(districtTravel).values([
      {
        district: 'Colombo',
        depotId: 'Peliyagoda',
        roadClass: 'urban',
        depotToDistrictKm: 12,
        depotToDistrictMin: 24,
        interStopKm: 4,
        interStopMin: 8,
      },
      {
        district: 'Kandy',
        depotId: 'Kandy',
        roadClass: 'hill',
        depotToDistrictKm: 6,
        depotToDistrictMin: 15,
        interStopKm: 2,
        interStopMin: 6,
      },
    ]);
    await database.db
      .insert(outlets)
      .values([
        outlet('OUT301', 'Colombo', 'Peliyagoda', '05:00:00', '18:00:00'),
        outlet('OUT302', 'Colombo', 'Peliyagoda', '03:00:00', '04:00:00'),
        outlet('OUT311', 'Kandy', 'Kandy', '05:00:00', '18:00:00'),
      ]);
    await database.db
      .insert(vehicles)
      .values([vehicle('VEH301', 'Peliyagoda'), vehicle('VEH311', 'Kandy')]);
    const brands = ['Fresh', 'Style', 'Tech'] as const;
    const docks = ['street', 'rear_dock', 'mall_bay'] as const;
    await database.db
      .insert(serviceAllowances)
      .values(
        brands.flatMap((brand) => docks.map((dockType) => ({ brand, dockType, minutes: 15 }))),
      );
    const days = [];
    let cursor = '2026-09-28';
    while (cursor <= '2026-10-12') {
      days.push(calendarRow(cursor));
      cursor = addIsoDays(cursor, 1);
    }
    await database.db.insert(calendarDays).values(days);
    await database.db.insert(users).values([
      {
        name: 'Peliyagoda Dispatcher',
        email: 'trips.dispatcher@waypoint.test',
        passwordHash,
        role: 'dispatcher' as const,
        depotId: 'Peliyagoda',
      },
      {
        name: 'Peliyagoda Loader',
        email: 'trips.loader@waypoint.test',
        passwordHash,
        role: 'loader' as const,
        depotId: 'Peliyagoda',
      },
      {
        name: 'Peliyagoda Driver',
        email: 'trips.driver@waypoint.test',
        passwordHash,
        role: 'driver' as const,
        vehicleId: 'VEH301',
      },
      {
        name: 'Kandy Driver',
        email: 'trips.other-driver@waypoint.test',
        passwordHash,
        role: 'driver' as const,
        vehicleId: 'VEH311',
      },
      {
        name: 'Store Manager',
        email: 'trips.store@waypoint.test',
        passwordHash,
        role: 'store_manager' as const,
        outletId: 'OUT301',
      },
    ]);
  }
});

function json(response: { statusCode: number; json: () => unknown }, status: number): unknown {
  expect(response.statusCode).toBe(status);
  return response.json();
}

function expectViolation(
  response: { statusCode: number; json: () => unknown },
  rule: string,
): void {
  expect(response.statusCode).toBe(422);
  const body = response.json() as { error: { code: string; violations?: { rule: string }[] } };
  expect(body.error.code).toBe('CONSTRAINT_VIOLATION');
  expect(body.error.violations?.some((item) => item.rule === rule)).toBe(true);
}

function missing(label: string): never {
  throw new Error(`Expected a ${label}`);
}

function outlet(
  id: string,
  district: string,
  depotId: string,
  windowOpen: string,
  windowClose: string,
) {
  return {
    id,
    brand: 'Fresh' as const,
    district,
    depotId,
    dockType: 'street' as const,
    parkingConstraint: 'normal' as const,
    windowOpen,
    windowClose,
    mallWindowOpen: null,
    mallWindowClose: null,
  };
}

function vehicle(id: string, depotId: string) {
  return {
    id,
    type: 'truck' as const,
    temp: 'ambient' as const,
    weightCapKg: 2_000,
    volumeCapM3: 10,
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

function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Expected an ISO date, received ${iso}`);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function calendarRow(iso: string) {
  const [year, month, day] = iso.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Expected an ISO date, received ${iso}`);
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  const jsDay = utc.getUTCDay();
  const dow = jsDay === 0 ? 6 : jsDay - 1;
  const isoWeekday = jsDay === 0 ? 7 : jsDay;
  const thursday = new Date(utc);
  thursday.setUTCDate(utc.getUTCDate() + 4 - isoWeekday);
  const isoYear = thursday.getUTCFullYear();
  const weekOne = new Date(Date.UTC(isoYear, 0, 4));
  const weekOneDow = weekOne.getUTCDay() || 7;
  weekOne.setUTCDate(weekOne.getUTCDate() - (weekOneDow - 1));
  const isoWeek = Math.round((thursday.getTime() - weekOne.getTime()) / 86_400_000 / 7) + 1;
  return {
    date: iso,
    dow,
    isoYear,
    isoWeek,
    isPayday: false,
    festival: null,
    festivalRamp: 0,
    isHoliday: false,
    monsoon: false,
    isOperating: dow <= 5,
  };
}
