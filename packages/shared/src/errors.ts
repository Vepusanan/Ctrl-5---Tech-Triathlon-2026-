import { z } from 'zod';
import { violationSchema } from './planning.ts';

export const errorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'CONSTRAINT_VIOLATION',
  'CUTOFF_PASSED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

// SYSTEM_DESIGN §6.3, plus 429 for the login rate limit and 500 for unexpected failures.
export const httpStatusByErrorCode = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  CONSTRAINT_VIOLATION: 422,
  CUTOFF_PASSED: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
} as const satisfies Record<ErrorCode, number>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
    violations: z.array(violationSchema).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
