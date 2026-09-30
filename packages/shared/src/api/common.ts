import { z } from 'zod';
import { uuidSchema } from '../primitives.ts';

// SYSTEM_DESIGN §6.1: list endpoints return { items, total }.
export function listResponseSchema<Item extends z.ZodType>(item: Item) {
  return z.object({ items: z.array(item), total: z.int().nonnegative() });
}

export const idParamsSchema = z.object({ id: uuidSchema });
export type IdParams = z.infer<typeof idParamsSchema>;

const nonNegativeIntegerString = z
  .string()
  .regex(/^\d+$/, 'Expected a non-negative integer')
  .transform(Number);

// Mutations on versioned entities send If-Match: <version>; a stale version returns 409.
export const ifMatchHeadersSchema = z.object({ 'if-match': nonNegativeIntegerString });
export type IfMatchHeaders = z.infer<typeof ifMatchHeadersSchema>;

export const versionQuerySchema = z.object({ since: nonNegativeIntegerString });
export type VersionQuery = z.infer<typeof versionQuerySchema>;
