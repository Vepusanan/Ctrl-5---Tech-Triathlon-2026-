import type { Brand } from '@waypoint/shared';
import { DAY_DEPARTURE_MIN, FRESH_DEPARTURE_MIN } from './constants.ts';
import { PlanningInputError } from './errors.ts';

/**
 * Trip arithmetic from SYSTEM_DESIGN §7.3. Every start minute is supplied by the caller.
 * Waiting is applied only to arrivals. It is not added to trip minutes, distance, or fuel.
 */

export type TripTimingInput = {
  depotToDistrictMin: number;
  interStopMin: number;
  serviceAllowanceMin: readonly number[];
};

export type TripDistanceInput = {
  depotToDistrictKm: number;
  interStopKm: number;
  stopCount: number;
};

export type PlannedStopTiming = {
  serviceAllowanceMin: number;
  /** Minutes from midnight, Asia/Colombo. The stop waits if the vehicle would arrive earlier. */
  windowOpenMin: number;
};

export type PlannedArrival = {
  /** 1-based stop sequence. */
  seq: number;
  /** Arrival before waiting. */
  rawMin: number;
  /** Arrival after waiting until window_open. */
  arrivalMin: number;
};

export type TripUtilization = {
  weight: number;
  volume: number;
};

/** depot_to_district_min + inter_stop_min × (n − 1) + Σ service allowance. */
export function calculateTripMinutes(input: TripTimingInput): number {
  const stopCount = input.serviceAllowanceMin.length;
  if (stopCount === 0) return 0;
  let service = 0;
  for (const minutes of input.serviceAllowanceMin) service += minutes;
  return input.depotToDistrictMin + input.interStopMin * (stopCount - 1) + service;
}

/**
 * Planned arrival at stop k = start + outbound + inter-stop × (k − 1) + allowances before k,
 * then wait until that stop's window_open. Later stops do not inherit the wait.
 */
export function calculatePlannedArrivals(input: {
  startMin: number;
  depotToDistrictMin: number;
  interStopMin: number;
  stops: readonly PlannedStopTiming[];
}): PlannedArrival[] {
  const arrivals: PlannedArrival[] = [];
  let priorService = 0;
  for (let index = 0; index < input.stops.length; index += 1) {
    const stop = input.stops[index];
    if (!stop) continue;
    const rawMin =
      input.startMin + input.depotToDistrictMin + input.interStopMin * index + priorService;
    arrivals.push({
      seq: index + 1,
      rawMin,
      arrivalMin: Math.max(rawMin, stop.windowOpenMin),
    });
    priorService += stop.serviceAllowanceMin;
  }
  return arrivals;
}

/** Round trip: out and back to the district, plus the gaps between stops. */
export function calculateTripDistance(input: TripDistanceInput): number {
  if (input.stopCount <= 0) return 0;
  return 2 * input.depotToDistrictKm + input.interStopKm * (input.stopCount - 1);
}

/** Assumption A4: route kilometres ÷ km_per_l. */
export function calculateFuelLitres(distanceKm: number, kmPerL: number): number {
  if (kmPerL <= 0) {
    throw new PlanningInputError('km per litre must be positive');
  }
  return distanceKm / kmPerL;
}

/** Load divided by the vehicle cap. 1 means the trip is exactly full. */
export function calculateUtilization(input: {
  weightKg: number;
  weightCapKg: number;
  volumeM3: number;
  volumeCapM3: number;
}): TripUtilization {
  if (input.weightCapKg <= 0 || input.volumeCapM3 <= 0) {
    throw new PlanningInputError('vehicle capacity must be positive');
  }
  return {
    weight: input.weightKg / input.weightCapKg,
    volume: input.volumeM3 / input.volumeCapM3,
  };
}

/** First trip of the day. Fresh leaves at 03:30. Style and Tech leave at 08:00. */
export function calculateFirstTripStartMin(brand: Brand): number {
  return brand === 'Fresh' ? FRESH_DEPARTURE_MIN : DAY_DEPARTURE_MIN;
}

/**
 * Trip 2 leaves when trip 1 ends plus the drive back to the depot.
 * Trip minutes already include the outbound leg, so the return adds that outbound time again.
 */
export function calculateNextTripStartMin(previous: {
  startMin: number;
  tripMinutes: number;
  outboundMin: number;
}): number {
  return previous.startMin + previous.tripMinutes + previous.outboundMin;
}
