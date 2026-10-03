/** D07 · What-if simulator (Figma 2040:3236). Lever effects add up; the plan is never changed. */
import type { z } from 'zod';
import type { Lever, ScenarioMetric, scenarioResultSchema } from '../../contracts';
import { dispatcher } from './guard';
import { state } from './orders';
import type { MockRoute } from './router';

type Result = z.infer<typeof scenarioResultSchema>;

const BASE_COST = 308_000;
const baseline = { deferred: 2, reefer: 94, late: 6, onTime: 92 };

const levers: (Lever & { effect: typeof baseline; cost: number; says: string })[] = [
  {
    id: 'hire-reefer-van',
    kind: 'hire_vehicle',
    title: 'Hire 1 reefer van',
    detail: '+1 vehicle · Kandy hub',
    effect: { deferred: -2, reefer: -15, late: -2, onTime: 2 },
    cost: 12_000,
    says: 'Hiring one reefer van clears both deferrals',
  },
  {
    id: 'veh007-second-trip',
    kind: 'second_trip',
    title: 'VEH007 second trip',
    detail: 'T2 from 09:30',
    effect: { deferred: 0, reefer: -8, late: -1, onTime: 1 },
    cost: 6_500,
    says: 'A second trip for VEH007 frees reefer space',
  },
  {
    id: 'remove-veh052',
    kind: 'remove_vehicle',
    title: 'Remove VEH052',
    detail: 'Workshop Saturday',
    effect: { deferred: 2, reefer: 0, late: 1, onTime: -2 },
    cost: -4_000,
    says: 'Without VEH052 two more orders wait',
  },
  {
    id: 'cutoff-17',
    kind: 'shift_cutoff',
    title: 'Cutoff 16:00 → 17:00',
    detail: 'Store orders',
    effect: { deferred: 1, reefer: 3, late: 2, onTime: -3 },
    cost: 3_000,
    says: 'A later cutoff admits more orders but squeezes planning time',
  },
  {
    id: 'demand-10',
    kind: 'demand',
    title: 'Demand +10%',
    detail: 'Payday weekend',
    effect: { deferred: 3, reefer: 6, late: 2, onTime: -4 },
    cost: 9_000,
    says: 'Ten per cent more demand outgrows the fleet',
  },
];

const metrics = (values: typeof baseline): ScenarioMetric[] => [
  { key: 'deferred', label: 'Deferred orders', value: values.deferred, unit: '' },
  { key: 'reefer', label: 'Reefer load', value: values.reefer, unit: '%' },
  { key: 'late', label: 'Late-risk stops', value: values.late, unit: '' },
  { key: 'onTime', label: 'On-time (pred.)', value: values.onTime, unit: '%' },
];

function simulate(ids: readonly string[]): Result {
  const active = levers.filter((lever) => ids.includes(lever.id));
  const sum = (key: keyof typeof baseline) =>
    active.reduce((total, lever) => total + lever.effect[key], baseline[key]);
  const clamp = (value: number, max = Number.POSITIVE_INFINITY) =>
    Math.max(0, Math.min(max, value));
  const scenario = {
    deferred: clamp(sum('deferred')),
    reefer: clamp(sum('reefer'), 110),
    late: clamp(sum('late')),
    onTime: clamp(sum('onTime'), 100),
  };
  const amount = active.reduce((total, lever) => total + lever.cost, 0);
  const deltaPercent = Math.round((amount / BASE_COST) * 100);
  const lead = active[0];
  return {
    scenario: metrics(scenario),
    extraCost: { amount, currency: 'LKR', deltaPercent },
    insight: lead
      ? `${lead.says} and ${
          scenario.reefer < baseline.reefer
            ? `brings reefer load under ${Math.ceil(scenario.reefer / 5) * 5}%`
            : `puts reefer load at ${scenario.reefer}%`
        }, for ${Math.abs(deltaPercent)}% ${deltaPercent < 0 ? 'less' : 'more'} cost.`
      : null,
  };
}

const requested = (body: unknown) => (body as { levers?: string[] } | null)?.levers ?? [];

export const scenarioRoutes: MockRoute[] = [
  [
    'GET',
    '/planning/runs/:date/scenario',
    dispatcher(() => ({
      planVersion: state.planVersion,
      levers: levers.map(({ id, kind, title, detail }) => ({ id, kind, title, detail })),
      baseline: metrics(baseline),
    })),
  ],
  ['POST', '/planning/runs/:date/simulate', dispatcher(({ body }) => simulate(requested(body)))],
  [
    'POST',
    '/planning/runs/:date/simulate/apply',
    dispatcher(() => {
      state.planVersion += 1;
      return { planVersion: state.planVersion };
    }),
  ],
];
