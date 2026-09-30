import { describe, expect, it } from 'vitest';
import {
  defaultPriorityWeights,
  planInputSchema,
  planResultSchema,
  priorityWeightsSchema,
} from '../src/index.ts';
import { colomboTime, ids, outletRow, vehicleRow } from './fixtures.ts';

const planInput = {
  serviceDate: '2026-06-02',
  depotId: 'Peliyagoda',
  orders: [
    {
      id: ids.order,
      outletId: 'OUT001',
      brand: 'Fresh',
      temp: 'chilled',
      weightKg: 448.6,
      volumeM3: 2.445,
      deferredYesterday: false,
      daysSinceLastServed: 2,
    },
  ],
  vehicles: [
    {
      id: vehicleRow.id,
      type: vehicleRow.type,
      temp: vehicleRow.temp,
      weightCapKg: vehicleRow.weightCapKg,
      volumeCapM3: vehicleRow.volumeCapM3,
      kmPerL: vehicleRow.kmPerL,
      depotId: vehicleRow.depotId,
    },
  ],
  outlets: { OUT001: outletRow },
  districtTravel: {
    Colombo: {
      district: 'Colombo',
      depotId: 'Peliyagoda',
      roadClass: 'urban',
      depotToDistrictKm: 12,
      depotToDistrictMin: 24,
      interStopKm: 4,
      interStopMin: 8,
    },
  },
  serviceAllowance: { 'Fresh:street': 16, 'Fresh:rear_dock': 15 },
  fuelRemainingL: { VEH001: 340 },
  policy: defaultPriorityWeights,
};

describe('planning contract', () => {
  it('ships the SYSTEM_DESIGN §7.4 default weights', () => {
    expect(priorityWeightsSchema.parse(defaultPriorityWeights)).toEqual({
      deferredYesterday: 40,
      perDaySinceLastServed: 5,
      daysSinceLastServedMax: 30,
      chilled: 10,
      freshBefore8: 10,
      tightWindowMax: 10,
    });
  });

  it('parses a plan input', () => {
    expect(planInputSchema.parse(planInput)).toEqual(planInput);
  });

  it('keys service allowances by brand and dock type', () => {
    const bad = { ...planInput, serviceAllowance: { 'Fresh:loading_bay': 16 } };
    expect(planInputSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects negative policy weights', () => {
    const bad = { ...planInput, policy: { ...defaultPriorityWeights, chilled: -1 } };
    expect(planInputSchema.safeParse(bad).success).toBe(false);
  });

  const planResult = {
    trips: [
      {
        vehicleId: 'VEH001',
        tripNo: 1,
        brand: 'Fresh',
        district: 'Colombo',
        stops: [{ orderId: ids.order, seq: 1, plannedArrival: colomboTime }],
        minutes: 40,
        km: 24,
        litres: 5.1,
        utilization: { weight: 0.08, volume: 0.09 },
      },
    ],
    deferred: [
      {
        orderId: ids.other,
        reason: 'REEFER_REQUIRED',
        type: 'unavoidable',
        explain: 'No reefer at Peliyagoda has room for this chilled order.',
      },
    ],
    metrics: {
      servedOrders: 1,
      servedVolumeM3: 2.445,
      deferredOrders: 1,
      deferredVolumeM3: 1.2,
      repeatDeferrals: 0,
      avgWeightUtilization: 0.08,
      avgVolumeUtilization: 0.09,
      reeferUtilization: 0.09,
      vanUtilization: 0,
      fuelUsedL: 5.1,
      tightWindowStops: 0,
    },
  };

  it('parses a plan result', () => {
    expect(planResultSchema.parse(planResult)).toEqual(planResult);
  });

  it('rejects a trip plan with no stops', () => {
    const [trip] = planResult.trips;
    const bad = { ...planResult, trips: [{ ...trip, stops: [] }] };
    expect(planResultSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects a deferral without a recognised reason', () => {
    const [deferral] = planResult.deferred;
    const bad = { ...planResult, deferred: [{ ...deferral, reason: 'NO_ROOM' }] };
    expect(planResultSchema.safeParse(bad).success).toBe(false);
  });
});
