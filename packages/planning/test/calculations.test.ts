import { describe, expect, it } from 'vitest';
import {
  calculateFirstTripStartMin,
  calculateFuelLitres,
  calculateNextTripStartMin,
  calculatePlannedArrivals,
  calculateTripDistance,
  calculateTripMinutes,
  calculateUtilization,
  PlanningInputError,
} from '../src/index.ts';

const FRESH_START = 3 * 60 + 30;

describe('calculateTripMinutes', () => {
  it('adds outbound travel and the service allowance for one stop', () => {
    // 20 + 15 = 35. There is no inter-stop leg when n = 1.
    expect(
      calculateTripMinutes({
        depotToDistrictMin: 20,
        interStopMin: 8,
        serviceAllowanceMin: [15],
      }),
    ).toBe(35);
  });

  it('adds one inter-stop leg and every service allowance for two stops', () => {
    // 30 + 10 × 1 + 18 + 12 = 70.
    expect(
      calculateTripMinutes({
        depotToDistrictMin: 30,
        interStopMin: 10,
        serviceAllowanceMin: [18, 12],
      }),
    ).toBe(70);
  });

  it('adds an inter-stop leg between each pair of three stops', () => {
    // 40 + 6 × 2 + 10 + 20 + 14 = 96.
    expect(
      calculateTripMinutes({
        depotToDistrictMin: 40,
        interStopMin: 6,
        serviceAllowanceMin: [10, 20, 14],
      }),
    ).toBe(96);
  });

  it('returns 0 for a trip with no stops', () => {
    expect(
      calculateTripMinutes({ depotToDistrictMin: 20, interStopMin: 8, serviceAllowanceMin: [] }),
    ).toBe(0);
  });
});

describe('calculatePlannedArrivals', () => {
  it('uses the start minute passed in and does not wait when the stop is already open', () => {
    // Start 01:30 (90), outbound 20. Raw arrival 110. Window opened at 01:00 (60).
    expect(
      calculatePlannedArrivals({
        startMin: 90,
        depotToDistrictMin: 20,
        interStopMin: 8,
        stops: [{ serviceAllowanceMin: 15, windowOpenMin: 60 }],
      }),
    ).toEqual([{ seq: 1, rawMin: 110, arrivalMin: 110 }]);
  });

  it('waits until window_open without changing the raw arrival', () => {
    // Fresh departure 03:30 (210) + outbound 20 = 03:50 (230). Window opens at 05:00 (300).
    expect(
      calculatePlannedArrivals({
        startMin: FRESH_START,
        depotToDistrictMin: 20,
        interStopMin: 8,
        stops: [{ serviceAllowanceMin: 15, windowOpenMin: 5 * 60 }],
      }),
    ).toEqual([{ seq: 1, rawMin: 230, arrivalMin: 300 }]);
  });

  it('waits at one stop without delaying the next stop', () => {
    // Stop 1: 210 + 30 = 240, already after open 200.
    // Stop 2: 210 + 30 + 10 + 18 = 268, then wait until 300.
    const arrivals = calculatePlannedArrivals({
      startMin: FRESH_START,
      depotToDistrictMin: 30,
      interStopMin: 10,
      stops: [
        { serviceAllowanceMin: 18, windowOpenMin: 200 },
        { serviceAllowanceMin: 12, windowOpenMin: 300 },
      ],
    });
    expect(arrivals).toEqual([
      { seq: 1, rawMin: 240, arrivalMin: 240 },
      { seq: 2, rawMin: 268, arrivalMin: 300 },
    ]);
    // The 32 minutes of waiting are not part of trip minutes: 30 + 10 + 18 + 12 = 70.
    expect(
      calculateTripMinutes({
        depotToDistrictMin: 30,
        interStopMin: 10,
        serviceAllowanceMin: [18, 12],
      }),
    ).toBe(70);
  });

  it('places three stops from outbound, inter-stop, and earlier allowances', () => {
    // Start 08:00 (480) is supplied by the caller.
    // Stop 1: 480 + 40 = 520.
    // Stop 2: 480 + 40 + 6 + 10 = 536.
    // Stop 3: 480 + 40 + 6 × 2 + 10 + 20 = 562.
    expect(
      calculatePlannedArrivals({
        startMin: 8 * 60,
        depotToDistrictMin: 40,
        interStopMin: 6,
        stops: [
          { serviceAllowanceMin: 10, windowOpenMin: 0 },
          { serviceAllowanceMin: 20, windowOpenMin: 0 },
          { serviceAllowanceMin: 14, windowOpenMin: 0 },
        ],
      }),
    ).toEqual([
      { seq: 1, rawMin: 520, arrivalMin: 520 },
      { seq: 2, rawMin: 536, arrivalMin: 536 },
      { seq: 3, rawMin: 562, arrivalMin: 562 },
    ]);
  });
});

describe('calculateTripDistance and calculateFuelLitres', () => {
  it('counts the drive out and the drive back for one stop', () => {
    // 2 × 12 = 24 km. 24 / 6 = 4 L.
    const distanceKm = calculateTripDistance({
      depotToDistrictKm: 12,
      interStopKm: 4,
      stopCount: 1,
    });
    expect(distanceKm).toBe(24);
    expect(calculateFuelLitres(distanceKm, 6)).toBe(4);
  });

  it('adds each inter-stop gap once on top of the round trip', () => {
    // 2 × 15 + 5 × 2 = 40 km for three stops. 40 / 8 = 5 L.
    const distanceKm = calculateTripDistance({
      depotToDistrictKm: 15,
      interStopKm: 5,
      stopCount: 3,
    });
    expect(distanceKm).toBe(40);
    expect(calculateFuelLitres(distanceKm, 8)).toBe(5);
  });

  it('returns 0 kilometres and 0 litres when there are no stops', () => {
    const distanceKm = calculateTripDistance({
      depotToDistrictKm: 12,
      interStopKm: 4,
      stopCount: 0,
    });
    expect(distanceKm).toBe(0);
    expect(calculateFuelLitres(distanceKm, 6)).toBe(0);
  });

  it('rejects a non-positive consumption rate', () => {
    expect(() => calculateFuelLitres(24, 0)).toThrow(PlanningInputError);
  });
});

describe('calculateUtilization', () => {
  it('divides the load by each cap', () => {
    // 1_200 / 4_000 = 0.3. 3 / 15 = 0.2.
    expect(
      calculateUtilization({
        weightKg: 1_200,
        weightCapKg: 4_000,
        volumeM3: 3,
        volumeCapM3: 15,
      }),
    ).toEqual({ weight: 0.3, volume: 0.2 });
  });

  it('reports 1 when the load equals the cap', () => {
    expect(
      calculateUtilization({
        weightKg: 5_000,
        weightCapKg: 5_000,
        volumeM3: 20,
        volumeCapM3: 20,
      }),
    ).toEqual({ weight: 1, volume: 1 });
  });

  it('rejects a non-positive cap', () => {
    expect(() =>
      calculateUtilization({ weightKg: 1, weightCapKg: 0, volumeM3: 1, volumeCapM3: 10 }),
    ).toThrow(PlanningInputError);
  });
});

describe('Fresh start and trip 2 timing', () => {
  it('starts a first Fresh trip at 03:30 and a first Style or Tech trip at 08:00', () => {
    expect(calculateFirstTripStartMin('Fresh')).toBe(FRESH_START);
    expect(calculateFirstTripStartMin('Style')).toBe(8 * 60);
    expect(calculateFirstTripStartMin('Tech')).toBe(8 * 60);
  });

  it('starts trip 2 when trip 1 ends plus the return leg', () => {
    // Trip 1 leaves at 03:30, runs 70 minutes, and the outbound leg is 30.
    // Return equals that outbound leg, so trip 2 leaves at 210 + 70 + 30 = 310 (05:10).
    const trip2Start = calculateNextTripStartMin({
      startMin: FRESH_START,
      tripMinutes: 70,
      outboundMin: 30,
    });
    expect(trip2Start).toBe(310);
    // Trip 2 outbound 25, window already open. Arrival = 310 + 25 = 335.
    expect(
      calculatePlannedArrivals({
        startMin: trip2Start,
        depotToDistrictMin: 25,
        interStopMin: 4,
        stops: [{ serviceAllowanceMin: 10, windowOpenMin: 0 }],
      }),
    ).toEqual([{ seq: 1, rawMin: 335, arrivalMin: 335 }]);
  });
});
