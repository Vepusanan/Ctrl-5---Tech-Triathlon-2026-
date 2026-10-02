import type { Outlet, StopStatus, TripStatus } from '@waypoint/shared';
import type { Status } from '../../components/waypoint';
import type { DriverIconName } from './shell';

// Picked from a list, never typed while driving (SYSTEM_DESIGN §10.3). The API stores the
// chosen text as the failure reason, and the store and dispatcher read it as written.
export const FAILURE_REASONS = [
  'Customer unavailable',
  'Outlet closed',
  'Damaged goods',
  'Shortage / missing items',
  'Wrong or incomplete address',
  'Vehicle / access issue',
  'Other',
] as const;

// Figma chip icons for each reason the API already accepts.
export const reasonIcon: Record<(typeof FAILURE_REASONS)[number], DriverIconName> = {
  'Customer unavailable': 'user',
  'Outlet closed': 'lock-inverse',
  'Damaged goods': 'xoct',
  'Shortage / missing items': 'minus',
  'Wrong or incomplete address': 'nav',
  'Vehicle / access issue': 'slash',
  Other: 'more',
};

export const dockLabel: Record<Outlet['dockType'], string> = {
  rear_dock: 'Rear dock',
  street: 'Street',
  mall_bay: 'Mall bay',
};

/** Figma shows the place first ("Gampola · WF-F071"); the API's place is the outlet district. */
export const stopTitle = (outletId: string, outlet: Outlet | undefined) =>
  outlet ? `${outlet.district} · ${outletId}` : outletId;

export const windowRange = (outlet: Outlet | undefined) =>
  outlet ? `${outlet.window.open}–${outlet.window.close}` : null;

export const percent = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

export function stopBadge(status: StopStatus, late: boolean): { status: Status; label?: string } {
  switch (status) {
    case 'pending':
      return { status: 'not-started', label: 'Not arrived' };
    case 'arrived':
      return late ? { status: 'late', label: 'Arrived late' } : { status: 'arrived' };
    case 'delivered':
      return { status: late ? 'delivered-late' : 'delivered' };
    case 'failed':
      return { status: 'failed', label: 'Not delivered' };
  }
}

export const tripBadge: Record<TripStatus, { status: Status; label: string }> = {
  planned: { status: 'planning', label: 'Planned' },
  published: { status: 'allocated', label: 'Waiting to load' },
  loading: { status: 'loading', label: 'Loading' },
  ready: { status: 'ready', label: 'Ready to start' },
  departed: { status: 'departed', label: 'On the road' },
  completed: { status: 'completed', label: 'Completed' },
  blocked: { status: 'blocked', label: 'Blocked' },
};
