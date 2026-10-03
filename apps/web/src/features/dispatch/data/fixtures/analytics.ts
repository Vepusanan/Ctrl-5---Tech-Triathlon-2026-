/** D10 · Analytics & forecast (Figma 2043:3551). Reefer, both depots, is copied from the frame. */
import type { z } from 'zod';
import type { forecastSchema } from '../../contracts';
import { dispatcher } from './guard';
import type { MockRoute } from './router';

type Forecast = z.infer<typeof forecastSchema>;

const reefer = [52, 55, 61, 58, 66, 63, 57, 56, 59, 64, 62, 58, 69, 60];
const share: Record<string, number> = { all: 1, peliyagoda: 0.62, kandy: 0.38 };

function forecast(vehicleClass: 'reefer' | 'dry', depot: string): Forecast {
  const part = share[depot] ?? 1;
  const scale = (vehicleClass === 'reefer' ? 1 : 0.73) * part;
  const capacity = Math.round((vehicleClass === 'reefer' ? 62 : 52) * part);
  const weeks = reefer.map((trips, index) => ({
    week: `W${35 + index}`,
    trips: Math.round(trips * scale),
    predicted: index >= 4,
  }));
  const over = weeks.filter((item) => item.predicted && item.trips > capacity);
  const worst = [...over].sort((a, b) => b.trips - a.trips)[0];
  const label = vehicleClass === 'reefer' ? 'reefer' : 'dry';
  const names = over.map((item) => item.week);
  return {
    vehicleClass,
    weekday: 'Saturday',
    depots: [
      { id: 'all', name: 'Both depots' },
      { id: 'peliyagoda', name: 'Peliyagoda DC' },
      { id: 'kandy', name: 'Kandy hub' },
    ],
    capacity,
    weeks,
    events: [
      { week: 'W39', label: 'W39 month-end payday', kind: 'payday' },
      { week: 'W44', label: 'W44 payday', kind: 'payday' },
      { week: 'W45', label: 'W45 Deepavali', kind: 'calendar' },
      { week: 'W47', label: 'W47 school term ends', kind: 'calendar' },
    ],
    insight:
      names.length === 0
        ? 'No week goes above what the fleet can run.'
        : `${['One week goes', 'Two weeks go', 'Three weeks go'][names.length - 1] ?? `${names.length} weeks go`} above what the fleet can run: ${
            names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
          }.`,
    gap: worst
      ? {
          week: worst.week,
          trips: worst.trips - capacity,
          detail: `${worst.week} · predicted ${worst.trips} ${label} trips vs ${capacity} the fleet can run.`,
        }
      : null,
    balance: {
      week: 'W39',
      rows: [
        {
          key: 'reefer-needed',
          label: 'Reefer needed',
          value: Math.round(66 * part),
          predicted: true,
        },
        {
          key: 'reefer-available',
          label: 'Reefer available',
          value: Math.round(62 * part),
          predicted: false,
        },
        { key: 'dry-needed', label: 'Dry needed', value: Math.round(48 * part), predicted: true },
        {
          key: 'dry-available',
          label: 'Dry available',
          value: Math.round(52 * part),
          predicted: false,
        },
      ],
    },
    actions: [
      { id: 'hire-vans', title: 'Hire 2 reefer vans', detail: 'W39 and W47 · Kandy hub' },
      { id: 'veh007-t2', title: 'Second trip for VEH007', detail: 'W44 only · +3 trips' },
      { id: 'friday', title: 'Move 4 dry trips to Friday', detail: 'Pre-load Style/Tech outlets' },
    ],
    anomaly: {
      week: 'W37',
      title: 'Kandy chilled demand ran 22% above forecast',
      bars: [
        { week: 'W35', percent: 100 },
        { week: 'W36', percent: 98 },
        { week: 'W37', percent: 122 },
        { week: 'W38', percent: 104 },
      ],
      evidence: 'Evidence: 3 new Fresh outlets opened in W37. Model retrains W40.',
    },
  };
}

export const analyticsRoutes: MockRoute[] = [
  [
    'GET',
    '/analytics/forecast',
    dispatcher(({ query }) =>
      forecast(query.get('class') === 'dry' ? 'dry' : 'reefer', query.get('depot') ?? 'all'),
    ),
  ],
];
