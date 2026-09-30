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
import { describe, expect, it } from 'vitest';
import {
  brandEnum,
  deferralTypeEnum,
  dockTypeEnum,
  entityTypeEnum,
  issueStatusEnum,
  issueTypeEnum,
  loadingIssueTypeEnum,
  loadingStatusEnum,
  notificationPriorityEnum,
  notificationTypeEnum,
  orderStatusEnum,
  parkingConstraintEnum,
  planningRunStatusEnum,
  reasonCodeEnum,
  roadClassEnum,
  roleEnum,
  stopEventTypeEnum,
  stopStatusEnum,
  temperatureRequirementEnum,
  tripStatusEnum,
  vehicleAvailabilityStatusEnum,
  vehicleTemperatureEnum,
  vehicleTypeEnum,
} from '../src/schema/enums.ts';

function sameLabels(
  postgres: { enumValues: readonly string[] },
  zod: { options: readonly string[] },
) {
  expect([...postgres.enumValues].sort()).toEqual([...zod.options].sort());
}

describe('postgres enums', () => {
  it('uses the shared status and reference vocabularies', () => {
    sameLabels(roleEnum, roleSchema);
    sameLabels(brandEnum, brandSchema);
    sameLabels(temperatureRequirementEnum, temperatureRequirementSchema);
    sameLabels(vehicleTypeEnum, vehicleTypeSchema);
    sameLabels(vehicleTemperatureEnum, vehicleTemperatureSchema);
    sameLabels(dockTypeEnum, dockTypeSchema);
    sameLabels(parkingConstraintEnum, parkingConstraintSchema);
    sameLabels(roadClassEnum, roadClassSchema);
    sameLabels(vehicleAvailabilityStatusEnum, vehicleAvailabilityStatusSchema);
    sameLabels(orderStatusEnum, orderStatusSchema);
    sameLabels(tripStatusEnum, tripStatusSchema);
    sameLabels(stopStatusEnum, stopStatusSchema);
    sameLabels(loadingStatusEnum, loadingStatusSchema);
    sameLabels(planningRunStatusEnum, planningRunStatusSchema);
    sameLabels(reasonCodeEnum, reasonCodeSchema);
    sameLabels(deferralTypeEnum, deferralTypeSchema);
    sameLabels(loadingIssueTypeEnum, loadingIssueTypeSchema);
    sameLabels(stopEventTypeEnum, stopEventTypeSchema);
    sameLabels(issueTypeEnum, issueTypeSchema);
    sameLabels(issueStatusEnum, issueStatusSchema);
    sameLabels(notificationTypeEnum, notificationTypeSchema);
    sameLabels(notificationPriorityEnum, notificationPrioritySchema);
    sameLabels(entityTypeEnum, entityTypeSchema);
  });
});
