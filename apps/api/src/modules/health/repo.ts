import type { Database } from '@waypoint/database';
import { sql } from 'drizzle-orm';

export interface HealthRepo {
  pingDatabase: () => Promise<void>;
  appliedMigrations: () => Promise<number>;
}

export function createHealthRepo(db: Database): HealthRepo {
  return {
    async pingDatabase() {
      await db.execute(sql`select 1`);
    },

    async appliedMigrations() {
      const result = await db.execute<{ applied: number | string }>(
        sql`select count(*)::int as applied from drizzle.__drizzle_migrations`,
      );
      const applied = result.rows[0]?.applied;
      if (typeof applied === 'number' && Number.isInteger(applied)) return applied;
      if (typeof applied === 'string' && /^\d+$/.test(applied)) return Number(applied);
      throw new Error('Migration count was not a number');
    },
  };
}
