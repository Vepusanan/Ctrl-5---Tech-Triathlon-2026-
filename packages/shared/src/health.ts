import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  database: z.enum(['up', 'down']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// GET /api/health/ready also reports whether every migration in the journal is applied.
export const readinessResponseSchema = healthResponseSchema.extend({
  migrations: z.enum(['applied', 'pending']),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
