import { z } from 'zod';
import { timestampSchema } from '../primitives.ts';

// GET and PUT /admin/clock (DEMO_MODE only).
export const operatingClockSchema = z.object({ now: timestampSchema });
export type OperatingClock = z.infer<typeof operatingClockSchema>;
