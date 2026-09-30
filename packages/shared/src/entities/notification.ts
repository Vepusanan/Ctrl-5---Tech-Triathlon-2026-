import { z } from 'zod';
import {
  entityTypeSchema,
  type NotificationPriority,
  type NotificationType,
  notificationPrioritySchema,
  notificationTypeSchema,
} from '../enums.ts';
import { timestampSchema, uuidSchema } from '../primitives.ts';

// SYSTEM_DESIGN §11.1.
export const notificationPriorityByType = {
  order_confirmed: 'info',
  order_deferred: 'high',
  plan_published: 'high',
  loading_shortfall: 'high',
  delivery_failed: 'high',
  delivered: 'info',
  receipt_discrepancy: 'high',
  sync_conflict: 'medium',
} as const satisfies Record<NotificationType, NotificationPriority>;

export const notificationSchema = z.object({
  id: uuidSchema,
  recipientId: uuidSchema,
  type: notificationTypeSchema,
  priority: notificationPrioritySchema,
  entityType: entityTypeSchema,
  entityId: z.string().min(1),
  createdAt: timestampSchema,
  readAt: timestampSchema.nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;
