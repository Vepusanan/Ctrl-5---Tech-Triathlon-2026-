import {
  PlanningInputError,
  type TripDraft,
  type ValidatorInput,
  validatePlan,
} from '@waypoint/planning';
import {
  defaultPriorityWeights,
  type OrderLite,
  type Outlet,
  type PlanInput,
  type PlanningQueueItem,
  type ServiceAllowance,
  type TripDetail,
  type VehicleAvailabilityStatus,
  type VehicleLite,
  type VehicleReference,
} from '@waypoint/shared';

export type TripSlot = { vehicleId: string; tripNo: 1 | 2; orderIds: string[] };

function orderLite(item: PlanningQueueItem): OrderLite {
  return {
    id: item.id,
    outletId: item.outletId,
    brand: item.brand,
    temp: item.temp,
    weightKg: item.weightKg,
    volumeM3: item.volumeM3,
    deferredYesterday: item.deferredYesterday,
    daysSinceLastServed: item.daysSinceLastServed,
  };
}

export function planningInput(
  serviceDate: string,
  depotId: string,
  items: PlanningQueueItem[],
  vehicles: VehicleReference[],
  outlets: Outlet[],
  travel: PlanInput['districtTravel'][string][],
  allowances: ServiceAllowance[],
): { plan: PlanInput; validator: ValidatorInput } {
  const outletById: PlanInput['outlets'] = {};
  for (const outlet of outlets) outletById[outlet.id] = outlet;
  const districtTravel: PlanInput['districtTravel'] = {};
  for (const row of travel) {
    if (row.depotId === depotId) districtTravel[row.district] = row;
  }
  const serviceAllowance = {} as PlanInput['serviceAllowance'];
  for (const row of allowances) serviceAllowance[`${row.brand}:${row.dockType}`] = row.minutes;
  const availability: Record<string, VehicleAvailabilityStatus> = {};
  const fuelRemainingL: PlanInput['fuelRemainingL'] = {};
  const available: VehicleLite[] = [];
  for (const vehicle of vehicles) {
    const status = vehicle.availability?.status ?? 'available';
    availability[vehicle.id] = status;
    fuelRemainingL[vehicle.id] = vehicle.weeklyFuelQuotaL;
    if (status === 'available') {
      available.push({
        id: vehicle.id,
        type: vehicle.type,
        temp: vehicle.temp,
        weightCapKg: vehicle.weightCapKg,
        volumeCapM3: vehicle.volumeCapM3,
        kmPerL: vehicle.kmPerL,
        depotId: vehicle.depotId,
      });
    }
  }
  const plan: PlanInput = {
    serviceDate,
    depotId,
    orders: items.map(orderLite),
    vehicles: available,
    outlets: outletById,
    districtTravel,
    serviceAllowance,
    fuelRemainingL,
    policy: defaultPriorityWeights,
  };
  return {
    plan,
    validator: { ...plan, serviceAllowance, availability },
  };
}

export function draftsOf(slots: TripSlot[]): TripDraft[] {
  return slots
    .filter((slot) => slot.orderIds.length > 0)
    .map((slot) => ({ vehicleId: slot.vehicleId, tripNo: slot.tripNo, orderIds: slot.orderIds }));
}

export function placeOrder(
  slots: TripSlot[],
  orderId: string,
  target: { vehicleId: string; tripNo: 1 | 2 } | null,
): TripSlot[] {
  const cleared = slots.map((slot) => ({
    ...slot,
    orderIds: slot.orderIds.filter((id) => id !== orderId),
  }));
  if (!target) return cleared;
  return cleared.map((slot) =>
    slot.vehicleId === target.vehicleId && slot.tripNo === target.tripNo
      ? { ...slot, orderIds: [...slot.orderIds, orderId] }
      : slot,
  );
}

export function inspectDraft(input: ValidatorInput, drafts: TripDraft[]) {
  try {
    return { violations: validatePlan(input, drafts), inputError: null };
  } catch (error) {
    if (error instanceof PlanningInputError) return { violations: [], inputError: error.message };
    throw error;
  }
}

/** The saved plan as slots: two empty trips per available vehicle, filled from recorded trips. */
export function slotsFromTrips(
  trips: readonly TripDetail[],
  vehicles: readonly { id: string; availability: { status: string } | null }[],
): TripSlot[] {
  const slots = new Map<string, TripSlot>();
  for (const vehicle of vehicles) {
    if (vehicle.availability && vehicle.availability.status !== 'available') continue;
    slots.set(`${vehicle.id}:1`, { vehicleId: vehicle.id, tripNo: 1, orderIds: [] });
    slots.set(`${vehicle.id}:2`, { vehicleId: vehicle.id, tripNo: 2, orderIds: [] });
  }
  for (const trip of trips) {
    const key = `${trip.vehicleId}:${trip.tripNo}`;
    const orderIds = [...trip.stops]
      .sort((left, right) => left.seq - right.seq)
      .map((stop) => stop.orderId);
    slots.set(key, { vehicleId: trip.vehicleId, tripNo: trip.tripNo, orderIds });
  }
  return [...slots.values()];
}
