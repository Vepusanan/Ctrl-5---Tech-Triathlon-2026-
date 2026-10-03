import { useQueryClient } from '@tanstack/react-query';
import { syncEventsResponseSchema, syncTripDeltaSchema } from '@waypoint/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { queryKeys } from '../../../lib/query-keys';
import { ensurePod } from '../pod';
import {
  cachedTrips,
  dexieOutbox,
  lastSyncAt,
  onOfflineChange,
  outboxEntries,
  pruneSynced,
  saveLastSync,
  setRouteChange,
} from './store';
import { runSync, type SyncTransport } from './sync-core';
import type { OutboxEntry } from './types';

const PENDING_INTERVAL_MS = 20_000;

const transport: SyncTransport = {
  uploadPod: (stopId, pod) =>
    ensurePod(stopId, async () => {
      const form = new FormData();
      form.append('recipientName', pod.recipientName);
      form.append('clientTime', pod.clientTime);
      form.append('signature', pod.signature, 'signature.png');
      if (pod.photo) form.append('photo', pod.photo, 'photo.jpg');
      return form;
    }),
  sendEvents: async (events) => {
    const response = await api('/sync/events', syncEventsResponseSchema, {
      method: 'POST',
      body: JSON.stringify({ events }),
    });
    return response.results;
  },
};

/**
 * §8.4: after a sync, ask whether each active trip moved past the version the driver accepted.
 * A version change with no stop changes (departure, for example) is accepted as is; anything
 * else waits for the driver to acknowledge it and is never applied silently.
 */
async function checkRouteChanges(userId: string): Promise<void> {
  for (const trip of await cachedTrips(userId)) {
    if (trip.detail.status !== 'departed' && trip.detail.status !== 'ready') continue;
    const delta = await api(
      `/sync/trips/${trip.tripId}?since=${trip.ackVersion}`,
      syncTripDeltaSchema,
    );
    if (!delta.changed) continue;
    const moved = delta.added.length + delta.removed.length + delta.reordered.length > 0;
    await setRouteChange(
      userId,
      trip.tripId,
      moved ? delta : null,
      moved ? undefined : delta.version,
    );
  }
}

let running: Promise<void> | null = null;

export interface SyncState {
  entries: OutboxEntry[];
  pending: number;
  conflicts: number;
  syncing: boolean;
  lastSyncAt: number | null;
  /** Sends what is queued now. `force` ignores the backoff timer (the Sync now button). */
  syncNow: (force?: boolean) => Promise<void>;
}

/** Runs the outbox for the signed-in driver on every trigger SYSTEM_DESIGN §8.2 lists. */
export function useSyncEngine(userId: string, online: boolean): SyncState {
  const client = useQueryClient();
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const retryTimer = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    setEntries(await outboxEntries(userId));
    setLastSync((await lastSyncAt(userId)) ?? null);
  }, [userId]);

  const syncNow = useCallback(
    async (force = false) => {
      if (!navigator.onLine) return;
      if (running) return running;
      running = (async () => {
        setSyncing(true);
        try {
          const report = await runSync(dexieOutbox, transport, userId, () => Date.now(), force);
          if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
          retryTimer.current = null;
          if (report.retryAt !== null) {
            retryTimer.current = window.setTimeout(
              () => void syncNow(),
              Math.max(0, report.retryAt - Date.now()),
            );
          } else {
            await saveLastSync(userId, Date.now());
            await pruneSynced(userId);
            await checkRouteChanges(userId).catch(() => undefined);
          }
          if (report.sent > 0 || report.conflicts > 0) {
            await client.invalidateQueries({ queryKey: queryKeys.driver.all(userId) });
          }
        } finally {
          setSyncing(false);
          running = null;
          await refresh();
        }
      })();
      return running;
    },
    [client, refresh, userId],
  );

  // Every local write re-reads the outbox and refreshes the screens. A sync run writes once per
  // event, so changes within 150 ms are handled together.
  useEffect(() => {
    void refresh();
    let pendingChange: number | null = null;
    const unsubscribe = onOfflineChange(() => {
      if (pendingChange !== null) return;
      pendingChange = window.setTimeout(() => {
        pendingChange = null;
        void refresh();
        void client.invalidateQueries({ queryKey: queryKeys.driver.all(userId) });
      }, 150);
    });
    return () => {
      unsubscribe();
      if (pendingChange !== null) window.clearTimeout(pendingChange);
    };
  }, [client, refresh, userId]);

  const pending = entries.filter(
    (entry) => entry.status === 'queued' || entry.status === 'syncing',
  ).length;
  const conflicts = entries.filter((entry) => entry.status === 'conflict').length;

  // Triggers: reconnecting, returning to the app, and every 20 s while anything is queued.
  // The Background Sync API is not used (§8.2: iOS Safari does not support it).
  useEffect(() => {
    if (online) void syncNow();
  }, [online, syncNow]);
  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };
    const focus = () => void syncNow();
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [syncNow]);
  useEffect(() => {
    if (pending === 0) return;
    const timer = window.setInterval(() => void syncNow(), PENDING_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [pending, syncNow]);
  useEffect(
    () => () => {
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    },
    [],
  );

  return { entries, pending, conflicts, syncing, lastSyncAt: lastSync, syncNow };
}
