import { z } from 'zod';
import { roleSchema } from '../enums.ts';
import { depotIdSchema, outletIdSchema, uuidSchema, vehicleIdSchema } from '../primitives.ts';

const userBase = {
  id: uuidSchema,
  name: z.string().trim().min(1),
  email: z.email(),
};

// Each role carries the scope the server filters its queries by (SYSTEM_DESIGN §9.2–9.3).
export const userSchema = z.discriminatedUnion('role', [
  z.object({
    ...userBase,
    role: z.literal(roleSchema.enum.dispatcher),
    depotId: depotIdSchema.nullable(),
  }),
  z.object({ ...userBase, role: z.literal(roleSchema.enum.loader), depotId: depotIdSchema }),
  z.object({ ...userBase, role: z.literal(roleSchema.enum.driver), vehicleId: vehicleIdSchema }),
  z.object({
    ...userBase,
    role: z.literal(roleSchema.enum.store_manager),
    outletId: outletIdSchema,
  }),
]);
export type User = z.infer<typeof userSchema>;
