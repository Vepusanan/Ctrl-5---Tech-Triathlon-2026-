import type { StopEvent } from '@waypoint/shared';
import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { bytea, eventTimestamp, operationalId } from './columns.ts';
import { stopEventTypeEnum } from './enums.ts';
import { tripStops } from './planning.ts';

type StopEventPayload = StopEvent['payload'];

export const stopEvents = pgTable(
  'stop_events',
  {
    id: operationalId(),
    clientEventId: uuid('client_event_id').notNull(),
    stopId: uuid('stop_id')
      .notNull()
      .references(() => tripStops.id),
    type: stopEventTypeEnum('type').notNull(),
    payload: jsonb('payload').$type<StopEventPayload>().notNull(),
    clientTime: eventTimestamp('client_time').notNull(),
    serverTime: eventTimestamp('server_time').notNull(),
    tripVersion: integer('trip_version').notNull(),
  },
  (table) => [
    unique('stop_events_client_event_id').on(table.clientEventId),
    index('stop_events_stop_id').on(table.stopId),
    check('stop_events_trip_version_nonnegative', sql`${table.tripVersion} >= 0`),
  ],
);

export const pods = pgTable(
  'pods',
  {
    id: operationalId(),
    stopId: uuid('stop_id')
      .notNull()
      .references(() => tripStops.id),
    recipientName: text('recipient_name').notNull(),
    signature: bytea('signature').notNull(),
    photo: bytea('photo'),
    clientTime: eventTimestamp('client_time').notNull(),
  },
  (table) => [
    unique('pods_stop_id').on(table.stopId),
    check('pods_recipient_name_length', sql`char_length(${table.recipientName}) between 1 and 120`),
  ],
);
