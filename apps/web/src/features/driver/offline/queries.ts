import {
  type DeliveryStop,
  deliveryStopSchema,
  type Outlet,
  outletListResponseSchema,
  type TripDetail,
  type TripListResponse,
  tripDetailSchema,
  tripListResponseSchema,
} from '@waypoint/shared';
import { api, HttpError } from '../../../lib/api';
import {
  cachedOutlets,
  cachedStop,
  cachedTrip,
  cachedTrips,
  outboxEntries,
  saveOutlets,
  saveStop,
  saveTrip,
  saveTrips,
} from './store';
import { localStopStatus } from './sync-core';
import type { OutboxEntry } from './types';

// Read-through loaders for the driver screens: the API when it answers, the copy in IndexedDB
// when it does not (§8.1), and in both cases the driver's unsynced actions on top.

const offline = (cause: unknown) => cause instanceof HttpError && cause.status === 0;

const notCached = () =>
  new HttpError(0, 'NETWORK_ERROR', 'Offline, and this has not been opened on this phone yet.');

function byStop(entries: readonly OutboxEntry[]): Map<string, OutboxEntry[]> {
  const map = new Map<string, OutboxEntry[]>();
  for (const entry of entries) map.set(entry.stopId, [...(map.get(entry.stopId) ?? []), entry]);
  return map;
}

function overlayTrip(trip: TripDetail, entries: Map<string, OutboxEntry[]>): TripDetail {
  return {
    ...trip,
    stops: trip.stops.map((stop) => ({
      ...stop,
      status: localStopStatus(stop.status, entries.get(stop.id) ?? []).status,
    })),
  };
}

function overlayStop(stop: DeliveryStop, entries: readonly OutboxEntry[]): DeliveryStop {
  const local = localStopStatus(stop.status, entries);
  const failed = entries.find((entry) => entry.type === 'failed' && entry.status !== 'conflict');
  return {
    ...stop,
    status: local.status,
    failureReason:
      stop.failureReason ?? (local.status === 'failed' ? (failed?.reason ?? null) : null),
  };
}

export async function loadTrips(userId: string): Promise<TripListResponse> {
  let list: TripListResponse;
  try {
    list = await api('/trips', tripListResponseSchema);
    await saveTrips(
      userId,
      list.items.filter((trip) => trip.run.status === 'published'),
    );
  } catch (cause) {
    if (!offline(cause)) throw cause;
    const items = (await cachedTrips(userId)).map((trip) => trip.detail);
    if (items.length === 0) throw cause;
    list = { items, total: items.length };
  }
  const entries = byStop(await outboxEntries(userId));
  return { ...list, items: list.items.map((trip) => overlayTrip(trip, entries)) };
}

export async function loadTrip(userId: string, tripId: string): Promise<TripDetail> {
  let trip: TripDetail;
  try {
    trip = await api(`/trips/${tripId}`, tripDetailSchema);
    if (trip.run.status === 'published') await saveTrip(userId, trip);
  } catch (cause) {
    if (!offline(cause)) throw cause;
    const cached = await cachedTrip(userId, tripId);
    if (!cached) throw notCached();
    trip = cached.detail;
  }
  return overlayTrip(trip, byStop(await outboxEntries(userId)));
}

export async function loadStop(userId: string, stopId: string): Promise<DeliveryStop> {
  let stop: DeliveryStop;
  try {
    stop = await api(`/stops/${stopId}`, deliveryStopSchema);
    await saveStop(userId, stop);
  } catch (cause) {
    if (!offline(cause)) throw cause;
    const cached = await cachedStop(userId, stopId);
    if (!cached) throw notCached();
    stop = cached;
  }
  const entries = (await outboxEntries(userId)).filter((entry) => entry.stopId === stopId);
  return overlayStop(stop, entries);
}

export async function loadOutlets(userId: string): Promise<{ items: Outlet[]; total: number }> {
  try {
    const list = await api('/outlets', outletListResponseSchema);
    await saveOutlets(userId, list.items);
    return list;
  } catch (cause) {
    if (!offline(cause)) throw cause;
    const items = await cachedOutlets(userId);
    if (!items) throw cause;
    return { items, total: items.length };
  }
}
