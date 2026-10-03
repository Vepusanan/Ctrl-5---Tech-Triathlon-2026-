import { calendarDays, seedMeta } from '@waypoint/database';
import { and, desc, eq, lt } from 'drizzle-orm';
import fp from 'fastify-plugin';

// SYSTEM_DESIGN §1.2 / §12.2. Cutoff and other operational decisions read this clock.
// Production follows the host clock until the demo admin endpoint pins a time.
// Callers must not read Date.now() themselves.
export interface OperatingClock {
  now(): Date;
  pin(now: Date): void;
  unpin(): void;
}

function createOperatingClock(): OperatingClock {
  let pinned: Date | null = null;
  return {
    now() {
      return pinned === null ? new Date() : new Date(pinned.getTime());
    },
    pin(now) {
      pinned = new Date(now.getTime());
    },
    unpin() {
      pinned = null;
    },
  };
}

export const clockPlugin = fp(
  async (app, options: { demoMode?: boolean }) => {
    const clock = createOperatingClock();
    app.decorate('clock', clock);
    if (!options.demoMode) return;
    const [seed] = await app.db
      .select({ serviceDate: seedMeta.serviceDate })
      .from(seedMeta)
      .limit(1);
    if (!seed) return;
    const [previous] = await app.db
      .select({ date: calendarDays.date })
      .from(calendarDays)
      .where(and(lt(calendarDays.date, seed.serviceDate), eq(calendarDays.isOperating, true)))
      .orderBy(desc(calendarDays.date))
      .limit(1);
    // Start the demo before cutoff so seeded drafts can still be edited and submitted.
    // Session expiry continues to use real time in the auth service.
    if (previous) clock.pin(new Date(`${previous.date}T10:00:00+05:30`));
  },
  { name: 'clock', dependencies: ['db'] },
);
