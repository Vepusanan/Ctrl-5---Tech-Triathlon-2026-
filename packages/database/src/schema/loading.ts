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
    // Trip version the loader accepted. A later plan change stays stale until verify.
    acceptedTripVersion: integer('accepted_trip_version').notNull().default(0),
    verifiedAt: eventTimestamp('verified_at'),
  },
  (table) => [
    unique('loading_records_trip_id').on(table.tripId),
    index('loading_records_loader_id').on(table.loaderId),
    check('loading_records_accepted_version', sql`${table.acceptedTripVersion} >= 0`),
  ],
);

export const loadingIssues = pgTable(
  'loading_issues',
  {
    id: operationalId(),
    tripId: uuid('trip_id')
      .notNull()
      .references(() => trips.id),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    type: loadingIssueTypeEnum('type').notNull(),
    qty: integer('qty').notNull(),
    note: text('note'),
    loaderId: uuid('loader_id')
      .notNull()
      .references(() => users.id),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id),
    acknowledgedAt: eventTimestamp('acknowledged_at'),
    createdAt: eventTimestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('loading_issues_trip_id').on(table.tripId),
    index('loading_issues_order_id').on(table.orderId),
    index('loading_issues_loader_id').on(table.loaderId),
    index('loading_issues_acknowledged_by').on(table.acknowledgedBy),
    check('loading_issues_qty_positive', sql`${table.qty} > 0`),
    check(
      'loading_issues_acknowledgement',
      sql`(
        (${table.acknowledgedBy} is null and ${table.acknowledgedAt} is null)
        or (${table.acknowledgedBy} is not null and ${table.acknowledgedAt} is not null)
      )`,
    ),
  ],
);
