import type {
  CurrentUserResponse,
  DeliveryStop,
  Outlet,
  SyncEventResultStatus,
  SyncStatus,
  SyncTripChanged,
  TripDetail,
} from '@waypoint/shared';

// SYSTEM_DESIGN §8.1. Four IndexedDB stores; Dexie is the only offline copy of driver data.

/** One driver action waiting for, or done with, POST /sync/events. */
export interface OutboxEntry {
  /** Insertion order; events are sent strictly in this order. */
  seq?: number;
  clientEventId: string;
  userId: string;
  tripId: string;
  stopId: string;
  outletId: string;
  type: 'arrived' | 'delivered' | 'failed';
  /** When it happened on the operating clock (§8.6). */
  clientTime: string;
  tripVersion: number;
  reason?: string;
  /** Delivered: the server POD id, once the POD has been uploaded (or was already there). */
  podId?: string;
  /** Delivered: the POD still on this phone, uploaded before the event (§8.2). */
  blobId?: string;
  recipientName?: string;
  status: SyncStatus;
  /** The server's answer for this event, kept so nothing is resolved silently. */
  result?: SyncEventResultStatus;
  detail?: string;
  attempts: number;
  /** Device time (ms) before which a retry is not attempted. */
  nextAttemptAt: number;
  createdAt: number;
  syncedAt?: number;
}

/** POD signature and optional photo, kept until the upload is confirmed. */
export interface PodBlob {
  id: string;
  userId: string;
  stopId: string;
  recipientName: string;
  clientTime: string;
  signature: Blob;
  photo?: Blob;
}

/** The driver's trip as last seen from the API, with its stops' delivery details. */
export interface CachedTrip {
  key: string;
  userId: string;
  tripId: string;
  detail: TripDetail;
  stops: Record<string, DeliveryStop>;
  /** The trip version the driver has seen and accepted (§8.4). */
  ackVersion: number;
  /** A route change found on reconnect and not yet acknowledged. */
  routeChange?: SyncTripChanged;
  savedAt: number;
}

export interface ClockReading {
  serverNow: number | null;
  deviceAt: number;
}

export interface MetaValues {
  session: CurrentUserResponse;
  clock: ClockReading;
  outlets: Outlet[];
  lastSyncAt: number;
}

export interface MetaRecord<K extends keyof MetaValues = keyof MetaValues> {
  key: string;
  value: MetaValues[K];
}
