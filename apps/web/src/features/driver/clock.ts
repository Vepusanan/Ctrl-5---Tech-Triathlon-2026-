import { useQuery } from '@tanstack/react-query';
import { operatingClockSchema } from '@waypoint/shared';
import { useRef } from 'react';
import { api, HttpError } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';
import { cachedClock, saveClock } from './offline/store';

// Asia/Colombo has no daylight-saving shift, so +05:30 is the whole zone rule.
const COLOMBO_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** ISO 8601 with the +05:30 offset, the format the API emits and the stop events carry. */
export function colomboTimestamp(instant: number): string {
  return `${new Date(instant + COLOMBO_OFFSET_MS).toISOString().slice(0, -1)}+05:30`;
}

interface Reading {
  /** Operating-clock time in ms, or null when DEMO_MODE is off and the device clock applies. */
  serverNow: number | null;
  /** Device time in ms at the moment of that reading. */
  deviceAt: number;
}

// GET /admin/clock exists only in DEMO_MODE. Without it the server follows the host clock.
// The last reading is kept on the phone: offline, the device clock advances from that anchor.
async function readClock(userId: string): Promise<Reading> {
  const sentAt = Date.now();
  try {
    const clock = await api('/admin/clock', operatingClockSchema);
    const receivedAt = Date.now();
    const reading = { serverNow: Date.parse(clock.now), deviceAt: (sentAt + receivedAt) / 2 };
    await saveClock(userId, reading);
    return reading;
  } catch (cause) {
    if (cause instanceof HttpError && cause.status === 404) {
      const reading = { serverNow: null, deviceAt: sentAt };
      await saveClock(userId, reading);
      return reading;
    }
    if (cause instanceof HttpError && cause.status === 0) {
      const cached = await cachedClock(userId);
      if (cached) return cached;
    }
    throw cause;
  }
}

/**
 * Stop events record when they happened (SYSTEM_DESIGN §8.6). In DEMO_MODE the operating clock
 * is pinned to the seeded day and does not tick, so the driver anchors to one reading and lets
 * the device clock advance from it. A new reading replaces the anchor only when the operating
 * clock itself moved; re-reading a pinned clock would otherwise pull every event back to the
 * pinned instant. Without DEMO_MODE the offset is zero and events carry device time.
 */
export function useDriverClock(userId: string) {
  const query = useQuery({
    queryKey: queryKeys.driver.clock(userId),
    queryFn: () => readClock(userId),
    networkMode: 'always',
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });
  const anchor = useRef<Reading | null>(null);
  const reading = query.data;
  if (
    reading !== undefined &&
    (anchor.current === null || anchor.current.serverNow !== reading.serverNow)
  ) {
    anchor.current = reading;
  }
  const current = anchor.current;
  return {
    isPending: query.isPending,
    error: query.error,
    refetch: query.refetch,
    ready: current !== null,
    offset: current?.serverNow == null ? 0 : current.serverNow - current.deviceAt,
  };
}
