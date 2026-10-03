/** The hard planning rules in plain words (SYSTEM_DESIGN §7.2). */
import type { ReasonCode } from '@waypoint/shared';

/** Short label for a rule, as used on charts and chips. */
export const ruleLabels: Record<ReasonCode, string> = {
  MIXED_BRAND_DISTRICT: 'Mixed brand or district',
  REEFER_REQUIRED: 'No reefer space',
  VAN_REQUIRED: 'Van-only slots full',
  WRONG_DEPOT: 'Wrong depot',
  VEHICLE_UNAVAILABLE: 'Vehicle unavailable',
  WEIGHT_CAP: 'Over weight',
  VOLUME_CAP: 'Over volume',
  TRIP_LIMIT: 'Trip limit reached',
  FRESH_TIME_BUDGET: 'Fresh time budget',
  DAY_TIME_BUDGET: 'Day time budget',
  WINDOW_MISSED: 'Window conflict',
  FUEL_QUOTA: 'Fuel quota',
};

/** What the rule requires, for "Why this rule". */
export const ruleExplanations: Record<ReasonCode, string> = {
  MIXED_BRAND_DISTRICT: 'Every stop on a trip must share one brand and one district.',
  REEFER_REQUIRED: 'A chilled order must travel on a refrigerated vehicle.',
  VAN_REQUIRED: 'A van-only outlet can only be served by a van.',
  WRONG_DEPOT: 'A vehicle serves outlets of its own depot only.',
  VEHICLE_UNAVAILABLE: 'The vehicle must be available on the service date.',
  WEIGHT_CAP: 'The total weight on a trip must not exceed the vehicle’s weight capacity.',
  VOLUME_CAP: 'The total volume on a trip must not exceed the vehicle’s volume capacity.',
  TRIP_LIMIT: 'A vehicle runs at most two trips a day.',
  FRESH_TIME_BUDGET: 'Fresh trips on one vehicle must fit in 270 minutes (03:30–08:00).',
  DAY_TIME_BUDGET: 'Style and Tech trips on one vehicle must fit in 480 minutes.',
  WINDOW_MISSED: 'Each stop must be reached before its window closes and inside any mall window.',
  FUEL_QUOTA: 'A trip’s fuel must fit in the vehicle’s remaining weekly quota.',
};

export const ruleIcons: Partial<Record<ReasonCode, string>> = {
  REEFER_REQUIRED: 'snow',
  WINDOW_MISSED: 'clock',
  VAN_REQUIRED: 'truck',
  WEIGHT_CAP: 'box',
  VOLUME_CAP: 'box',
  FUEL_QUOTA: 'fuel',
  FRESH_TIME_BUDGET: 'clock',
  DAY_TIME_BUDGET: 'clock',
};
