/** D04a · Trip record · view only (Figma 2106:11293). VEH051 trip 1 is copied from the frame. */
import type { z } from 'zod';
import { correctionRequestSchema, type tripRecordSchema } from '../../contracts';
import { inspect } from './fleet';
import { dispatcher } from './guard';
import { state } from './orders';
import { actor } from './review';
import { fail, type MockRoute } from './router';

type TripRecord = z.infer<typeof tripRecordSchema>;

const you = () => ({
  name: actor(),
  role: 'Dispatcher',
  permission: 'view only',
  events: null,
  you: true,
});

const veh051 = (): TripRecord => ({
  vehicleId: 'VEH051',
  tripNo: 1,
  loading: {
    loader: 'K. Perera',
    dock: 'dock 2',
    state: 'ready',
    readyAt: '2026-09-26T04:27:00+05:30',
    stops: [
      {
        seq: 1,
        outlet: { code: 'WF-F071', name: 'Gampola' },
        planned: 10,
        loaded: 7,
        exception: '3 short · v4.1',
      },
      {
        seq: 2,
        outlet: { code: 'WF-F070', name: 'Pilimatalawa' },
        planned: 8,
        loaded: 8,
        exception: null,
      },
      {
        seq: 3,
        outlet: { code: 'WF-F058', name: 'Peradeniya' },
        planned: 8,
        loaded: 8,
        exception: null,
      },
    ],
  },
  owners: [
    {
      name: 'K. Perera',
      role: 'Loader',
      permission: 'can edit loading',
      events: 6,
      you: false,
    },
    {
      name: 'S. Kumar',
      role: 'Driver',
      permission: 'can edit delivery',
      events: 5,
      you: false,
    },
    you(),
  ],
  delivery: {
    driver: 'S. Kumar',
    stops: [
      {
        seq: 1,
        outletName: 'Gampola',
        state: 'delivered',
        note: '7 of 10 · POD 05:44',
        signature: true,
        photo: true,
      },
      {
        seq: 2,
        outletName: 'Pilimatalawa',
        state: 'conflict',
        note: '8 recorded · v5 says 6',
        signature: true,
        photo: true,
      },
      {
        seq: 3,
        outletName: 'Peradeniya',
        state: 'not-started',
        note: 'ETA 07:05',
        signature: false,
        photo: false,
      },
    ],
    fields: [
      {
        key: 'gampola-arrived',
        label: 'Gampola · arrived',
        value: '05:41 · offline',
        hint: 'Synced 06:02',
      },
      {
        key: 'gampola-pod',
        label: 'Gampola · POD',
        value: 'T. Jayasinghe · signature + photo',
        hint: 'Event ev-51a09',
      },
      {
        key: 'pilimatalawa-delivered',
        label: 'Pilimatalawa · delivered',
        value: '8 cartons · 06:31',
        hint: 'Conflict with plan v5 · with dispatcher',
      },
    ],
  },
});

/** Any other trip is still in planning: its stops come from the plan and nothing is recorded. */
function planned(vehicleId: string, tripNo: number): TripRecord | null {
  const trip = inspect(vehicleId)?.trips.find((item) => item.tripNo === tripNo);
  if (!trip || trip.stops.length === 0) return null;
  return {
    vehicleId,
    tripNo: trip.tripNo,
    loading: {
      loader: null,
      dock: null,
      state: 'not-started',
      readyAt: null,
      stops: trip.stops.map((stop, index) => ({
        seq: index + 1,
        outlet: {
          code:
            state.orders.find((order) => order.id === stop.orderId)?.outlet.code ??
            `WF-F${stop.orderId.slice(-3)}`,
          name: stop.name,
        },
        planned: Math.max(1, Math.round(stop.weightKg / 35)),
        loaded: null,
        exception: null,
      })),
    },
    owners: [you()],
    delivery: {
      driver: null,
      stops: trip.stops.map((stop, index) => ({
        seq: index + 1,
        outletName: stop.name,
        state: 'not-started',
        note: `ETA ${stop.plannedArrival.slice(11, 16)}`,
        signature: false,
        photo: false,
      })),
      fields: [],
    },
  };
}

const find = (vehicleId = '', trip = '') =>
  vehicleId === 'VEH051' && trip === '1' ? veh051() : planned(vehicleId, Number(trip));

export const recordRoutes: MockRoute[] = [
  [
    'GET',
    '/planning/runs/:date/vehicles/:vehicleId/trips/:tripNo/record',
    dispatcher(
      ({ params }) =>
        find(params.vehicleId, params.tripNo) ??
        fail(404, 'NOT_FOUND', 'That trip is not in this run.'),
    ),
  ],
  [
    'POST',
    '/planning/runs/:date/vehicles/:vehicleId/trips/:tripNo/record/corrections',
    dispatcher(({ params, body }) => {
      const record = find(params.vehicleId, params.tripNo);
      const request = correctionRequestSchema.safeParse(body);
      if (!record) return fail(404, 'NOT_FOUND', 'That trip is not in this run.');
      if (!request.success) {
        return fail(400, 'VALIDATION_ERROR', 'Say what needs correcting, in up to 500 characters.');
      }
      const owner =
        request.data.target === 'loading' ? record.loading.loader : record.delivery.driver;
      return {
        id: `cor-${params.vehicleId}-${params.tripNo}`,
        sentTo: owner ?? 'the depot supervisor',
        at: '2026-09-26T06:40:00+05:30',
      };
    }),
  ],
];
