import type { Database } from '@waypoint/database';
import {
  calendarDays,
  districtTravel,
  fuelLedger,
  loadingIssues,
  loadingRecords,
  notifications,
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
import type {
  Brand,
  DockType,
  EntityType,
  ListTripsQuery,
  LoadingIssueType,
  LoadingStatus,
  NotificationPriority,
  NotificationType,
  OrderStatus,
  ParkingConstraint,
  RoadClass,
  StopStatus,
  TemperatureRequirement,
  TripStatus,
  VehicleAvailabilityStatus,
  VehicleTemperature,
  VehicleType,
} from '@waypoint/shared';
import { and, asc, desc, eq, inArray, type SQL, sql, sum } from 'drizzle-orm';
import { ApiError } from '../../plugins/errors.ts';

export type TripDb = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface TripRow {
  id: string;
  runId: string;
  vehicleId: string;
  tripNo: number;
  brand: Brand;
  district: string;
  status: TripStatus;
  version: number;
  plannedMinutes: number;
  plannedKm: number;
}

interface RunRow {
  id: string;
  depotId: string;
  serviceDate: string;
  status: 'open' | 'published';
  planVersion: number;
}

interface VehicleRow {
  id: string;
  type: VehicleType;
  temp: VehicleTemperature;
  weightCapKg: number;
  volumeCapM3: number;
  kmPerL: number;
  weeklyFuelQuotaL: number;
  depotId: string;
  fuelType: string;
}

export interface StopRow {
  id: string;
  tripId: string;
  orderId: string;
  seq: number;
  plannedArrival: Date;
  status: StopStatus;
  outletId: string;
  brand: Brand;
  temp: TemperatureRequirement;
  requestedDate: string;
  units: number;
  weightKg: number;
  volumeM3: number;
  orderStatus: OrderStatus;
}

interface IssueRow {
  id: string;
  tripId: string;
  orderId: string;
  type: LoadingIssueType;
  qty: number;
  note: string | null;
  loaderId: string;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
}

interface LastEventRow {
  serverTime: Date;
  tripVersion: number;
}

export interface TripBundle {
  trip: TripRow;
  run: RunRow;
  vehicle: VehicleRow;
  stops: StopRow[];
  loadingStatus: LoadingStatus | null;
  exceptions: IssueRow[];
  lastEvent: LastEventRow | null;
}

export interface VehicleTripRow {
  id: string;
  tripNo: number;
  orderIds: string[];
}

export interface PlanningOrderRow {
  id: string;
  outletId: string;
  brand: Brand;
  temp: TemperatureRequirement;
  weightKg: number;
  volumeM3: number;
  outletBrand: Brand;
  dockType: DockType;
  parkingConstraint: ParkingConstraint;
  district: string;
  depotId: string;
  windowOpen: string;
  windowClose: string;
  mallWindowOpen: string | null;
  mallWindowClose: string | null;
}

interface AllowanceRow {
  brand: Brand;
  dockType: DockType;
  minutes: number;
}

interface TravelRow {
  district: string;
  depotId: string;
  roadClass: RoadClass;
  depotToDistrictKm: number;
  depotToDistrictMin: number;
  interStopKm: number;
  interStopMin: number;
}

export interface TripRepo {
  list(db: TripDb, userScope: SQL, query: ListTripsQuery): Promise<TripBundle[]>;
  findBundle(db: TripDb, userScope: SQL, id: string): Promise<TripBundle | null>;
  lock(db: TripDb, userScope: SQL, id: string): Promise<TripRow | null>;
  listVehicleTrips(db: TripDb, runId: string, vehicleId: string): Promise<VehicleTripRow[]>;
  listPlanningOrders(db: TripDb, orderIds: readonly string[]): Promise<PlanningOrderRow[]>;
  findVehicle(db: TripDb, id: string): Promise<VehicleRow | null>;
  findCalendar(
    db: TripDb,
    serviceDate: string,
  ): Promise<{ isoYear: number; isoWeek: number } | null>;
  listTravel(db: TripDb, districts: readonly string[]): Promise<TravelRow[]>;
  listAllowances(db: TripDb): Promise<AllowanceRow[]>;
  lockAvailability(
    db: TripDb,
    vehicleId: string,
    serviceDate: string,
  ): Promise<VehicleAvailabilityStatus | null>;
  fuelUsedLitres(db: TripDb, vehicleId: string, isoYear: number, isoWeek: number): Promise<number>;
  fuelForTrips(db: TripDb, tripIds: readonly string[]): Promise<number>;
  shiftStopSequences(db: TripDb, tripId: string): Promise<void>;
  updateStop(db: TripDb, stopId: string, seq: number, plannedArrival: Date): Promise<void>;
  saveResequence(
    db: TripDb,
    tripId: string,
    expectedVersion: number,
    plannedMinutes: number,
    plannedKm: number,
    litres: number,
  ): Promise<TripRow | null>;
  lockOrders(
    db: TripDb,
    orderIds: readonly string[],
  ): Promise<{ id: string; status: OrderStatus }[]>;
  dispatchOrder(db: TripDb, orderId: string): Promise<boolean>;
  lockLoading(db: TripDb, tripId: string): Promise<LoadingStatus | null>;
  markLoadingDeparted(db: TripDb, tripId: string): Promise<boolean>;
  markDeparted(db: TripDb, tripId: string, expectedVersion: number): Promise<TripRow | null>;
  listLoaders(db: TripDb, depotId: string): Promise<{ id: string }[]>;
  listDrivers(db: TripDb, vehicleId: string): Promise<{ id: string }[]>;
  insertNotifications(db: TripDb, rows: readonly TripNotificationDraft[]): Promise<void>;
}

interface TripNotificationDraft {
  recipientId: string;
  type: NotificationType;
  priority: NotificationPriority;
  entityType: EntityType;
  entityId: string;
  createdAt: Date;
}

export function createTripRepo(): TripRepo {
  return {
    async list(db, userScope, query) {
      const rows = await db
        .select(tripColumns)
        .from(trips)
        .innerJoin(planningRuns, eq(planningRuns.id, trips.runId))
        .where(tripFilter(userScope, query))
        .orderBy(
          asc(planningRuns.serviceDate),
          asc(trips.vehicleId),
          asc(trips.tripNo),
          asc(trips.id),
        );
      return assemble(db, rows);
    },

    async findBundle(db, userScope, id) {
      const trip = await findTrip(db, userScope, id, false);
      if (trip === null) return null;
      const bundles = await assemble(db, [trip]);
      return bundles[0] ?? null;
    },

    async lock(db, userScope, id) {
      return findTrip(db, userScope, id, true);
    },

    async listVehicleTrips(db, runId, vehicleId) {
      const tripRows = await db
        .select({ id: trips.id, tripNo: trips.tripNo })
        .from(trips)
        .where(and(eq(trips.runId, runId), eq(trips.vehicleId, vehicleId)))
        .orderBy(asc(trips.tripNo));
      if (tripRows.length === 0) return [];
      const stopRows = await db
        .select({ tripId: tripStops.tripId, orderId: tripStops.orderId, seq: tripStops.seq })
        .from(tripStops)
        .where(
          inArray(
            tripStops.tripId,
            tripRows.map((trip) => trip.id),
          ),
        )
        .orderBy(asc(tripStops.seq));
      const ordersByTrip = new Map<string, string[]>();
      for (const stop of stopRows) {
        const list = ordersByTrip.get(stop.tripId);
        if (list) list.push(stop.orderId);
        else ordersByTrip.set(stop.tripId, [stop.orderId]);
      }
      return tripRows.map((trip) => ({
        id: trip.id,
        tripNo: trip.tripNo,
        orderIds: ordersByTrip.get(trip.id) ?? [],
      }));
    },

    async listPlanningOrders(db, orderIds) {
      if (orderIds.length === 0) return [];
      return db
        .select({
          id: orders.id,
          outletId: orders.outletId,
          brand: orders.brand,
          temp: orders.temp,
          weightKg: orders.weightKg,
          volumeM3: orders.volumeM3,
          outletBrand: outlets.brand,
          dockType: outlets.dockType,
          parkingConstraint: outlets.parkingConstraint,
          district: outlets.district,
          depotId: outlets.depotId,
          windowOpen: outlets.windowOpen,
          windowClose: outlets.windowClose,
          mallWindowOpen: outlets.mallWindowOpen,
          mallWindowClose: outlets.mallWindowClose,
        })
        .from(orders)
        .innerJoin(outlets, eq(outlets.id, orders.outletId))
        .where(inArray(orders.id, [...orderIds]));
    },

    async findVehicle(db, id) {
      const rows = await db
        .select({
          id: vehicles.id,
          type: vehicles.type,
          temp: vehicles.temp,
          weightCapKg: vehicles.weightCapKg,
          volumeCapM3: vehicles.volumeCapM3,
          kmPerL: vehicles.kmPerL,
          weeklyFuelQuotaL: vehicles.weeklyFuelQuotaL,
          depotId: vehicles.depotId,
          fuelType: vehicles.fuelType,
        })
        .from(vehicles)
        .where(eq(vehicles.id, id))
        .limit(1);
      return rows[0] ?? null;
    },

    async findCalendar(db, serviceDate) {
      const rows = await db
        .select({ isoYear: calendarDays.isoYear, isoWeek: calendarDays.isoWeek })
        .from(calendarDays)
        .where(eq(calendarDays.date, serviceDate))
        .limit(1);
      return rows[0] ?? null;
    },

    async listTravel(db, districts) {
      if (districts.length === 0) return [];
      return db
        .select({
          district: districtTravel.district,
          depotId: districtTravel.depotId,
          roadClass: districtTravel.roadClass,
          depotToDistrictKm: districtTravel.depotToDistrictKm,
          depotToDistrictMin: districtTravel.depotToDistrictMin,
          interStopKm: districtTravel.interStopKm,
          interStopMin: districtTravel.interStopMin,
        })
        .from(districtTravel)
        .where(inArray(districtTravel.district, [...districts]));
    },

    async listAllowances(db) {
      return db
        .select({
          brand: serviceAllowances.brand,
          dockType: serviceAllowances.dockType,
          minutes: serviceAllowances.minutes,
        })
        .from(serviceAllowances);
    },

    async lockAvailability(db, vehicleId, serviceDate) {
      await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(eq(vehicles.id, vehicleId))
        .limit(1)
        .for('update');
      const rows = await db
        .select({ status: vehicleAvailability.status })
        .from(vehicleAvailability)
        .where(
          and(
            eq(vehicleAvailability.vehicleId, vehicleId),
            eq(vehicleAvailability.date, serviceDate),
          ),
        )
        .limit(1)
        .for('update');
      return rows[0]?.status ?? null;
    },

    async fuelUsedLitres(db, vehicleId, isoYear, isoWeek) {
      const rows = await db
        .select({ litres: sum(fuelLedger.litres) })
        .from(fuelLedger)
        .where(
          and(
            eq(fuelLedger.vehicleId, vehicleId),
            eq(fuelLedger.isoYear, isoYear),
            eq(fuelLedger.isoWeek, isoWeek),
          ),
        );
      return Number(rows[0]?.litres ?? 0);
    },

    async fuelForTrips(db, tripIds) {
      if (tripIds.length === 0) return 0;
      const rows = await db
        .select({ litres: sum(fuelLedger.litres) })
        .from(fuelLedger)
        .where(inArray(fuelLedger.tripId, [...tripIds]));
      return Number(rows[0]?.litres ?? 0);
    },

    async shiftStopSequences(db, tripId) {
      await db
        .update(tripStops)
        .set({ seq: sql`${tripStops.seq} + 1000` })
        .where(eq(tripStops.tripId, tripId));
    },

    async updateStop(db, stopId, seq, plannedArrival) {
      await db.update(tripStops).set({ seq, plannedArrival }).where(eq(tripStops.id, stopId));
    },

    async saveResequence(db, tripId, expectedVersion, plannedMinutes, plannedKm, litres) {
      const rows = await db
        .update(trips)
        .set({
          plannedMinutes,
          plannedKm,
          version: sql`${trips.version} + 1`,
        })
        .where(and(eq(trips.id, tripId), eq(trips.version, expectedVersion)))
        .returning(tripColumns);
      const saved = rows[0] ?? null;
      if (saved === null) return null;
      await db.update(fuelLedger).set({ litres }).where(eq(fuelLedger.tripId, tripId));
      return saved;
    },

    async lockOrders(db, orderIds) {
      if (orderIds.length === 0) return [];
      return db
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(inArray(orders.id, [...orderIds]))
        .for('update');
    },

    async dispatchOrder(db, orderId) {
      const rows = await db
        .update(orders)
        .set({ status: 'dispatched', version: sql`${orders.version} + 1` })
        .where(and(eq(orders.id, orderId), eq(orders.status, 'loading')))
        .returning({ id: orders.id });
      return rows.length === 1;
    },

    async lockLoading(db, tripId) {
      const rows = await db
        .select({ status: loadingRecords.status })
        .from(loadingRecords)
        .where(eq(loadingRecords.tripId, tripId))
        .limit(1)
        .for('update');
      return rows[0]?.status ?? null;
    },

    async markLoadingDeparted(db, tripId) {
      const rows = await db
        .update(loadingRecords)
        .set({ status: 'departed' })
        .where(and(eq(loadingRecords.tripId, tripId), eq(loadingRecords.status, 'ready')))
        .returning({ id: loadingRecords.id });
      return rows.length === 1;
    },

    async markDeparted(db, tripId, expectedVersion) {
      const rows = await db
        .update(trips)
        .set({ status: 'departed', version: sql`${trips.version} + 1` })
        .where(
          and(eq(trips.id, tripId), eq(trips.version, expectedVersion), eq(trips.status, 'ready')),
        )
        .returning(tripColumns);
      return rows[0] ?? null;
    },

    async listLoaders(db, depotId) {
      return db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'loader'), eq(users.depotId, depotId)));
    },

    async listDrivers(db, vehicleId) {
      return db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'driver'), eq(users.vehicleId, vehicleId)));
    },

    async insertNotifications(db, rows) {
      if (rows.length === 0) return;
      await db.insert(notifications).values([...rows]);
    },
  };
}

const tripColumns = {
  id: trips.id,
  runId: trips.runId,
  vehicleId: trips.vehicleId,
  tripNo: trips.tripNo,
  brand: trips.brand,
  district: trips.district,
  status: trips.status,
  version: trips.version,
  plannedMinutes: trips.plannedMinutes,
  plannedKm: trips.plannedKm,
};

function tripFilter(userScope: SQL, query: ListTripsQuery): SQL {
  const filters = [userScope];
  if (query.date !== undefined) filters.push(eq(planningRuns.serviceDate, query.date));
  if (query.vehicle !== undefined) filters.push(eq(trips.vehicleId, query.vehicle));
  const combined = and(...filters);
  if (combined === undefined) return userScope;
  return combined;
}

async function findTrip(
  db: TripDb,
  userScope: SQL,
  id: string,
  lock: boolean,
): Promise<TripRow | null> {
  const query = db
    .select(tripColumns)
    .from(trips)
    .where(and(eq(trips.id, id), userScope))
    .limit(1);
  const rows = await (lock ? query.for('update') : query);
  return rows[0] ?? null;
}

async function assemble(db: TripDb, tripRows: readonly TripRow[]): Promise<TripBundle[]> {
  if (tripRows.length === 0) return [];
  const tripIds = tripRows.map((trip) => trip.id);
  const runRows = await db
    .select({
      id: planningRuns.id,
      depotId: planningRuns.depotId,
      serviceDate: planningRuns.serviceDate,
      status: planningRuns.status,
      planVersion: planningRuns.planVersion,
    })
    .from(planningRuns)
    .where(
      inArray(
        planningRuns.id,
        tripRows.map((trip) => trip.runId),
      ),
    );
  const vehicleRows = await db
    .select({
      id: vehicles.id,
      type: vehicles.type,
      temp: vehicles.temp,
      weightCapKg: vehicles.weightCapKg,
      volumeCapM3: vehicles.volumeCapM3,
      kmPerL: vehicles.kmPerL,
      weeklyFuelQuotaL: vehicles.weeklyFuelQuotaL,
      depotId: vehicles.depotId,
      fuelType: vehicles.fuelType,
    })
    .from(vehicles)
    .where(
      inArray(
        vehicles.id,
        tripRows.map((trip) => trip.vehicleId),
      ),
    );
  const runs = new Map(runRows.map((run) => [run.id, run]));
  const fleet = new Map(vehicleRows.map((vehicle) => [vehicle.id, vehicle]));
  const stops = await db
    .select({
      id: tripStops.id,
      tripId: tripStops.tripId,
      orderId: tripStops.orderId,
      seq: tripStops.seq,
      plannedArrival: tripStops.plannedArrival,
      status: tripStops.status,
      outletId: orders.outletId,
      brand: orders.brand,
      temp: orders.temp,
      requestedDate: orders.requestedDate,
      units: orders.units,
      weightKg: orders.weightKg,
      volumeM3: orders.volumeM3,
      orderStatus: orders.status,
    })
    .from(tripStops)
    .innerJoin(orders, eq(orders.id, tripStops.orderId))
    .where(inArray(tripStops.tripId, tripIds))
    .orderBy(asc(tripStops.seq));
  const stopsByTrip = new Map<string, StopRow[]>();
  for (const stop of stops) {
    const list = stopsByTrip.get(stop.tripId);
    if (list) list.push(stop);
    else stopsByTrip.set(stop.tripId, [stop]);
  }
  const loadingRows = await db
    .select({ tripId: loadingRecords.tripId, status: loadingRecords.status })
    .from(loadingRecords)
    .where(inArray(loadingRecords.tripId, tripIds));
  const loadingByTrip = new Map(loadingRows.map((row) => [row.tripId, row.status]));
  const orderIds = stops.map((stop) => stop.orderId);
  const issueRows =
    orderIds.length === 0
      ? []
      : await db
          .select({
            id: loadingIssues.id,
            tripId: loadingIssues.tripId,
            orderId: loadingIssues.orderId,
            type: loadingIssues.type,
            qty: loadingIssues.qty,
            note: loadingIssues.note,
            loaderId: loadingIssues.loaderId,
            acknowledgedBy: loadingIssues.acknowledgedBy,
            acknowledgedAt: loadingIssues.acknowledgedAt,
            createdAt: loadingIssues.createdAt,
          })
          .from(loadingIssues)
          .where(inArray(loadingIssues.orderId, orderIds))
          .orderBy(asc(loadingIssues.createdAt), asc(loadingIssues.id));
  const issuesByOrder = new Map<string, IssueRow[]>();
  for (const issue of issueRows) {
    const list = issuesByOrder.get(issue.orderId);
    if (list) list.push(issue);
    else issuesByOrder.set(issue.orderId, [issue]);
  }
  const eventRows = await db
    .select({
      tripId: tripStops.tripId,
      serverTime: stopEvents.serverTime,
      tripVersion: stopEvents.tripVersion,
    })
    .from(stopEvents)
    .innerJoin(tripStops, eq(tripStops.id, stopEvents.stopId))
    .where(inArray(tripStops.tripId, tripIds))
    .orderBy(desc(stopEvents.serverTime), desc(stopEvents.id));
  const latestEvent = new Map<string, LastEventRow>();
  for (const event of eventRows) {
    if (!latestEvent.has(event.tripId)) {
      latestEvent.set(event.tripId, {
        serverTime: event.serverTime,
        tripVersion: event.tripVersion,
      });
    }
  }
  return tripRows.map((trip) => {
    const run = runs.get(trip.runId);
    const vehicle = fleet.get(trip.vehicleId);
    if (run === undefined || vehicle === undefined) {
      throw new ApiError('INTERNAL_ERROR', 'Trip reference data is incomplete');
    }
    const tripStopsForTrip = stopsByTrip.get(trip.id) ?? [];
    const exceptions: IssueRow[] = [];
    for (const stop of tripStopsForTrip) {
      const issues = issuesByOrder.get(stop.orderId);
      if (issues) exceptions.push(...issues.filter((issue) => issue.tripId === trip.id));
    }
    exceptions.sort((left, right) => {
      const time = left.createdAt.getTime() - right.createdAt.getTime();
      if (time !== 0) return time;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    });
    return {
      trip,
      run,
      vehicle,
      stops: tripStopsForTrip,
      loadingStatus: loadingByTrip.get(trip.id) ?? null,
      exceptions,
      lastEvent: latestEvent.get(trip.id) ?? null,
    };
  });
}
