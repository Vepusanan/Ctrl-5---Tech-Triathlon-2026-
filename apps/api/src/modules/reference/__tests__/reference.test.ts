import { randomBytes } from 'node:crypto';
import {
  calendarDays,
  depots,
  districtTravel,
  orders,
  outlets,
  planningRuns,
  serviceAllowances,
  tripStops,
  trips,
  users,
  vehicleAvailability,
  vehicles,
} from '@waypoint/database';
import {
  calendarListResponseSchema,
  depotListResponseSchema,
  districtTravelListResponseSchema,
  outletListResponseSchema,
  outletSchema,
  serviceAllowanceListResponseSchema,
  vehicleListResponseSchema,
  vehicleReferenceSchema,
} from '@waypoint/shared';
import { argon2id } from 'hash-wasm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, cookiePair, SESSION_SECRET } from '../../../../test/http.ts';
import { createMigratedDatabase } from '../../../../test/postgres.ts';
import { buildApp } from '../../../app.ts';

const BLOCKED_DATE = '2026-10-06';
const SERVICE_DATE = '2026-10-07';
const PLANNED_DATE = '2026-10-08';
const PINNED = '2026-10-07T10:00:00.000+05:30';
const PASSWORD = 'waypoint-demo';

const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Outlet not found' } };
const VEHICLE_NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Vehicle not found' } };
const ROUTE_NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Route not found' } };

describe('reference data', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let database: Awaited<ReturnType<typeof createMigratedDatabase>>;
  let dispatcher: string;
  let central: string;
  let loader: string;
  let driver: string;
  let store: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
    await seed(await hashPassword(PASSWORD));
    app = await buildApp({
      db: database.db,
      logger: false,
      sessionSecret: SESSION_SECRET,
      secureCookies: false,
    });
    app.clock.pin(new Date(PINNED));
    dispatcher = await login('reference.dispatcher@waypoint.test');
    central = await login('reference.central@waypoint.test');
    loader = await login('reference.loader@waypoint.test');
    driver = await login('reference.driver@waypoint.test');
    store = await login('reference.store@waypoint.test');
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  it('returns 401 without a session and 400 for a bad filter', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/api/v1/outlets' });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Sign in required' },
    });

    const badBrand = await app.inject({
      method: 'GET',
      url: '/api/v1/outlets?brand=fresh',
      headers: { cookie: dispatcher },
    });
    expect(badBrand.statusCode).toBe(400);
    expect(badBrand.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const badId = await app.inject({
      method: 'GET',
      url: '/api/v1/vehicles/VEH1',
      headers: { cookie: dispatcher },
    });
    expect(badId.statusCode).toBe(400);
  });

  it('scopes outlets to the caller and hides other records as not found', async () => {
    const depot = await outletsOf(dispatcher);
    expect(depot.total).toBe(4);
    expect(depot.items.map((item) => item.id)).toEqual(['OUT201', 'OUT202', 'OUT203', 'OUT204']);

    const network = await outletsOf(central);
    expect(network.items.map((item) => item.id)).toEqual([
      'OUT201',
      'OUT202',
      'OUT203',
      'OUT204',
      'OUT211',
    ]);

    const loading = await outletsOf(loader);
    expect(loading.items.map((item) => item.id)).toEqual(['OUT201', 'OUT202', 'OUT203', 'OUT204']);

    const trip = await outletsOf(driver);
    expect(trip.total).toBe(2);
    expect(trip.items.map((item) => item.id)).toEqual(['OUT202', 'OUT204']);
    const mall = trip.items.find((item) => item.id === 'OUT202');
    expect(mall).toMatchObject({
      brand: 'Style',
      district: 'Colombo',
      depotId: 'Peliyagoda',
      dockType: 'mall_bay',
      parkingConstraint: 'mall_dock',
      window: { open: '10:00', close: '18:00' },
      mallWindow: { open: '10:30', close: '12:30' },
    });

    const own = await outletsOf(store);
    expect(own).toEqual({
      items: [
        {
          id: 'OUT201',
          brand: 'Fresh',
          district: 'Colombo',
          depotId: 'Peliyagoda',
          dockType: 'street',
          parkingConstraint: 'normal',
          window: { open: '05:00', close: '08:00' },
          mallWindow: null,
        },
      ],
      total: 1,
    });

    const visible = await app.inject({
      method: 'GET',
      url: '/api/v1/outlets/OUT201',
      headers: { cookie: store },
    });
    expect(visible.statusCode).toBe(200);
    expect(outletSchema.parse(visible.json()).id).toBe('OUT201');

    const hidden = await app.inject({
      method: 'GET',
      url: '/api/v1/outlets/OUT202',
      headers: { cookie: store },
    });
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/outlets/OUT999',
      headers: { cookie: store },
    });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toEqual(NOT_FOUND);
    expect(missing.json()).toEqual(hidden.json());

    const otherDepot = await app.inject({
      method: 'GET',
      url: '/api/v1/outlets/OUT211',
      headers: { cookie: dispatcher },
    });
    expect(otherDepot.json()).toEqual(NOT_FOUND);

    const plannedStop = await app.inject({
      method: 'GET',
      url: '/api/v1/outlets/OUT201',
      headers: { cookie: driver },
    });
    const completedStop = await app.inject({
      method: 'GET',
      url: '/api/v1/outlets/OUT203',
      headers: { cookie: driver },
    });
    expect(plannedStop.json()).toEqual(NOT_FOUND);
    expect(completedStop.json()).toEqual(NOT_FOUND);
  });

  it('filters outlets by depot, brand and district inside the caller scope', async () => {
    const style = await outletsOf(dispatcher, 'brand=Style');
    expect(style.items.map((item) => item.id)).toEqual(['OUT202']);

    const gampaha = await outletsOf(dispatcher, 'district=Gampaha');
    expect(gampaha.items.map((item) => item.id)).toEqual(['OUT203', 'OUT204']);

    const kandy = await outletsOf(dispatcher, 'depot=Kandy');
    expect(kandy).toEqual({ items: [], total: 0 });

    const centralKandy = await outletsOf(central, 'depot=Kandy&brand=Fresh');
    expect(centralKandy.items.map((item) => item.id)).toEqual(['OUT211']);
  });

  it('scopes vehicles and applies type, temperature, depot, date and status filters', async () => {
    const depot = await vehiclesOf(dispatcher);
    expect(depot.items.map((item) => item.id)).toEqual(['VEH201', 'VEH202']);
    expect(depot.items.every((item) => item.availability === null)).toBe(true);

    const network = await vehiclesOf(central, 'depot=Kandy');
    expect(network.items.map((item) => item.id)).toEqual(['VEH211']);

    const loading = await vehiclesOf(loader, 'type=van&temp=reefer');
    expect(loading.items.map((item) => item.id)).toEqual(['VEH201']);
    expect(loading.items[0]).toMatchObject({
      type: 'van',
      temp: 'reefer',
      weightCapKg: 1500,
      volumeCapM3: 8,
      kmPerL: 10.5,
      depotId: 'Peliyagoda',
    });

    const dated = await vehiclesOf(dispatcher, `date=${SERVICE_DATE}`);
    expect(dated.items.map((item) => item.availability)).toEqual([
      { date: SERVICE_DATE, status: 'available' },
      { date: SERVICE_DATE, status: 'in_workshop' },
    ]);

    const workshop = await vehiclesOf(dispatcher, 'status=in_workshop');
    expect(workshop.items.map((item) => item.id)).toEqual(['VEH202']);
    expect(workshop.items[0]?.availability).toEqual({
      date: SERVICE_DATE,
      status: 'in_workshop',
    });

    const available = await vehiclesOf(central, `status=available&date=${SERVICE_DATE}`);
    expect(available.items.map((item) => item.id)).toEqual(['VEH201', 'VEH211']);

    const own = await vehiclesOf(driver);
    expect(own.items.map((item) => item.id)).toEqual(['VEH201']);
    const storeFleet = await vehiclesOf(store);
    expect(storeFleet).toEqual({ items: [], total: 0 });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/vehicles/VEH201?date=${SERVICE_DATE}`,
      headers: { cookie: driver },
    });
    expect(detail.statusCode).toBe(200);
    expect(vehicleReferenceSchema.parse(detail.json()).availability).toEqual({
      date: SERVICE_DATE,
      status: 'available',
    });

    const hidden = await app.inject({
      method: 'GET',
      url: '/api/v1/vehicles/VEH202',
      headers: { cookie: driver },
    });
    const missing = await app.inject({
      method: 'GET',
      url: '/api/v1/vehicles/VEH999',
      headers: { cookie: central },
    });
    expect(hidden.json()).toEqual(VEHICLE_NOT_FOUND);
    expect(missing.json()).toEqual(hidden.json());

    const storeVehicle = await app.inject({
      method: 'GET',
      url: '/api/v1/vehicles/VEH201',
      headers: { cookie: store },
    });
    expect(storeVehicle.json()).toEqual(VEHICLE_NOT_FOUND);
  });

  it('returns only the depots each role is allowed to see', async () => {
    expect(await depotIds(dispatcher)).toEqual(['Peliyagoda']);
    expect(await depotIds(loader)).toEqual(['Peliyagoda']);
    expect(await depotIds(driver)).toEqual(['Peliyagoda']);
    expect(await depotIds(store)).toEqual(['Peliyagoda']);
    expect(await depotIds(central)).toEqual(['Kandy', 'Peliyagoda']);
  });

  it('gives the operating calendar to planners and stores, and trip dates to the driver', async () => {
    const all = await calendarOf(dispatcher);
    expect(all.items.map((item) => item.date)).toEqual([BLOCKED_DATE, SERVICE_DATE, PLANNED_DATE]);
    expect(all.items.find((item) => item.date === PLANNED_DATE)).toMatchObject({
      dow: 3,
      isoYear: 2026,
      isoWeek: 41,
      festival: 'Vesak',
      festivalRamp: 0.5,
      isHoliday: true,
      isOperating: false,
    });
    expect(all.items.find((item) => item.date === SERVICE_DATE)).toMatchObject({
      isPayday: true,
      monsoon: true,
      festival: null,
      isOperating: true,
    });

    const one = await calendarOf(store, `date=${SERVICE_DATE}`);
    expect(one.items.map((item) => item.date)).toEqual([SERVICE_DATE]);

    const tripDays = await calendarOf(driver);
    expect(tripDays.items.map((item) => item.date)).toEqual([BLOCKED_DATE, SERVICE_DATE]);
    const planned = await calendarOf(driver, `date=${PLANNED_DATE}`);
    expect(planned).toEqual({ items: [], total: 0 });
  });

  it('scopes district travel and service allowances to what the role needs', async () => {
    const depotTravel = await travelOf(dispatcher);
    expect(depotTravel.items.map((item) => item.district)).toEqual(['Colombo', 'Gampaha']);
    expect(depotTravel.items[0]).toMatchObject({
      district: 'Colombo',
      depotId: 'Peliyagoda',
      roadClass: 'urban',
      depotToDistrictKm: 12,
      depotToDistrictMin: 24,
      interStopKm: 4,
      interStopMin: 8,
    });

    const filtered = await travelOf(loader, 'district=Gampaha');
    expect(filtered.items.map((item) => item.district)).toEqual(['Gampaha']);

    const outside = await travelOf(dispatcher, 'depot=Kandy');
    expect(outside).toEqual({ items: [], total: 0 });

    const network = await travelOf(central, 'depot=Kandy');
    expect(network.items.map((item) => item.district)).toEqual(['Kandy']);

    const tripTravel = await travelOf(driver);
    expect(tripTravel.items.map((item) => item.district)).toEqual(['Colombo', 'Gampaha']);
    expect(await travelOf(store)).toEqual({ items: [], total: 0 });

    const allowances = await allowancesOf(dispatcher);
    expect(allowances.total).toBe(4);
    const freshStreet = await allowancesOf(loader, 'brand=Fresh&dockType=street');
    expect(freshStreet.items).toEqual([{ brand: 'Fresh', dockType: 'street', minutes: 12 }]);

    const tripAllowances = await allowancesOf(driver);
    expect(tripAllowances.items).toEqual([
      { brand: 'Fresh', dockType: 'street', minutes: 12 },
      { brand: 'Style', dockType: 'mall_bay', minutes: 20 },
    ]);
    expect(await allowancesOf(store)).toEqual({ items: [], total: 0 });
  });

  it('rejects writes on every reference collection', async () => {
    const urls = [
      '/api/v1/outlets',
      '/api/v1/outlets/OUT201',
      '/api/v1/vehicles',
      '/api/v1/vehicles/VEH201',
      '/api/v1/depots',
      '/api/v1/calendar',
      '/api/v1/district-travel',
      '/api/v1/service-allowances',
    ];
    for (const url of urls) {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
        const response = await app.inject({
          method,
          url,
          headers: { cookie: central },
        });
        expect(response.statusCode, `${method} ${url}`).toBe(404);
        expect(response.json()).toEqual(ROUTE_NOT_FOUND);
      }
    }
  });

  async function outletsOf(cookie: string, query = '') {
    const response = await app.inject({
      method: 'GET',
      url: query.length === 0 ? '/api/v1/outlets' : `/api/v1/outlets?${query}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return outletListResponseSchema.parse(response.json());
  }

  async function vehiclesOf(cookie: string, query = '') {
    const response = await app.inject({
      method: 'GET',
      url: query.length === 0 ? '/api/v1/vehicles' : `/api/v1/vehicles?${query}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return vehicleListResponseSchema.parse(response.json());
  }

  async function depotIds(cookie: string): Promise<string[]> {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/depots',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return depotListResponseSchema.parse(response.json()).items.map((item) => item.id);
  }

  async function calendarOf(cookie: string, query = '') {
    const response = await app.inject({
      method: 'GET',
      url: query.length === 0 ? '/api/v1/calendar' : `/api/v1/calendar?${query}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return calendarListResponseSchema.parse(response.json());
  }

  async function travelOf(cookie: string, query = '') {
    const response = await app.inject({
      method: 'GET',
      url: query.length === 0 ? '/api/v1/district-travel' : `/api/v1/district-travel?${query}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return districtTravelListResponseSchema.parse(response.json());
  }

  async function allowancesOf(cookie: string, query = '') {
    const response = await app.inject({
      method: 'GET',
      url:
        query.length === 0 ? '/api/v1/service-allowances' : `/api/v1/service-allowances?${query}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    return serviceAllowanceListResponseSchema.parse(response.json());
  }

  async function login(email: string): Promise<string> {
    const response = await app.inject({
      ...client(),
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: PASSWORD },
    });
    expect(response.statusCode).toBe(200);
    return cookiePair(response);
  }

  async function seed(passwordHash: string) {
    await database.db.insert(depots).values([
      { id: 'Peliyagoda', name: 'Peliyagoda' },
      { id: 'Kandy', name: 'Kandy' },
    ]);
    await database.db
      .insert(districtTravel)
      .values([
        travel('Colombo', 'Peliyagoda', 'urban', 12, 24, 4, 8),
        travel('Gampaha', 'Peliyagoda', 'suburban', 28, 40, 6, 10),
        travel('Kandy', 'Kandy', 'hill', 6, 15, 2, 6),
      ]);
    await database.db.insert(outlets).values([
      outlet('OUT201', 'Fresh', 'Colombo', 'Peliyagoda', 'street', 'normal'),
      outlet('OUT202', 'Style', 'Colombo', 'Peliyagoda', 'mall_bay', 'mall_dock', {
        open: '10:30:00',
        close: '12:30:00',
      }),
      outlet('OUT203', 'Tech', 'Gampaha', 'Peliyagoda', 'rear_dock', 'normal'),
      outlet('OUT204', 'Fresh', 'Gampaha', 'Peliyagoda', 'street', 'normal'),
      outlet('OUT211', 'Fresh', 'Kandy', 'Kandy', 'street', 'normal'),
    ]);
    await database.db
      .insert(vehicles)
      .values([
        vehicle('VEH201', 'Peliyagoda', 'van', 'reefer', 1500, 8, 10.5, 200),
        vehicle('VEH202', 'Peliyagoda', 'truck', 'ambient', 2000, 12, 8, 180),
        vehicle('VEH211', 'Kandy', 'truck', 'reefer', 1800, 10, 9, 160),
      ]);
    await database.db
      .insert(calendarDays)
      .values([
        day(BLOCKED_DATE, 1, false),
        day(SERVICE_DATE, 2, true),
        day(PLANNED_DATE, 3, false, 'Vesak'),
      ]);
    await database.db.insert(serviceAllowances).values([
      { brand: 'Fresh', dockType: 'street', minutes: 12 },
      { brand: 'Fresh', dockType: 'rear_dock', minutes: 15 },
      { brand: 'Style', dockType: 'mall_bay', minutes: 20 },
      { brand: 'Tech', dockType: 'rear_dock', minutes: 18 },
    ]);
    await database.db.insert(vehicleAvailability).values({
      vehicleId: 'VEH202',
      date: SERVICE_DATE,
      status: 'in_workshop',
    });
    await database.db.insert(users).values([
      account('Peliyagoda Dispatcher', 'reference.dispatcher@waypoint.test', passwordHash, {
        role: 'dispatcher',
        depotId: 'Peliyagoda',
      }),
      account('Central Dispatcher', 'reference.central@waypoint.test', passwordHash, {
        role: 'dispatcher',
        depotId: null,
      }),
      account('Peliyagoda Loader', 'reference.loader@waypoint.test', passwordHash, {
        role: 'loader',
        depotId: 'Peliyagoda',
      }),
      account('Van Driver', 'reference.driver@waypoint.test', passwordHash, {
        role: 'driver',
        vehicleId: 'VEH201',
      }),
      account('Store Manager', 'reference.store@waypoint.test', passwordHash, {
        role: 'store_manager',
        outletId: 'OUT201',
      }),
    ]);

    const runs = await database.db
      .insert(planningRuns)
      .values([
        { depotId: 'Peliyagoda', serviceDate: BLOCKED_DATE },
        { depotId: 'Peliyagoda', serviceDate: SERVICE_DATE },
        { depotId: 'Peliyagoda', serviceDate: PLANNED_DATE },
      ])
      .returning({ id: planningRuns.id, serviceDate: planningRuns.serviceDate });
    const runId = (serviceDate: string) => {
      const run = runs.find((item) => item.serviceDate === serviceDate);
      if (run === undefined) throw new Error(`Expected a run for ${serviceDate}`);
      return run.id;
    };

    const placed = await database.db
      .insert(orders)
      .values([
        order('OUT201', 'Fresh'),
        order('OUT202', 'Style'),
        order('OUT203', 'Tech'),
        order('OUT204', 'Fresh'),
      ])
      .returning({ id: orders.id, outletId: orders.outletId });
    const orderId = (outletId: string) => {
      const row = placed.find((item) => item.outletId === outletId);
      if (row === undefined) throw new Error(`Expected an order for ${outletId}`);
      return row.id;
    };

    const placedTrips = await database.db
      .insert(trips)
      .values([
        trip(runId(BLOCKED_DATE), 1, 'Fresh', 'Gampaha', 'blocked'),
        trip(runId(SERVICE_DATE), 1, 'Style', 'Colombo', 'published'),
        trip(runId(SERVICE_DATE), 2, 'Tech', 'Gampaha', 'completed'),
        trip(runId(PLANNED_DATE), 1, 'Fresh', 'Colombo', 'planned'),
      ])
      .returning({ id: trips.id, status: trips.status });
    const tripId = (status: string) => {
      const row = placedTrips.find((item) => item.status === status);
      if (row === undefined) throw new Error(`Expected a ${status} trip`);
      return row.id;
    };

    await database.db
      .insert(tripStops)
      .values([
        stop(tripId('blocked'), orderId('OUT204')),
        stop(tripId('published'), orderId('OUT202')),
        stop(tripId('completed'), orderId('OUT203')),
        stop(tripId('planned'), orderId('OUT201')),
      ]);
  }
});

function outlet(
  id: string,
  brand: 'Fresh' | 'Style' | 'Tech',
  district: string,
  depotId: string,
  dockType: 'street' | 'mall_bay' | 'rear_dock',
  parkingConstraint: 'normal' | 'mall_dock',
  mall?: { open: string; close: string },
) {
  return {
    id,
    brand,
    district,
    depotId,
    dockType,
    parkingConstraint,
    windowOpen: mall === undefined ? '05:00:00' : '10:00:00',
    windowClose: mall === undefined ? '08:00:00' : '18:00:00',
    mallWindowOpen: mall?.open ?? null,
    mallWindowClose: mall?.close ?? null,
  };
}

function vehicle(
  id: string,
  depotId: string,
  type: 'van' | 'truck',
  temp: 'reefer' | 'ambient',
  weightCapKg: number,
  volumeCapM3: number,
  kmPerL: number,
  weeklyFuelQuotaL: number,
) {
  return {
    id,
    type,
    temp,
    weightCapKg,
    volumeCapM3,
    fuelType: 'diesel',
    kmPerL,
    weeklyFuelQuotaL,
    depotId,
  };
}

function travel(
  district: string,
  depotId: string,
  roadClass: 'urban' | 'suburban' | 'hill',
  depotToDistrictKm: number,
  depotToDistrictMin: number,
  interStopKm: number,
  interStopMin: number,
) {
  return {
    district,
    depotId,
    roadClass,
    depotToDistrictKm,
    depotToDistrictMin,
    interStopKm,
    interStopMin,
  };
}

function day(date: string, dow: number, operating: boolean, festival?: string) {
  return {
    date,
    dow,
    isoYear: 2026,
    isoWeek: 41,
    isPayday: operating,
    festival: festival ?? null,
    festivalRamp: festival === undefined ? 0 : 0.5,
    isHoliday: festival !== undefined,
    monsoon: operating,
    isOperating: operating,
  };
}

function account(
  name: string,
  email: string,
  passwordHash: string,
  scope:
    | { role: 'dispatcher'; depotId: string | null }
    | { role: 'loader'; depotId: string }
    | { role: 'driver'; vehicleId: string }
    | { role: 'store_manager'; outletId: string },
) {
  return { name, email, passwordHash, ...scope };
}

function order(outletId: string, brand: 'Fresh' | 'Style' | 'Tech') {
  return {
    outletId,
    brand,
    temp: 'ambient' as const,
    requestedDate: SERVICE_DATE,
    units: 4,
    weightKg: 12,
    volumeM3: 1,
    status: 'confirmed' as const,
  };
}

function trip(
  runId: string,
  tripNo: 1 | 2,
  brand: 'Fresh' | 'Style' | 'Tech',
  district: string,
  status: 'planned' | 'published' | 'completed' | 'blocked',
) {
  return {
    runId,
    vehicleId: 'VEH201',
    tripNo,
    brand,
    district,
    status,
    plannedMinutes: 40,
    plannedKm: 16,
  };
}

function stop(tripId: string, orderId: string) {
  return {
    tripId,
    orderId,
    seq: 1,
    plannedArrival: new Date(`${SERVICE_DATE}T03:30:00.000+05:30`),
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
