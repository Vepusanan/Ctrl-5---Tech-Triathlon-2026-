import { z } from 'zod';
import { loadingIssueTypeSchema } from '../enums.ts';
import { timestampSchema, uuidSchema } from '../primitives.ts';

export const loadingIssueSchema = z.object({
  id: uuidSchema,
  tripId: uuidSchema,
  orderId: uuidSchema,
  type: loadingIssueTypeSchema,
  qty: z.int().positive(),
  note: z.string().trim().min(1).nullable(),
  loaderId: uuidSchema,
  acknowledgedBy: uuidSchema.nullable(),
  acknowledgedAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});
export type LoadingIssue = z.infer<typeof loadingIssueSchema>;
