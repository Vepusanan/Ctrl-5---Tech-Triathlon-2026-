import type { Database } from '@waypoint/database';
import { auditLog } from '@waypoint/database';
import type { Role } from '@waypoint/shared';
import fp from 'fastify-plugin';

interface AuditRecord {
  actorId: string;
  role: Role;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  // Operating-clock time when the caller has one. Otherwise the database default applies.
  createdAt?: Date;
}

type AuditTx = Parameters<Parameters<Database['transaction']>[0]>[0];

// Routes and services share one append-only writer. There is no update or delete path.
type AuditDb = Database | AuditTx;

export interface AuditRecorder {
  record(db: AuditDb, entry: AuditRecord): Promise<void>;
}

function createAuditRecorder(): AuditRecorder {
  return {
    async record(db, entry) {
      await db.insert(auditLog).values({
        actorId: entry.actorId,
        role: entry.role,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before ?? null,
        after: entry.after ?? null,
        ...(entry.createdAt !== undefined ? { createdAt: entry.createdAt } : {}),
      });
    },
  };
}

export const auditPlugin = fp(
  async (app) => {
    app.decorate('audit', createAuditRecorder());
  },
  { name: 'audit', dependencies: ['db'] },
);
