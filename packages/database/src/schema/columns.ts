import { sql } from 'drizzle-orm';
import { customType, numeric, timestamp, uuid } from 'drizzle-orm/pg-core';

// Proof-of-delivery images. node-pg returns bytea as a Buffer.
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// PostgreSQL 16 has no built-in uuidv7(). The migration defines uuidv7() and columns default to it.
export function operationalId() {
  return uuid('id').primaryKey().default(sql`uuidv7()`);
}

export function eventTimestamp(name: string) {
  return timestamp(name, { withTimezone: true });
}

export function quantity(name: string) {
  return numeric(name, { precision: 12, scale: 3, mode: 'number' });
}
