import {
  brandSchema,
  deferralTypeSchema,
  dockTypeSchema,
  entityTypeSchema,
  issueStatusSchema,
  issueTypeSchema,
  loadingIssueTypeSchema,
  loadingStatusSchema,
  notificationPrioritySchema,
  notificationTypeSchema,
  orderStatusSchema,
  parkingConstraintSchema,
  planningRunStatusSchema,
  reasonCodeSchema,
  roadClassSchema,
  roleSchema,
  stopEventTypeSchema,
  stopStatusSchema,
  temperatureRequirementSchema,
  tripStatusSchema,
  vehicleAvailabilityStatusSchema,
  vehicleTemperatureSchema,
  vehicleTypeSchema,
} from '@waypoint/shared';
import { pgEnum } from 'drizzle-orm/pg-core';

// Labels come from the shared Zod enums so the database cannot drift from the API vocabulary.

export const roleEnum = pgEnum('role', roleSchema.enum);
export const brandEnum = pgEnum('brand', brandSchema.enum);
export const temperatureRequirementEnum = pgEnum(
  'temperature_requirement',
  temperatureRequirementSchema.enum,
);
export const vehicleTypeEnum = pgEnum('vehicle_type', vehicleTypeSchema.enum);
export const vehicleTemperatureEnum = pgEnum('vehicle_temperature', vehicleTemperatureSchema.enum);
export const dockTypeEnum = pgEnum('dock_type', dockTypeSchema.enum);
export const parkingConstraintEnum = pgEnum('parking_constraint', parkingConstraintSchema.enum);
export const roadClassEnum = pgEnum('road_class', roadClassSchema.enum);
export const vehicleAvailabilityStatusEnum = pgEnum(
  'vehicle_availability_status',
  vehicleAvailabilityStatusSchema.enum,
);
export const orderStatusEnum = pgEnum('order_status', orderStatusSchema.enum);
export const tripStatusEnum = pgEnum('trip_status', tripStatusSchema.enum);
export const stopStatusEnum = pgEnum('stop_status', stopStatusSchema.enum);
export const loadingStatusEnum = pgEnum('loading_status', loadingStatusSchema.enum);
export const planningRunStatusEnum = pgEnum('planning_run_status', planningRunStatusSchema.enum);
export const reasonCodeEnum = pgEnum('reason_code', reasonCodeSchema.enum);
export const deferralTypeEnum = pgEnum('deferral_type', deferralTypeSchema.enum);
export const loadingIssueTypeEnum = pgEnum('loading_issue_type', loadingIssueTypeSchema.enum);
export const stopEventTypeEnum = pgEnum('stop_event_type', stopEventTypeSchema.enum);
export const issueTypeEnum = pgEnum('issue_type', issueTypeSchema.enum);
export const issueStatusEnum = pgEnum('issue_status', issueStatusSchema.enum);
export const notificationTypeEnum = pgEnum('notification_type', notificationTypeSchema.enum);
export const notificationPriorityEnum = pgEnum(
  'notification_priority',
  notificationPrioritySchema.enum,
);
export const entityTypeEnum = pgEnum('entity_type', entityTypeSchema.enum);
