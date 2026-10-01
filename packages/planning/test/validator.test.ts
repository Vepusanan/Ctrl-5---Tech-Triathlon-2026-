import type {
  Brand,
  DistrictTravel,
  DockType,
  OrderLite,
  Outlet,
  ReasonCode,
  VehicleAvailabilityStatus,
  VehicleLite,
  Violation,
} from '@waypoint/shared';
import { violationSchema } from '@waypoint/shared';
import { describe, expect, it } from 'vitest';
import {
  calculateFuelLitres,
  calculateTripDistance,
  calculateTripMinutes,
  PlanningInputError,
  type TripDraft,
  type ValidatorInput,
  validatePlan,
  validateTrip,
  validateVehicleDay,
} from '../src/index.ts';

const SERVICE_DATE = '2026-10-03';

const IDS = {
  a: '0192f5e8-7b3a-7c3e-9a1b-2c3d4e5f6a01',
  b: '0192f5e8-7b3a-7c3e-9a1b-2c3d4e5f6a02',
  c: '0192f5e8-7b3a-7c3e-9a1b-2c3d4e5f6a03',
  d: '0192f5e8-7b3a-7c3e-9a1b-2c3d4e5f6a04',
  e: '0192f5e8-7b3a-7c3e-9a1b-2c3d4e5f6a05',
  f: '0192f5e8-7b3a-7c3e-9a1b-2c3d4e5f6a06',
} as const;

function order(
  overrides: Partial<OrderLite> & Pick<OrderLite, 'id' | 'outletId' | 'brand'>,
): OrderLite {
  return {
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
    depotId: 'Peliyagoda',
    dockType: 'street',
    parkingConstraint: 'normal',
    window: { open: '05:00', close: '08:00' },
    mallWindow: null,
    ...overrides,
  };
}

function vehicle(overrides: Partial<VehicleLite> = {}): VehicleLite {
  return {
    id: 'VEH001',
    type: 'van',
    temp: 'reefer',
    weightCapKg: 5_000,
    volumeCapM3: 20,
    kmPerL: 10,
    depotId: 'Peliyagoda',
    ...overrides,
  };
}

function travel(
  district: string,
  depotToDistrictMin: number,
  extra: Partial<DistrictTravel> = {},
): DistrictTravel {
  return {
    district,
    depotId: 'Peliyagoda',
    roadClass: 'urban',
    depotToDistrictKm: 10,
    depotToDistrictMin,
    interStopKm: 2,
    interStopMin: 5,
    ...extra,
  };
}

function trip(
  orderIds: readonly string[],
  tripNo: TripDraft['tripNo'] = 1,
  vehicleId = 'VEH001',
): TripDraft {
  return { vehicleId, tripNo, orderIds };
}

function input(args: {
  orders: OrderLite[];
  outlets: Outlet[];
  vehicles?: VehicleLite[];
  travel?: DistrictTravel[];
  allowance?: Partial<ValidatorInput['serviceAllowance']>;
  fuel?: number;
  availability?: ValidatorInput['availability'];
}): ValidatorInput {
  const vehicles = args.vehicles ?? [vehicle()];
  const fuelRemainingL: Record<string, number> = {};
  const availability: Record<string, VehicleAvailabilityStatus> = { ...args.availability };
  for (const item of vehicles) {
    fuelRemainingL[item.id] = args.fuel ?? 100;
    if (availability[item.id] === undefined) availability[item.id] = 'available';
  }
  return {
    serviceDate: SERVICE_DATE,
    orders: args.orders,
    vehicles,
    availability,
    outlets: Object.fromEntries(args.outlets.map((item) => [item.id, item])),
    districtTravel: Object.fromEntries(
      (args.travel ?? [travel('Colombo', 20)]).map((item) => [item.district, item]),
    ),
    serviceAllowance: {
      'Fresh:street': 15,
      ...args.allowance,
    },
    fuelRemainingL,
  };
}

function rules(violations: Violation[]): ReasonCode[] {
  return violations.map((item) => item.rule);
}

describe('validateTrip', () => {
  describe('same brand per trip', () => {
    it('passes when every stop is the same brand', () => {
      const orders = [
        order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' }),
        order({ id: IDS.b, outletId: 'OUT002', brand: 'Fresh' }),
      ];
      const outlets = [outlet({ id: 'OUT001' }), outlet({ id: 'OUT002' })];
      const plan = input({ orders, outlets });
      expect(validateTrip(plan, trip([IDS.a, IDS.b]))).toEqual([]);
    });

    it('fails when a trip mixes brands', () => {
      const orders = [
        order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' }),
        order({ id: IDS.b, outletId: 'OUT002', brand: 'Style' }),
      ];
      const outlets = [
        outlet({ id: 'OUT001' }),
        outlet({ id: 'OUT002', brand: 'Style', window: { open: '00:00', close: '23:59' } }),
      ];
      const plan = input({
        orders,
        outlets,
        allowance: { 'Fresh:street': 15, 'Style:street': 20 },
      });
      expect(validateTrip(plan, trip([IDS.a, IDS.b]))).toEqual([
        {
          rule: 'MIXED_BRAND_DISTRICT',
          tripKey: 'VEH001-1',
          vehicleId: 'VEH001',
          detail: 'Trip VEH001-1 mixes brands (Fresh, Style)',
        },
      ]);
    });
  });

  describe('same district per trip', () => {
    it('passes when every stop is in the same district', () => {
      const orders = [
        order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' }),
        order({ id: IDS.b, outletId: 'OUT002', brand: 'Fresh' }),
      ];
      const outlets = [outlet({ id: 'OUT001' }), outlet({ id: 'OUT002' })];
      const plan = input({ orders, outlets });
      expect(validateTrip(plan, trip([IDS.a, IDS.b]))).toEqual([]);
    });

    it('fails when a trip mixes districts', () => {
      const orders = [
        order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' }),
        order({ id: IDS.b, outletId: 'OUT002', brand: 'Fresh' }),
      ];
      const outlets = [
        outlet({ id: 'OUT001', district: 'Colombo' }),
        outlet({ id: 'OUT002', district: 'Gampaha', window: { open: '00:00', close: '23:59' } }),
      ];
      const plan = input({
        orders,
        outlets,
        travel: [travel('Colombo', 20), travel('Gampaha', 30)],
      });
      expect(validateTrip(plan, trip([IDS.a, IDS.b]))).toEqual([
        {
          rule: 'MIXED_BRAND_DISTRICT',
          tripKey: 'VEH001-1',
          vehicleId: 'VEH001',
          detail: 'Trip VEH001-1 mixes districts (Colombo, Gampaha)',
        },
      ]);
    });
  });

  describe('reefer required for chilled', () => {
    it('passes when a chilled order is on a reefer', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh', temp: 'chilled' })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001' })],
        vehicles: [vehicle({ temp: 'reefer' })],
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([]);
    });

    it('fails when a chilled order is on an ambient vehicle', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh', temp: 'chilled' })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001' })],
        vehicles: [vehicle({ type: 'van', temp: 'ambient' })],
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([
        {
          rule: 'REEFER_REQUIRED',
          orderId: IDS.a,
          tripKey: 'VEH001-1',
          vehicleId: 'VEH001',
          detail: 'Chilled order on ambient vehicle VEH001',
        },
      ]);
    });
  });

  describe('van required for van_only', () => {
    it('passes when a van_only outlet is served by a van', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001', parkingConstraint: 'van_only' })],
        vehicles: [vehicle({ type: 'van' })],
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([]);
    });

    it('fails when a truck is sent to a van_only outlet', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001', parkingConstraint: 'van_only' })],
        vehicles: [vehicle({ type: 'truck', temp: 'reefer' })],
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([
        {
          rule: 'VAN_REQUIRED',
          orderId: IDS.a,
          tripKey: 'VEH001-1',
          vehicleId: 'VEH001',
          detail: 'van_only outlet OUT001 requires a van',
        },
      ]);
    });
  });

  describe('home depot', () => {
    it('passes when the vehicle depot matches the outlet depot', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001', depotId: 'Peliyagoda' })],
        vehicles: [vehicle({ depotId: 'Peliyagoda' })],
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([]);
    });

    it('fails when the outlet belongs to another depot', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001', depotId: 'Kandy' })],
        vehicles: [vehicle({ depotId: 'Peliyagoda' })],
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([
        {
          rule: 'WRONG_DEPOT',
          orderId: IDS.a,
          tripKey: 'VEH001-1',
          vehicleId: 'VEH001',
          detail: 'Vehicle VEH001 is based at Peliyagoda but outlet OUT001 is served from Kandy',
        },
      ]);
    });
  });

  describe('vehicle availability', () => {
    it('passes when the vehicle is available on the service date', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001' })],
        availability: { VEH001: 'available' },
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([]);
    });

    it('fails when the vehicle is in the workshop', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001' })],
        availability: { VEH001: 'in_workshop' },
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([
        {
          rule: 'VEHICLE_UNAVAILABLE',
          tripKey: 'VEH001-1',
          vehicleId: 'VEH001',
          detail: 'Vehicle VEH001 is not available on 2026-10-03',
        },
      ]);
    });
  });

  describe('weight capacity', () => {
    it('passes when the load is under the weight cap', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh', weightKg: 100 })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001' })],
        vehicles: [vehicle({ weightCapKg: 5_000 })],
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([]);
    });

    it('fails when the load is over the weight cap', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh', weightKg: 6_000 })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001' })],
        vehicles: [vehicle({ weightCapKg: 5_000 })],
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([
        {
          rule: 'WEIGHT_CAP',
          tripKey: 'VEH001-1',
          vehicleId: 'VEH001',
          detail: 'Weight 6000 kg exceeds capacity 5000 kg',
          actual: 6_000,
          limit: 5_000,
        },
      ]);
    });
  });

  describe('volume capacity', () => {
    it('passes when the load is under the volume cap', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh', volumeM3: 1 })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001' })],
        vehicles: [vehicle({ volumeCapM3: 20 })],
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([]);
    });

    it('fails when the load is over the volume cap', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh', volumeM3: 21 })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001' })],
        vehicles: [vehicle({ volumeCapM3: 20 })],
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([
        {
          rule: 'VOLUME_CAP',
          tripKey: 'VEH001-1',
          vehicleId: 'VEH001',
          detail: 'Volume 21 m3 exceeds capacity 20 m3',
          actual: 21,
          limit: 20,
        },
      ]);
    });
  });

  describe('delivery windows', () => {
    it('passes when an early arrival can wait until the window opens', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001', window: { open: '05:00', close: '08:00' } })],
        travel: [travel('Colombo', 20)],
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([]);
    });

    it('fails when the planned arrival is after window close', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001', window: { open: '03:00', close: '03:40' } })],
        travel: [travel('Colombo', 20)],
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([
        {
          rule: 'WINDOW_MISSED',
          orderId: IDS.a,
          tripKey: 'VEH001-1',
          vehicleId: 'VEH001',
          detail: 'Planned arrival 03:50 is after window close 03:40',
          actual: 3 * 60 + 50,
          limit: 3 * 60 + 40,
        },
      ]);
    });
  });

  describe('mall windows', () => {
    it('passes when the arrival is inside the mall window', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
      const plan = input({
        orders,
        outlets: [
          outlet({
            id: 'OUT001',
            dockType: 'mall_bay',
            parkingConstraint: 'mall_dock',
            window: { open: '03:00', close: '08:00' },
            mallWindow: { open: '03:00', close: '08:00' },
          }),
        ],
        allowance: { 'Fresh:mall_bay': 15 },
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([]);
    });

    it('fails when the arrival is after the mall window closes', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
      const plan = input({
        orders,
        outlets: [
          outlet({
            id: 'OUT001',
            window: { open: '03:00', close: '18:00' },
            mallWindow: { open: '03:00', close: '03:40' },
          }),
        ],
        travel: [travel('Colombo', 20)],
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([
        {
          rule: 'WINDOW_MISSED',
          orderId: IDS.a,
          tripKey: 'VEH001-1',
          vehicleId: 'VEH001',
          detail: 'Planned arrival 03:50 is outside mall window 03:00-03:40',
          actual: 3 * 60 + 50,
          limit: 3 * 60 + 40,
        },
      ]);
    });

    it('fails both window checks when the delivery window and the mall window do not overlap', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
      const plan = input({
        orders,
        outlets: [
          outlet({
            id: 'OUT001',
            window: { open: '05:00', close: '07:00' },
            mallWindow: { open: '10:00', close: '12:00' },
          }),
        ],
        travel: [travel('Colombo', 20)],
      });
      expect(rules(validateTrip(plan, trip([IDS.a])))).toEqual(['WINDOW_MISSED', 'WINDOW_MISSED']);
      expect(validateTrip(plan, trip([IDS.a])).map((item) => item.detail)).toEqual([
        'Delivery window 05:00-07:00 does not overlap mall window 10:00-12:00',
        'Mall window 10:00-12:00 does not overlap delivery window 05:00-07:00',
      ]);
    });
  });

  describe('weekly fuel quota', () => {
    it('passes when the trip is within the remaining quota', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001' })],
        travel: [travel('Colombo', 20, { depotToDistrictKm: 10 })],
        vehicles: [vehicle({ kmPerL: 10 })],
        fuel: 100,
      });
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([]);
    });

    it('fails when one trip uses more than the remaining quota', () => {
      const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
      const plan = input({
        orders,
        outlets: [outlet({ id: 'OUT001' })],
        travel: [travel('Colombo', 20, { depotToDistrictKm: 10 })],
        vehicles: [vehicle({ kmPerL: 10 })],
        fuel: 1,
      });
      const litres = calculateFuelLitres(
        calculateTripDistance({ depotToDistrictKm: 10, interStopKm: 2, stopCount: 1 }),
        10,
      );
      expect(litres).toBe(2);
      expect(validateTrip(plan, trip([IDS.a]))).toEqual([
        {
          rule: 'FUEL_QUOTA',
          tripKey: 'VEH001-1',
          vehicleId: 'VEH001',
          detail: 'Trip VEH001-1 uses 2 L; weekly fuel remaining is 1 L',
          actual: litres,
          limit: 1,
        },
      ]);
    });
  });

  it.each(['Style', 'Tech'] as const)('starts a %s trip at 08:00', (brand: Brand) => {
    const dock: DockType = 'street';
    const orders = [order({ id: IDS.a, outletId: 'OUT001', brand })];
    const plan = input({
      orders,
      outlets: [outlet({ id: 'OUT001', brand, window: { open: '08:00', close: '08:15' } })],
      travel: [travel('Colombo', 30)],
      allowance: { [`${brand}:${dock}`]: 10 },
      vehicles: [vehicle({ type: 'truck', temp: 'ambient' })],
    });
    expect(validateTrip(plan, trip([IDS.a]))).toEqual([
      {
        rule: 'WINDOW_MISSED',
        orderId: IDS.a,
        tripKey: 'VEH001-1',
        vehicleId: 'VEH001',
        detail: 'Planned arrival 08:30 is after window close 08:15',
        actual: 8 * 60 + 30,
        limit: 8 * 60 + 15,
      },
    ]);
  });
});

describe('validateVehicleDay', () => {
  describe('maximum two trips per vehicle', () => {
    function shortFresh(count: number): { plan: ValidatorInput; trips: TripDraft[] } {
      const ids = [IDS.a, IDS.b, IDS.c].slice(0, count);
      const orders = ids.map((id, index) =>
        order({ id, outletId: `OUT00${index + 1}`, brand: 'Fresh', weightKg: 10, volumeM3: 0.2 }),
      );
      const outlets = ids.map((_, index) =>
        outlet({ id: `OUT00${index + 1}`, window: { open: '05:00', close: '18:00' } }),
      );
      const trips = ids.map((id, index) => trip([id], index === 0 ? 1 : 2));
      return {
        plan: input({ orders, outlets, travel: [travel('Colombo', 20)], fuel: 100 }),
        trips,
      };
    }

    it('passes when the vehicle has two trips', () => {
      const { plan, trips } = shortFresh(2);
      expect(validateVehicleDay(plan, 'VEH001', trips)).toEqual([]);
    });

    it('fails when the vehicle has a third trip', () => {
      const { plan, trips } = shortFresh(3);
      expect(validateVehicleDay(plan, 'VEH001', trips)).toEqual([
        {
          rule: 'TRIP_LIMIT',
          vehicleId: 'VEH001',
          detail: 'Vehicle VEH001 has 3 trips; the daily limit is 2',
          actual: 3,
          limit: 2,
        },
      ]);
    });
  });

  describe('Fresh 270 minute vehicle budget', () => {
    function freshDay(secondOutbound: number): { plan: ValidatorInput; trips: TripDraft[] } {
      const orders = [
        order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh', weightKg: 10, volumeM3: 0.2 }),
        order({ id: IDS.b, outletId: 'OUT002', brand: 'Fresh', weightKg: 10, volumeM3: 0.2 }),
      ];
      const window = { open: '04:00', close: '12:00' };
      const outlets = [
        outlet({ id: 'OUT001', district: 'Colombo', window }),
        outlet({ id: 'OUT002', district: 'Gampaha', window }),
      ];
      const plan = input({
        orders,
        outlets,
        travel: [
          travel('Colombo', 135, { depotToDistrictKm: 1 }),
          travel('Gampaha', secondOutbound, { depotToDistrictKm: 1 }),
        ],
        fuel: 50,
      });
      return { plan, trips: [trip([IDS.a], 1), trip([IDS.b], 2)] };
    }

    it('passes when Fresh trip minutes are under 270', () => {
      const { plan, trips } = freshDay(30);
      expect(validateVehicleDay(plan, 'VEH001', trips)).toEqual([]);
    });

    it('fails when each Fresh trip is under 270 but the vehicle total is over', () => {
      const { plan, trips } = freshDay(106);
      const total = [135, 106].reduce(
        (sum, outbound) =>
          sum +
          calculateTripMinutes({
            depotToDistrictMin: outbound,
            interStopMin: 5,
            serviceAllowanceMin: [15],
          }),
        0,
      );
      expect(total).toBe(271);
      expect(validateVehicleDay(plan, 'VEH001', trips)).toEqual([
        {
          rule: 'FRESH_TIME_BUDGET',
          vehicleId: 'VEH001',
          detail: 'Fresh trips total 271 min; the pre-dawn budget is 270 min',
          actual: total,
          limit: 270,
        },
      ]);
    });
  });

  describe('Style + Tech 480 minute vehicle budget', () => {
    it('passes when a Style trip is under 480 minutes', () => {
      const orders = [
        order({ id: IDS.a, outletId: 'OUT001', brand: 'Style', weightKg: 10, volumeM3: 0.2 }),
      ];
      const plan = input({
        orders,
        outlets: [
          outlet({ id: 'OUT001', brand: 'Style', window: { open: '09:00', close: '18:00' } }),
        ],
        travel: [travel('Colombo', 20)],
        allowance: { 'Style:street': 20 },
        vehicles: [vehicle({ type: 'truck', temp: 'ambient' })],
      });
      expect(validateVehicleDay(plan, 'VEH001', [trip([IDS.a])])).toEqual([]);
    });

    function dayBrand(techOutbound: number): { plan: ValidatorInput; trips: TripDraft[] } {
      const orders = [
        order({ id: IDS.a, outletId: 'OUT001', brand: 'Style', weightKg: 10, volumeM3: 0.2 }),
        order({ id: IDS.b, outletId: 'OUT002', brand: 'Tech', weightKg: 10, volumeM3: 0.2 }),
      ];
      const window = { open: '09:00', close: '23:00' };
      const outlets = [
        outlet({ id: 'OUT001', brand: 'Style', district: 'Colombo', window }),
        outlet({ id: 'OUT002', brand: 'Tech', district: 'Negombo', window }),
      ];
      const plan = input({
        orders,
        outlets,
        travel: [
          travel('Colombo', 280, { depotToDistrictKm: 1 }),
          travel('Negombo', techOutbound, { depotToDistrictKm: 1 }),
        ],
        allowance: { 'Style:street': 20, 'Tech:street': 24 },
        vehicles: [vehicle({ type: 'truck', temp: 'ambient' })],
        fuel: 100,
      });
      return { plan, trips: [trip([IDS.a], 1), trip([IDS.b], 2)] };
    }

    it('fails when Style and Tech each fit in 480 minutes but the vehicle total does not', () => {
      const { plan, trips } = dayBrand(157);
      expect(validateVehicleDay(plan, 'VEH001', trips)).toEqual([
        {
          rule: 'DAY_TIME_BUDGET',
          vehicleId: 'VEH001',
          detail: 'Style and Tech trips total 481 min; the daytime budget is 480 min',
          actual: 481,
          limit: 480,
        },
      ]);
    });
  });

  describe('weekly fuel quota across trips', () => {
    it('fails when each trip fits the quota but the vehicle day does not', () => {
      const orders = [
        order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh', weightKg: 10, volumeM3: 0.2 }),
        order({ id: IDS.b, outletId: 'OUT002', brand: 'Fresh', weightKg: 10, volumeM3: 0.2 }),
      ];
      const outlets = [
        outlet({ id: 'OUT001', window: { open: '05:00', close: '18:00' } }),
        outlet({ id: 'OUT002', window: { open: '05:00', close: '18:00' } }),
      ];
      const plan = input({
        orders,
        outlets,
        travel: [travel('Colombo', 20, { depotToDistrictKm: 10 })],
        vehicles: [vehicle({ kmPerL: 10 })],
        fuel: 3,
      });
      expect(validateVehicleDay(plan, 'VEH001', [trip([IDS.a], 1), trip([IDS.b], 2)])).toEqual([
        {
          rule: 'FUEL_QUOTA',
          vehicleId: 'VEH001',
          detail: 'Vehicle VEH001 trips use 4 L; weekly fuel remaining is 3 L',
          actual: 4,
          limit: 3,
        },
      ]);
    });
  });
});

describe('boundary equality', () => {
  it('allows weight equal to capacity', () => {
    const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh', weightKg: 5_000 })];
    const plan = input({
      orders,
      outlets: [outlet({ id: 'OUT001' })],
      vehicles: [vehicle({ weightCapKg: 5_000 })],
    });
    expect(validateTrip(plan, trip([IDS.a]))).toEqual([]);
  });

  it('allows volume equal to capacity', () => {
    const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh', volumeM3: 20 })];
    const plan = input({
      orders,
      outlets: [outlet({ id: 'OUT001' })],
      vehicles: [vehicle({ volumeCapM3: 20 })],
    });
    expect(validateTrip(plan, trip([IDS.a]))).toEqual([]);
  });

  it('allows fuel equal to the remaining quota', () => {
    const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
    const plan = input({
      orders,
      outlets: [outlet({ id: 'OUT001' })],
      travel: [travel('Colombo', 20, { depotToDistrictKm: 10 })],
      vehicles: [vehicle({ kmPerL: 10 })],
      fuel: 2,
    });
    expect(validateTrip(plan, trip([IDS.a]))).toEqual([]);
  });

  it('allows a delivery arrival equal to window close', () => {
    const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
    const plan = input({
      orders,
      outlets: [outlet({ id: 'OUT001', window: { open: '03:00', close: '04:00' } })],
      travel: [travel('Colombo', 30)],
    });
    expect(validateTrip(plan, trip([IDS.a]))).toEqual([]);
  });

  it('allows an arrival equal to mall open and equal to mall close', () => {
    const atOpen = input({
      orders: [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })],
      outlets: [
        outlet({
          id: 'OUT001',
          window: { open: '03:00', close: '18:00' },
          mallWindow: { open: '03:50', close: '08:00' },
        }),
      ],
      travel: [travel('Colombo', 20)],
    });
    const atClose = input({
      orders: [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })],
      outlets: [
        outlet({
          id: 'OUT001',
          window: { open: '03:00', close: '18:00' },
          mallWindow: { open: '03:00', close: '03:50' },
        }),
      ],
      travel: [travel('Colombo', 20)],
    });
    expect(validateTrip(atOpen, trip([IDS.a]))).toEqual([]);
    expect(validateTrip(atClose, trip([IDS.a]))).toEqual([]);
  });

  it('waits for a mall that opens after the raw arrival', () => {
    const plan = input({
      orders: [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })],
      outlets: [
        outlet({
          id: 'OUT001',
          window: { open: '03:00', close: '18:00' },
          mallWindow: { open: '05:00', close: '08:00' },
        }),
      ],
      travel: [travel('Colombo', 20)],
    });
    expect(validateTrip(plan, trip([IDS.a]))).toEqual([]);
  });

  it('allows Fresh minutes equal to 270', () => {
    const orders = [
      order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh', weightKg: 10, volumeM3: 0.2 }),
      order({ id: IDS.b, outletId: 'OUT002', brand: 'Fresh', weightKg: 10, volumeM3: 0.2 }),
    ];
    const window = { open: '04:00', close: '12:00' };
    const plan = input({
      orders,
      outlets: [
        outlet({ id: 'OUT001', district: 'Colombo', window }),
        outlet({ id: 'OUT002', district: 'Gampaha', window }),
      ],
      travel: [
        travel('Colombo', 135, { depotToDistrictKm: 1 }),
        travel('Gampaha', 105, { depotToDistrictKm: 1 }),
      ],
      fuel: 50,
    });
    expect(validateVehicleDay(plan, 'VEH001', [trip([IDS.a], 1), trip([IDS.b], 2)])).toEqual([]);
  });

  it('allows Style and Tech minutes equal to 480', () => {
    const orders = [
      order({ id: IDS.a, outletId: 'OUT001', brand: 'Style', weightKg: 10, volumeM3: 0.2 }),
      order({ id: IDS.b, outletId: 'OUT002', brand: 'Tech', weightKg: 10, volumeM3: 0.2 }),
    ];
    const window = { open: '09:00', close: '23:00' };
    const plan = input({
      orders,
      outlets: [
        outlet({ id: 'OUT001', brand: 'Style', district: 'Colombo', window }),
        outlet({ id: 'OUT002', brand: 'Tech', district: 'Negombo', window }),
      ],
      travel: [
        travel('Colombo', 280, { depotToDistrictKm: 1 }),
        travel('Negombo', 156, { depotToDistrictKm: 1 }),
      ],
      allowance: { 'Style:street': 20, 'Tech:street': 24 },
      vehicles: [vehicle({ type: 'truck', temp: 'ambient' })],
      fuel: 100,
    });
    expect(validateVehicleDay(plan, 'VEH001', [trip([IDS.a], 1), trip([IDS.b], 2)])).toEqual([]);
  });
});

describe('validatePlan', () => {
  it('accepts a feasible plan', () => {
    const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
    const plan = input({ orders, outlets: [outlet({ id: 'OUT001' })] });
    expect(validatePlan(plan, [trip([IDS.a])])).toEqual([]);
  });

  it('starts trip 2 after trip 1 returns to the depot', () => {
    const orders = [
      order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' }),
      order({ id: IDS.b, outletId: 'OUT002', brand: 'Fresh' }),
    ];
    const window = { open: '05:00', close: '06:00' };
    const plan = input({
      orders,
      outlets: [
        outlet({ id: 'OUT001', district: 'Colombo', window }),
        outlet({ id: 'OUT002', district: 'Gampaha', window }),
      ],
      travel: [
        travel('Colombo', 20, { depotToDistrictKm: 1 }),
        travel('Gampaha', 120, { depotToDistrictKm: 1 }),
      ],
      fuel: 100,
    });
    const trips = [trip([IDS.a], 1), trip([IDS.b], 2)];
    expect(validateTrip(plan, trips[1] ?? trip([IDS.b], 2))).toEqual([]);
    expect(validatePlan(plan, trips)).toEqual([
      {
        rule: 'WINDOW_MISSED',
        orderId: IDS.b,
        tripKey: 'VEH001-2',
        vehicleId: 'VEH001',
        detail: 'Planned arrival 06:25 is after window close 06:00',
        actual: 6 * 60 + 25,
        limit: 6 * 60,
      },
    ]);
  });

  it('returns every simultaneous violation', () => {
    const wide = { open: '00:00', close: '23:59' };
    const orders = [
      order({
        id: IDS.a,
        outletId: 'OUT001',
        brand: 'Fresh',
        temp: 'chilled',
        weightKg: 60,
        volumeM3: 1,
      }),
      order({ id: IDS.b, outletId: 'OUT002', brand: 'Style', weightKg: 60, volumeM3: 1 }),
      order({ id: IDS.c, outletId: 'OUT003', brand: 'Fresh', weightKg: 10, volumeM3: 1 }),
      order({ id: IDS.d, outletId: 'OUT004', brand: 'Fresh', weightKg: 10, volumeM3: 1 }),
      order({ id: IDS.e, outletId: 'OUT005', brand: 'Fresh', weightKg: 10, volumeM3: 1 }),
      order({ id: IDS.f, outletId: 'OUT006', brand: 'Style', weightKg: 10, volumeM3: 1 }),
    ];
    const outlets = [
      outlet({
        id: 'OUT001',
        brand: 'Fresh',
        district: 'Colombo',
        depotId: 'Kandy',
        parkingConstraint: 'van_only',
        window: { open: '04:00', close: '05:00' },
        mallWindow: { open: '04:00', close: '05:00' },
      }),
      outlet({
        id: 'OUT002',
        brand: 'Style',
        district: 'Gampaha',
        depotId: 'Kandy',
        parkingConstraint: 'van_only',
        window: { open: '04:00', close: '05:00' },
        mallWindow: { open: '04:00', close: '05:00' },
      }),
      outlet({ id: 'OUT003', district: 'Negombo', window: wide }),
      outlet({ id: 'OUT004', district: 'Negombo', window: wide }),
      outlet({ id: 'OUT005', district: 'Gampaha', window: { open: '04:00', close: '08:30' } }),
      outlet({
        id: 'OUT006',
        brand: 'Style',
        district: 'Kandy',
        window: { open: '09:00', close: '18:00' },
      }),
    ];
    const vehicles = [
      vehicle({
        id: 'VEH001',
        type: 'truck',
        temp: 'ambient',
        weightCapKg: 100,
        volumeCapM3: 1,
        kmPerL: 10,
      }),
      vehicle({ id: 'VEH002', type: 'truck', temp: 'ambient', kmPerL: 10 }),
      vehicle({ id: 'VEH003', type: 'truck', temp: 'ambient', kmPerL: 10 }),
    ];
    const plan = input({
      orders,
      outlets,
      vehicles,
      travel: [
        travel('Colombo', 200, { depotToDistrictKm: 10, interStopKm: 0, interStopMin: 5 }),
        travel('Gampaha', 261, { depotToDistrictKm: 1, interStopKm: 0 }),
        travel('Negombo', 5, { depotToDistrictKm: 2.5, interStopKm: 0 }),
        travel('Kandy', 471, { depotToDistrictKm: 1, interStopKm: 0 }),
      ],
      allowance: { 'Fresh:street': 10, 'Style:street': 10 },
      availability: { VEH001: 'in_workshop', VEH002: 'available', VEH003: 'available' },
      fuel: 50,
    });
    plan.fuelRemainingL = { VEH001: 1, VEH002: 50, VEH003: 50 };

    const violations = validatePlan(plan, [
      trip([IDS.a, IDS.b], 1, 'VEH001'),
      trip([IDS.c], 2, 'VEH001'),
      trip([IDS.d], 2, 'VEH001'),
      trip([IDS.e], 1, 'VEH002'),
      trip([IDS.f], 1, 'VEH003'),
    ]);

    expect(rules(violations)).toEqual([
      'VEHICLE_UNAVAILABLE',
      'MIXED_BRAND_DISTRICT',
      'MIXED_BRAND_DISTRICT',
      'REEFER_REQUIRED',
      'VAN_REQUIRED',
      'WRONG_DEPOT',
      'VAN_REQUIRED',
      'WRONG_DEPOT',
      'WINDOW_MISSED',
      'WINDOW_MISSED',
      'WINDOW_MISSED',
      'WINDOW_MISSED',
      'WEIGHT_CAP',
      'VOLUME_CAP',
      'FUEL_QUOTA',
      'VEHICLE_UNAVAILABLE',
      'VEHICLE_UNAVAILABLE',
      'TRIP_LIMIT',
      'FUEL_QUOTA',
      'FRESH_TIME_BUDGET',
      'DAY_TIME_BUDGET',
    ]);
    expect(violations.find((item) => item.rule === 'WEIGHT_CAP')).toMatchObject({
      actual: 120,
      limit: 100,
      tripKey: 'VEH001-1',
    });
    expect(violations.find((item) => item.rule === 'VOLUME_CAP')).toMatchObject({
      actual: 2,
      limit: 1,
    });
    expect(violations.find((item) => item.rule === 'TRIP_LIMIT')).toMatchObject({
      actual: 3,
      limit: 2,
      vehicleId: 'VEH001',
    });
    expect(violations.find((item) => item.rule === 'FRESH_TIME_BUDGET')).toMatchObject({
      actual: 271,
      limit: 270,
      vehicleId: 'VEH002',
    });
    expect(violations.find((item) => item.rule === 'DAY_TIME_BUDGET')).toMatchObject({
      actual: 481,
      limit: 480,
      vehicleId: 'VEH003',
    });
    expect(
      violations.filter((item) => item.rule === 'MIXED_BRAND_DISTRICT').map((item) => item.detail),
    ).toEqual([
      'Trip VEH001-1 mixes brands (Fresh, Style)',
      'Trip VEH001-1 mixes districts (Colombo, Gampaha)',
    ]);
    expect(violations.some((item) => item.detail.includes('window close'))).toBe(true);
    expect(violations.some((item) => item.detail.includes('mall window'))).toBe(true);
    for (const item of violations) {
      expect(violationSchema.safeParse(item).success).toBe(true);
    }
  });
});

describe('validator input', () => {
  it('rejects an empty trip, an unknown order, and a missing allowance', () => {
    const orders = [order({ id: IDS.a, outletId: 'OUT001', brand: 'Fresh' })];
    const plan = input({ orders, outlets: [outlet({ id: 'OUT001' })] });
    expect(() => validateTrip(plan, trip([]))).toThrow(PlanningInputError);
    expect(() => validateTrip(plan, trip([IDS.b]))).toThrow(PlanningInputError);
    const noAllowance = input({
      orders,
      outlets: [outlet({ id: 'OUT001', dockType: 'rear_dock' })],
      allowance: {},
    });
    expect(() => validateTrip(noAllowance, trip([IDS.a]))).toThrow(/Fresh:rear_dock/);
  });
});
