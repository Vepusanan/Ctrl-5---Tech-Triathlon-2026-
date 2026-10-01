import type { OrderLite, PlanMetrics, TripPlan, VehicleLite } from '@waypoint/shared';

/**
 * Plan scorecard (SYSTEM_DESIGN §7.6).
 * Averages are over trips that exist. Reefer and van figures are the share of that
 * scarce fleet, at this depot, which runs at least one trip. An empty fleet scores 0.
 */
export function buildPlanMetrics(args: {
  orders: readonly OrderLite[];
  servedOrderIds: ReadonlySet<string>;
  deferredOrderIds: readonly string[];
  trips: readonly TripPlan[];
  fleet: readonly VehicleLite[];
  tightWindowStops: number;
}): PlanMetrics {
  const orderById = new Map(args.orders.map((order) => [order.id, order]));
  let servedVolumeM3 = 0;
  for (const orderId of args.servedOrderIds) {
    servedVolumeM3 += orderById.get(orderId)?.volumeM3 ?? 0;
  }
  let deferredVolumeM3 = 0;
  let repeatDeferrals = 0;
  for (const orderId of args.deferredOrderIds) {
    const order = orderById.get(orderId);
    deferredVolumeM3 += order?.volumeM3 ?? 0;
    if (order?.deferredYesterday) repeatDeferrals += 1;
  }

  let weightSum = 0;
  let volumeSum = 0;
  let fuelUsedL = 0;
  const usedVehicleIds = new Set<string>();
  for (const trip of args.trips) {
    weightSum += trip.utilization.weight;
    volumeSum += trip.utilization.volume;
    fuelUsedL += trip.litres;
    usedVehicleIds.add(trip.vehicleId);
  }
  const tripCount = args.trips.length;

  return {
    servedOrders: args.servedOrderIds.size,
    servedVolumeM3,
    deferredOrders: args.deferredOrderIds.length,
    deferredVolumeM3,
    repeatDeferrals,
    avgWeightUtilization: tripCount === 0 ? 0 : weightSum / tripCount,
    avgVolumeUtilization: tripCount === 0 ? 0 : volumeSum / tripCount,
    reeferUtilization: fleetShare(
      args.fleet,
      usedVehicleIds,
      (vehicle) => vehicle.temp === 'reefer',
    ),
    vanUtilization: fleetShare(args.fleet, usedVehicleIds, (vehicle) => vehicle.type === 'van'),
    fuelUsedL,
    tightWindowStops: args.tightWindowStops,
  };
}

function fleetShare(
  fleet: readonly VehicleLite[],
  usedVehicleIds: ReadonlySet<string>,
  include: (vehicle: VehicleLite) => boolean,
): number {
  const pool = fleet.filter(include);
  if (pool.length === 0) return 0;
  let used = 0;
  for (const vehicle of pool) {
    if (usedVehicleIds.has(vehicle.id)) used += 1;
  }
  return used / pool.length;
}
