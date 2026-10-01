import type { DistrictTravel, OrderLite, Outlet, PlanInput, VehicleLite } from '@waypoint/shared';
import { defaultPriorityWeights, planResultSchema } from '@waypoint/shared';
import { describe, expect, it } from 'vitest';
import { repairAssignment } from '../src/allocator.ts';
import {
  allocate,
  describeAssignment,
  explain,
  InfeasiblePlanError,
  PlanningInputError,
  scoreOrder,
  validatePlan,
  WIDE_DELIVERY_WINDOW_MIN,
} from '../src/index.ts';
import { allServiceAllowances, assertAllocatorResult, toValidatorInput } from './helpers.ts';

const SERVICE_DATE = '2026-10-03';
const DEPOT = 'Peliyagoda';

const IDS = {
  a: '00000000-0000-4000-8000-000000000001',
  b: '00000000-0000-4000-8000-000000000002',
  c: '00000000-0000-4000-8000-000000000003',
  d: '00000000-0000-4000-8000-000000000004',
  e: '00000000-0000-4000-8000-000000000005',
} as const;

function order(overrides: Partial<OrderLite> & Pick<OrderLite, 'id' | 'outletId'>): OrderLite {
  return {
    brand: 'Fresh',
    temp: 'ambient',
    weightKg: 100,
    volumeM3: 1,
    deferredYesterday: false,
    daysSinceLastServed: 0,
    ...overrides,
  };
}

function outlet(overrides: Partial<Outlet> & Pick<Outlet, 'id'>): Outlet {
  return {
    brand: 'Fresh',
    district: 'Colombo',
    depotId: DEPOT,
    dockType: 'street',
    parkingConstraint: 'normal',
    window: { open: '05:00', close: '18:00' },
    mallWindow: null,
    ...overrides,
  };
}

function vehicle(overrides: Partial<VehicleLite> & Pick<VehicleLite, 'id'>): VehicleLite {
  return {
    type: 'truck',
    temp: 'ambient',
    weightCapKg: 5_000,
    volumeCapM3: 20,
    kmPerL: 10,
    depotId: DEPOT,
    ...overrides,
  };
}

function travel(district: string, depotToDistrictMin = 30, depotToDistrictKm = 10): DistrictTravel {
  return {
    district,
    depotId: DEPOT,
    roadClass: 'urban',
    depotToDistrictKm,
    depotToDistrictMin,
    interStopKm: 2,
    interStopMin: 5,
  };
}

function plan(args: {
  orders: OrderLite[];
  outlets: Outlet[];
  vehicles: VehicleLite[];
  travel?: DistrictTravel[];
  fuel?: number;
  policy?: PlanInput['policy'];
}): PlanInput {
  const fuelRemainingL: Record<string, number> = {};
  for (const item of args.vehicles) fuelRemainingL[item.id] = args.fuel ?? 100;
  return {
    serviceDate: SERVICE_DATE,
    depotId: DEPOT,
    orders: args.orders,
    vehicles: args.vehicles,
    outlets: Object.fromEntries(args.outlets.map((item) => [item.id, item])),
    districtTravel: Object.fromEntries(
      (args.travel ?? [travel('Colombo')]).map((item) => [item.district, item]),
    ),
    serviceAllowance: allServiceAllowances(),
    fuelRemainingL,
    policy: args.policy ?? defaultPriorityWeights,
  };
}

function run(input: PlanInput) {
  const result = allocate(input);
  assertAllocatorResult(input, result);
  return result;
}

describe('scoreOrder', () => {
  const freshOutlet = outlet({
    id: 'OUT001',
    window: { open: '05:00', close: '06:00' },
  });

  it('adds the §7.4 weights and caps days since last served', () => {
    const score = scoreOrder(
      order({
        id: IDS.a,
        outletId: 'OUT001',
        temp: 'chilled',
        deferredYesterday: true,
        daysSinceLastServed: 100,
      }),
      freshOutlet,
      defaultPriorityWeights,
    );
    const tight = (1 - 60 / WIDE_DELIVERY_WINDOW_MIN) * defaultPriorityWeights.tightWindowMax;
    expect(score.deferredYesterday).toBe(40);
    expect(score.daysSinceLastServed).toBe(150);
    expect(score.chilled).toBe(10);
    expect(score.freshBefore8).toBe(10);
    expect(score.tightWindow).toBeCloseTo(tight);
    expect(score.total).toBeCloseTo(40 + 150 + 10 + 10 + tight);
  });

  it('scores a wide Style window at zero and follows the supplied policy', () => {
    const style = outlet({
      id: 'OUT002',
      brand: 'Style',
      window: { open: '08:00', close: '11:00' },
    });
    const policy = { ...defaultPriorityWeights, chilled: 7, tightWindowMax: 0 };
    const score = scoreOrder(
      order({ id: IDS.b, outletId: 'OUT002', brand: 'Style', temp: 'ambient' }),
      style,
      policy,
    );
    expect(score.total).toBe(0);
    const chilled = scoreOrder(
      order({ id: IDS.c, outletId: 'OUT002', brand: 'Style', temp: 'chilled' }),
      style,
      policy,
    );
    expect(chilled.chilled).toBe(7);
    expect(chilled.freshBefore8).toBe(0);
    expect(chilled.tightWindow).toBe(0);
  });

  it('uses the mall overlap when that window is tighter', () => {
    const mallOutlet = outlet({
      id: 'OUT003',
      window: { open: '05:00', close: '11:00' },
      mallWindow: { open: '05:00', close: '06:00' },
    });
    const score = scoreOrder(order({ id: IDS.a, outletId: 'OUT003' }), mallOutlet, {
      ...defaultPriorityWeights,
      deferredYesterday: 0,
      perDaySinceLastServed: 0,
      chilled: 0,
      freshBefore8: 0,
    });
    expect(score.tightWindow).toBeCloseTo((1 - 60 / WIDE_DELIVERY_WINDOW_MIN) * 10);
  });
});

describe('explain', () => {
  it('matches the §7.5 deferral sentence', () => {
    expect(
      explain({
        kind: 'deferral',
        orderId: '00000000-0000-4000-8000-000000000047',
        outletId: 'OUT047',
        depotId: 'Peliyagoda',
        type: 'prioritized',
        reason: 'VOLUME_CAP',
        deferredYesterday: true,
        suitableVehicleCount: 5,
        resource: 'reefer',
        fullness: { kind: 'volume', ratio: 0.98 },
      }),
    ).toBe(
      "Deferred: all 5 available reefers at Peliyagoda are full (98% volume). Outlet OUT047 was also skipped yesterday; it is first in tomorrow's queue.",
    );
  });

  it('describes a placement', () => {
    expect(
      explain({
        kind: 'placement',
        orderId: IDS.a,
        outletId: 'OUT001',
        vehicleId: 'VEH001',
        tripNo: 1,
        score: 40,
        joinedExistingTrip: false,
      }),
    ).toBe('Placed on VEH001 trip 1, opening a new trip. Priority score 40.');
  });
});

describe('allocate', () => {
  it('returns an empty plan when the queue is empty', () => {
    const result = run(
      plan({
        orders: [],
        outlets: [],
        vehicles: [vehicle({ id: 'VEH001' })],
      }),
    );
    expect(result.trips).toEqual([]);
    expect(result.deferred).toEqual([]);
    expect(result.metrics).toEqual({
      servedOrders: 0,
      servedVolumeM3: 0,
      deferredOrders: 0,
      deferredVolumeM3: 0,
      repeatDeferrals: 0,
      avgWeightUtilization: 0,
      avgVolumeUtilization: 0,
      reeferUtilization: 0,
      vanUtilization: 0,
      fuelUsedL: 0,
      tightWindowStops: 0,
    });
  });

  it('rejects a duplicate order before planning', () => {
    const input = plan({
      orders: [order({ id: IDS.a, outletId: 'OUT001' }), order({ id: IDS.a, outletId: 'OUT001' })],
      outlets: [outlet({ id: 'OUT001' })],
      vehicles: [vehicle({ id: 'VEH001' })],
    });
    expect(() => allocate(input)).toThrow(PlanningInputError);
  });

  it('prefers an ambient truck over a reefer and a truck over a van', () => {
    const result = run(
      plan({
        orders: [order({ id: IDS.a, outletId: 'OUT001', volumeM3: 2 })],
        outlets: [outlet({ id: 'OUT001' })],
        vehicles: [
          vehicle({ id: 'VEH004', type: 'van', temp: 'reefer' }),
          vehicle({ id: 'VEH002', type: 'truck', temp: 'reefer' }),
          vehicle({ id: 'VEH003', type: 'van', temp: 'ambient' }),
          vehicle({ id: 'VEH001', type: 'truck', temp: 'ambient' }),
        ],
      }),
    );
    expect(result.trips.map((trip) => trip.vehicleId)).toEqual(['VEH001']);
    expect(result.deferred).toEqual([]);
  });

  it('opens the new trip on the tighter ambient truck', () => {
    const result = run(
      plan({
        orders: [order({ id: IDS.a, outletId: 'OUT001', volumeM3: 8, weightKg: 50 })],
        outlets: [outlet({ id: 'OUT001' })],
        vehicles: [
          vehicle({ id: 'VEH002', volumeCapM3: 100 }),
          vehicle({ id: 'VEH001', volumeCapM3: 10 }),
        ],
      }),
    );
    expect(result.trips.map((trip) => trip.vehicleId)).toEqual(['VEH001']);
    expect(result.trips[0]?.utilization.volume).toBeCloseTo(0.8);
  });

  it('joins an existing same-group trip before opening another vehicle', () => {
    const result = run(
      plan({
        orders: [
          order({
            id: IDS.a,
            outletId: 'OUT001',
            volumeM3: 8,
            weightKg: 50,
            daysSinceLastServed: 4,
          }),
          order({ id: IDS.b, outletId: 'OUT002', volumeM3: 2, weightKg: 50 }),
        ],
        outlets: [outlet({ id: 'OUT001' }), outlet({ id: 'OUT002' })],
        vehicles: [
          vehicle({ id: 'VEH001', volumeCapM3: 10 }),
          vehicle({ id: 'VEH002', volumeCapM3: 100 }),
        ],
      }),
    );
    expect(result.trips).toHaveLength(1);
    expect(result.trips[0]?.vehicleId).toBe('VEH001');
    expect(result.trips[0]?.stops.map((stop) => stop.orderId).sort()).toEqual(
      [IDS.a, IDS.b].sort(),
    );
    expect(result.deferred).toEqual([]);
  });

  it('keeps the reefer van for van-only chilled demand', () => {
    const result = run(
      plan({
        orders: [
          order({
            id: IDS.a,
            outletId: 'OUT001',
            temp: 'chilled',
            deferredYesterday: false,
            volumeM3: 2,
          }),
          order({
            id: IDS.b,
            outletId: 'OUT002',
            temp: 'ambient',
            deferredYesterday: true,
            volumeM3: 2,
          }),
        ],
        outlets: [
          outlet({ id: 'OUT001', parkingConstraint: 'van_only' }),
          outlet({ id: 'OUT002' }),
        ],
        vehicles: [
          vehicle({ id: 'VEH001', type: 'van', temp: 'reefer', volumeCapM3: 10 }),
          vehicle({ id: 'VEH002', type: 'truck', temp: 'ambient', volumeCapM3: 10 }),
        ],
      }),
    );
    const byOrder = new Map(
      result.trips.flatMap((trip) => trip.stops.map((stop) => [stop.orderId, trip.vehicleId])),
    );
    expect(byOrder.get(IDS.a)).toBe('VEH001');
    expect(byOrder.get(IDS.b)).toBe('VEH002');
  });

  it('serves scarce demand ahead of a higher-scored order that could use the same van', () => {
    const result = run(
      plan({
        orders: [
          order({ id: IDS.a, outletId: 'OUT001', temp: 'chilled', volumeM3: 2 }),
          order({
            id: IDS.b,
            outletId: 'OUT002',
            temp: 'ambient',
            deferredYesterday: true,
            volumeM3: 2,
          }),
        ],
        outlets: [
          outlet({ id: 'OUT001', parkingConstraint: 'van_only' }),
          outlet({ id: 'OUT002' }),
        ],
        vehicles: [vehicle({ id: 'VEH001', type: 'van', temp: 'reefer' })],
        fuel: 2,
      }),
    );
    expect(result.trips.flatMap((trip) => trip.stops.map((stop) => stop.orderId))).toEqual([IDS.a]);
    expect(result.deferred.map((item) => item.orderId)).toEqual([IDS.b]);
    expect(result.deferred[0]?.type).toBe('prioritized');
    expect(result.deferred[0]?.reason).toBe('FUEL_QUOTA');
  });

  it('labels an order that fits no empty vehicle as unavoidable', () => {
    const result = run(
      plan({
        orders: [
          order({
            id: IDS.a,
            outletId: 'OUT001',
            volumeM3: 50,
            weightKg: 10,
            deferredYesterday: true,
          }),
          order({ id: IDS.b, outletId: 'OUT001', volumeM3: 4, weightKg: 10 }),
        ],
        outlets: [outlet({ id: 'OUT001' })],
        vehicles: [vehicle({ id: 'VEH001', volumeCapM3: 10 })],
      }),
    );
    const huge = result.deferred.find((item) => item.orderId === IDS.a);
    expect(huge?.type).toBe('unavoidable');
    expect(huge?.reason).toBe('VOLUME_CAP');
    expect(huge?.explain).toBe(
      "Deferred: this order is larger than every suitable vehicle at Peliyagoda. Outlet OUT001 was also skipped yesterday; it is first in tomorrow's queue.",
    );
    expect(result.trips.flatMap((trip) => trip.stops.map((stop) => stop.orderId))).toEqual([IDS.b]);
  });

  it('says when the reefer fleet is full and a higher-scored order took the space', () => {
    const outlets = [outlet({ id: 'OUT001' })];
    const orders = [8, 6, 4, 2].map((days, index) =>
      order({
        id: [IDS.a, IDS.b, IDS.c, IDS.d][index] ?? IDS.e,
        outletId: 'OUT001',
        temp: 'chilled',
        volumeM3: 10,
        weightKg: 10,
        daysSinceLastServed: days,
      }),
    );
    const result = run(
      plan({
        orders,
        outlets,
        vehicles: [vehicle({ id: 'VEH001', type: 'truck', temp: 'reefer', volumeCapM3: 10 })],
      }),
    );
    expect(result.trips).toHaveLength(2);
    expect(new Set(result.trips.flatMap((trip) => trip.stops.map((stop) => stop.orderId)))).toEqual(
      new Set([IDS.a, IDS.b]),
    );
    expect(result.deferred.map((item) => item.type)).toEqual(['prioritized', 'prioritized']);
    expect(result.deferred[0]?.explain).toBe(
      'Deferred: the only available reefer at Peliyagoda is full (100% volume).',
    );
  });

  it('defers a window that is already closed when the vehicle would arrive', () => {
    const result = run(
      plan({
        orders: [order({ id: IDS.a, outletId: 'OUT001' })],
        outlets: [outlet({ id: 'OUT001', window: { open: '04:00', close: '05:00' } })],
        vehicles: [vehicle({ id: 'VEH001' })],
        travel: [travel('Colombo', 180, 10)],
      }),
    );
    expect(result.trips).toEqual([]);
    expect(result.deferred[0]?.type).toBe('unavoidable');
    expect(result.deferred[0]?.reason).toBe('WINDOW_MISSED');
  });

  it('defers chilled demand when the depot has no reefer and van-only demand when it has no van', () => {
    const chilled = run(
      plan({
        orders: [order({ id: IDS.a, outletId: 'OUT001', temp: 'chilled' })],
        outlets: [outlet({ id: 'OUT001' })],
        vehicles: [vehicle({ id: 'VEH001', temp: 'ambient' })],
      }),
    );
    expect(chilled.deferred[0]?.reason).toBe('REEFER_REQUIRED');
    expect(chilled.deferred[0]?.type).toBe('unavoidable');

    const vanOnly = run(
      plan({
        orders: [order({ id: IDS.a, outletId: 'OUT001' })],
        outlets: [outlet({ id: 'OUT001', parkingConstraint: 'van_only' })],
        vehicles: [vehicle({ id: 'VEH001', type: 'truck' })],
      }),
    );
    expect(vanOnly.deferred[0]?.reason).toBe('VAN_REQUIRED');
    expect(vanOnly.deferred[0]?.explain).toContain('no van at Peliyagoda');
  });

  it('chains trip 2 after trip 1 returns and counts a stop within 15 minutes of close', () => {
    const shared = {
      orders: [
        order({ id: IDS.a, outletId: 'OUT001', volumeM3: 5, weightKg: 200 }),
        order({ id: IDS.b, outletId: 'OUT002', volumeM3: 5, weightKg: 300 }),
      ],
      outlets: [
        outlet({ id: 'OUT001', window: { open: '05:00', close: '05:10' } }),
        outlet({ id: 'OUT002', window: { open: '05:00', close: '18:00' } }),
      ],
      vehicles: [vehicle({ id: 'VEH001', volumeCapM3: 5, weightCapKg: 1_000, kmPerL: 10 })],
    };
    const result = run(plan(shared));
    expect(result.trips.map((trip) => trip.tripNo)).toEqual([1, 2]);
    expect(result.trips.every((trip) => trip.vehicleId === 'VEH001')).toBe(true);
    const arrival = new Map(
      result.trips.flatMap((trip) => trip.stops.map((stop) => [stop.orderId, stop.plannedArrival])),
    );
    expect(arrival.get(IDS.a)).toBe('2026-10-03T05:00:00+05:30');
    expect(arrival.get(IDS.b)).toBe('2026-10-03T05:15:00+05:30');
    expect(result.metrics.tightWindowStops).toBe(1);
    expect(result.metrics.servedOrders).toBe(2);
    expect(result.metrics.servedVolumeM3).toBe(10);
    expect(result.metrics.fuelUsedL).toBeCloseTo(4);
    expect(result.metrics.avgWeightUtilization).toBeCloseTo((0.2 + 0.3) / 2);
    expect(result.metrics.avgVolumeUtilization).toBeCloseTo(1);
    expect(planResultSchema.parse(result)).toEqual(result);
  });

  it('counts repeat deferrals and scarce-fleet use', () => {
    const result = run(
      plan({
        orders: [
          order({ id: IDS.a, outletId: 'OUT001', temp: 'chilled', volumeM3: 2, weightKg: 100 }),
          order({
            id: IDS.b,
            outletId: 'OUT001',
            temp: 'chilled',
            volumeM3: 30,
            weightKg: 10,
            deferredYesterday: true,
          }),
        ],
        outlets: [outlet({ id: 'OUT001' })],
        vehicles: [
          vehicle({
            id: 'VEH001',
            type: 'van',
            temp: 'reefer',
            volumeCapM3: 10,
            weightCapKg: 1_000,
          }),
          vehicle({ id: 'VEH002', type: 'van', temp: 'ambient', volumeCapM3: 10 }),
          vehicle({ id: 'VEH003', type: 'truck', temp: 'ambient', volumeCapM3: 10 }),
        ],
      }),
    );
    expect(result.metrics.repeatDeferrals).toBe(1);
    expect(result.metrics.deferredVolumeM3).toBe(30);
    expect(result.metrics.reeferUtilization).toBe(1);
    expect(result.metrics.vanUtilization).toBe(0.5);
    expect(result.deferred[0]?.type).toBe('unavoidable');
  });

  it('keeps different districts and temperatures on separate trips', () => {
    const result = run(
      plan({
        orders: [
          order({ id: IDS.a, outletId: 'OUT001', temp: 'chilled', volumeM3: 2 }),
          order({ id: IDS.b, outletId: 'OUT002', temp: 'ambient', volumeM3: 2 }),
          order({ id: IDS.c, outletId: 'OUT003', temp: 'ambient', brand: 'Style', volumeM3: 2 }),
        ],
        outlets: [
          outlet({ id: 'OUT001', district: 'Colombo' }),
          outlet({ id: 'OUT002', district: 'Colombo' }),
          outlet({ id: 'OUT003', district: 'Gampaha', brand: 'Style' }),
        ],
        vehicles: [
          vehicle({ id: 'VEH001', temp: 'reefer', volumeCapM3: 20 }),
          vehicle({ id: 'VEH002', temp: 'reefer', volumeCapM3: 20 }),
        ],
        travel: [travel('Colombo'), travel('Gampaha')],
      }),
    );
    expect(result.deferred).toEqual([]);
    expect(result.trips).toHaveLength(3);
    expect(result.trips.every((trip) => trip.stops.length === 1)).toBe(true);
  });

  it('exchanges a lower-scored stop for a higher-scored order of the same group', () => {
    const input = plan({
      orders: [
        order({
          id: IDS.a,
          outletId: 'OUT001',
          volumeM3: 2,
          weightKg: 10,
          deferredYesterday: true,
          daysSinceLastServed: 30,
        }),
        order({
          id: IDS.b,
          outletId: 'OUT001',
          volumeM3: 5,
          weightKg: 10,
          daysSinceLastServed: 10,
        }),
        order({ id: IDS.c, outletId: 'OUT001', volumeM3: 5, weightKg: 10 }),
      ],
      outlets: [outlet({ id: 'OUT001' })],
      vehicles: [vehicle({ id: 'VEH001', volumeCapM3: 10 })],
      // One two-stop trip uses 2.2 L, so the displaced order cannot open trip 2.
      fuel: 2.2,
    });
    const repaired = repairAssignment(input, [
      { vehicleId: 'VEH001', tripNo: 1, orderIds: [IDS.a, IDS.c] },
    ]);
    expect(repaired).toEqual([{ vehicleId: 'VEH001', tripNo: 1, orderIds: [IDS.b, IDS.a] }]);
    expect(validatePlan(toValidatorInput(input), repaired)).toEqual([]);
  });

  it('describes a manual assignment with the same validator and defers what was left out', () => {
    const input = plan({
      orders: [
        order({ id: IDS.a, outletId: 'OUT001', weightKg: 100, volumeM3: 1 }),
        order({ id: IDS.b, outletId: 'OUT001', temp: 'chilled', weightKg: 100, volumeM3: 1 }),
      ],
      outlets: [outlet({ id: 'OUT001' })],
      vehicles: [vehicle({ id: 'VEH001', temp: 'ambient' })],
    });
    const described = describeAssignment(input, [
      { vehicleId: 'VEH001', tripNo: 1, orderIds: [IDS.a] },
    ]);
    expect(described.trips.map((trip) => trip.stops.map((stop) => stop.orderId))).toEqual([
      [IDS.a],
    ]);
    expect(described.deferred.map((item) => item.orderId)).toEqual([IDS.b]);
    expect(described.deferred[0]?.type).toBe('unavoidable');
    expect(described.metrics.servedOrders).toBe(1);
    expect(described.metrics.deferredOrders).toBe(1);
    expect(() =>
      describeAssignment(input, [{ vehicleId: 'VEH001', tripNo: 1, orderIds: [IDS.b] }]),
    ).toThrow(InfeasiblePlanError);
  });
});
