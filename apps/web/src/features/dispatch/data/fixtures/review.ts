/** D08 · Review & publish and D08a · Plan published (Figma 2040:3555, 2040:3969). */
import type { z } from 'zod';
import type { planReviewSchema } from '../../contracts';
import { dispatcher } from './guard';
import { state } from './orders';
import { fail, type MockRoute } from './router';
import { currentUser, scenarioNow } from './session';
import { report } from './validation';

type Review = z.infer<typeof planReviewSchema>;

let published: { at: string; by: string } | null = null;
/** The signed-in user as the plan shows them, for example "N. Fernando". */
export function actor() {
  const [first = '', ...rest] = (currentUser()?.name ?? 'Dispatcher').split(' ');
  return `${first.charAt(0)}. ${rest.join(' ')}`.trim();
}

const day = (time: string) => `2026-09-26T${time}:00+05:30`;
const night = (time: string) => `2026-09-25T${time}:00+05:30`;
const AT_RISK = [3, 9, 17, 26, 33, 48];
const TRIPS = 58;

function review(): Review {
  const { violations, risks } = report();
  const deferred = 2 + state.confirmedDeferrals;
  const chilled = state.orders.filter((order) => order.temp === 'chilled').length;
  const reefer = violations.find((item) => item.rule === 'REEFER_REQUIRED');
  return {
    planVersion: state.planVersion,
    orders: state.orders.length - deferred,
    trips: TRIPS,
    deferred,
    quality: {
      score: 86,
      delta: 4,
      previousVersion: state.planVersion - 1,
      factors: [
        { key: 'on-time', label: 'On time', percent: 92 },
        { key: 'fill', label: 'Vehicle fill', percent: 81 },
        { key: 'fairness', label: 'Fairness', percent: 88 },
        { key: 'distance', label: 'Distance', percent: 64 },
      ],
      note: 'Higher is better. Fairness uses policy v2 weights.',
    },
    checks: [
      violations.length === 0
        ? {
            key: 'violations',
            state: 'pass',
            title: 'No hard violations',
            detail: `${state.orders.length} orders checked`,
          }
        : {
            key: 'violations',
            state: 'fail',
            title: `${violations.length} hard ${violations.length === 1 ? 'violation' : 'violations'}`,
            detail: 'Fix in Validation before publishing',
          },
      {
        key: 'trips',
        state: 'pass',
        title: 'Trips ≤ 2 per vehicle',
        detail: `${TRIPS} trips on 41 vehicles`,
      },
      reefer
        ? {
            key: 'chilled',
            state: 'fail',
            title: 'Chilled on a dry vehicle',
            detail: `${reefer.orderIds.length} chilled orders on ${reefer.vehicleId}`,
          }
        : {
            key: 'chilled',
            state: 'pass',
            title: 'Chilled on reefer only',
            detail: `${chilled} chilled orders`,
          },
      {
        key: 'deferrals',
        state: 'pass',
        title: `${deferred} deferrals, ${deferred === 2 ? 'both' : 'all'} with reasons`,
        detail: 'Notices ready',
      },
      {
        key: 'risks',
        state: 'warn',
        title: `${risks.length} risks acknowledged`,
        detail: 'by N. Fernando 17:44',
      },
    ],
    lateRisk: {
      trips: Array.from({ length: TRIPS }, (_, index) => AT_RISK.includes(index)),
      model: 'Model v1.3',
    },
    notify: [
      { key: 'loaders', label: 'Loaders · 12 docks', count: 12 },
      { key: 'drivers', label: `Drivers · route v${state.planVersion}`, count: TRIPS },
      { key: 'stores', label: 'Stores · ETA window', count: state.orders.length - deferred },
      { key: 'deferrals', label: 'Stores · deferral notice', count: deferred },
    ],
    windowNote: 'Loaders see the plan at 03:00; stores get ETAs now.',
    published: published && {
      at: published.at,
      by: published.by,
      trips: TRIPS,
      drivers: {
        done: 41,
        total: TRIPS,
        recent: { count: 12, minutes: 5 },
        note: `17 still to open route v${state.planVersion}. Reminder goes at 03:30.`,
      },
      loaders: { done: 3, total: 12, note: 'Docks open at 03:00.' },
      stores: {
        done: 131,
        total: state.orders.length - deferred,
        note: `${deferred} deferral notices delivered.`,
      },
      timeline: [
        { key: 'loading', at: day('03:00'), label: 'Loading' },
        { key: 'departures', at: day('04:00'), label: 'Departures' },
        { key: 'first_stops', at: day('05:30'), label: 'First stops' },
        { key: 'last_stop', at: day('11:00'), label: 'Last stop' },
      ],
      timelineNote: 'Monitoring moves to Live operations at 04:00.',
      versions: [
        {
          version: state.planVersion,
          at: published.at,
          summary: `Published · ${deferred} deferred`,
          live: true,
        },
        {
          version: state.planVersion - 1,
          at: night('17:20'),
          summary: 'Draft · weight fix',
          live: false,
        },
        {
          version: state.planVersion - 2,
          at: night('16:58'),
          summary: 'Draft · advisor run',
          live: false,
        },
        {
          version: state.planVersion - 3,
          at: night('16:21'),
          summary: 'Draft · auto-allocated',
          live: false,
        },
      ].filter((item) => item.version > 0),
    },
  };
}

export const reviewRoutes: MockRoute[] = [
  ['GET', '/planning/runs/:date/review', dispatcher(review)],
  [
    'POST',
    '/planning/runs/:date/publish',
    dispatcher(() => {
      const blocking = report().violations.length;
      if (blocking > 0) {
        return fail(
          422,
          'CONSTRAINT_VIOLATION',
          `${blocking} hard ${blocking === 1 ? 'violation blocks' : 'violations block'} publishing. Fix them in Validation, then publish.`,
        );
      }
      published = { at: scenarioNow(), by: actor() };
      return { planVersion: state.planVersion, publishedAt: published.at };
    }),
  ],
];
