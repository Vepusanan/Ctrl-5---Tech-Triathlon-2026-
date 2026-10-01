// Hard limits from SYSTEM_DESIGN §7.2. Equality is feasible; only a greater value violates.

export const MAX_TRIPS_PER_VEHICLE = 2;
export const FRESH_TIME_BUDGET_MIN = 270;
export const DAY_TIME_BUDGET_MIN = 480;

/** Fresh's first trip of the day leaves the depot at 03:30 Asia/Colombo. */
export const FRESH_DEPARTURE_MIN = 3 * 60 + 30;

/**
 * Style and Tech start when the Fresh pre-dawn window ends (03:30 + 270 min).
 * SYSTEM_DESIGN states the Fresh departure explicitly and the daytime budget separately.
 */
export const DAY_DEPARTURE_MIN = 8 * 60;

/** Same tolerance as the published Task 2B checker: values within 1e-6 of the limit still pass. */
export const LIMIT_EPSILON = 1e-6;

/**
 * Window span that scores zero tightness (SYSTEM_DESIGN §7.4, "+0 to 10").
 * A zero-length window scores `policy.tightWindowMax`; spans in between scale linearly.
 * 180 minutes is a full Fresh morning window (05:00–08:00).
 */
export const WIDE_DELIVERY_WINDOW_MIN = 180;

/** Plan scorecard: a stop this close to its deadline is a tight-window stop (§7.6). */
export const TIGHT_WINDOW_SLACK_MIN = 15;
