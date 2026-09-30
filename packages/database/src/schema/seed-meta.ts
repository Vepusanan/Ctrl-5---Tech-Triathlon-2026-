import { sql } from 'drizzle-orm';
import { check, date, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { eventTimestamp } from './columns.ts';

// One row means this database was seeded (SYSTEM_DESIGN §12.1). A missing row is the only
// signal the seed job uses, so a second migrate-and-seed exits without changing data.
export const seedMeta = pgTable(
  'seed_meta',
  {
    id: text('id').primaryKey(),
    seedVersion: text('seed_version').notNull(),
    serviceDate: date('service_date').notNull(),
    source: text('source').notNull(),
    rngSeed: integer('rng_seed').notNull(),
    seededAt: eventTimestamp('seeded_at').notNull(),
  },
  (table) => [check('seed_meta_source', sql`${table.source} in ('dataset', 'synthetic')`)],
);
