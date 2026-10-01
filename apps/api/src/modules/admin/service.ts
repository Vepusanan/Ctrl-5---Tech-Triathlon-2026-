import type { Database } from '@waypoint/database';
import type {
  OperatingClock as OperatingClockBody,
  SeedResetRequest,
  SeedResetResponse,
  User,
} from '@waypoint/shared';
import type { FastifyBaseLogger } from 'fastify';
import type { AuditRecorder } from '../../plugins/audit.ts';
import type { OperatingClock } from '../../plugins/clock.ts';
import { ApiError } from '../../plugins/errors.ts';
import { formatColomboTimestamp } from '../orders/cutoff.ts';
import { createAdminRepo, DEMO_DISPATCHER_EMAIL } from './repo.ts';

export interface DemoSeedConfig {
  password: string;
  demoDate?: string;
  dataDir?: string;
}

export interface AdminService {
  readClock(): OperatingClockBody;
  setClock(input: OperatingClockBody): OperatingClockBody;
  reset(user: User | null, input: SeedResetRequest): Promise<SeedResetResponse>;
}

export function createAdminService(
  db: Database,
  audit: AuditRecorder,
  clock: OperatingClock,
  log: Pick<FastifyBaseLogger, 'info' | 'error'>,
  seed: DemoSeedConfig,
  repo = createAdminRepo(db),
): AdminService {
  return {
    readClock() {
      return { now: formatColomboTimestamp(clock.now()) };
    },

    setClock(input) {
      const pinned = new Date(input.now);
      if (Number.isNaN(pinned.getTime())) {
        throw new ApiError('VALIDATION_ERROR', 'Operating time is invalid');
      }
      clock.pin(pinned);
      return { now: formatColomboTimestamp(pinned) };
    },

    async reset(user, input) {
      if (user === null) throw new ApiError('UNAUTHENTICATED', 'Sign in required');
      if (user.role !== 'dispatcher') {
        throw new ApiError('FORBIDDEN', 'You do not have access to this action');
      }
      if (input.confirm !== true) {
        throw new ApiError('VALIDATION_ERROR', 'Seed reset requires confirm: true');
      }

      let restored: Awaited<ReturnType<typeof repo.restoreSeed>>;
      try {
        restored = await repo.restoreSeed(seed);
      } catch (error) {
        log.error({ err: error }, 'seed.reset_failed');
        throw new ApiError('INTERNAL_ERROR', 'Could not restore the demo seed');
      }
      if (!restored.applied) {
        throw new ApiError('INTERNAL_ERROR', 'Could not restore the demo seed');
      }

      const actor =
        (await repo.findUserByEmail(user.email)) ??
        (await repo.findUserByEmail(DEMO_DISPATCHER_EMAIL));
      if (actor === null || actor.role !== 'dispatcher') {
        throw new ApiError('INTERNAL_ERROR', 'Could not restore the demo seed');
      }

      const after = { serviceDate: restored.serviceDate, source: restored.source };
      await audit.record(db, {
        actorId: actor.id,
        role: 'dispatcher',
        action: 'seed.reset',
        entityType: 'seed',
        entityId: 'waypoint',
        after,
        createdAt: clock.now(),
      });
      log.info({ actorId: actor.id, role: 'dispatcher', ...after }, 'seed.reset');
      return after;
    },
  };
}
