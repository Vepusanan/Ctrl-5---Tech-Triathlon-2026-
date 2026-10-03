/** D05 · Validation (Figma 2040:2166). Findings follow the shared planning state. */
import type { z } from 'zod';
import type { validationSchema } from '../../contracts';
import { dispatcher } from './guard';
import { orderId, state } from './orders';
import type { MockRoute } from './router';
import { scenarioNow } from './session';

type Report = z.infer<typeof validationSchema>;

let checkedAt = '2026-09-25T17:31:00+05:30';
const groupNames: Record<string, string> = {
  capacity: 'Weight',
  refrigeration: 'reefer',
  window: 'time windows',
};

export function report(): Report {
  const onDryVan = state.orders.filter(
    (order) =>
      order.temp === 'chilled' &&
      order.state.kind === 'allocated' &&
      order.state.vehicleId === 'VEH052',
  );
  const violations: Report['violations'] = [];
  if (!state.weightFixApplied) {
    violations.push({
      id: 'VEH014-2-weight',
      vehicleId: 'VEH014',
      tripNo: 2,
      rule: 'WEIGHT_CAP',
      group: 'capacity',
      summary: 'Weight 103%',
      detail: '1,236 kg on a 1,200 kg vehicle. Move one stop or split the order.',
      orderIds: [orderId(3001)],
    });
  }
  if (onDryVan.length > 0) {
    violations.push({
      id: 'VEH052-1-reefer',
      vehicleId: 'VEH052',
      tripNo: 1,
      rule: 'REEFER_REQUIRED',
      group: 'refrigeration',
      summary: 'Not refrigerated',
      detail: `${onDryVan.length} chilled ${
        onDryVan.length === 1 ? 'order' : 'orders'
      } on a dry box van. Chilled needs a reefer.`,
      orderIds: onDryVan.map((order) => order.id),
    });
  }
  const risks: Report['risks'] = [
    {
      id: 'reefer-capacity',
      group: 'refrigeration',
      title: 'Reefer capacity 94%',
      detail: 'VEH007 needs a second trip',
      percent: 94,
      lateRiskPercent: null,
      vehicleId: 'VEH007',
    },
    {
      id: 'VEH014-fuel',
      group: 'capacity',
      title: `VEH014 fuel ${state.weightFixApplied ? 91 : 88}%`,
      detail: 'Weekly quota',
      percent: state.weightFixApplied ? 91 : 88,
      lateRiskPercent: null,
      vehicleId: 'VEH014',
    },
    {
      id: 'peradeniya-window',
      group: 'window',
      title: 'Peradeniya window',
      detail: '05:30–07:30 is tight',
      percent: null,
      lateRiskPercent: 41,
      vehicleId: null,
    },
  ];
  const findings = [...violations, ...risks];
  const tally = new Map<string, number>();
  for (const item of findings) tally.set(item.group, (tally.get(item.group) ?? 0) + 1);
  const [first, second] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  return {
    planVersion: state.planVersion,
    checkedAt,
    orders: state.orders.length,
    passing: state.orders.length - findings.length,
    violations,
    risks,
    insight:
      first && second
        ? `${groupNames[first[0]] ?? first[0]} and ${groupNames[second[0]] ?? second[0]} cause ${
            first[1] + second[1]
          } of ${findings.length} findings.`
        : null,
  };
}

export const validationRoutes: MockRoute[] = [
  ['GET', '/planning/runs/:date/validation', dispatcher(report)],
  [
    'POST',
    '/planning/runs/:date/validation',
    dispatcher(() => {
      checkedAt = scenarioNow();
      return report();
    }),
  ],
];
