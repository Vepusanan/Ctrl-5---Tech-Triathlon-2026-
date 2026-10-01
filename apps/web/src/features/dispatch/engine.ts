import {
  PlanningInputError,
  scoreOrder,
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
  type VehicleAvailabilityStatus,
  type VehicleLite,
  type VehicleReference,
  type Violation,
} from '@waypoint/shared';

export type TripSlot = { vehicleId: string; tripNo: 1 | 2; orderIds: string[] };

export function orderLite(item: PlanningQueueItem): OrderLite {
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

export function recommendation(
  item: PlanningQueueItem,
  outlet: Outlet | undefined,
  slots: TripSlot[],
  validator: ValidatorInput,
) {
  if (!outlet) return null;
  const score = scoreOrder(orderLite(item), outlet, defaultPriorityWeights);
  const feasible = slots
    .map((slot) => {
      const next = placeOrder(slots, item.id, slot);
      const check = inspectDraft(validator, draftsOf(next));
      return { slot, check };
    })
    .filter((option) => option.check.inputError === null && option.check.violations.length === 0);
  const best = feasible[0];
  return { score, feasible: best ? best.slot : null, checked: feasible.length };
}

export function violationsFor(
  violations: Violation[],
  orderId: string,
  vehicleId?: string,
): Violation[] {
  return violations.filter(
    (item) =>
      item.orderId === orderId ||
      (vehicleId !== undefined && item.vehicleId === vehicleId) ||
      (item.orderId === undefined && item.vehicleId === undefined),
  );
}

export function panelItems(violations: Violation[]) {
  return violations.map((item, index) => ({
    id: `${item.rule}:${item.orderId ?? 'plan'}:${item.tripKey ?? ''}:${item.vehicleId ?? ''}:${index}`,
    title: item.rule.replaceAll('_', ' '),
    description: [
      item.detail,
      item.orderId ? `Order ${item.orderId}` : null,
      item.vehicleId ? `Vehicle ${item.vehicleId}` : null,
      item.tripKey ? `Trip ${item.tripKey}` : null,
      item.actual !== undefined && item.limit !== undefined
        ? `Actual ${item.actual} · limit ${item.limit}`
        : null,
    ]
      .filter((part) => part !== null)
      .join(' · '),
    severity: 'danger' as const,
  }));
}
