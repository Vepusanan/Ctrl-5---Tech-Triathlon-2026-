import { z } from 'zod';
import { brandSchema, orderStatusSchema, temperatureRequirementSchema } from '../enums.ts';
import {
  isoDateSchema,
  outletIdSchema,
  timestampSchema,
  uuidSchema,
  versionSchema,
} from '../primitives.ts';

export const orderSizeSchema = z.object({
  units: z.int().positive(),
  weightKg: z.number().positive(),
  volumeM3: z.number().positive(),
});

export const orderSchema = z.object({
  id: uuidSchema,
  outletId: outletIdSchema,
  brand: brandSchema,
  temp: temperatureRequirementSchema,
  requestedDate: isoDateSchema,
  ...orderSizeSchema.shape,
  status: orderStatusSchema,
  submittedAt: timestampSchema.nullable(),
  lockedAt: timestampSchema.nullable(),
  version: versionSchema,
});
export type Order = z.infer<typeof orderSchema>;
