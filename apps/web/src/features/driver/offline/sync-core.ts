import {
  type StopEventInput,
  type StopStatus,
  SYNC_BATCH_LIMIT,
  type SyncEventResult,
  type SyncStatus,
  stopEventInputSchema,
  syncStateMachine,
} from '@waypoint/shared';
import { HttpError } from '../../../lib/api';
import type { OutboxEntry, PodBlob } from './types';

// The outbox engine (SYSTEM_DESIGN §8.2–8.3) without storage or network, so it can be tested.

export interface OutboxStore {
  /** Entries still to send for this user, oldest first. */
  pending(userId: string): Promise<OutboxEntry[]>;
  update(seq: number, patch: Partial<OutboxEntry>): Promise<void>;
  blob(id: string): Promise<PodBlob | undefined>;
  deleteBlob(id: string): Promise<void>;
}

export interface SyncTransport {
  /** Uploads the POD and returns its id; a POD the server already holds is recovered. */
  uploadPod(stopId: string, pod: PodBlob): Promise<string>;
  sendEvents(events: StopEventInput[]): Promise<SyncEventResult[]>;
}

export interface SyncReport {
  sent: number;
  synced: number;
  conflicts: number;
  /** Set when a retryable failure stopped the run; nothing later was sent out of order. */
  retryAt: number | null;
}

const FIRST_RETRY_MS = 2_000;
const MAX_RETRY_MS = 60_000;

/** Exponential backoff from 2 s, doubling, capped at 60 s (§8.3). */
export function retryDelay(attempts: number): number {
  return Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** Math.max(0, attempts - 1));
}

/** No signal, a timeout, an expired session or a server fault: keep the event and try again. */
function isRetryable(cause: unknown): boolean {
  if (!(cause instanceof HttpError)) return true;
  return (
    cause.status === 0 ||
    cause.status === 401 ||
    cause.status === 408 ||
    cause.status === 429 ||
    cause.status >= 500
  );
}

/** The wire event for an outbox entry; a delivered entry needs its POD id first. */
function toStopEvent(entry: OutboxEntry): StopEventInput {
  const base = {
    clientEventId: entry.clientEventId,
    stopId: entry.stopId,
    clientTime: entry.clientTime,
    tripVersion: entry.tripVersion,
  };
  if (entry.type === 'arrived')
    return stopEventInputSchema.parse({ ...base, type: 'arrived', payload: {} });
  if (entry.type === 'failed') {
    return stopEventInputSchema.parse({
      ...base,
      type: 'failed',
      payload: { reason: entry.reason },
    });
  }
  return stopEventInputSchema.parse({
    ...base,
    type: 'delivered',
    payload: { podId: entry.podId },
  });
}

function move(entry: OutboxEntry, to: SyncStatus): SyncStatus {
  // Queued entries pass through syncing; a run interrupted mid-send restarts from syncing.
  if (entry.status !== to) syncStateMachine.assertTransition(entry.status, to);
  return to;
}

/**
 * Sends queued events in order. POD uploads go first and the delivered event references the
 * returned id. Consecutive ready events go together, up to 100 per request. A retryable failure
 * stops the run so a later event never overtakes an earlier one.
 */
export async function runSync(
  store: OutboxStore,
  transport: SyncTransport,
  userId: string,
  now: () => number,
  force = false,
): Promise<SyncReport> {
  const report: SyncReport = { sent: 0, synced: 0, conflicts: 0, retryAt: null };
  const entries = await store.pending(userId);
  const due = (entry: OutboxEntry) => force || entry.nextAttemptAt <= now();

  const backOff = async (batch: readonly OutboxEntry[]) => {
    for (const entry of batch) {
      const attempts = entry.attempts + 1;
      const nextAttemptAt = now() + retryDelay(attempts);
      const status = entry.status === 'syncing' ? move(entry, 'queued') : entry.status;
      await store.update(seqOf(entry), { attempts, nextAttemptAt, status });
      entry.attempts = attempts;
      entry.nextAttemptAt = nextAttemptAt;
      entry.status = status;
    }
    report.retryAt = batch[0]?.nextAttemptAt ?? null;
  };

  const markConflict = async (
    entry: OutboxEntry,
    result: OutboxEntry['result'],
    detail?: string,
  ) => {
    if (entry.status === 'queued') entry.status = move(entry, 'syncing');
    const status = move(entry, 'conflict');
    await store.update(seqOf(entry), {
      status,
      ...(result ? { result } : {}),
      ...(detail ? { detail } : {}),
    });
    entry.status = status;
    report.conflicts += 1;
  };

  let index = 0;
  while (index < entries.length) {
    const head = entries[index];
    if (!head) break;
    if (!due(head)) {
      report.retryAt = head.nextAttemptAt;
      break;
    }

    if (head.type === 'delivered' && !head.podId) {
      const pod = head.blobId ? await store.blob(head.blobId) : undefined;
      if (!pod) {
        await markConflict(head, 'rejected', 'The proof of delivery is no longer on this phone.');
        index += 1;
        continue;
      }
      try {
        const podId = await transport.uploadPod(head.stopId, pod);
        head.podId = podId;
        await store.update(seqOf(head), { podId });
        // The POD is confirmed on the server, so the local copy can go (§8.1).
        await store.deleteBlob(pod.id);
      } catch (cause) {
        if (isRetryable(cause)) {
          await backOff([head]);
          break;
        }
        await markConflict(head, 'rejected', cause instanceof Error ? cause.message : undefined);
        index += 1;
        continue;
      }
    }

    const batch: OutboxEntry[] = [];
    let next = index;
    while (next < entries.length && batch.length < SYNC_BATCH_LIMIT) {
      const entry = entries[next];
      if (!entry || !due(entry)) break;
      if (entry.type === 'delivered' && !entry.podId) break;
      batch.push(entry);
      next += 1;
    }

    for (const entry of batch) {
      if (entry.status === 'queued') {
        entry.status = move(entry, 'syncing');
        await store.update(seqOf(entry), { status: entry.status });
      }
    }

    let results: SyncEventResult[];
    try {
      results = await transport.sendEvents(batch.map(toStopEvent));
      report.sent += batch.length;
    } catch (cause) {
      if (isRetryable(cause)) {
        await backOff(batch);
        break;
      }
      // The whole batch was refused (it failed the shared schema): keep each event visible.
      for (const entry of batch) {
        await markConflict(entry, 'rejected', cause instanceof Error ? cause.message : undefined);
      }
      index = next;
      continue;
    }

    const byId = new Map(results.map((result) => [result.clientEventId, result]));
    const unanswered: OutboxEntry[] = [];
    for (const entry of batch) {
      const result = byId.get(entry.clientEventId);
      if (!result) {
        unanswered.push(entry);
        continue;
      }
      if (result.status === 'applied' || result.status === 'duplicate') {
        const status = move(entry, 'synced');
        await store.update(seqOf(entry), {
          status,
          result: result.status,
          syncedAt: now(),
          ...(result.detail ? { detail: result.detail } : {}),
        });
        entry.status = status;
        report.synced += 1;
      } else {
        await markConflict(entry, result.status, result.detail);
      }
    }
    if (unanswered.length > 0) {
      await backOff(unanswered);
      break;
    }
    index = next;
  }
  return report;
}

function seqOf(entry: OutboxEntry): number {
  if (entry.seq === undefined) throw new Error('Outbox entry has no sequence number');
  return entry.seq;
}

const STOP_RANK: Record<StopStatus, number> = { pending: 0, arrived: 1, delivered: 2, failed: 2 };

/**
 * The stop as this phone knows it: the server status, moved forward by events still waiting to
 * sync. A synced event is already in the server status; a conflicting one never is.
 */
export function localStopStatus(
  serverStatus: StopStatus,
  entries: readonly OutboxEntry[],
): { status: StopStatus; pending: boolean; conflict: boolean } {
  let status = serverStatus;
  let pending = false;
  let conflict = false;
  for (const entry of entries) {
    if (entry.status === 'conflict') {
      conflict = true;
      continue;
    }
    if (entry.status === 'synced') continue;
    pending = true;
    if (STOP_RANK[entry.type] > STOP_RANK[status]) status = entry.type;
  }
  return { status, pending, conflict };
}
