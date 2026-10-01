import { z } from 'zod';
import {
  calendarDaySchema,
  depotSchema,
  districtTravelSchema,
  outletSchema,
  serviceAllowanceSchema,
  vehicleSchema,
} from '../entities/reference.ts';
import {
  brandSchema,
  dockTypeSchema,
  vehicleAvailabilityStatusSchema,
  vehicleTemperatureSchema,
  vehicleTypeSchema,
} from '../enums.ts';
import {
  depotIdSchema,
  districtSchema,
  isoDateSchema,
  outletIdSchema,
  vehicleIdSchema,
} from '../primitives.ts';
import { listResponseSchema } from './common.ts';

export const outletParamsSchema = z.object({ id: outletIdSchema });
export type OutletParams = z.infer<typeof outletParamsSchema>;

export const vehicleParamsSchema = z.object({ id: vehicleIdSchema });
export type VehicleParams = z.infer<typeof vehicleParamsSchema>;

export const listOutletsQuerySchema = z.object({
  depot: depotIdSchema.optional(),
  brand: brandSchema.optional(),
  district: districtSchema.optional(),
});
export type ListOutletsQuery = z.infer<typeof listOutletsQuerySchema>;

export const listVehiclesQuerySchema = z.object({
  depot: depotIdSchema.optional(),
  status: vehicleAvailabilityStatusSchema.optional(),
  type: vehicleTypeSchema.optional(),
  temp: vehicleTemperatureSchema.optional(),
  date: isoDateSchema.optional(),
});
export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>;

export const vehicleDetailQuerySchema = z.object({
  date: isoDateSchema.optional(),
});
export type VehicleDetailQuery = z.infer<typeof vehicleDetailQuerySchema>;

export const listCalendarQuerySchema = z.object({
  date: isoDateSchema.optional(),
});
export type ListCalendarQuery = z.infer<typeof listCalendarQuerySchema>;

export const listDistrictTravelQuerySchema = z.object({
  depot: depotIdSchema.optional(),
  district: districtSchema.optional(),
});
export type ListDistrictTravelQuery = z.infer<typeof listDistrictTravelQuerySchema>;

export const listServiceAllowancesQuerySchema = z.object({
  brand: brandSchema.optional(),
  dockType: dockTypeSchema.optional(),
});
export type ListServiceAllowancesQuery = z.infer<typeof listServiceAllowancesQuerySchema>;

// Status lives on vehicle_availability for a service date, not on the vehicle row.
// Null means the caller did not ask for a date.
export const vehicleReferenceSchema = vehicleSchema.extend({
  availability: z
    .object({
      date: isoDateSchema,
      status: vehicleAvailabilityStatusSchema,
    })
    .nullable(),
});
export type VehicleReference = z.infer<typeof vehicleReferenceSchema>;

export const outletListResponseSchema = listResponseSchema(outletSchema);
export type OutletListResponse = z.infer<typeof outletListResponseSchema>;

export const vehicleListResponseSchema = listResponseSchema(vehicleReferenceSchema);
export type VehicleListResponse = z.infer<typeof vehicleListResponseSchema>;

export const depotListResponseSchema = listResponseSchema(depotSchema);
export type DepotListResponse = z.infer<typeof depotListResponseSchema>;

export const calendarListResponseSchema = listResponseSchema(calendarDaySchema);
export type CalendarListResponse = z.infer<typeof calendarListResponseSchema>;

export const districtTravelListResponseSchema = listResponseSchema(districtTravelSchema);
export type DistrictTravelListResponse = z.infer<typeof districtTravelListResponseSchema>;

export const serviceAllowanceListResponseSchema = listResponseSchema(serviceAllowanceSchema);
export type ServiceAllowanceListResponse = z.infer<typeof serviceAllowanceListResponseSchema>;
