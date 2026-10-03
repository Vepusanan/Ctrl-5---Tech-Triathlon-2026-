/** D12 · Vehicle unavailable · replan (Figma 2044:3828). VEH052 is copied from the frame. */
import type { z } from 'zod';
import type { replanSchema } from '../../contracts';
import { dispatcher } from './guard';
import { actor } from './review';
import { fail, type MockRoute } from './router';

type Replan = z.infer<typeof replanSchema>;

let published: Replan['published'] = null;

const veh052 = (): Replan => ({
  vehicleId: 'VEH052',
  markedAt: '2026-09-26T03:40:00+05:30',
  reason: 'workshop',
  phase: 'before loading',
  planVersion: 4,
  nextVersion: 5,
  orders: 9,
  feasible: true,
  moves: [
    { vehicleId: 'VEH033', tripNo: 2, orders: 4, loadPercent: 84 },
    { vehicleId: 'VEH049', tripNo: 2, orders: 3, loadPercent: 78 },
    { vehicleId: 'VEH007', tripNo: 2, orders: 2, loadPercent: 92 },
  ],
  insight: 'Every order keeps its window; one trip goes near its reefer limit.',
  impact: { tripsRemoved: 2, deferred: 0, secondTrips: 3 },
  checks: [
    { key: 'reefer', label: 'Chilled stays on reefer', state: 'pass' },
    { key: 'trips', label: 'Trips ≤ 2 per vehicle', state: 'pass' },
    { key: 'weight', label: 'Weight under limit on all 3', state: 'pass' },
    { key: 'veh007', label: 'VEH007 T2 reefer 92%', state: 'warn' },
  ],
  lateRisk: {
    before: 6,
    after: 8,
    note: 'Two Kandy stops move to a second trip after 09:30. Stores get a new ETA window on publish.',
  },
  acknowledge: [
    { key: 'loaders', label: 'Loaders · dock 3, 4', count: 2, acknowledged: 0 },
    { key: 'drivers', label: 'Drivers · 3 routes', count: 3, acknowledged: 0 },
    { key: 'stores', label: 'Stores · new ETA', count: 9, acknowledged: 0 },
  ],
  published,
});

const find = (vehicleId: string | undefined) =>
  vehicleId === 'VEH052'
    ? veh052()
    : fail(
        404,
        'NOT_FOUND',
        `${vehicleId} is not marked unavailable, so there is nothing to replan.`,
      );

export const replanRoutes: MockRoute[] = [
  [
    'GET',
    '/planning/runs/:date/replans/:vehicleId',
    dispatcher(({ params }) => find(params.vehicleId)),
  ],
  [
    'POST',
    '/planning/runs/:date/replans/:vehicleId/publish',
    dispatcher(({ params }) => {
      if (params.vehicleId === 'VEH052') {
        if (published) return fail(409, 'VERSION_CONFLICT', 'Plan v5 is already published.');
        published = { at: '2026-09-26T03:52:00+05:30', by: actor() };
      }
      return find(params.vehicleId);
    }),
  ],
];
