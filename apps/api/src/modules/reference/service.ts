import type { Database } from '@waypoint/database';
import type {
  CalendarListResponse,
  DepotListResponse,
  DistrictTravelListResponse,
  ListCalendarQuery,
  ListDistrictTravelQuery,
  ListOutletsQuery,
  ListServiceAllowancesQuery,
  ListVehiclesQuery,
  Outlet,
  OutletListResponse,
  ServiceAllowanceListResponse,
  User,
  VehicleDetailQuery,
  VehicleListResponse,
  VehicleReference,
} from '@waypoint/shared';
import type { OperatingClock } from '../../plugins/clock.ts';
import { ApiError } from '../../plugins/errors.ts';
import { colomboDate } from '../orders/cutoff.ts';
import {
  type CalendarListFilter,
  createReferenceRepo,
  type DistrictTravelListFilter,
  type OutletListFilter,
  type ReferenceRepo,
  type ServiceAllowanceListFilter,
  type VehicleListFilter,
} from './repo.ts';
import {
  calendarScope,
  depotScope,
  districtTravelScope,
  outletScope,
  serviceAllowanceScope,
  vehicleScope,
} from './scope.ts';
import {
  toCalendarDay,
  toDepot,
  toDistrictTravel,
  toOutlet,
  toServiceAllowance,
  toVehicle,
} from './serialize.ts';

const OUTLET_MISSING = 'Outlet not found';
const VEHICLE_MISSING = 'Vehicle not found';

export interface ReferenceService {
  listOutlets(user: User | null, query: ListOutletsQuery): Promise<OutletListResponse>;
  getOutlet(user: User | null, id: string): Promise<Outlet>;
  listVehicles(user: User | null, query: ListVehiclesQuery): Promise<VehicleListResponse>;
  getVehicle(user: User | null, id: string, query: VehicleDetailQuery): Promise<VehicleReference>;
  listDepots(user: User | null): Promise<DepotListResponse>;
  listCalendar(user: User | null, query: ListCalendarQuery): Promise<CalendarListResponse>;
  listDistrictTravel(
    user: User | null,
    query: ListDistrictTravelQuery,
  ): Promise<DistrictTravelListResponse>;
  listServiceAllowances(
    user: User | null,
    query: ListServiceAllowancesQuery,
  ): Promise<ServiceAllowanceListResponse>;
}

export function createReferenceService(
  db: Database,
  clock: OperatingClock,
  repo: ReferenceRepo = createReferenceRepo(),
): ReferenceService {
  return {
    async listOutlets(user, query) {
      const reader = assertUser(user);
      const rows = await repo.listOutlets(db, outletScope(reader), outletFilter(query));
      const items = rows.map(toOutlet);
      return { items, total: items.length };
    },

    async getOutlet(user, id) {
      const reader = assertUser(user);
      const row = await repo.findOutlet(db, outletScope(reader), id);
      if (row === null) throw new ApiError('NOT_FOUND', OUTLET_MISSING);
      return toOutlet(row);
    },

    async listVehicles(user, query) {
      const reader = assertUser(user);
      const rows = await repo.listVehicles(db, vehicleScope(reader), vehicleFilter(query, clock));
      const items = rows.map(toVehicle);
      return { items, total: items.length };
    },

    async getVehicle(user, id, query) {
      const reader = assertUser(user);
      const row = await repo.findVehicle(db, vehicleScope(reader), id, query.date);
      if (row === null) throw new ApiError('NOT_FOUND', VEHICLE_MISSING);
      return toVehicle(row);
    },

    async listDepots(user) {
      const reader = assertUser(user);
      const rows = await repo.listDepots(db, depotScope(reader));
      const items = rows.map(toDepot);
      return { items, total: items.length };
    },

    async listCalendar(user, query) {
      const reader = assertUser(user);
      const rows = await repo.listCalendar(db, calendarScope(reader), calendarFilter(query));
      const items = rows.map(toCalendarDay);
      return { items, total: items.length };
    },

    async listDistrictTravel(user, query) {
      const reader = assertUser(user);
      const rows = await repo.listDistrictTravel(
        db,
        districtTravelScope(reader),
        districtFilter(query),
      );
      const items = rows.map(toDistrictTravel);
      return { items, total: items.length };
    },

    async listServiceAllowances(user, query) {
      const reader = assertUser(user);
      const rows = await repo.listServiceAllowances(
        db,
        serviceAllowanceScope(reader),
        allowanceFilter(query),
      );
      const items = rows.map(toServiceAllowance);
      return { items, total: items.length };
    },
  };
}

function assertUser(user: User | null): User {
  if (user === null) throw new ApiError('UNAUTHENTICATED', 'Sign in required');
  return user;
}

function outletFilter(query: ListOutletsQuery): OutletListFilter {
  const filter: OutletListFilter = {};
  if (query.depot !== undefined) filter.depotId = query.depot;
  if (query.brand !== undefined) filter.brand = query.brand;
  if (query.district !== undefined) filter.district = query.district;
  return filter;
}

function vehicleFilter(query: ListVehiclesQuery, clock: OperatingClock): VehicleListFilter {
  const filter: VehicleListFilter = {};
  if (query.depot !== undefined) filter.depotId = query.depot;
  if (query.type !== undefined) filter.type = query.type;
  if (query.temp !== undefined) filter.temp = query.temp;
  if (query.date !== undefined) filter.date = query.date;
  if (query.status !== undefined) {
    filter.status = query.status;
    if (filter.date === undefined) filter.date = colomboDate(clock.now());
  }
  return filter;
}

function calendarFilter(query: ListCalendarQuery): CalendarListFilter {
  const filter: CalendarListFilter = {};
  if (query.date !== undefined) filter.date = query.date;
  return filter;
}

function districtFilter(query: ListDistrictTravelQuery): DistrictTravelListFilter {
  const filter: DistrictTravelListFilter = {};
  if (query.depot !== undefined) filter.depotId = query.depot;
  if (query.district !== undefined) filter.district = query.district;
  return filter;
}

function allowanceFilter(query: ListServiceAllowancesQuery): ServiceAllowanceListFilter {
  const filter: ServiceAllowanceListFilter = {};
  if (query.brand !== undefined) filter.brand = query.brand;
  if (query.dockType !== undefined) filter.dockType = query.dockType;
  return filter;
}
