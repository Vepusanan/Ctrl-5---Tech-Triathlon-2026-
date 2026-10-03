import { DASHBOARD_POLL_INTERVAL_MS, dashboardStreamEventTypeSchema } from '@waypoint/shared';
import { describe, expect, it } from 'vitest';
import {
  dispatchNotificationsKey,
  invalidationsFor,
  pollInterval,
} from '../src/features/dispatch/stream';

const DATE = '2026-06-26';
const USER = '00000000-0000-4000-8000-000000000001';
const keys = (type: Parameters<typeof invalidationsFor>[0]) =>
  invalidationsFor(type, DATE, USER).map((key) => JSON.stringify(key));

describe('invalidationsFor', () => {
  it('refreshes the dashboard for every event the stream sends', () => {
    for (const type of dashboardStreamEventTypeSchema.options) {
      expect(keys(type)).toContain(JSON.stringify(['dashboard', DATE]));
    }
  });

  it('refreshes the notification feed for the events that notify the dispatcher', () => {
    const notifying = [
      'loading.issue_recorded',
      'stop.failed',
      'receipt.confirmed',
      'sync.conflict',
    ] as const;
    for (const type of notifying) {
      expect(keys(type)).toContain(JSON.stringify(dispatchNotificationsKey(USER)));
    }
  });

  it('touches only what changed', () => {
    expect(keys('order.submitted')).toEqual([
      JSON.stringify(['planning']),
      JSON.stringify(['dashboard', DATE]),
    ]);
    expect(keys('stop.arrived')).not.toContain(JSON.stringify(['planning']));
    expect(keys('stop.arrived')).not.toContain(JSON.stringify(dispatchNotificationsKey(USER)));
  });
});

describe('pollInterval', () => {
  it('polls every 15 s while the stream is down and stops when offline', () => {
    expect(pollInterval('polling')).toBe(DASHBOARD_POLL_INTERVAL_MS);
    expect(DASHBOARD_POLL_INTERVAL_MS).toBe(15_000);
    expect(pollInterval('offline')).toBe(false);
  });

  it('keeps a slow refresh while live, so a quiet driver still turns stale', () => {
    expect(pollInterval('live')).toBe(60_000);
  });
});
