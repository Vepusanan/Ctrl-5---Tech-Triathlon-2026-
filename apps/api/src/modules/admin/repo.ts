import {
  type Database,
  DEMO_USERS,
  type SeedResult,
  seedDatabase,
  users,
} from '@waypoint/database';
import type { Role } from '@waypoint/shared';
import { eq } from 'drizzle-orm';

interface DemoActor {
  id: string;
  role: Role;
  email: string;
}

export interface AdminRepo {
  findUserByEmail(email: string): Promise<DemoActor | null>;
  restoreSeed(options: {
    password: string;
    demoDate?: string;
    dataDir?: string;
  }): Promise<SeedResult>;
}

export function createAdminRepo(db: Database): AdminRepo {
  return {
    async findUserByEmail(email) {
      const rows = await db
        .select({ id: users.id, role: users.role, email: users.email })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      return rows[0] ?? null;
    },

    restoreSeed(options) {
      return seedDatabase(db, {
        reset: true,
        password: options.password,
        ...(options.demoDate !== undefined ? { demoDate: options.demoDate } : {}),
        ...(options.dataDir !== undefined ? { dataDir: options.dataDir } : {}),
      });
    },
  };
}

export const DEMO_DISPATCHER_EMAIL = DEMO_USERS.dispatcher.email;
