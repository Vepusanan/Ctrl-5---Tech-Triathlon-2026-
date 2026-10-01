/**
 * SYSTEM_DESIGN §8.3. The stop is no longer on the driver's vehicle.
 * A trip version ahead of the version cached on the event means the plan changed
 * while the driver was offline, so the event is kept as a conflict.
 * Matching versions are another driver's stop, not an offline removal.
 */
export function offlinePlanMovedPast(
  eventTripVersion: number,
  stopTripVersion: number,
  driverTripVersions: readonly number[],
): boolean {
  if (stopTripVersion > eventTripVersion) return true;
  return driverTripVersions.some((version) => version > eventTripVersion);
}
