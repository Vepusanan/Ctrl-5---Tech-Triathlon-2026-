import {
  calendarDays,
  type Database,
  DEMO_USERS,
  type SeedResult,
  seedDatabase,
  seedMeta,
  users,
} from '@waypoint/database';
import type { Role } from '@waypoint/shared';
import { and, desc, eq, lt } from 'drizzle-orm';

interface DemoActor {
  id: string;
  role: Role;
  email: string;
}

interface SeededDay {
  serviceDate: string;
  // The operating day whose 4 PM cutoff closes the seeded run.
  cutoffDate: string;
}

export interface AdminRepo {
  findUserByEmail(email: string): Promise<DemoActor | null>;
  findSeededDay(): Promise<SeededDay | null>;
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

    async findSeededDay() {
      const [seeded] = await db
        .select({ serviceDate: seedMeta.serviceDate })
        .from(seedMeta)
        .limit(1);
      if (seeded === undefined) return null;
      const [previous] = await db
        .select({ date: calendarDays.date })
        .from(calendarDays)
        .where(and(lt(calendarDays.date, seeded.serviceDate), eq(calendarDays.isOperating, true)))
        .orderBy(desc(calendarDays.date))
        .limit(1);
      if (previous === undefined) return null;
      return { serviceDate: seeded.serviceDate, cutoffDate: previous.date };
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
