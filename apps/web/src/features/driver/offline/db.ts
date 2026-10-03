import Dexie, { type EntityTable } from 'dexie';
import type { CachedTrip, MetaRecord, OutboxEntry, PodBlob } from './types';

// SYSTEM_DESIGN §8.1: trips, outbox, blobs and meta. The service worker never caches API
// responses, so this database is the only offline source of driver data.
class DriverDatabase extends Dexie {
  trips!: EntityTable<CachedTrip, 'key'>;
  outbox!: EntityTable<OutboxEntry, 'seq'>;
  blobs!: EntityTable<PodBlob, 'id'>;
  meta!: EntityTable<MetaRecord, 'key'>;

  constructor() {
    super('waypoint-driver');
    this.version(1).stores({
      trips: 'key, userId, tripId',
      outbox: '++seq, &clientEventId, userId, stopId, status',
      blobs: 'id, userId, stopId',
      meta: 'key',
    });
  }
}

export const driverDb = new DriverDatabase();
