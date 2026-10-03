import type {
  CurrentUserResponse,
  DeliveryStop,
  Outlet,
  SyncTripChanged,
  TripDetail,
} from '@waypoint/shared';
import { driverDb } from './db';
import type { OutboxStore } from './sync-core';
import type { CachedTrip, ClockReading, MetaValues, OutboxEntry, PodBlob } from './types';

// Reads and writes for the driver's offline data. Every write that changes what the screens
// show calls notify(), so the workspace re-reads the outbox and refreshes its queries.

type Listener = () => void;
const listeners = new Set<Listener>();

export function onOfflineChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

const tripKey = (userId: string, tripId: string) => `${userId}:${tripId}`;
const metaKey = (name: keyof MetaValues, userId?: string) =>
  userId === undefined ? name : `${name}:${userId}`;

async function readMeta<K extends keyof MetaValues>(
  name: K,
  userId?: string,
): Promise<MetaValues[K] | undefined> {
  const record = await driverDb.meta.get(metaKey(name, userId));
  return record?.value as MetaValues[K] | undefined;
}

async function writeMeta<K extends keyof MetaValues>(
  name: K,
  value: MetaValues[K],
  userId?: string,
): Promise<void> {
  await driverDb.meta.put({ key: metaKey(name, userId), value });
}

// Trips -------------------------------------------------------------------------------------

/** Keeps the latest trip, its stop details and the version the driver accepted. */
export async function saveTrip(userId: string, detail: TripDetail): Promise<void> {
  const key = tripKey(userId, detail.id);
  await driverDb.transaction('rw', driverDb.trips, async () => {
    const existing = await driverDb.trips.get(key);
    await driverDb.trips.put({
      key,
      userId,
      tripId: detail.id,
      detail,
      stops: existing?.stops ?? {},
      ackVersion: existing?.ackVersion ?? detail.version,
      ...(existing?.routeChange ? { routeChange: existing.routeChange } : {}),
      savedAt: Date.now(),
    });
  });
}

export async function saveTrips(userId: string, trips: readonly TripDetail[]): Promise<void> {
  for (const trip of trips) await saveTrip(userId, trip);
}

export async function cachedTrips(userId: string): Promise<CachedTrip[]> {
  return driverDb.trips.where('userId').equals(userId).toArray();
}

export async function cachedTrip(userId: string, tripId: string): Promise<CachedTrip | undefined> {
  return driverDb.trips.get(tripKey(userId, tripId));
}

export async function saveStop(userId: string, stop: DeliveryStop): Promise<void> {
  await driverDb.transaction('rw', driverDb.trips, async () => {
    const existing = await driverDb.trips.get(tripKey(userId, stop.tripId));
    if (!existing) return;
    await driverDb.trips.put({ ...existing, stops: { ...existing.stops, [stop.id]: stop } });
  });
}

export async function cachedStop(
  userId: string,
  stopId: string,
): Promise<DeliveryStop | undefined> {
  for (const trip of await cachedTrips(userId)) {
    const stop = trip.stops[stopId];
    if (stop) return stop;
  }
  return undefined;
}

/** The trip version the driver works from moves only when they acknowledge it (§8.4). */
export async function setRouteChange(
  userId: string,
  tripId: string,
  change: SyncTripChanged | null,
  ackVersion?: number,
): Promise<void> {
  const existing = await cachedTrip(userId, tripId);
  if (!existing) return;
  const { routeChange: _previous, ...rest } = existing;
  await driverDb.trips.put({
    ...rest,
    ...(change ? { routeChange: change } : {}),
    ackVersion: ackVersion ?? existing.ackVersion,
  });
  notify();
}

// Reference and session ---------------------------------------------------------------------

export const cachedOutlets = (userId: string) => readMeta('outlets', userId);
export const saveOutlets = (userId: string, outlets: Outlet[]) =>
  writeMeta('outlets', outlets, userId);

export const cachedClock = (userId: string) => readMeta('clock', userId);
export const saveClock = (userId: string, reading: ClockReading) =>
  writeMeta('clock', reading, userId);

export const cachedSession = () => readMeta('session');
export const saveSession = (session: CurrentUserResponse) => writeMeta('session', session);

/** Forgets who was signed in, so an offline reload cannot reopen the workspace. */
export async function clearSession(): Promise<void> {
  await driverDb.meta.delete('session');
}

export const lastSyncAt = (userId: string) => readMeta('lastSyncAt', userId);
export async function saveLastSync(userId: string, at: number): Promise<void> {
  await writeMeta('lastSyncAt', at, userId);
  notify();
}

// Outbox ------------------------------------------------------------------------------------

/** Writes the action to IndexedDB first; the sync engine sends it when it can (§8.2). */
export async function enqueue(entry: OutboxEntry, pod?: PodBlob): Promise<void> {
  await driverDb.transaction('rw', driverDb.outbox, driverDb.blobs, async () => {
    if (pod) await driverDb.blobs.put(pod);
    await driverDb.outbox.add(entry);
  });
  notify();
}

/** Every entry for this user, oldest first, for the stop overlay and the Sync center. */
export async function outboxEntries(userId: string): Promise<OutboxEntry[]> {
  return driverDb.outbox.where('userId').equals(userId).sortBy('seq');
}

export async function stopEntries(userId: string, stopId: string): Promise<OutboxEntry[]> {
  const entries = await driverDb.outbox.where('stopId').equals(stopId).sortBy('seq');
  return entries.filter((entry) => entry.userId === userId);
}

const SYNCED_HISTORY = 50;

/** Keeps the latest synced events for the Sync center; older history is the server's. */
export async function pruneSynced(userId: string): Promise<void> {
  const synced = (await outboxEntries(userId)).filter((entry) => entry.status === 'synced');
  const stale = synced.slice(0, Math.max(0, synced.length - SYNCED_HISTORY));
  await driverDb.outbox.bulkDelete(
    stale.flatMap((entry) => (entry.seq === undefined ? [] : [entry.seq])),
  );
}

export const dexieOutbox: OutboxStore = {
  async pending(userId) {
    const entries = await outboxEntries(userId);
    return entries.filter((entry) => entry.status === 'queued' || entry.status === 'syncing');
  },
  async update(seq, patch) {
    await driverDb.outbox.update(seq, patch);
    notify();
  },
  async blob(id) {
    return driverDb.blobs.get(id);
  },
  async deleteBlob(id) {
    await driverDb.blobs.delete(id);
  },
};
