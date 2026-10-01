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
  vehicles,
} from '@waypoint/database';
import type { TripStatus, User } from '@waypoint/shared';
import { type SQL, sql } from 'drizzle-orm';

const allow = sql`true`;
const deny = sql`false`;

// Planned trips are unpublished. Completed trips are history.
// Blocked stays visible so the assigned driver can still see that trip's outlets.
const ACTIVE_TRIP_STATUSES = [
  'published',
  'loading',
  'ready',
  'departed',
  'blocked',
] as const satisfies readonly TripStatus[];

function activeStatus(column: SQL): SQL {
  const list = sql.join(
    ACTIVE_TRIP_STATUSES.map((status) => sql`${status}::trip_status`),
    sql`, `,
  );
  return sql`${column} in (${list})`;
}

function activeOutletIds(vehicleId: string): SQL {
  return sql`(
    select ${orders.outletId}
    from ${tripStops}
    inner join ${trips} on ${trips.id} = ${tripStops.tripId}
    inner join ${orders} on ${orders.id} = ${tripStops.orderId}
    where ${trips.vehicleId} = ${vehicleId}
      and ${activeStatus(sql`${trips.status}`)}
  )`;
}

export function outletScope(user: User): SQL {
  switch (user.role) {
    case 'dispatcher':
      return user.depotId === null ? allow : sql`${outlets.depotId} = ${user.depotId}`;
    case 'loader':
      return sql`${outlets.depotId} = ${user.depotId}`;
    case 'store_manager':
      return sql`${outlets.id} = ${user.outletId}`;
    case 'driver':
      return sql`${outlets.id} in ${activeOutletIds(user.vehicleId)}`;
  }
}

export function vehicleScope(user: User): SQL {
  switch (user.role) {
    case 'dispatcher':
      return user.depotId === null ? allow : sql`${vehicles.depotId} = ${user.depotId}`;
    case 'loader':
      return sql`${vehicles.depotId} = ${user.depotId}`;
    case 'driver':
      return sql`${vehicles.id} = ${user.vehicleId}`;
    case 'store_manager':
      return deny;
  }
}

export function depotScope(user: User): SQL {
  switch (user.role) {
    case 'dispatcher':
      return user.depotId === null ? allow : sql`${depots.id} = ${user.depotId}`;
    case 'loader':
      return sql`${depots.id} = ${user.depotId}`;
    case 'driver':
      return sql`${depots.id} = (select ${vehicles.depotId} from ${vehicles} where ${vehicles.id} = ${user.vehicleId})`;
    case 'store_manager':
      return sql`${depots.id} = (select ${outlets.depotId} from ${outlets} where ${outlets.id} = ${user.outletId})`;
  }
}

export function calendarScope(user: User): SQL {
  switch (user.role) {
    case 'dispatcher':
    case 'loader':
    case 'store_manager':
      return allow;
    case 'driver':
      return sql`${calendarDays.date} in (
        select ${planningRuns.serviceDate}
        from ${trips}
        inner join ${planningRuns} on ${planningRuns.id} = ${trips.runId}
        where ${trips.vehicleId} = ${user.vehicleId}
          and ${activeStatus(sql`${trips.status}`)}
      )`;
  }
}

export function districtTravelScope(user: User): SQL {
  switch (user.role) {
    case 'dispatcher':
      return user.depotId === null ? allow : sql`${districtTravel.depotId} = ${user.depotId}`;
    case 'loader':
      return sql`${districtTravel.depotId} = ${user.depotId}`;
    case 'driver':
      return sql`${districtTravel.district} in (
        select ${outlets.district} from ${outlets} where ${outletScope(user)}
      )`;
    case 'store_manager':
      // Travel minutes are planning inputs. The outlet already names the district.
      return deny;
  }
}

export function serviceAllowanceScope(user: User): SQL {
  switch (user.role) {
    case 'dispatcher':
    case 'loader':
      return allow;
    case 'driver':
      return sql`(${serviceAllowances.brand}, ${serviceAllowances.dockType}) in (
        select ${outlets.brand}, ${outlets.dockType}
        from ${outlets}
        where ${outletScope(user)}
      )`;
    case 'store_manager':
      return deny;
  }
}
