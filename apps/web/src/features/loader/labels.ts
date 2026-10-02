import type { LoadingIssueType, LoadingStatus, LoadingStop, TripDetail } from '@waypoint/shared';
import type { Status } from '../../components/waypoint';
import { time } from '../store/shared';

export const loadingBadge: Record<LoadingStatus, Status> = {
  not_started: 'not-started',
  in_progress: 'loading',
  exception: 'loading-exception',
  ready: 'ready',
  departed: 'departed',
};

export const issueTypeLabel: Record<LoadingIssueType, string> = {
  missing: 'Missing',
  damaged: 'Damaged',
  short: 'Short',
};

export const tripName = (trip: Pick<TripDetail, 'vehicleId' | 'tripNo'>) =>
  `${trip.vehicleId} · Trip ${trip.tripNo}`;

/** The earliest planned arrival on a trip: the API has no departure time, so this stands in. */
export const firstArrival = (stops: readonly { seq: number; plannedArrival: string }[]) =>
  [...stops].sort((left, right) => left.seq - right.seq)[0]?.plannedArrival ?? null;

// Figma chip icons for the shortfall types the API records, at each export's own size.
export const issueTypeIcon: Record<LoadingIssueType, { src: string; size: number }> = {
  missing: { src: 'loader/box', size: 12 },
  damaged: { src: 'driver/xoct', size: 18 },
  short: { src: 'driver/minus', size: 24 },
};

export const unitsOf = (stops: readonly { order: { units: number } }[]) =>
  stops.reduce((total, stop) => total + stop.order.units, 0);

/** What changed between the plan the loader accepted and the current one, one line per change. */
export function planDiff(previous: readonly LoadingStop[], current: readonly LoadingStop[]) {
  const changes: { text: string; removed: boolean }[] = [];
  for (const old of previous) {
    const next = current.find((stop) => stop.order.id === old.order.id);
    const label = old.order.outletId;
    if (!next) {
      changes.push({ text: `${label}: order removed (${old.order.units} units)`, removed: true });
      continue;
    }
    if (old.seq !== next.seq) {
      changes.push({ text: `${label}: stop ${old.seq} → ${next.seq}`, removed: false });
    }
    if (old.order.units !== next.order.units) {
      changes.push({
        text: `${label}: ${old.order.units} → ${next.order.units} units`,
        removed: next.order.units < old.order.units,
      });
    }
    if (old.plannedArrival !== next.plannedArrival) {
      changes.push({
        text: `${label}: arrival ${time(old.plannedArrival)} → ${time(next.plannedArrival)}`,
        removed: false,
      });
    }
    if (old.chilled !== next.chilled) {
      changes.push({
        text: `${label}: ${old.chilled ? 'Chilled' : 'Ambient'} → ${next.chilled ? 'Chilled' : 'Ambient'}`,
        removed: false,
      });
    }
    if (old.access !== next.access) {
      changes.push({ text: `${label}: access ${old.access} → ${next.access}`, removed: false });
    }
  }
  for (const next of current) {
    if (!previous.some((stop) => stop.order.id === next.order.id)) {
      changes.push({
        text: `${next.order.outletId}: added at stop ${next.seq}, ${next.order.units} units`,
        removed: false,
      });
    }
  }
  return changes;
}
