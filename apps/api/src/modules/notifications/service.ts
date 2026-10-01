import type { Database } from '@waypoint/database';
import type { NotificationFeedItem, NotificationListResponse, User } from '@waypoint/shared';
import { notificationRequiresAction } from '@waypoint/shared';
import type { OperatingClock } from '../../plugins/clock.ts';
import { ApiError } from '../../plugins/errors.ts';
import { formatColomboTimestamp } from '../orders/cutoff.ts';
import { createNotificationRepo, type NotificationRepo, type NotificationRow } from './repo.ts';

const MISSING = 'Notification not found';
const NOT_ACTIONABLE = 'This notification does not require acknowledgement';

export interface NotificationService {
  list(user: User | null): Promise<NotificationListResponse>;
  markRead(user: User | null, id: string): Promise<NotificationFeedItem>;
  acknowledge(user: User | null, id: string): Promise<NotificationFeedItem>;
}

export function createNotificationService(
  db: Database,
  clock: OperatingClock,
  repo: NotificationRepo = createNotificationRepo(),
): NotificationService {
  return {
    async list(user) {
      const reader = assertUser(user);
      const rows = await repo.listForRecipient(db, reader.id);
      const items = rows.map(toFeed);
      return { items, total: items.length };
    },

    async markRead(user, id) {
      const reader = assertUser(user);
      const now = clock.now();
      return db.transaction(async (tx) => {
        const current = await repo.lockForRecipient(tx, id, reader.id);
        if (current === null) throw new ApiError('NOT_FOUND', MISSING);
        if (current.readAt !== null) return toFeed(current);
        const updated = await repo.markRead(tx, id, now);
        if (updated === null) throw new ApiError('NOT_FOUND', MISSING);
        return toFeed(updated);
      });
    },

    async acknowledge(user, id) {
      const reader = assertUser(user);
      const now = clock.now();
      return db.transaction(async (tx) => {
        const current = await repo.lockForRecipient(tx, id, reader.id);
        if (current === null) throw new ApiError('NOT_FOUND', MISSING);
        if (current.priority !== 'high') throw new ApiError('CONSTRAINT_VIOLATION', NOT_ACTIONABLE);
        if (current.acknowledgedAt !== null) return toFeed(current);
        const updated = await repo.acknowledge(tx, id, now);
        if (updated === null) throw new ApiError('NOT_FOUND', MISSING);
        return toFeed(updated);
      });
    },
  };
}

function assertUser(user: User | null): User {
  if (user === null) throw new ApiError('UNAUTHENTICATED', 'Sign in required');
  return user;
}

function toFeed(row: NotificationRow): NotificationFeedItem {
  const acknowledgedAt =
    row.acknowledgedAt === null ? null : formatColomboTimestamp(row.acknowledgedAt);
  return {
    id: row.id,
    recipientId: row.recipientId,
    type: row.type,
    priority: row.priority,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: formatColomboTimestamp(row.createdAt),
    readAt: row.readAt === null ? null : formatColomboTimestamp(row.readAt),
    acknowledgedAt,
    actionRequired: notificationRequiresAction(row.priority, acknowledgedAt),
  };
}
