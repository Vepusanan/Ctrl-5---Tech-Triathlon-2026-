import { z } from 'zod';
import { isoDateSchema, timestampSchema } from '../primitives.ts';

// GET and PUT /admin/clock (DEMO_MODE only).
export const operatingClockSchema = z.object({ now: timestampSchema });
export type OperatingClock = z.infer<typeof operatingClockSchema>;

// POST /admin/reset. The literal true stops an empty body from wiping the demo.
export const seedResetRequestSchema = z.object({
  confirm: z.literal(true),
});
export type SeedResetRequest = z.infer<typeof seedResetRequestSchema>;

export const seedResetResponseSchema = z.object({
  serviceDate: isoDateSchema,
  source: z.enum(['dataset', 'synthetic']),
});
export type SeedResetResponse = z.infer<typeof seedResetResponseSchema>;
