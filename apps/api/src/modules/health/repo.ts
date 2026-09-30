import type { Database } from '@waypoint/database';
import { sql } from 'drizzle-orm';

export interface HealthRepo {
  pingDatabase: () => Promise<void>;
}

export function createHealthRepo(db: Database): HealthRepo {
  return {
    async pingDatabase() {
      await db.execute(sql`select 1`);
    },
  };
}
