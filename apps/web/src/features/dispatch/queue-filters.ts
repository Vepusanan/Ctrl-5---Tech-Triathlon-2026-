import type { TagKind } from '../../components/waypoint';
import type { QueueFilters, QueueOrder, QueueTag } from './contracts';

export const tagKinds: Record<QueueTag, TagKind> = {
  tight_window: 'tight-window',
  van_only: 'van-only',
  repeat_deferral: 'repeat-deferral',
  mall_window: 'mall-window',
  high_value: 'high-value',
  fragile: 'fragile',
};

const tagLabels: Record<QueueTag, string> = {
  tight_window: 'Tight window',
  van_only: 'Van only',
  repeat_deferral: 'Repeat deferral',
  mall_window: 'Mall window',
  high_value: 'High value',
  fragile: 'Fragile',
};

const stateLabels = { unallocated: 'Unallocated', allocated: 'Allocated', held: 'Held · next run' };

export function matches(order: QueueOrder, filters: QueueFilters): boolean {
  if (filters.temp && order.temp !== filters.temp) return false;
  if (filters.state && order.state.kind !== filters.state) return false;
  if (filters.tag && !order.tags.includes(filters.tag)) return false;
  if (filters.brand && order.brand !== filters.brand) return false;
  if (filters.depot && order.outlet.depot !== filters.depot) return false;
  return true;
}

export const sameFilters = (a: QueueFilters, b: QueueFilters) =>
  a.temp === b.temp &&
  a.state === b.state &&
  a.tag === b.tag &&
  a.brand === b.brand &&
  a.depot === b.depot;

export const hasFilters = (filters: QueueFilters) => Object.values(filters).some(Boolean);

export type FilterKey = keyof QueueFilters;

/** One entry per active filter, as shown on the chips: "Temp · Chilled". */
export function filterChips(filters: QueueFilters): { key: FilterKey; label: string }[] {
  const chips: { key: FilterKey; label: string }[] = [];
  if (filters.temp) {
    chips.push({
      key: 'temp',
      label: `Temp · ${filters.temp === 'chilled' ? 'Chilled' : 'Ambient'}`,
    });
  }
  if (filters.state) chips.push({ key: 'state', label: `Status · ${stateLabels[filters.state]}` });
  if (filters.tag) chips.push({ key: 'tag', label: `Constraint · ${tagLabels[filters.tag]}` });
  if (filters.brand) chips.push({ key: 'brand', label: `Brand · ${filters.brand}` });
  if (filters.depot) chips.push({ key: 'depot', label: `Depot · ${filters.depot}` });
  return chips;
}

/** Every value a filter can take, for the filter panel and the "Add filter" picker. */
export function filterChoices(orders: readonly QueueOrder[]) {
  const depots = [...new Set(orders.map((order) => order.outlet.depot))].sort();
  return {
    temp: [
      { value: 'chilled', label: 'Chilled' },
      { value: 'ambient', label: 'Ambient' },
    ],
    state: Object.entries(stateLabels).map(([value, label]) => ({ value, label })),
    tag: Object.entries(tagLabels).map(([value, label]) => ({ value, label })),
    brand: ['Fresh', 'Style', 'Tech'].map((value) => ({ value, label: value })),
    depot: depots.map((value) => ({ value, label: value })),
  } satisfies Record<FilterKey, { value: string; label: string }[]>;
}

export const filterNames: Record<FilterKey, string> = {
  temp: 'Temp',
  state: 'Status',
  tag: 'Constraint',
  brand: 'Brand',
  depot: 'Depot',
};

/** Returns the filters with one key set, or cleared when the value is empty. */
export function withFilter(filters: QueueFilters, key: FilterKey, value: string): QueueFilters {
  const next: Record<string, string | undefined> = { ...filters };
  if (value) next[key] = value;
  else delete next[key];
  return next as QueueFilters;
}
