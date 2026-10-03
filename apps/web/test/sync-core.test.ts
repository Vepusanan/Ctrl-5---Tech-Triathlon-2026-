import type { StopEventInput, SyncEventResult } from '@waypoint/shared';
import { describe, expect, it } from 'vitest';
import {
  localStopStatus,
  type OutboxStore,
  retryDelay,
  runSync,
  type SyncTransport,
} from '../src/features/driver/offline/sync-core';
import type { OutboxEntry, PodBlob } from '../src/features/driver/offline/types';
import { HttpError } from '../src/lib/api';

const randomUUID = () => crypto.randomUUID();
const USER = randomUUID();
const TRIP = randomUUID();
const NOW = 1_000_000;

function entry(type: OutboxEntry['type'], patch: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    clientEventId: randomUUID(),
    userId: USER,
    tripId: TRIP,
    stopId: randomUUID(),
    outletId: 'OUT-001',
    type,
    clientTime: '2026-06-26T09:00:00+05:30',
    tripVersion: 3,
    ...(type === 'failed' ? { reason: 'Shop closed' } : {}),
    ...(type === 'delivered' ? { podId: randomUUID() } : {}),
    status: 'queued',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: NOW,
    ...patch,
  };
}

/** An in-memory outbox with the same contract as the Dexie one. */
function memoryStore(initial: OutboxEntry[], blobs: PodBlob[] = []) {
  const rows = new Map<number, OutboxEntry>();
  for (const [index, row] of initial.entries()) rows.set(index + 1, { ...row, seq: index + 1 });
  const files = new Map(blobs.map((blob) => [blob.id, blob]));
  const store: OutboxStore = {
    async pending(userId) {
      return [...rows.values()]
        .filter(
          (row) => row.userId === userId && (row.status === 'queued' || row.status === 'syncing'),
        )
        .sort((left, right) => (left.seq ?? 0) - (right.seq ?? 0))
        .map((row) => ({ ...row }));
    },
    async update(seq, patch) {
      const row = rows.get(seq);
      if (row) rows.set(seq, { ...row, ...patch });
    },
    async blob(id) {
      return files.get(id);
    },
    async deleteBlob(id) {
      files.delete(id);
    },
  };
  return { store, rows: () => [...rows.values()], files };
}

type Answer = (events: StopEventInput[]) => SyncEventResult[];
const applyAll: Answer = (events) =>
  events.map((event) => ({ clientEventId: event.clientEventId, status: 'applied' }));

function transport(answer: Answer = applyAll, podId = randomUUID()) {
  const calls: string[] = [];
  const batches: StopEventInput[][] = [];
  let failNext: unknown = null;
  const value: SyncTransport = {
    async uploadPod(stopId) {
      calls.push(`pod:${stopId}`);
      return podId;
    },
    async sendEvents(events) {
      calls.push(`events:${events.length}`);
      if (failNext) {
        const cause = failNext;
        failNext = null;
        throw cause;
      }
      batches.push(events);
      return answer(events);
    },
  };
  return {
    value,
    calls,
    batches,
    failOnce(cause: unknown) {
      failNext = cause;
    },
  };
}

describe('runSync', () => {
  it('sends queued events in the order they were recorded and marks them synced', async () => {
    const recorded = [entry('arrived'), entry('failed'), entry('arrived')];
    const { store, rows } = memoryStore(recorded);
    const net = transport();

    const report = await runSync(store, net.value, USER, () => NOW);

    expect(net.batches).toHaveLength(1);
    expect(net.batches[0]?.map((event) => event.clientEventId)).toEqual(
      recorded.map((row) => row.clientEventId),
    );
    expect(rows().every((row) => row.status === 'synced' && row.result === 'applied')).toBe(true);
    expect(report).toMatchObject({ sent: 3, synced: 3, conflicts: 0, retryAt: null });
  });

  it('uploads the POD before the delivered event and references the returned id', async () => {
    const podId = randomUUID();
    const arrival = entry('arrived');
    const blob: PodBlob = {
      id: randomUUID(),
      userId: USER,
      stopId: arrival.stopId,
      recipientName: 'R. Perera',
      clientTime: '2026-06-26T09:05:00+05:30',
      signature: new Blob(['png']),
    };
    const { podId: _unused, ...withoutPod } = entry('delivered', { stopId: arrival.stopId });
    const delivery: OutboxEntry = { ...withoutPod, blobId: blob.id };
    const { store, rows, files } = memoryStore([arrival, delivery], [blob]);
    const net = transport(applyAll, podId);

    await runSync(store, net.value, USER, () => NOW);

    // The arrival recorded earlier goes first; the delivery waits for its POD id.
    expect(net.calls).toEqual(['events:1', `pod:${arrival.stopId}`, 'events:1']);
    const sent = net.batches[1]?.[0];
    expect(sent?.type).toBe('delivered');
    expect(sent?.type === 'delivered' ? sent.payload.podId : null).toBe(podId);
    expect(rows()[1]?.podId).toBe(podId);
    expect(files.has(blob.id)).toBe(false);
  });

  it('treats a duplicate as synced, so a retried event is never applied twice', async () => {
    const { store, rows } = memoryStore([entry('arrived')]);
    const net = transport((events) =>
      events.map((event) => ({ clientEventId: event.clientEventId, status: 'duplicate' })),
    );

    await runSync(store, net.value, USER, () => NOW);

    expect(rows()[0]).toMatchObject({ status: 'synced', result: 'duplicate' });
  });

  it('keeps conflicts and rejections visible with the server detail', async () => {
    const [conflicting, rejected] = [entry('arrived'), entry('failed')];
    const { store, rows } = memoryStore([conflicting, rejected]);
    const net = transport((events) => [
      {
        clientEventId: events[0]?.clientEventId ?? '',
        status: 'conflict',
        detail: 'Route changed',
      },
      {
        clientEventId: events[1]?.clientEventId ?? '',
        status: 'rejected',
        detail: 'Stop is delivered',
      },
    ]);

    const report = await runSync(store, net.value, USER, () => NOW);

    expect(rows()[0]).toMatchObject({
      status: 'conflict',
      result: 'conflict',
      detail: 'Route changed',
    });
    expect(rows()[1]).toMatchObject({
      status: 'conflict',
      result: 'rejected',
      detail: 'Stop is delivered',
    });
    expect(report.conflicts).toBe(2);
  });

  it('backs off after a network failure, keeps the events queued and sends nothing out of order', async () => {
    const { store, rows } = memoryStore([entry('arrived'), entry('arrived')]);
    const net = transport();
    net.failOnce(new HttpError(0, 'NETWORK_ERROR', 'offline'));

    const report = await runSync(store, net.value, USER, () => NOW);

    expect(report.retryAt).toBe(NOW + 2_000);
    expect(rows().every((row) => row.status === 'queued' && row.attempts === 1)).toBe(true);

    // Not due yet: the next run waits for the backoff.
    const early = await runSync(store, net.value, USER, () => NOW + 1_000);
    expect(early.sent).toBe(0);
    expect(net.batches).toHaveLength(0);

    const later = await runSync(store, net.value, USER, () => NOW + 2_000);
    expect(later.synced).toBe(2);
  });

  it('marks a batch the server refuses outright as rejected instead of retrying it forever', async () => {
    const { store, rows } = memoryStore([entry('arrived')]);
    const net = transport();
    net.failOnce(new HttpError(400, 'VALIDATION_FAILED', 'Bad event'));

    await runSync(store, net.value, USER, () => NOW);

    expect(rows()[0]).toMatchObject({
      status: 'conflict',
      result: 'rejected',
      detail: 'Bad event',
    });
  });

  it('sends at most 100 events per request', async () => {
    const { store } = memoryStore(Array.from({ length: 230 }, () => entry('arrived')));
    const net = transport();

    const report = await runSync(store, net.value, USER, () => NOW);

    expect(net.batches.map((batch) => batch.length)).toEqual([100, 100, 30]);
    expect(report.synced).toBe(230);
  });

  it('turns a delivered event whose POD is gone into a visible rejection', async () => {
    const { podId: _unused, ...withoutPod } = entry('delivered');
    const { store, rows } = memoryStore([{ ...withoutPod, blobId: randomUUID() }]);

    await runSync(store, transport().value, USER, () => NOW);

    expect(rows()[0]).toMatchObject({ status: 'conflict', result: 'rejected' });
  });
});

describe('retryDelay', () => {
  it('doubles from 2 s and stops at 60 s', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 12].map(retryDelay)).toEqual([
      2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000,
    ]);
  });
});

describe('localStopStatus', () => {
  it('moves the stop forward with events still on the phone', () => {
    expect(localStopStatus('pending', [entry('arrived')])).toEqual({
      status: 'arrived',
      pending: true,
      conflict: false,
    });
    expect(localStopStatus('arrived', [entry('arrived'), entry('delivered')]).status).toBe(
      'delivered',
    );
  });

  it('ignores synced events and never applies a conflicting one', () => {
    expect(localStopStatus('pending', [entry('arrived', { status: 'synced' })])).toEqual({
      status: 'pending',
      pending: false,
      conflict: false,
    });
    expect(localStopStatus('arrived', [entry('delivered', { status: 'conflict' })])).toEqual({
      status: 'arrived',
      pending: false,
      conflict: true,
    });
  });
});
