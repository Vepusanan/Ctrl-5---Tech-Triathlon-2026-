import type {
  CalendarDay,
  Depot,
  DistrictTravel,
  Outlet,
  ServiceAllowance,
  VehicleReference,
} from '@waypoint/shared';
import { ApiError } from '../../plugins/errors.ts';
import type {
  CalendarRow,
  DepotRow,
  DistrictTravelRow,
  OutletRow,
  ServiceAllowanceRow,
  VehicleRow,
} from './repo.ts';

export function toOutlet(row: OutletRow): Outlet {
  const mallOpen = row.mallWindowOpen;
  const mallClose = row.mallWindowClose;
  return {
    id: row.id,
    brand: row.brand,
    district: row.district,
    depotId: row.depotId,
    dockType: row.dockType,
    parkingConstraint: row.parkingConstraint,
    window: { open: timeOfDay(row.windowOpen), close: timeOfDay(row.windowClose) },
    mallWindow:
      mallOpen !== null && mallClose !== null
        ? { open: timeOfDay(mallOpen), close: timeOfDay(mallClose) }
        : null,
  };
}

export function toVehicle(row: VehicleRow): VehicleReference {
  return {
    id: row.id,
    type: row.type,
    temp: row.temp,
    weightCapKg: row.weightCapKg,
    volumeCapM3: row.volumeCapM3,
    fuelType: row.fuelType,
    kmPerL: row.kmPerL,
    weeklyFuelQuotaL: row.weeklyFuelQuotaL,
    depotId: row.depotId,
    availability: row.availability,
  };
}

export function toDepot(row: DepotRow): Depot {
  return { id: row.id, name: row.name };
}

export function toCalendarDay(row: CalendarRow): CalendarDay {
  return {
    date: row.date,
    dow: row.dow,
    isoYear: row.isoYear,
    isoWeek: row.isoWeek,
    isPayday: row.isPayday,
    festival: row.festival,
    festivalRamp: row.festivalRamp,
    isHoliday: row.isHoliday,
    monsoon: row.monsoon,
    isOperating: row.isOperating,
  };
}

export function toDistrictTravel(row: DistrictTravelRow): DistrictTravel {
  return {
    district: row.district,
    depotId: row.depotId,
    roadClass: row.roadClass,
    depotToDistrictKm: row.depotToDistrictKm,
    depotToDistrictMin: row.depotToDistrictMin,
    interStopKm: row.interStopKm,
    interStopMin: row.interStopMin,
  };
}

export function toServiceAllowance(row: ServiceAllowanceRow): ServiceAllowance {
  return { brand: row.brand, dockType: row.dockType, minutes: row.minutes };
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
