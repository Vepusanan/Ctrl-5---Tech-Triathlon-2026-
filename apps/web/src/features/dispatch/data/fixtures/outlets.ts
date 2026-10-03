/** D13 · Outlets (Figma 2106:7017). The first seven rows and the Gampola profile are the frame. */
import type { z } from 'zod';
import type { OutletAccess, OutletDelivery, OutletRow, outletProfileSchema } from '../../contracts';
import { dispatcher } from './guard';
import { KANDY, orderId, PELIYAGODA, state } from './orders';
import { fail, type MockRoute } from './router';
import { SERVICE_DATE } from './session';

type Profile = z.infer<typeof outletProfileSchema>;
type Brand = OutletRow['brand'];

const TOTAL = 612;
const none = [false, false, false, false];
/** Eight arrivals, all on time except the one at `late`. */
const arrivals = (late?: number) => Array.from({ length: 8 }, (_, index) => index !== late);
const row = (
  code: string,
  name: string,
  brand: Brand,
  open: string,
  close: string,
  access: OutletAccess | null,
  late: number | undefined,
  deferrals: boolean[],
): OutletRow => ({
  code,
  name,
  brand,
  depot: KANDY,
  window: { open, close },
  access,
  arrivals: arrivals(late),
  deferrals,
});

const figmaRows: OutletRow[] = [
  row('WF-F071', 'Gampola', 'Fresh', '05:30', '07:45', 'van_only', 6, none),
  row('WF-F070', 'Pilimatalawa', 'Fresh', '06:00', '09:00', 'van_only', undefined, none),
  row('WF-F058', 'Peradeniya', 'Fresh', '05:30', '07:30', 'tight_window', 1, [
    true,
    true,
    false,
    false,
  ]),
  row('WS-S112', 'Kandy City Centre', 'Style', '08:00', '09:30', 'mall_window', undefined, [
    false,
    true,
    false,
    false,
  ]),
  row('WF-F088', 'Kurunegala', 'Fresh', '06:30', '08:30', null, 4, [false, false, false, true]),
  row('WT-T061', 'Katugastota', 'Tech', '09:00', '12:00', 'high_value', undefined, none),
  row('WF-F097', 'Digana', 'Fresh', '06:00', '08:00', null, 2, none),
];

const accessTags: OutletAccess[] = ['van_only', 'mall_window', 'tight_window', 'high_value'];
const towns = [
  'Battaramulla',
  'Panadura',
  'Kaduwela',
  'Homagama',
  'Kalutara',
  'Mawanella',
  'Nawalapitiya',
  'Kundasale',
  'Minuwangoda',
  'Piliyandala',
  'Horana',
  'Avissawella',
];
const brands: Brand[] = ['Fresh', 'Fresh', 'Style', 'Tech'];
const windows = [
  { open: '05:00', close: '07:30' },
  { open: '06:00', close: '08:30' },
  { open: '07:00', close: '10:00' },
  { open: '09:00', close: '12:00' },
];

/** The frame's rows, then the outlets with an order in this run, then the rest of the network. */
function directory(): OutletRow[] {
  const rows = new Map(figmaRows.map((item) => [item.code, item]));
  for (const [index, order] of state.orders.entries()) {
    if (rows.has(order.outlet.code)) continue;
    rows.set(order.outlet.code, {
      code: order.outlet.code,
      name: order.outlet.name,
      brand: order.brand,
      depot: order.outlet.depot,
      window: order.window,
      access: accessTags.find((tag) => order.tags.includes(tag)) ?? null,
      arrivals: arrivals(index % 3 === 0 ? index % 8 : undefined),
      deferrals: order.history,
    });
  }
  for (let index = 0; rows.size < TOTAL; index += 1) {
    const brand = brands[index % brands.length] ?? 'Fresh';
    const letter = brand.charAt(0);
    const code = `W${letter}-${letter}${String(400 + index)}`;
    rows.set(code, {
      code,
      name: `${towns[index % towns.length] ?? 'Colombo'} ${1 + Math.floor(index / towns.length)}`,
      brand,
      depot: index % 3 === 0 ? KANDY : PELIYAGODA,
      window: windows[index % windows.length] ?? { open: '06:00', close: '09:00' },
      access: index % 9 === 4 ? 'van_only' : index % 14 === 6 ? 'mall_window' : null,
      arrivals: arrivals(index % 4 === 0 ? index % 8 : undefined),
      deferrals: [false, index % 13 === 7, false, index % 19 === 3],
    });
  }
  return [...rows.values()];
}
const outlets = directory();

const gampola: Profile = {
  code: 'WF-F071',
  name: 'Waypoint Fresh Gampola',
  brand: 'Fresh',
  depot: KANDY,
  manager: 'T. Jayasinghe',
  phone: '+94 81 555 0171',
  window: { open: '05:30', close: '07:45' },
  onTime: { arrivals: 11, of: 12 },
  deferred: { count: 0, runs: 4 },
  avgUnloadMinutes: 14,
  notes: [
    { kind: 'access', text: 'Van-only rear lane · enter from Hill St.' },
    { kind: 'receiving', text: 'Receiving 05:30–07:45 · 2 staff' },
    { kind: 'storage', text: 'Chilled room · 40 cartons' },
  ],
  volume: {
    weekday: 'Saturday',
    weeks: [
      { week: 'W34', kg: 318 },
      { week: 'W35', kg: 332 },
      { week: 'W36', kg: 340 },
      { week: 'W37', kg: 326 },
      { week: 'W38', kg: 351 },
      { week: 'W39', kg: 344 },
    ],
    insight: 'Steady around 340 kg; chilled is 54% of it.',
  },
  nextDelivery: {
    serviceDate: SERVICE_DATE,
    orderId: orderId(712),
    state: 'received',
    arrivedAt: '2026-09-26T05:41:00+05:30',
    vehicleId: 'VEH051',
    tripNo: 1,
    note: '7 of 10 · top-up 09:50',
  },
};

const accessNotes: Record<OutletAccess, string> = {
  van_only: 'Van-only access · no trucks over 3.5 t',
  mall_window: 'Mall loading bay · booked slot only',
  tight_window: 'Short receiving window · arrive early',
  high_value: 'High-value goods · signature from the manager',
};

function delivery(code: string): OutletDelivery | null {
  const order = state.orders.find((item) => item.outlet.code === code);
  if (!order) return null;
  const allocated = order.state.kind === 'allocated' ? order.state : null;
  return {
    serviceDate: order.state.kind === 'held' ? order.state.until : SERVICE_DATE,
    orderId: order.id,
    state: order.state.kind === 'held' ? 'deferred' : order.state.kind,
    arrivedAt: null,
    vehicleId: allocated?.vehicleId ?? null,
    tripNo: allocated?.tripNo ?? null,
    note: `${order.weightKg} kg · ${order.temp}`,
  };
}

/** A profile for every other outlet, worked out from its directory row. */
function profile(outlet: OutletRow): Profile {
  const seed = Number(outlet.code.replace(/\D/g, ''));
  const late = outlet.arrivals.filter((onTime) => !onTime).length;
  const base = 180 + (seed % 9) * 20;
  const notes: Profile['notes'] = [
    {
      kind: 'receiving',
      text: `Receiving ${outlet.window.open}–${outlet.window.close} · ${1 + (seed % 3)} staff`,
    },
  ];
  if (outlet.access) notes.unshift({ kind: 'access', text: accessNotes[outlet.access] });
  if (outlet.brand === 'Fresh') {
    notes.push({ kind: 'storage', text: `Chilled room · ${20 + (seed % 5) * 10} cartons` });
  }
  return {
    code: outlet.code,
    name: `Waypoint ${outlet.brand} ${outlet.name}`,
    brand: outlet.brand,
    depot: outlet.depot,
    manager: null,
    phone: null,
    window: outlet.window,
    onTime: { arrivals: 12 - late, of: 12 },
    deferred: { count: outlet.deferrals.filter(Boolean).length, runs: outlet.deferrals.length },
    avgUnloadMinutes: 9 + (seed % 12),
    notes,
    volume: {
      weekday: 'Saturday',
      weeks: ['W34', 'W35', 'W36', 'W37', 'W38', 'W39'].map((week, index) => ({
        week,
        kg: base + ((seed + index * 7) % 5) * 6,
      })),
      insight: null,
    },
    nextDelivery: delivery(outlet.code),
  };
}

const list = (value: string | null) => value?.split(',').filter(Boolean) ?? [];

export const outletRoutes: MockRoute[] = [
  [
    'GET',
    '/outlets/directory',
    dispatcher(({ query }) => {
      const depot = query.get('depot');
      const term = query.get('q')?.trim().toLowerCase() ?? '';
      const brand = list(query.get('brand'));
      const access = list(query.get('access'));
      const limit = Number(query.get('limit')) || 50;
      const matching = outlets.filter(
        (outlet) =>
          (!depot || outlet.depot === depot) &&
          (!term || `${outlet.name} ${outlet.code}`.toLowerCase().includes(term)) &&
          (brand.length === 0 || brand.includes(outlet.brand)) &&
          (access.length === 0 || (outlet.access !== null && access.includes(outlet.access))),
      );
      return {
        total: outlets.length,
        depots: [PELIYAGODA, KANDY],
        matching: matching.length,
        items: matching.slice(0, limit),
      };
    }),
  ],
  [
    'GET',
    '/outlets/:code/profile',
    dispatcher(({ params }) => {
      if (params.code === gampola.code) return gampola;
      const outlet = outlets.find((item) => item.code === params.code);
      return outlet ? profile(outlet) : fail(404, 'NOT_FOUND', 'That outlet does not exist.');
    }),
  ],
];
