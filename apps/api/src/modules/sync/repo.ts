import type { Database } from '@waypoint/database';
import { auditLog, syncConflicts, trips } from '@waypoint/database';
import { and, asc, eq } from 'drizzle-orm';
import type { RouteAudit } from './delta.ts';

type SyncDb = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface SyncRepo {
  findConflict(db: SyncDb, eventId: string): Promise<{ id: string; reason: string } | null>;
  insertConflict(
    db: SyncDb,
    eventId: string,
    reason: string,
    createdAt: Date,
  ): Promise<{ id: string }>;
  listVehicleTripVersions(db: SyncDb, vehicleId: string): Promise<number[]>;
  listRouteAudits(db: SyncDb, tripId: string): Promise<RouteAudit[]>;
}

export function createSyncRepo(): SyncRepo {
  return {
    async findConflict(db, eventId) {
      const rows = await db
        .select({ id: syncConflicts.id, reason: syncConflicts.reason })
        .from(syncConflicts)
        .where(eq(syncConflicts.eventId, eventId))
        .limit(1);
      return rows[0] ?? null;
    },

    async insertConflict(db, eventId, reason, createdAt) {
      const rows = await db
        .insert(syncConflicts)
        .values({ eventId, reason, createdAt })
        .returning({ id: syncConflicts.id });
      const created = rows[0];
      if (created === undefined) throw new Error('Sync conflict was not stored');
      return created;
    },

    async listVehicleTripVersions(db, vehicleId) {
      const rows = await db
        .select({ version: trips.version })
        .from(trips)
        .where(eq(trips.vehicleId, vehicleId));
      return rows.map((row) => row.version);
    },

    async listRouteAudits(db, tripId) {
      return db
        .select({ before: auditLog.before, after: auditLog.after })
        .from(auditLog)
        .where(and(eq(auditLog.entityType, 'trip'), eq(auditLog.entityId, tripId)))
        .orderBy(asc(auditLog.createdAt), asc(auditLog.id));
    },
  };
}
