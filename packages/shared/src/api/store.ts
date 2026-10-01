import { z } from 'zod';
import { notificationSchema } from '../entities/notification.ts';
import { issueSchema } from '../entities/store.ts';
import { listResponseSchema } from './common.ts';

export const notificationFeedItemSchema = notificationSchema.extend({
  actionRequired: z.boolean(),
});
export type NotificationFeedItem = z.infer<typeof notificationFeedItemSchema>;

export const createIssueRequestSchema = issueSchema
  .pick({ orderId: true, type: true })
  .extend({ note: z.string().trim().min(1).optional() });
export type CreateIssueRequest = z.infer<typeof createIssueRequestSchema>;

export const issueListResponseSchema = listResponseSchema(issueSchema);
export type IssueListResponse = z.infer<typeof issueListResponseSchema>;

export const notificationListResponseSchema = listResponseSchema(notificationFeedItemSchema);
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
