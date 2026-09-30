import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { eventTimestamp, operationalId } from './columns.ts';
import {
  entityTypeEnum,
  notificationPriorityEnum,
  notificationTypeEnum,
  roleEnum,
} from './enums.ts';
import { stopEvents } from './field.ts';
import { users } from './identity.ts';

export const notifications = pgTable(
  'notifications',
  {
    id: operationalId(),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id),
    type: notificationTypeEnum('type').notNull(),
    priority: notificationPriorityEnum('priority').notNull(),
    entityType: entityTypeEnum('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    createdAt: eventTimestamp('created_at').notNull().defaultNow(),
    readAt: eventTimestamp('read_at'),
  },
  (table) => [
    index('notifications_recipient_created_at').on(table.recipientId, table.createdAt),
    check('notifications_entity_id_present', sql`${table.entityId} <> ''`),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: operationalId(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    role: roleEnum('role').notNull(),
    action: text('action').notNull(),
    // Wider than notification entity_type: publish, deferrals and seed resets are audited too.
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    createdAt: eventTimestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_entity').on(table.entityType, table.entityId),
    index('audit_log_actor_id').on(table.actorId),
    index('audit_log_created_at').on(table.createdAt),
    check('audit_log_action_present', sql`${table.action} <> ''`),
    check('audit_log_entity_present', sql`${table.entityType} <> '' and ${table.entityId} <> ''`),
  ],
);

export const syncConflicts = pgTable(
  'sync_conflicts',
  {
    id: operationalId(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => stopEvents.id),
    reason: text('reason').notNull(),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    createdAt: eventTimestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('sync_conflicts_event_id').on(table.eventId),
    index('sync_conflicts_resolved_by').on(table.resolvedBy),
    index('sync_conflicts_unresolved').on(table.createdAt).where(sql`${table.resolvedBy} is null`),
    check('sync_conflicts_reason_present', sql`${table.reason} <> ''`),
  ],
);
