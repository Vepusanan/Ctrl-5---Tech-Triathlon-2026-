import { z } from 'zod';
import { notificationSchema } from '../entities/notification.ts';
import { issueSchema } from '../entities/store.ts';
import { listResponseSchema } from './common.ts';

export const createIssueRequestSchema = issueSchema
  .pick({ orderId: true, type: true })
  .extend({ note: z.string().trim().min(1).optional() });
export type CreateIssueRequest = z.infer<typeof createIssueRequestSchema>;

export const notificationListResponseSchema = listResponseSchema(notificationSchema);
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;
