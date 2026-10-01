import type { OrderLite, Outlet, PriorityWeights } from '@waypoint/shared';
import { WIDE_DELIVERY_WINDOW_MIN } from './constants.ts';
import { parseTimeOfDay } from './schedule.ts';

/** Transparent breakdown of SYSTEM_DESIGN §7.4. `total` is the sum of the factors. */
export type PriorityScore = {
  total: number;
  deferredYesterday: number;
  daysSinceLastServed: number;
  chilled: number;
  freshBefore8: number;
  tightWindow: number;
};

/**
 * Score one order with the dispatcher's weights.
 * Days since last served are capped by `policy.daysSinceLastServedMax` before multiplying.
 * Fresh orders receive the morning-commitment weight. Tightness is 0 for a window at least
 * `WIDE_DELIVERY_WINDOW_MIN` long and rises linearly to `policy.tightWindowMax`.
 */
export function scoreOrder(
  order: OrderLite,
  outlet: Outlet,
  policy: PriorityWeights,
): PriorityScore {
  const deferredYesterday = order.deferredYesterday ? policy.deferredYesterday : 0;
  const cappedDays = Math.min(order.daysSinceLastServed, policy.daysSinceLastServedMax);
  const daysSinceLastServed = cappedDays * policy.perDaySinceLastServed;
  const chilled = order.temp === 'chilled' ? policy.chilled : 0;
  const freshBefore8 = order.brand === 'Fresh' ? policy.freshBefore8 : 0;
  const tightWindow = tightWindowPoints(outlet, policy.tightWindowMax);
  return {
    total: deferredYesterday + daysSinceLastServed + chilled + freshBefore8 + tightWindow,
    deferredYesterday,
    daysSinceLastServed,
    chilled,
    freshBefore8,
    tightWindow,
  };
}

function tightWindowPoints(outlet: Outlet, maxPoints: number): number {
  if (maxPoints <= 0 || WIDE_DELIVERY_WINDOW_MIN <= 0) return 0;
  const span = effectiveWindowMin(outlet);
  const tightness = Math.min(1, Math.max(0, 1 - span / WIDE_DELIVERY_WINDOW_MIN));
  return tightness * maxPoints;
}

/** Delivery window, narrowed to the mall window when the outlet has one. */
function effectiveWindowMin(outlet: Outlet): number {
  let open = parseTimeOfDay(outlet.window.open);
  let close = parseTimeOfDay(outlet.window.close);
  if (outlet.mallWindow) {
    open = Math.max(open, parseTimeOfDay(outlet.mallWindow.open));
    close = Math.min(close, parseTimeOfDay(outlet.mallWindow.close));
  }
  return Math.max(0, close - open);
}
