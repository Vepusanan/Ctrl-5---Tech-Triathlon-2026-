/** D04 · Fleet & trips (Figma 2040:1599). VEH014 is copied from the frame; others are derived. */
import type { z } from 'zod';
import type { BoardVehicle, vehicleInspectorSchema } from '../../contracts';
import { dispatcher } from './guard';
import { orderId, state } from './orders';
import { fail, type MockRoute } from './router';

type Inspector = z.infer<typeof vehicleInspectorSchema>;
type Trip = Inspector['trips'][number];

const at = (time: string) => `2026-09-26T${time}:00+05:30`;
const KADAWATHA = orderId(3001);

const veh014Trip2 = (): Trip => {
  const stops = [
    { orderId: KADAWATHA, name: 'Kadawatha', weightKg: 402, time: '05:10', mins: 18, risk: 41 },
    { orderId: orderId(3002), name: 'Ragama', weightKg: 286, time: '05:46', mins: 12, risk: null },
    { orderId: orderId(3003), name: 'Ja-Ela', weightKg: 188, time: '06:14', mins: 9, risk: null },
    { orderId: orderId(3004), name: 'Wattala', weightKg: 142, time: '06:40', mins: 11, risk: 22 },
    { orderId: orderId(3005), name: 'Hendala', weightKg: 118, time: '07:05', mins: 8, risk: null },
    { orderId: orderId(3006), name: 'Kelaniya', weightKg: 100, time: '07:26', mins: 7, risk: null },
  ].filter((item) => !state.weightFixApplied || item.orderId !== KADAWATHA);
  const loadKg = stops.reduce((sum, item) => sum + item.weightKg, 0);
  return {
    tripNo: 2,
    loadKg,
    loadM3: state.weightFixApplied ? 7.6 : 10.4,
    stops: stops.map((item) => ({
      orderId: item.orderId,
      name: item.name,
      weightKg: item.weightKg,
      volumeM3: Number((item.weightKg / 119).toFixed(1)),
      plannedArrival: at(item.time),
      serviceMinutes: item.mins,
      lateRiskPercent: item.risk,
    })),
    insight: state.weightFixApplied
      ? null
      : 'Kadawatha (402 kg) tips trip 2 over the 1,200 kg limit.',
    capacity: [
      { key: 'weight', label: 'Weight', percent: state.weightFixApplied ? 70 : 103 },
      { key: 'volume', label: 'Volume', percent: state.weightFixApplied ? 63 : 87 },
      { key: 'reefer', label: 'Reefer', percent: state.weightFixApplied ? 66 : 92 },
      state.weightFixApplied
        ? { key: 'fuel', label: 'Fuel', percent: 91 }
        : { key: 'fuel', label: 'Fuel', percent: 88, markerPercent: 91 },
      { key: 'trips', label: 'Trips', percent: 100 },
    ],
    capacityNote: 'Trips 2 of 2 · no third trip allowed.',
    fix: state.weightFixApplied
      ? null
      : {
          title: 'Move Kadawatha to VEH007 T2',
          orderId: KADAWATHA,
          target: { vehicleId: 'VEH007', tripNo: 2 },
          effects: [
            { label: 'VEH014', percent: 70 },
            { label: 'VEH007', percent: 94 },
          ],
          note: 'Both trips feasible · +8 km',
          reasons: [
            'VEH007 is a reefer with room on trip 2, so the chilled load stays cold.',
            'Kadawatha is the heaviest stop, so one move clears the weight limit.',
            'Its 05:00–07:00 window is still met on the new trip.',
          ],
        },
  };
};

const veh014 = (): Inspector => ({
  vehicle: {
    id: 'VEH014',
    kind: 'Reefer truck',
    depot: 'Peliyagoda DC',
    weightCapKg: 1200,
    volumeCapM3: 12,
    kmPerL: 7.5,
  },
  fuel: state.weightFixApplied
    ? { percent: 91, afterPercent: 91, note: 'Route 170 km ÷ 7.5 km/L.' }
    : {
        percent: 88,
        afterPercent: 91,
        note: 'Route 162 km ÷ 7.5 km/L. Marker = after this change.',
      },
  trips: [
    {
      tripNo: 1,
      loadKg: 984,
      loadM3: 8.3,
      stops: [
        { name: 'Maharagama', weightKg: 310, time: '03:55', mins: 14 },
        { name: 'Dehiwala', weightKg: 280, time: '04:21', mins: 11 },
        { name: 'Moratuwa', weightKg: 394, time: '04:44', mins: 16 },
      ].map((item, index) => ({
        orderId: orderId(2013 + index),
        name: item.name,
        weightKg: item.weightKg,
        volumeM3: Number((item.weightKg / 119).toFixed(1)),
        plannedArrival: at(item.time),
        serviceMinutes: item.mins,
        lateRiskPercent: null,
      })),
      insight: null,
      capacity: [
        { key: 'weight', label: 'Weight', percent: 82 },
        { key: 'volume', label: 'Volume', percent: 69 },
        { key: 'reefer', label: 'Reefer', percent: 74 },
        { key: 'fuel', label: 'Fuel', percent: 88 },
        { key: 'trips', label: 'Trips', percent: 100 },
      ],
      capacityNote: 'Trips 2 of 2 · no third trip allowed.',
      fix: null,
    },
    veh014Trip2(),
  ],
});

/** A plain inspector for vehicles the frame does not draw, built from the board lanes. */
function derived(vehicle: BoardVehicle): Inspector {
  const weightCapKg = vehicle.type === 'van' ? 1430 : 2600;
  const volumeCapM3 = vehicle.type === 'van' ? 9 : 16;
  return {
    vehicle: {
      id: vehicle.id,
      kind: vehicle.kind,
      depot: vehicle.depot,
      weightCapKg,
      volumeCapM3,
      kmPerL: vehicle.type === 'van' ? 9.5 : 7.5,
    },
    fuel: { percent: 62, afterPercent: 62, note: 'Within this week’s quota.' },
    trips: vehicle.trips.map((trip) => {
      const loadKg = Math.round((trip.loadPercent / 100) * weightCapKg);
      const share = trip.stops.map((_, index) => trip.stops.length - index);
      const parts = share.reduce((sum, part) => sum + part, 0) || 1;
      return {
        tripNo: trip.tripNo,
        loadKg,
        loadM3: Number(((trip.loadPercent / 100) * volumeCapM3 * 0.85).toFixed(1)),
        stops: trip.stops.map((item, index) => {
          const weightKg = Math.round((loadKg * (share[index] ?? 1)) / parts);
          return {
            orderId: item.orderId,
            name: item.name,
            weightKg,
            volumeM3: Number((weightKg / 119).toFixed(1)),
            plannedArrival: at(
              `0${5 + Math.floor((index * 26) / 60)}:${String((10 + index * 26) % 60).padStart(2, '0')}`,
            ),
            serviceMinutes: 9 + ((index * 5) % 9),
            lateRiskPercent: null,
          };
        }),
        insight: null,
        capacity: [
          { key: 'weight', label: 'Weight', percent: trip.loadPercent },
          { key: 'volume', label: 'Volume', percent: Math.round(trip.loadPercent * 0.85) },
          ...(vehicle.temp === 'reefer'
            ? [{ key: 'reefer', label: 'Reefer', percent: Math.round(trip.loadPercent * 0.9) }]
            : []),
          { key: 'fuel', label: 'Fuel', percent: 62 },
          { key: 'trips', label: 'Trips', percent: vehicle.trips.length * 50 },
        ],
        capacityNote: `Trips ${vehicle.trips.length} of 2.`,
        fix: null,
      };
    }),
  };
}

/** Applies the offered fix when the move matches it. Returns false for any other move. */
export function applyFix(id: string, target: { vehicleId: string; tripNo: 1 | 2 }): boolean {
  if (
    state.weightFixApplied ||
    id !== KADAWATHA ||
    target.vehicleId !== 'VEH007' ||
    target.tripNo !== 2
  ) {
    return false;
  }
  state.weightFixApplied = true;
  for (const vehicle of state.fleet) {
    for (const trip of vehicle.trips) {
      if (vehicle.id === 'VEH014' && trip.tripNo === 2) {
        trip.stops = trip.stops.filter((item) => item.orderId !== id);
        trip.loadPercent = 70;
      }
      if (vehicle.id === 'VEH007' && trip.tripNo === 2) {
        trip.stops.push({ orderId: id, name: 'Kadawatha' });
        trip.loadPercent = 94;
      }
    }
  }
  state.planVersion += 1;
  return true;
}

/** One vehicle with its trips, or null when it is not in the run. */
export function inspect(vehicleId: string | undefined): Inspector | null {
  if (vehicleId === 'VEH014') return veh014();
  const vehicle = state.fleet.find((item) => item.id === vehicleId);
  return vehicle ? derived(vehicle) : null;
}

export const fleetRoutes: MockRoute[] = [
  [
    'GET',
    '/planning/runs/:date/vehicles',
    dispatcher(() => ({
      items: state.fleet.map((vehicle) => ({
        id: vehicle.id,
        kind: vehicle.kind,
        depot: vehicle.depot,
        violation: vehicle.trips.some((trip) => trip.loadPercent > 100),
      })),
      total: state.fleet.length,
    })),
  ],
  [
    'GET',
    '/planning/runs/:date/vehicles/:vehicleId',
    dispatcher(
      ({ params }) =>
        inspect(params.vehicleId) ?? fail(404, 'NOT_FOUND', 'That vehicle is not in this run.'),
    ),
  ],
];
