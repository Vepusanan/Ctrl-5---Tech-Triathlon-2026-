import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { eventTimestamp, operationalId } from './columns.ts';
import { loadingIssueTypeEnum, loadingStatusEnum } from './enums.ts';
import { users } from './identity.ts';
import { orders } from './orders.ts';
import { trips } from './planning.ts';

export const loadingRecords = pgTable(
  'loading_records',
  {
    id: operationalId(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    status: loadingStatusEnum('status').notNull().default('not_started'),
    loaderId: uuid('loader_id')
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    unique('loading_records_trip_id').on(table.tripId),
    index('loading_records_loader_id').on(table.loaderId),
  ],
);

export const loadingIssues = pgTable(
  'loading_issues',
  {
    id: operationalId(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    type: loadingIssueTypeEnum('type').notNull(),
    qty: integer('qty').notNull(),
    note: text('note'),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id),
    createdAt: eventTimestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('loading_issues_order_id').on(table.orderId),
    index('loading_issues_acknowledged_by').on(table.acknowledgedBy),
    check('loading_issues_qty_positive', sql`${table.qty} > 0`),
  ],
);
