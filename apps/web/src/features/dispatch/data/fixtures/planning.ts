/** D03 · Allocation board, advisor and automatic run (Figma 2039:1225, 2106:11837). */
import type { ReasonCode } from '@waypoint/shared';
import type { z } from 'zod';
import type {
  adviceSchema,
  allocationBoardSchema,
  autoRunSchema,
  BoardVehicle,
  Candidate,
  QueueOrder,
} from '../../contracts';
import { applyFix, fleetRoutes } from './fleet';
import { dispatcher } from './guard';
import { KANDY, orderId, PELIYAGODA, resetOrders, state } from './orders';
import { reviewRoutes } from './review';
import { fail, type MockRoute } from './router';
import { scenarioRoutes } from './scenario';
import { SERVICE_DATE } from './session';
import { report, validationRoutes } from './validation';

type Board = z.infer<typeof allocationBoardSchema>;
type Advice = z.infer<typeof adviceSchema>;
type AutoRun = z.infer<typeof autoRunSchema>;

const stop = (n: number, name: string) => ({ orderId: orderId(n), name });

// Lanes as drawn in D03. The Peliyagoda vehicles are not in the frame; they exist so orders
// from that depot have somewhere to go.
const initialFleet = (): BoardVehicle[] => [
  {
    id: 'VEH051',
    kind: 'Reefer van',
    driver: 'S. Kumar',
    depot: KANDY,
    temp: 'reefer',
    type: 'van',
    trips: [
      { tripNo: 1, stops: [stop(712, 'Gampola'), stop(655, 'Pilimatalawa')], loadPercent: 78 },
    ],
  },
  {
    id: 'VEH007',
    kind: 'Reefer truck',
    driver: null,
    depot: KANDY,
    temp: 'reefer',
    type: 'truck',
    trips: [
      {
        tripNo: 1,
        stops: [stop(602, 'Kadawatha'), stop(2001, 'Ragama'), stop(2002, 'Ja-Ela')],
        loadPercent: 84,
      },
      { tripNo: 2, stops: [stop(2003, 'Katugastota'), stop(2004, 'Akurana')], loadPercent: 61 },
    ],
  },
  {
    id: 'VEH049',
    kind: 'Dry truck',
    driver: null,
    depot: KANDY,
    temp: 'ambient',
    type: 'truck',
    trips: [
      {
        tripNo: 1,
        stops: [stop(331, 'Kandy CC'), stop(2005, 'Peradeniya Rd'), stop(2006, 'Tennekumbura')],
        loadPercent: 88,
      },
    ],
  },
  {
    id: 'VEH052',
    kind: 'Dry box van',
    driver: null,
    depot: KANDY,
    temp: 'ambient',
    type: 'van',
    trips: [{ tripNo: 1, stops: [stop(1021, 'Digana'), stop(1024, 'Teldeniya')], loadPercent: 70 }],
  },
  {
    id: 'VEH033',
    kind: 'Reefer van',
    driver: null,
    depot: KANDY,
    temp: 'reefer',
    type: 'van',
    trips: [{ tripNo: 1, stops: [stop(2009, 'Matale'), stop(2010, 'Ukuwela')], loadPercent: 66 }],
  },
  {
    id: 'VEH012',
    kind: 'Reefer truck',
    driver: 'N. Perera',
    depot: PELIYAGODA,
    temp: 'reefer',
    type: 'truck',
    trips: [{ tripNo: 1, stops: [stop(2011, 'Wattala'), stop(2012, 'Kelaniya')], loadPercent: 58 }],
  },
  {
    id: 'VEH014',
    kind: 'Reefer truck',
    driver: null,
    depot: PELIYAGODA,
    temp: 'reefer',
    type: 'truck',
    trips: [
      {
        tripNo: 1,
        stops: [stop(2013, 'Maharagama'), stop(2014, 'Dehiwala'), stop(2015, 'Moratuwa')],
        loadPercent: 82,
      },
      {
        tripNo: 2,
        stops: [
          stop(3001, 'Kadawatha'),
          stop(3002, 'Ragama'),
          stop(3003, 'Ja-Ela'),
          stop(3004, 'Wattala'),
          stop(3005, 'Hendala'),
          stop(3006, 'Kelaniya'),
        ],
        loadPercent: 103,
      },
    ],
  },
  {
    id: 'VEH019',
    kind: 'Reefer van',
    driver: null,
    depot: PELIYAGODA,
    temp: 'reefer',
    type: 'van',
    trips: [{ tripNo: 1, stops: [stop(2017, 'Negombo')], loadPercent: 44 }],
  },
];

const initialRun = (): AutoRun => ({
  planVersion: 1,
  finishedAt: '2026-09-25T16:21:00+05:30',
  durationSeconds: 38,
  orders: 146,
  placed: 128,
  leftover: [
    { rule: 'REEFER_REQUIRED', count: 6 },
    { rule: 'WINDOW_MISSED', count: 5 },
    { rule: 'VAN_REQUIRED', count: 4 },
    { rule: 'WEIGHT_CAP', count: 3 },
  ],
  quality: { score: 79, note: 'Good start. Fairness is the weakest factor (2 repeat risks).' },
  changes: [
    {
      id: 'trips',
      title: '38 trips built on 41 vehicles',
      detail: 'Reefer first, then van-only, then by window',
    },
    {
      id: 'veh051-t1',
      title: 'VEH051 T1 · Gampola, Pilimatalawa, Peradeniya',
      detail: 'Reefer · van · 78% weight',
    },
    {
      id: 'veh007-t2',
      title: 'VEH007 given a second trip',
      detail: 'Needed for 9 chilled orders',
    },
    { id: 'held', title: '7 late orders held for Mon', detail: 'Cutoff rule, not a choice' },
  ],
});

state.fleet = initialFleet();
let autoRun: AutoRun | null = initialRun();

const capacityKg = (vehicle: BoardVehicle) => (vehicle.type === 'van' ? 1430 : 2600);
const isUnallocated = (order: QueueOrder) => order.state.kind === 'unallocated';

function board(): Board {
  const unallocated = state.orders.filter(isUnallocated);
  return {
    date: SERVICE_DATE,
    planVersion: state.planVersion,
    quality: { score: 86, delta: 4 },
    orders: state.orders.length,
    allocated: state.orders.filter((order) => order.state.kind === 'allocated').length,
    violations: report().violations.length,
    risks: report().risks.length,
    tripLimitOk: state.fleet.every((vehicle) => vehicle.trips.length <= 2),
    deferred: 11 + state.confirmedDeferrals,
    unallocated,
    vehicles: state.fleet,
  };
}

/** The hard rule that stops this vehicle taking the order, if any (SYSTEM_DESIGN §7.2). */
function blocker(order: QueueOrder, vehicle: BoardVehicle): [ReasonCode, string] | null {
  if (order.outlet.depot !== vehicle.depot) return ['WRONG_DEPOT', `Based at ${vehicle.depot}`];
  if (order.temp === 'chilled' && vehicle.temp !== 'reefer') {
    return ['REEFER_REQUIRED', 'Not refrigerated'];
  }
  if (order.tags.includes('van_only') && vehicle.type !== 'van') {
    return ['VAN_REQUIRED', 'Truck · outlet is van-only'];
  }
  return null;
}

// D03 advisor panel for ORD-260926-0587, copied as drawn.
const figmaAdvice: Advice = {
  orderId: orderId(587),
  candidates: [
    {
      vehicleId: 'VEH051',
      tripNo: 1,
      score: 94,
      summary: 'Same corridor · 05:55 arrival',
      factors: [
        { ok: true, text: 'Reefer · van · depot match' },
        { ok: true, text: 'Window 05:30–07:30 met' },
        { ok: false, text: 'Weight 98% of limit' },
      ],
      seq: 3,
      loadPercentAfter: 98,
    },
    {
      vehicleId: 'VEH007',
      tripNo: 2,
      score: 81,
      summary: '+1 stop · 06:10 arrival',
      factors: [
        { ok: true, text: 'Reefer · depot match' },
        { ok: true, text: 'Window 05:30–07:30 met' },
        { ok: true, text: 'Weight 72% of limit' },
      ],
      seq: 3,
      loadPercentAfter: 72,
    },
    {
      vehicleId: 'VEH033',
      tripNo: 2,
      score: 64,
      summary: 'Second trip · longer route',
      factors: [
        { ok: true, text: 'Reefer · van · depot match' },
        { ok: false, text: 'Second trip · longer route' },
      ],
      seq: 1,
      loadPercentAfter: 20,
    },
  ],
  blocked: [
    { vehicleId: 'VEH052', rule: 'REEFER_REQUIRED', reason: 'Not refrigerated' },
    { vehicleId: 'VEH049', rule: 'VAN_REQUIRED', reason: 'Truck · outlet is van-only' },
  ],
};

function advise(order: QueueOrder): Advice {
  if (order.id === figmaAdvice.orderId) return figmaAdvice;
  const candidates: Candidate[] = [];
  const blocked: Advice['blocked'] = [];
  for (const vehicle of state.fleet) {
    if (order.outlet.depot !== vehicle.depot) continue;
    const reason = blocker(order, vehicle);
    if (reason) {
      blocked.push({ vehicleId: vehicle.id, rule: reason[0], reason: reason[1] });
      continue;
    }
    const added = Math.round((order.weightKg / capacityKg(vehicle)) * 100);
    const trips = vehicle.trips.length < 2 ? [...vehicle.trips, null] : vehicle.trips;
    let fits = false;
    for (const [index, trip] of trips.entries()) {
      const after = (trip?.loadPercent ?? 0) + added;
      if (after > 100) continue;
      fits = true;
      const second = index === 1;
      candidates.push({
        vehicleId: vehicle.id,
        tripNo: second ? 2 : 1,
        score: Math.max(1, Math.round(100 - after / 5 - (second ? 18 : 0) - (trip ? 0 : 6))),
        summary: trip ? `+1 stop · ${after}% of weight` : 'New second trip · longer route',
        factors: [
          { ok: true, text: `${vehicle.kind} · depot match` },
          { ok: true, text: `Window ${order.window.open}–${order.window.close} met` },
          { ok: after < 90, text: `Weight ${after}% of limit` },
        ],
        seq: (trip?.stops.length ?? 0) + 1,
        loadPercentAfter: after,
      });
    }
    if (!fits)
      blocked.push({ vehicleId: vehicle.id, rule: 'WEIGHT_CAP', reason: 'Over weight limit' });
  }
  candidates.sort((a, b) => b.score - a.score);
  return { orderId: order.id, candidates, blocked };
}

export const planningRoutes: MockRoute[] = [
  ...fleetRoutes,
  ...validationRoutes,
  ...scenarioRoutes,
  ...reviewRoutes,
  ['GET', '/planning/runs/:date/board', dispatcher(board)],
  [
    'GET',
    '/planning/runs/:date/advice',
    dispatcher(({ query }) => {
      const order = state.orders.find((item) => item.id === query.get('orderId'));
      return order ? advise(order) : fail(404, 'NOT_FOUND', 'That order is not in this run.');
    }),
  ],
  [
    'PUT',
    '/planning/runs/:date/allocations',
    dispatcher(({ body }) => {
      const { orderId: id, target } = body as {
        orderId: string;
        target: { vehicleId: string; tripNo: 1 | 2 } | null;
      };
      // A recommended fix was validated when it was offered, so it is applied as given.
      if (target && applyFix(id, target)) return undefined;
      const order = state.orders.find((item) => item.id === id);
      if (!order) return fail(404, 'NOT_FOUND', 'That order is not in this run.');
      // Take the order off whichever trip holds it.
      state.fleet = state.fleet.map((vehicle) => ({
        ...vehicle,
        trips: vehicle.trips
          .map((trip) => ({ ...trip, stops: trip.stops.filter((item) => item.orderId !== id) }))
          .filter((trip) => trip.stops.length > 0),
      }));
      if (!target) {
        order.state = { kind: 'unallocated' };
        state.planVersion += 1;
        return undefined;
      }
      const vehicle = state.fleet.find((item) => item.id === target.vehicleId);
      if (!vehicle) return fail(404, 'NOT_FOUND', 'That vehicle is not in this run.');
      // Only what the advisor ranks as feasible may be placed; everything else is a hard-rule
      // violation, exactly as the real validator answers.
      const advice = advise(order);
      const candidate = advice.candidates.find(
        (item) => item.vehicleId === target.vehicleId && item.tripNo === target.tripNo,
      );
      if (!candidate) {
        const reason =
          advice.blocked.find((item) => item.vehicleId === vehicle.id)?.reason ??
          blocker(order, vehicle)?.[1] ??
          'Over weight limit';
        return fail(
          422,
          'CONSTRAINT_VIOLATION',
          `${vehicle.id} cannot take ${order.outlet.name}: ${reason.toLowerCase()}. Nothing was changed.`,
        );
      }
      const trip = vehicle.trips.find((item) => item.tripNo === target.tripNo);
      const after = candidate.loadPercentAfter;
      if (trip) {
        trip.stops.push({ orderId: id, name: order.outlet.name });
        trip.loadPercent = after;
      } else {
        vehicle.trips.push({
          tripNo: target.tripNo,
          stops: [{ orderId: id, name: order.outlet.name }],
          loadPercent: after,
        });
      }
      order.state = { kind: 'allocated', vehicleId: vehicle.id, tripNo: target.tripNo };
      state.planVersion += 1;
      return undefined;
    }),
  ],
  [
    'GET',
    '/planning/runs/:date/auto-run',
    dispatcher(() => autoRun ?? fail(404, 'NOT_FOUND', 'No automatic run for this date yet.')),
  ],
  [
    'POST',
    '/planning/runs/:date/auto-allocate',
    dispatcher(() => {
      resetOrders();
      state.fleet = initialFleet();
      state.weightFixApplied = false;
      autoRun = initialRun();
      state.planVersion += 1;
      return autoRun;
    }),
  ],
  [
    'DELETE',
    '/planning/runs/:date/auto-run',
    dispatcher(() => {
      for (const order of state.orders) {
        if (order.state.kind === 'allocated') order.state = { kind: 'unallocated' };
      }
      state.fleet = state.fleet.map((vehicle) => ({ ...vehicle, trips: [] }));
      autoRun = null;
      state.planVersion += 1;
      return undefined;
    }),
  ],
  [
    'DELETE',
    '/planning/runs/:date/auto-run/changes/:id',
    dispatcher(({ params }) => {
      if (!autoRun) return fail(404, 'NOT_FOUND', 'No automatic run for this date yet.');
      autoRun = {
        ...autoRun,
        changes: autoRun.changes.filter((change) => change.id !== params.id),
      };
      state.planVersion += 1;
      return undefined;
    }),
  ],
];
