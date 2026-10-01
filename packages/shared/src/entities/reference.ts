import { z } from 'zod';
import {
  brandSchema,
  dockTypeSchema,
  parkingConstraintSchema,
  roadClassSchema,
  vehicleTemperatureSchema,
  vehicleTypeSchema,
} from '../enums.ts';
import {
  depotIdSchema,
  districtSchema,
  isoDateSchema,
  outletIdSchema,
  timeOfDaySchema,
  vehicleIdSchema,
} from '../primitives.ts';

export const timeWindowSchema = z.object({
  open: timeOfDaySchema,
  close: timeOfDaySchema,
});
export type TimeWindow = z.infer<typeof timeWindowSchema>;

export const outletSchema = z.object({
  id: outletIdSchema,
  brand: brandSchema,
  district: districtSchema,
  depotId: depotIdSchema,
  dockType: dockTypeSchema,
  parkingConstraint: parkingConstraintSchema,
  window: timeWindowSchema,
  mallWindow: timeWindowSchema.nullable(),
});
export type Outlet = z.infer<typeof outletSchema>;

export const vehicleSchema = z.object({
  id: vehicleIdSchema,
  type: vehicleTypeSchema,
  temp: vehicleTemperatureSchema,
  weightCapKg: z.number().positive(),
  volumeCapM3: z.number().positive(),
  fuelType: z.string().min(1),
  kmPerL: z.number().positive(),
  weeklyFuelQuotaL: z.number().nonnegative(),
  depotId: depotIdSchema,
});
export type Vehicle = z.infer<typeof vehicleSchema>;

export const districtTravelSchema = z.object({
  district: districtSchema,
  depotId: depotIdSchema,
  roadClass: roadClassSchema,
  depotToDistrictKm: z.number().nonnegative(),
  depotToDistrictMin: z.number().nonnegative(),
  interStopKm: z.number().nonnegative(),
  interStopMin: z.number().nonnegative(),
});
export type DistrictTravel = z.infer<typeof districtTravelSchema>;

export const serviceAllowanceSchema = z.object({
  brand: brandSchema,
  dockType: dockTypeSchema,
  minutes: z.number().nonnegative(),
});
export type ServiceAllowance = z.infer<typeof serviceAllowanceSchema>;

export const depotSchema = z.object({
  id: depotIdSchema,
  name: z.string().min(1),
});
export type Depot = z.infer<typeof depotSchema>;

// calendar.csv numbers Monday as 0. festivalRamp is the dataset coefficient, from 0 to 1.
export const calendarDaySchema = z.object({
  date: isoDateSchema,
  dow: z.int().min(0).max(6),
  isoYear: z.int().positive(),
  isoWeek: z.int().min(1).max(53),
  isPayday: z.boolean(),
  festival: z.string().min(1).nullable(),
  festivalRamp: z.number().min(0).max(1),
  isHoliday: z.boolean(),
  monsoon: z.boolean(),
  isOperating: z.boolean(),
});
export type CalendarDay = z.infer<typeof calendarDaySchema>;
