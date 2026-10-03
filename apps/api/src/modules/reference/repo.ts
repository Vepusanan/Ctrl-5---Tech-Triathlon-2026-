import type { Database } from '@waypoint/database';
import {
  calendarDays,
  depots,
  districtTravel,
  outlets,
  serviceAllowances,
  vehicleAvailability,
  vehicles,
} from '@waypoint/database';
import type {
  Brand,
  DockType,
  VehicleAvailabilityStatus,
  VehicleTemperature,
  VehicleType,
} from '@waypoint/shared';
import { and, asc, eq, isNull, or, type SQL } from 'drizzle-orm';
import { ApiError } from '../../plugins/errors.ts';

type ReferenceDb = Database;

export interface OutletListFilter {
  depotId?: string;
  brand?: Brand;
  district?: string;
}

export interface VehicleListFilter {
  depotId?: string;
  type?: VehicleType;
  temp?: VehicleTemperature;
  date?: string;
  status?: VehicleAvailabilityStatus;
}

export interface CalendarListFilter {
  date?: string;
}

export interface DistrictTravelListFilter {
  depotId?: string;
  district?: string;
}

export interface ServiceAllowanceListFilter {
  brand?: Brand;
  dockType?: DockType;
}

export type OutletRow = typeof outlets.$inferSelect;
export type DepotRow = typeof depots.$inferSelect;
export type CalendarRow = typeof calendarDays.$inferSelect;
export type DistrictTravelRow = typeof districtTravel.$inferSelect;
export type ServiceAllowanceRow = typeof serviceAllowances.$inferSelect;

export interface VehicleRow {
  id: string;
  type: VehicleType;
  temp: VehicleTemperature;
  weightCapKg: number;
  volumeCapM3: number;
  fuelType: string;
  kmPerL: number;
  weeklyFuelQuotaL: number;
  depotId: string;
  availability: { date: string; status: VehicleAvailabilityStatus } | null;
}

export interface ReferenceRepo {
  listOutlets(db: ReferenceDb, userScope: SQL, filter: OutletListFilter): Promise<OutletRow[]>;
  findOutlet(db: ReferenceDb, userScope: SQL, id: string): Promise<OutletRow | null>;
  listVehicles(db: ReferenceDb, userScope: SQL, filter: VehicleListFilter): Promise<VehicleRow[]>;
  findVehicle(
    db: ReferenceDb,
    userScope: SQL,
    id: string,
    date: string | undefined,
  ): Promise<VehicleRow | null>;
  listDepots(db: ReferenceDb, userScope: SQL): Promise<DepotRow[]>;
  listCalendar(db: ReferenceDb, userScope: SQL, filter: CalendarListFilter): Promise<CalendarRow[]>;
  listDistrictTravel(
    db: ReferenceDb,
    userScope: SQL,
    filter: DistrictTravelListFilter,
  ): Promise<DistrictTravelRow[]>;
  listServiceAllowances(
    db: ReferenceDb,
    userScope: SQL,
    filter: ServiceAllowanceListFilter,
  ): Promise<ServiceAllowanceRow[]>;
}

export function createReferenceRepo(): ReferenceRepo {
  return {
    async listOutlets(db, userScope, filter) {
      return db
        .select()
        .from(outlets)
        .where(and(userScope, ...outletConditions(filter)))
        .orderBy(asc(outlets.id));
    },

    async findOutlet(db, userScope, id) {
      const rows = await db
        .select()
        .from(outlets)
        .where(and(userScope, eq(outlets.id, id)))
        .limit(1);
      return rows[0] ?? null;
    },

    async listVehicles(db, userScope, filter) {
      return selectVehicles(db, and(userScope, ...vehicleConditions(filter)), filter.date);
    },

    async findVehicle(db, userScope, id, date) {
      const rows = await selectVehicles(db, and(userScope, eq(vehicles.id, id)), date);
      return rows[0] ?? null;
    },

    async listDepots(db, userScope) {
      return db.select().from(depots).where(userScope).orderBy(asc(depots.id));
    },

    async listCalendar(db, userScope, filter) {
      const conditions: SQL[] = [userScope];
      if (filter.date !== undefined) conditions.push(eq(calendarDays.date, filter.date));
      return db
        .select()
        .from(calendarDays)
        .where(and(...conditions))
        .orderBy(asc(calendarDays.date));
    },

    async listDistrictTravel(db, userScope, filter) {
      const conditions: SQL[] = [userScope];
      if (filter.depotId !== undefined) {
        conditions.push(eq(districtTravel.depotId, filter.depotId));
      }
      if (filter.district !== undefined) {
        conditions.push(eq(districtTravel.district, filter.district));
      }
      return db
        .select()
        .from(districtTravel)
        .where(and(...conditions))
        .orderBy(asc(districtTravel.district));
    },

    async listServiceAllowances(db, userScope, filter) {
      const conditions: SQL[] = [userScope];
      if (filter.brand !== undefined) conditions.push(eq(serviceAllowances.brand, filter.brand));
      if (filter.dockType !== undefined) {
        conditions.push(eq(serviceAllowances.dockType, filter.dockType));
      }
      return db
        .select()
        .from(serviceAllowances)
        .where(and(...conditions))
        .orderBy(asc(serviceAllowances.brand), asc(serviceAllowances.dockType));
    },
  };
}

function outletConditions(filter: OutletListFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.depotId !== undefined) conditions.push(eq(outlets.depotId, filter.depotId));
  if (filter.brand !== undefined) conditions.push(eq(outlets.brand, filter.brand));
  if (filter.district !== undefined) conditions.push(eq(outlets.district, filter.district));
  return conditions;
}

function vehicleConditions(filter: VehicleListFilter): SQL[] {
  const conditions: SQL[] = [];
  if (filter.depotId !== undefined) conditions.push(eq(vehicles.depotId, filter.depotId));
  if (filter.type !== undefined) conditions.push(eq(vehicles.type, filter.type));
  if (filter.temp !== undefined) conditions.push(eq(vehicles.temp, filter.temp));
  if (filter.status !== undefined) {
    if (filter.date === undefined) {
      throw new ApiError('INTERNAL_ERROR', 'Vehicle status filter requires a date');
    }
    conditions.push(statusCondition(filter.status));
  }
  return conditions;
}

// A missing availability row means the vehicle is available, matching planning.
function statusCondition(status: VehicleAvailabilityStatus): SQL {
  if (status === 'available') {
    const open = or(
      isNull(vehicleAvailability.status),
      eq(vehicleAvailability.status, 'available'),
    );
    if (open === undefined) {
      throw new ApiError('INTERNAL_ERROR', 'Vehicle status filter is empty');
    }
    return open;
  }
  return eq(vehicleAvailability.status, status);
}

async function selectVehicles(
  db: ReferenceDb,
  where: SQL | undefined,
  date: string | undefined,
): Promise<VehicleRow[]> {
  if (date === undefined) {
    const rows = await db.select().from(vehicles).where(where).orderBy(asc(vehicles.id));
    return rows.map((row) => ({ ...row, availability: null }));
  }

  const rows = await db
    .select({ vehicle: vehicles, status: vehicleAvailability.status })
    .from(vehicles)
    .leftJoin(
      vehicleAvailability,
      and(eq(vehicleAvailability.vehicleId, vehicles.id), eq(vehicleAvailability.date, date)),
    )
    .where(where)
    .orderBy(asc(vehicles.id));

  return rows.map((row) => ({
    ...row.vehicle,
    availability: { date, status: row.status ?? 'available' },
  }));
}
