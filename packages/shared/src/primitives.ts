import { z } from 'zod';

export const uuidSchema = z.uuid();

export const outletIdSchema = z
  .string()
  .regex(/^OUT\d{3}$/, 'Expected an outlet id such as OUT001');
export const vehicleIdSchema = z
  .string()
  .regex(/^VEH\d{3}$/, 'Expected a vehicle id such as VEH014');
export const depotIdSchema = z.string().min(1);
export const districtSchema = z.string().min(1);

export const isoDateSchema = z.iso.date();
// ISO 8601 with an explicit offset; the API emits +05:30 (Asia/Colombo).
export const timestampSchema = z.iso.datetime({ offset: true });
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a 24-hour HH:MM time');

export const versionSchema = z.int().nonnegative();
export const tripNoSchema = z.union([z.literal(1), z.literal(2)]);
export type TripNo = z.infer<typeof tripNoSchema>;

// Identifies one vehicle-trip in violations, for example VEH031-1.
export const tripKeySchema = z
  .string()
  .regex(/^VEH\d{3}-[12]$/, 'Expected a trip key such as VEH031-1');
