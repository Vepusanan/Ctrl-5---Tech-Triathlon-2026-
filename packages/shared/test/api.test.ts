import { describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  auditTimelineSchema,
  createOrderRequestSchema,
  dashboardExceptionSchema,
  dashboardStreamMessageSchema,
  dashboardSummarySchema,
  errorCodeSchema,
  httpStatusByErrorCode,
  ifMatchHeadersSchema,
  listResponseSchema,
  listVehiclesQuerySchema,
  moveAllocationRequestSchema,
  operatingClockSchema,
  orderSchema,
  resequenceTripRequestSchema,
  SYNC_BATCH_LIMIT,
  seedResetRequestSchema,
  seedResetResponseSchema,
  syncEventsRequestSchema,
  syncEventsResponseSchema,
  syncTripDeltaSchema,
  updateOrderRequestSchema,
  versionQuerySchema,
} from '../src/index.ts';
import { colomboTime, ids, orderRow } from './fixtures.ts';

describe('API error model', () => {
  it('parses the SYSTEM_DESIGN §6.3 constraint violation example', () => {
    const body = {
      error: {
        code: 'CONSTRAINT_VIOLATION',
        message: 'VEH031 cannot carry this load',
        violations: [
          {
            rule: 'REEFER_REQUIRED',
            orderId: ids.order,
            detail: 'Chilled order on ambient vehicle',
          },
          { rule: 'VOLUME_CAP', tripKey: 'VEH031-1', detail: '18.4 m3 > 16.0 m3' },
        ],
      },
    };
    expect(apiErrorSchema.parse(body)).toEqual(body);
  });

  it('allows errors without violations', () => {
    const body = { error: { code: 'NOT_FOUND', message: 'Order not found' } };
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
  });

  it.each([
    ['an unknown code', { code: 'TEAPOT', message: 'x' }],
    ['an empty message', { code: 'NOT_FOUND', message: '' }],
    [
      'a violation with an unknown rule',
      {
        code: 'CONSTRAINT_VIOLATION',
        message: 'x',
        violations: [{ rule: 'TOO_HEAVY', detail: 'x' }],
      },
    ],
    [
      'a malformed trip key',
      {
        code: 'CONSTRAINT_VIOLATION',
        message: 'x',
        violations: [{ rule: 'TRIP_LIMIT', tripKey: 'VEH031-3', detail: 'x' }],
      },
    ],
  ])('rejects %s', (_label, error) => {
    expect(apiErrorSchema.safeParse({ error }).success).toBe(false);
  });

  it('maps each error code to the HTTP status in the design', () => {
    expect(Object.keys(httpStatusByErrorCode).sort()).toEqual([...errorCodeSchema.options].sort());
    expect(httpStatusByErrorCode.VERSION_CONFLICT).toBe(409);
    expect(httpStatusByErrorCode.CONSTRAINT_VIOLATION).toBe(422);
    expect(httpStatusByErrorCode.CUTOFF_PASSED).toBe(422);
  });
});

describe('common DTOs', () => {
  it('wraps list responses as { items, total }', () => {
    const schema = listResponseSchema(orderSchema);
    expect(schema.parse({ items: [orderRow], total: 1 }).items).toHaveLength(1);
    expect(schema.safeParse({ items: [orderRow] }).success).toBe(false);
  });

  it('parses If-Match as a version number', () => {
    expect(ifMatchHeadersSchema.parse({ 'if-match': '3' })).toEqual({ 'if-match': 3 });
    expect(ifMatchHeadersSchema.safeParse({ 'if-match': '-1' }).success).toBe(false);
    expect(ifMatchHeadersSchema.safeParse({}).success).toBe(false);
  });

  it('parses the sync ?since= version', () => {
    expect(versionQuerySchema.parse({ since: '12' })).toEqual({ since: 12 });
    expect(versionQuerySchema.safeParse({ since: 'latest' }).success).toBe(false);
  });

  it('accepts vehicle reference filters and rejects an unknown status', () => {
    expect(
      listVehiclesQuerySchema.parse({ type: 'van', temp: 'reefer', date: '2026-10-07' }),
    ).toEqual({ type: 'van', temp: 'reefer', date: '2026-10-07' });
    expect(listVehiclesQuerySchema.safeParse({ status: 'offline' }).success).toBe(false);
    expect(listVehiclesQuerySchema.safeParse({ date: '07-10-2026' }).success).toBe(false);
  });
});

describe('order DTOs', () => {
  const body = {
    requestedDate: '2026-06-02',
    temp: 'ambient',
    units: 12,
    weightKg: 97.8,
    volumeM3: 0.5,
  };

  it('takes the outlet from the session, not the request body', () => {
    const parsed = createOrderRequestSchema.parse({ ...body, outletId: 'OUT099', brand: 'Tech' });
    expect(parsed).toEqual(body);
  });

  it('rejects an update that changes nothing', () => {
    expect(updateOrderRequestSchema.safeParse({}).success).toBe(false);
    expect(updateOrderRequestSchema.safeParse({ units: 14 }).success).toBe(true);
  });
});

describe('planning and trip DTOs', () => {
  it('allows moving an order back to the queue', () => {
    expect(
      moveAllocationRequestSchema.safeParse({ orderId: ids.order, target: null }).success,
    ).toBe(true);
    expect(
      moveAllocationRequestSchema.safeParse({
        orderId: ids.order,
        target: { vehicleId: 'VEH014', tripNo: 3 },
      }).success,
    ).toBe(false);
  });

  it('rejects a resequence that repeats a stop', () => {
    expect(resequenceTripRequestSchema.safeParse({ stopIds: [ids.stop, ids.other] }).success).toBe(
      true,
    );
    expect(resequenceTripRequestSchema.safeParse({ stopIds: [ids.stop, ids.stop] }).success).toBe(
      false,
    );
  });
});

describe('sync DTOs', () => {
  const event = (index: number) => ({
    clientEventId: `0192f5e8-7b3a-7c3e-9a1b-${index.toString(16).padStart(12, '0')}`,
    stopId: ids.stop,
    type: 'arrived',
    payload: {},
    clientTime: colomboTime,
    tripVersion: 1,
  });

  it(`accepts batches of 1 to ${SYNC_BATCH_LIMIT} events`, () => {
    expect(syncEventsRequestSchema.safeParse({ events: [event(1)] }).success).toBe(true);
    const full = Array.from({ length: SYNC_BATCH_LIMIT }, (_, index) => event(index));
    expect(syncEventsRequestSchema.safeParse({ events: full }).success).toBe(true);
  });

  it('rejects empty and oversized batches', () => {
    expect(syncEventsRequestSchema.safeParse({ events: [] }).success).toBe(false);
    const tooMany = Array.from({ length: SYNC_BATCH_LIMIT + 1 }, (_, index) => event(index));
    expect(syncEventsRequestSchema.safeParse({ events: tooMany }).success).toBe(false);
  });

  it('reports a status per event', () => {
    const response = {
      results: [
        { clientEventId: ids.event, status: 'duplicate' },
        { clientEventId: ids.other, status: 'conflict', detail: 'Stop was reassigned' },
      ],
    };
    expect(syncEventsResponseSchema.parse(response)).toEqual(response);
    expect(
      syncEventsResponseSchema.safeParse({ results: [{ clientEventId: ids.event, status: 'ok' }] })
        .success,
    ).toBe(false);
  });

  it('describes a trip delta, including an unchanged version', () => {
    const unchanged = { changed: false, tripId: ids.trip, version: 3 };
    expect(syncTripDeltaSchema.parse(unchanged)).toEqual(unchanged);
    const changed = {
      changed: true,
      tripId: ids.trip,
      since: 1,
      version: 2,
      added: [
        {
          id: ids.stop,
          orderId: ids.order,
          seq: 2,
          plannedArrival: colomboTime,
          status: 'pending',
        },
      ],
      removed: [{ id: ids.other }],
      reordered: [
        {
          id: ids.event,
          orderId: ids.order,
          seq: 1,
          plannedArrival: colomboTime,
          status: 'arrived',
        },
      ],
      acknowledgementRequired: true,
    };
    expect(syncTripDeltaSchema.parse(changed)).toEqual(changed);
    expect(syncTripDeltaSchema.safeParse({ ...unchanged, changed: true }).success).toBe(false);
  });
});

describe('dashboard DTOs', () => {
  const offline = {
    presence: 'offline' as const,
    tripId: ids.trip,
    vehicleId: 'VEH014',
    driverId: ids.user,
    driverName: 'Van Driver',
    lastSeenAt: '2026-10-08T09:12:00.000+05:30',
    pendingSyncCount: 1,
    label: 'Last seen 09:12 · may be offline',
  };

  it('keeps offline drivers free of live stop progress', () => {
    const summary = {
      date: '2026-10-08',
      orders: {
        confirmed: 2,
        allocated: 1,
        deferred: 1,
        loading: 0,
        dispatched: 1,
        delivered: 1,
        failed: 1,
        receiptConfirmed: 0,
      },
      repeatDeferrals: 1,
      loading: { notStarted: 1, inProgress: 1, exception: 0, ready: 0, departed: 1 },
      activeTrips: 3,
      stops: { pending: 1, arrived: 1, delivered: 1, failed: 1 },
      pendingLoadingIssues: 1,
      pendingSyncConflicts: 1,
      fleet: { available: 3, unavailable: 1 },
      utilization: { weight: 0.4, volume: 0.4, reefer: 0.5, van: 1 },
      fuelUsedL: 20,
      tightWindowStops: 1,
      drivers: [offline],
    };
    const parsed = dashboardSummarySchema.parse(summary);
    expect(parsed.drivers[0]).toEqual(offline);
    expect(parsed.drivers[0]).not.toHaveProperty('lastStopStatus');
  });

  it('describes an exception and a lightweight stream message', () => {
    const item = {
      severity: 'high',
      type: 'loading_shortfall',
      entityType: 'loading_issue',
      entityId: ids.order,
      title: 'Loading shortfall',
      reason: '2 cases short',
      occurredAt: colomboTime,
      action: { href: `/api/v1/trips/${ids.trip}/loading` },
    };
    expect(dashboardExceptionSchema.parse(item)).toEqual(item);
    const message = {
      type: 'trip.departed',
      occurredAt: colomboTime,
      entityType: 'trip',
      entityId: ids.trip,
    };
    expect(dashboardStreamMessageSchema.parse(message)).toEqual(message);
    expect(Object.keys(message)).toEqual(['type', 'occurredAt', 'entityType', 'entityId']);
    expect(
      auditTimelineSchema.parse({
        items: [
          {
            id: ids.event,
            actorId: ids.user,
            role: 'dispatcher',
            action: 'order.confirmed',
            entityType: 'order',
            entityId: ids.order,
            before: null,
            after: { status: 'confirmed' },
            createdAt: colomboTime,
          },
        ],
        total: 1,
      }).total,
    ).toBe(1);
  });
});

describe('admin demo contracts', () => {
  it('accepts an operating clock and an explicit seed reset', () => {
    expect(operatingClockSchema.parse({ now: colomboTime })).toEqual({ now: colomboTime });
    expect(operatingClockSchema.safeParse({ now: 'tomorrow' }).success).toBe(false);
    expect(seedResetRequestSchema.parse({ confirm: true })).toEqual({ confirm: true });
    expect(seedResetRequestSchema.safeParse({ confirm: false }).success).toBe(false);
    expect(seedResetRequestSchema.safeParse({}).success).toBe(false);
    expect(
      seedResetResponseSchema.parse({ serviceDate: '2026-06-26', source: 'synthetic' }),
    ).toEqual({ serviceDate: '2026-06-26', source: 'synthetic' });
  });
});
