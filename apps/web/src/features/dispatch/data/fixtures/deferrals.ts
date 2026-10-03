/** D06 · Deferral decision center (Figma 2102:6825). */
import type { CreateDeferralRequest } from '@waypoint/shared';
import type { z } from 'zod';
import type { DeferralCandidate, deferralBoardSchema } from '../../contracts';
import { dispatcher } from './guard';
import { NEXT_RUN, orderId, state } from './orders';
import { fail, type MockRoute } from './router';

type Board = z.infer<typeof deferralBoardSchema>;

const reefer = { severity: 'blocking', rule: 'REEFER_REQUIRED', label: 'No reefer slot' } as const;
const base = { temp: 'chilled', suggestedType: 'unavoidable' } as const;

const initial = (): DeferralCandidate[] => [
  {
    ...base,
    orderId: orderId(719),
    reference: 'ORD-260926-0719',
    outlet: { code: 'WF-F088', name: 'Kurunegala' },
    weightKg: 377,
    reasons: [reefer, { severity: 'neutral', rule: null, label: 'Wide window' }],
    facts: [
      { ok: false, text: 'No reefer trip has 377 kg free' },
      { ok: true, text: 'Window 06:30–08:30 is wide' },
      { ok: true, text: 'Not deferred in last 4 runs' },
    ],
    history: [false, false, false, false],
    daysSinceServed: 0,
    lastServed: '2026-09-24',
    rank: 1,
    priorityPercent: 23,
    advice: 'defer',
    repeat: false,
    suggestedReason: 'REEFER_REQUIRED',
    notice:
      'Your chilled order ORD-260926-0719 moves to Mon 28 Sep: every refrigerated vehicle at Peliyagoda is full tonight. It is first in the next queue.',
  },
  {
    ...base,
    orderId: orderId(602),
    reference: 'ORD-260926-0602',
    outlet: { code: 'WF-F031', name: 'Kadawatha' },
    weightKg: 402,
    reasons: [reefer, { severity: 'pressure', rule: 'WEIGHT_CAP', label: 'Heaviest chilled' }],
    facts: [
      { ok: false, text: 'No reefer trip has 402 kg free' },
      { ok: true, text: 'Heaviest chilled order, so deferring it frees the most space' },
      { ok: true, text: 'Not deferred in last 4 runs' },
    ],
    history: [false, false, false, false],
    daysSinceServed: 0,
    lastServed: '2026-09-25',
    rank: 2,
    priorityPercent: 31,
    advice: 'defer',
    repeat: false,
    suggestedReason: 'REEFER_REQUIRED',
    notice:
      'Your chilled order ORD-260926-0602 moves to Mon 28 Sep: every refrigerated vehicle at Peliyagoda is full tonight. It is first in the next queue.',
  },
  {
    ...base,
    orderId: orderId(3003),
    reference: 'ORD-260926-0644',
    outlet: { code: 'WF-F044', name: 'Ja-Ela' },
    weightKg: 188,
    reasons: [{ severity: 'pressure', rule: 'REEFER_REQUIRED', label: 'Reefer T2 only' }],
    facts: [
      { ok: false, text: 'Fits only on a reefer second trip' },
      { ok: true, text: 'Not deferred in last 4 runs' },
    ],
    history: [false, false, false, false],
    daysSinceServed: 0,
    lastServed: '2026-09-25',
    rank: 3,
    priorityPercent: 40,
    advice: 'serve',
    repeat: false,
    suggestedReason: 'REEFER_REQUIRED',
    suggestedType: 'prioritized',
    notice:
      'Your chilled order ORD-260926-0644 moves to Mon 28 Sep: refrigerated space went to outlets that have waited longer.',
  },
  {
    ...base,
    orderId: orderId(3002),
    reference: 'ORD-260926-0640',
    outlet: { code: 'WF-F040', name: 'Ragama' },
    weightKg: 210,
    reasons: [{ severity: 'pressure', rule: 'FUEL_QUOTA', label: '+18 km detour' }],
    facts: [
      { ok: false, text: 'Adds an 18 km detour to the nearest trip' },
      { ok: false, text: 'Deferred once in the last 4 runs' },
    ],
    history: [false, false, true, false],
    daysSinceServed: 1,
    lastServed: '2026-09-24',
    rank: 4,
    priorityPercent: 48,
    advice: 'serve',
    repeat: false,
    suggestedReason: 'FUEL_QUOTA',
    suggestedType: 'prioritized',
    notice:
      'Your order ORD-260926-0640 moves to Mon 28 Sep: tonight’s route could not reach your outlet within its fuel budget.',
  },
  {
    ...base,
    orderId: orderId(587),
    reference: 'ORD-260926-0587',
    outlet: { code: 'WF-F058', name: 'Peradeniya' },
    weightKg: 286,
    reasons: [
      { severity: 'pressure', rule: 'WINDOW_MISSED', label: 'Tight 05:30–07:30' },
      { severity: 'neutral', rule: null, label: 'Van only' },
    ],
    facts: [
      { ok: false, text: 'Window 05:30–07:30 is tight' },
      { ok: false, text: 'Outlet takes vans only' },
      { ok: false, text: 'Deferred twice in the last 4 runs' },
    ],
    history: [true, true, false, false],
    daysSinceServed: 2,
    lastServed: '2026-09-23',
    rank: 5,
    priorityPercent: 58,
    advice: 'serve',
    repeat: false,
    suggestedReason: 'WINDOW_MISSED',
    suggestedType: 'prioritized',
    notice:
      'Your chilled order ORD-260926-0587 moves to Mon 28 Sep: no van could reach your outlet inside its 05:30–07:30 window.',
  },
  {
    ...base,
    orderId: orderId(412),
    reference: 'ORD-260926-0412',
    outlet: { code: 'WF-F023', name: 'Kiribathgoda' },
    weightKg: 344,
    reasons: [reefer],
    facts: [
      { ok: false, text: 'No reefer trip has 344 kg free' },
      { ok: false, text: 'Deferred in 3 of the last 4 runs' },
      { ok: false, text: 'Last served 3 days ago' },
    ],
    history: [true, true, false, true],
    daysSinceServed: 3,
    lastServed: '2026-09-22',
    rank: 6,
    priorityPercent: 83,
    advice: 'serve',
    repeat: true,
    suggestedReason: 'REEFER_REQUIRED',
    notice:
      'Your chilled order ORD-260926-0412 moves to Mon 28 Sep: every refrigerated vehicle at Peliyagoda is full tonight. We are sorry this outlet waits again; it is first in the next queue.',
  },
];

const policies = [
  {
    id: 'policy-v2',
    name: 'Policy v2',
    weights: [
      { label: 'Days since served', percent: 40 },
      { label: 'Past deferrals', percent: 30 },
      { label: 'Order value', percent: 15 },
      { label: 'Window slack', percent: 15 },
    ],
  },
  {
    id: 'policy-v1',
    name: 'Policy v1',
    weights: [
      { label: 'Days since served', percent: 50 },
      { label: 'Past deferrals', percent: 50 },
    ],
  },
];

let candidates = initial();

function board(policyId: string | null): Board {
  const policy = policies.find((item) => item.id === policyId) ?? policies[0];
  const short = candidates.filter((item) => item.advice === 'defer');
  return {
    planVersion: state.planVersion,
    nextRun: NEXT_RUN,
    shortage:
      short.length > 0
        ? {
            label: 'Reefer short by',
            count: short.length,
            detail: `chilled ${short.length === 1 ? 'order' : 'orders'} · ${short
              .reduce((sum, item) => sum + item.weightKg, 0)
              .toLocaleString('en-GB')} kg`,
            neededPercent: 92,
            capacityPercent: 85,
            capacityLabel: 'Reefer capacity',
          }
        : null,
    unallocated: state.orders.filter((order) => order.state.kind === 'unallocated').length,
    policy: { id: policy?.id ?? 'policy-v2', weights: policy?.weights ?? [] },
    policies: policies.map(({ id, name }) => ({ id, name })),
    candidates,
  };
}

export const deferralRoutes: MockRoute[] = [
  [
    'GET',
    '/planning/runs/:date/deferral-candidates',
    dispatcher(({ query }) => board(query.get('policy'))),
  ],
  [
    'POST',
    '/deferrals',
    dispatcher(({ body }) => {
      const request = body as CreateDeferralRequest;
      if (!request.reasonCode) {
        return fail(400, 'VALIDATION_ERROR', 'A deferral needs a reason code.');
      }
      const candidate = candidates.find((item) => item.orderId === request.orderId);
      if (candidate?.repeat && !request.note) {
        return fail(400, 'VALIDATION_ERROR', 'A repeat deferral needs a written justification.');
      }
      candidates = candidates
        .filter((item) => item.orderId !== request.orderId)
        .map((item, index) => ({ ...item, rank: index + 1 }));
      const order = state.orders.find((item) => item.id === request.orderId);
      if (order) order.state = { kind: 'held', until: NEXT_RUN };
      for (const vehicle of state.fleet) {
        for (const trip of vehicle.trips) {
          trip.stops = trip.stops.filter((item) => item.orderId !== request.orderId);
        }
      }
      state.confirmedDeferrals += 1;
      state.planVersion += 1;
      return { id: `deferral-${state.confirmedDeferrals}`, ...request };
    }),
  ],
];
