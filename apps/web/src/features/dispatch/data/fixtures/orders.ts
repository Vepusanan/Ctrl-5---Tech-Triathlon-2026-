/** Planning queue fixture shared by the Dispatcher mocks. */
import type { BoardVehicle, QueueOrder } from '../../contracts';

// D02 · Planning queue (2038:1782). The first eight rows are the Figma rows; the rest are
// generated so the totals match the frame: 146 confirmed, 18 unallocated, 61 chilled, 7 held.
export const orderId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const NEXT_RUN = '2026-09-28';
export const KANDY = 'Kandy hub';
export const PELIYAGODA = 'Peliyagoda DC';

const figmaOrders: QueueOrder[] = [
  {
    id: orderId(587),
    reference: 'ORD-260926-0587',
    outlet: { code: 'WF-F058', name: 'Peradeniya', depot: KANDY },
    brand: 'Fresh',
    temp: 'chilled',
    weightKg: 286,
    window: { open: '05:30', close: '07:30' },
    tags: ['tight_window', 'van_only'],
    history: [true, true, false, false],
    state: { kind: 'unallocated' },
  },
  {
    id: orderId(412),
    reference: 'ORD-260926-0412',
    outlet: { code: 'WF-F023', name: 'Kiribathgoda', depot: PELIYAGODA },
    brand: 'Fresh',
    temp: 'chilled',
    weightKg: 344,
    window: { open: '06:00', close: '08:00' },
    tags: ['repeat_deferral'],
    history: [true, true, false, true],
    state: { kind: 'unallocated' },
  },
  {
    id: orderId(712),
    reference: 'ORD-260926-0712',
    outlet: { code: 'WF-F071', name: 'Gampola', depot: KANDY },
    brand: 'Fresh',
    temp: 'chilled',
    weightKg: 344,
    window: { open: '05:30', close: '07:45' },
    tags: ['van_only'],
    history: [false, false, false, false],
    state: { kind: 'allocated', vehicleId: 'VEH051', tripNo: 1 },
  },
  {
    id: orderId(655),
    reference: 'ORD-260926-0655',
    outlet: { code: 'WF-F070', name: 'Pilimatalawa', depot: KANDY },
    brand: 'Fresh',
    temp: 'ambient',
    weightKg: 218,
    window: { open: '06:00', close: '09:00' },
    tags: ['van_only'],
    history: [false, false, false, false],
    state: { kind: 'allocated', vehicleId: 'VEH051', tripNo: 1 },
  },
  {
    id: orderId(331),
    reference: 'ORD-260926-0331',
    outlet: { code: 'WS-S112', name: 'Kandy City Centre', depot: KANDY },
    brand: 'Style',
    temp: 'ambient',
    weightKg: 132,
    window: { open: '08:00', close: '09:30' },
    tags: ['mall_window'],
    history: [false, true, false, false],
    state: { kind: 'allocated', vehicleId: 'VEH033', tripNo: 1 },
  },
  {
    id: orderId(498),
    reference: 'ORD-260926-0498',
    outlet: { code: 'WT-T045', name: 'Nugegoda', depot: PELIYAGODA },
    brand: 'Tech',
    temp: 'ambient',
    weightKg: 96,
    window: { open: '09:00', close: '12:00' },
    tags: ['high_value', 'fragile'],
    history: [false, false, false, false],
    state: { kind: 'unallocated' },
  },
  {
    id: orderId(602),
    reference: 'ORD-260926-0602',
    outlet: { code: 'WF-F031', name: 'Kadawatha', depot: PELIYAGODA },
    brand: 'Fresh',
    temp: 'chilled',
    weightKg: 402,
    window: { open: '05:00', close: '07:00' },
    tags: [],
    history: [false, false, true, false],
    state: { kind: 'allocated', vehicleId: 'VEH007', tripNo: 2 },
  },
  {
    id: orderId(719),
    reference: 'ORD-260926-0719',
    outlet: { code: 'WF-F088', name: 'Kurunegala', depot: PELIYAGODA },
    brand: 'Fresh',
    temp: 'chilled',
    weightKg: 377,
    window: { open: '06:30', close: '08:30' },
    tags: ['tight_window'],
    history: [false, false, false, false],
    state: { kind: 'held', until: NEXT_RUN },
  },
];

const places = [
  'Maharagama',
  'Wattala',
  'Katugastota',
  'Negombo',
  'Dehiwala',
  'Matale',
  'Ja-Ela',
  'Kegalle',
  'Moratuwa',
  'Gampaha',
  'Kelaniya',
  'Akurana',
];
const windows = [
  { open: '05:00', close: '07:30' },
  { open: '06:00', close: '08:30' },
  { open: '07:00', close: '10:00' },
  { open: '09:00', close: '12:00' },
];

/** 138 further orders: 15 unallocated, 6 held and 117 allocated. */
function generatedOrder(index: number): QueueOrder {
  const unallocated = index < 15;
  const held = index >= 15 && index < 21;
  const chilled = index < 4 || (index >= 15 && index < 18) || (index >= 21 && index < 70);
  const mall = index >= 4 && index < 8;
  const brand = chilled
    ? 'Fresh'
    : mall
      ? 'Style'
      : ((['Fresh', 'Style', 'Tech'] as const)[index % 3] ?? 'Fresh');
  const number = 100 + index * 2;
  const tags: QueueOrder['tags'] = [];
  if (index < 2) tags.push('repeat_deferral');
  if (index === 2) tags.push('van_only');
  if (mall) tags.push('mall_window');
  if (index % 17 === 9) tags.push('tight_window');
  // D03 shows two of these in the Unallocated pane: 0801 Katugastota and 0810 Digana.
  // D05: orders 21 and 24 are the two chilled orders wrongly placed on the dry van VEH052.
  const onDryVan = index === 21 || index === 24;
  const named =
    index === 1
      ? 'Katugastota'
      : index === 10 || index === 21
        ? 'Digana'
        : index === 24
          ? 'Teldeniya'
          : undefined;
  const weight = index === 1 ? 188 : index === 10 ? 142 : 80 + ((index * 37) % 360);
  return {
    id: orderId(1000 + index),
    reference: `ORD-260926-${String(800 + index).padStart(4, '0')}`,
    outlet: {
      code: `W${brand.charAt(0)}-${brand.charAt(0)}${String(number).padStart(3, '0')}`,
      name: named ?? places[index % places.length] ?? 'Colombo',
      depot: named || index % 3 === 0 ? KANDY : PELIYAGODA,
    },
    brand,
    temp: chilled ? 'chilled' : 'ambient',
    weightKg: weight,
    window: windows[index % windows.length] ?? { open: '06:00', close: '09:00' },
    tags,
    history: index < 2 ? [false, true, true, false] : [false, false, index % 11 === 5, false],
    state: unallocated
      ? { kind: 'unallocated' }
      : held
        ? { kind: 'held', until: NEXT_RUN }
        : {
            kind: 'allocated',
            vehicleId: onDryVan ? 'VEH052' : `VEH${String(1 + (index % 58)).padStart(3, '0')}`,
            tripNo: !onDryVan && index % 4 === 0 ? 2 : 1,
          },
  };
}

const initialOrders = (): QueueOrder[] => [
  ...figmaOrders,
  ...Array.from({ length: 138 }, (_, index) => generatedOrder(index)),
];

/** Mutable planning state shared by the Dispatcher mocks. Resets on page reload. */
export const state = {
  orders: initialOrders(),
  fleet: [] as BoardVehicle[],
  /** Draft plan version. The automatic run produced v1; edits since took it to v4. */
  planVersion: 4,
  /** The D04 weight fix for VEH014 trip 2 has been applied. */
  weightFixApplied: false,
  /** Deferrals confirmed in this session, on top of the 11 the run started with. */
  confirmedDeferrals: 0,
};
export const resetOrders = () => {
  state.orders = initialOrders();
};
