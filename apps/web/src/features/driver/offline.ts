import {
  currentUserResponseSchema,
  type DeliveryStop,
  deliveryStopSchema,
  podSchema,
  type StopEventInput,
  syncEventsResponseSchema,
  type TripDetail,
  tripListResponseSchema,
} from '@waypoint/shared';
import Dexie, { type Table } from 'dexie';
import { api, HttpError } from '../../lib/api';

export interface Pending {
  key?: number;
  owner: string;
  event: StopEventInput;
  status: 'queued' | 'synced' | 'conflict' | 'rejected';
  detail: string;
  proof?: { recipientName: string; signature: Blob; photo?: Blob };
}
interface CachedTrips {
  owner: string;
  items: TripDetail[];
}
interface CachedStop {
  key: string;
  data: DeliveryStop;
}
const db = new Dexie('waypoint-driver') as Dexie & {
  trips: Table<CachedTrips, string>;
  stops: Table<CachedStop, string>;
  outbox: Table<Pending, number>;
  plans: Table<{ key: string; version: number }, string>;
};
db.version(1).stores({ trips: 'owner', stops: 'key', outbox: '++key, owner' });
db.version(2).stores({ plans: 'key' });

export async function acceptedVersion(owner: string, tripId: string, version: number) {
  const key = `${owner}:${tripId}`;
  return db.transaction('rw', db.plans, async () => {
    const old = await db.plans.get(key);
    if (old) return old.version;
    await db.plans.put({ key, version });
    return version;
  });
}
export async function acceptVersion(owner: string, tripId: string, version: number) {
  await db.plans.put({ key: `${owner}:${tripId}`, version });
}

export function driverOwner(user: { id: string; vehicleId: string }) {
  return `${user.id}:${user.vehicleId}`;
}
export async function readOutbox(owner: string) {
  return db.outbox.where('owner').equals(owner).sortBy('key');
}
export async function queueEvent(item: Omit<Pending, 'status' | 'detail'>) {
  await db.outbox.add({ ...item, status: 'queued', detail: '' });
}
export async function loadTrips(owner: string, signal: AbortSignal) {
  try {
    const result = await api('/trips', tripListResponseSchema, { signal });
    for (const trip of result.items) await acceptedVersion(owner, trip.id, trip.version);
    await db.trips.put({ owner, items: result.items });
    return result.items;
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 0) || signal.aborted) throw error;
    const cached = await db.trips.get(owner);
    if (!cached) throw error;
    return cached.items;
  }
}
export async function loadStop(owner: string, id: string, signal: AbortSignal) {
  const key = `${owner}:${id}`;
  try {
    const data = await api(`/stops/${id}`, deliveryStopSchema, { signal });
    await db.stops.put({ key, data });
    return data;
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 0) || signal.aborted) throw error;
    const cached = await db.stops.get(key);
    if (!cached) throw error;
    return cached.data;
  }
}

// The identity is rechecked before sending: an old tab must never submit one
// driver's queue with a different account's cookie. Queues survive logout.
export async function syncOutbox(owner: string, signal: AbortSignal) {
  const run = async () => {
    const all = await readOutbox(owner);
    const blockedStops = new Set(
      all
        .filter((item) => item.status === 'conflict' || item.status === 'rejected')
        .map((item) => item.event.stopId),
    );
    const items = all.filter(
      (item) => item.status === 'queued' && !blockedStops.has(item.event.stopId),
    );
    for (const item of items) {
      if (signal.aborted || !navigator.onLine) return;
      const { user } = await api('/auth/me', currentUserResponseSchema, { signal });
      if (user.role !== 'driver' || driverOwner(user) !== owner) {
        window.dispatchEvent(new Event('waypoint:unauthenticated'));
        return;
      }
      const key = item.key;
      if (key === undefined) continue;
      let event = item.event;
      if (item.proof && event.type === 'delivered') {
        // Recover a previously accepted upload if its response was lost.
        const stop = await api(`/stops/${event.stopId}`, deliveryStopSchema, { signal });
        let pod = stop.pod;
        if (!pod) {
          const form = new FormData();
          form.set('recipientName', item.proof.recipientName);
          form.set('clientTime', event.clientTime);
          form.set('signature', item.proof.signature, 'signature.png');
          if (item.proof.photo) form.set('photo', item.proof.photo, 'photo.jpg');
          pod = await api(`/stops/${event.stopId}/pod`, podSchema, {
            method: 'POST',
            body: form,
            signal,
          });
        }
        event = { ...event, payload: { podId: pod.id } };
        await db.outbox.put({ ...item, event });
      }
      const response = await api('/sync/events', syncEventsResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ events: [event] }),
        signal,
      });
      const result = response.results.find((r) => r.clientEventId === event.clientEventId);
      if (!result) throw new Error('Sync response is incomplete. Retry to check the saved event.');
      const status =
        result.status === 'applied' || result.status === 'duplicate' ? 'synced' : result.status;
      const saved: Pending = { key, owner, event, status, detail: result.detail ?? '' };
      // Keep proof for unresolved events, remove blobs only after confirmation.
      if (status !== 'synced' && item.proof) saved.proof = item.proof;
      await db.outbox.put(saved);
      if (status !== 'synced') break;
    }
  };
  if (navigator.locks) await navigator.locks.request('waypoint-driver-sync', { signal }, run);
  else await run();
}
