import type { DeferralType, ReasonCode, TripNo } from '@waypoint/shared';
import { formatQuantity } from './schedule.ts';

/** Scarce resource named in a deferral sentence. */
export type ResourceKind = 'reefer' | 'van' | 'reefer_van' | 'vehicle';

export type PlacementExplanation = {
  kind: 'placement';
  orderId: string;
  outletId: string;
  vehicleId: string;
  tripNo: TripNo;
  score: number;
  joinedExistingTrip: boolean;
};

export type DeferralExplanation = {
  kind: 'deferral';
  orderId: string;
  outletId: string;
  depotId: string;
  type: DeferralType;
  reason: ReasonCode;
  deferredYesterday: boolean;
  suitableVehicleCount: number;
  resource: ResourceKind;
  /**
   * Set when every suitable vehicle already has a trip and the blocker is weight or volume.
   * `ratio` is the emptiest of those vehicles (0–1), so "all are full (N%)" means each is at least N%.
   */
  fullness: { kind: 'weight' | 'volume'; ratio: number } | null;
};

/** Structured reason for one placement or deferral (SYSTEM_DESIGN §7.5). */
export type Explanation = PlacementExplanation | DeferralExplanation;

const RESOURCE_LABELS: Record<ResourceKind, { one: string; many: string }> = {
  reefer: { one: 'reefer', many: 'reefers' },
  van: { one: 'van', many: 'vans' },
  reefer_van: { one: 'reefer van', many: 'reefer vans' },
  vehicle: { one: 'vehicle', many: 'vehicles' },
};

/**
 * Renders one structured reason as the sentence shown to the dispatcher and the store.
 * The same wording is stored on each deferral.
 */
export function explain(explanation: Explanation): string {
  if (explanation.kind === 'placement') return explainPlacement(explanation);
  const history = explanation.deferredYesterday
    ? ` Outlet ${explanation.outletId} was also skipped yesterday; it is first in tomorrow's queue.`
    : '';
  return `${explainDeferral(explanation)}${history}`;
}

function explainPlacement(explanation: PlacementExplanation): string {
  const action = explanation.joinedExistingTrip ? 'joining an existing trip' : 'opening a new trip';
  return `Placed on ${explanation.vehicleId} trip ${explanation.tripNo}, ${action}. Priority score ${formatQuantity(explanation.score)}.`;
}

function explainDeferral(explanation: DeferralExplanation): string {
  const { depotId, reason, type, suitableVehicleCount, fullness } = explanation;
  if (type === 'unavoidable') return `${unavoidableLead(depotId, reason)}.`;
  if (
    fullness &&
    (reason === 'VOLUME_CAP' || reason === 'WEIGHT_CAP') &&
    suitableVehicleCount > 0
  ) {
    const percent = Math.round(fullness.ratio * 100);
    const noun = fullness.kind === 'weight' ? 'weight' : 'volume';
    const verb = suitableVehicleCount === 1 ? 'is' : 'are';
    return `Deferred: ${fleetPhrase(explanation)} ${verb} full (${percent}% ${noun}).`;
  }
  return `${prioritizedLead(explanation)}.`;
}

function unavoidableLead(depotId: string, reason: ReasonCode): string {
  switch (reason) {
    case 'REEFER_REQUIRED':
      return `Deferred: no reefer at ${depotId} can carry this chilled order`;
    case 'VAN_REQUIRED':
      return `Deferred: no van at ${depotId} can reach this van-only outlet`;
    case 'WRONG_DEPOT':
      return `Deferred: no vehicle at ${depotId} serves this outlet`;
    case 'VEHICLE_UNAVAILABLE':
      return `Deferred: no vehicle at ${depotId} is available for this order`;
    case 'WEIGHT_CAP':
      return `Deferred: this order is heavier than every suitable vehicle at ${depotId}`;
    case 'VOLUME_CAP':
      return `Deferred: this order is larger than every suitable vehicle at ${depotId}`;
    case 'WINDOW_MISSED':
      return `Deferred: no vehicle at ${depotId} can reach this outlet before its delivery window closes`;
    case 'FUEL_QUOTA':
      return `Deferred: no vehicle at ${depotId} has enough weekly fuel for this order`;
    case 'FRESH_TIME_BUDGET':
      return `Deferred: this Fresh order does not fit the pre-dawn time budget on any vehicle at ${depotId}`;
    case 'DAY_TIME_BUDGET':
      return `Deferred: this order does not fit the daytime budget on any vehicle at ${depotId}`;
    default:
      return `Deferred: no feasible trip exists for this order at ${depotId}`;
  }
}

function prioritizedLead(explanation: DeferralExplanation): string {
  const fleet = fleetPhrase(explanation);
  switch (explanation.reason) {
    case 'TRIP_LIMIT':
      return `Deferred: higher-priority orders already use both daily trips on ${fleet}`;
    case 'FUEL_QUOTA':
      return `Deferred: higher-priority orders used the remaining weekly fuel on ${fleet}`;
    case 'FRESH_TIME_BUDGET':
    case 'DAY_TIME_BUDGET':
      return `Deferred: higher-priority orders used the time budget on ${fleet}`;
    case 'WINDOW_MISSED':
      return "Deferred: higher-priority stops leave no arrival before this outlet's window closes";
    default:
      return `Deferred: higher-priority orders took the remaining capacity on ${fleet}`;
  }
}

function fleetPhrase(explanation: DeferralExplanation): string {
  const labels = RESOURCE_LABELS[explanation.resource];
  if (explanation.suitableVehicleCount === 1) {
    return `the only available ${labels.one} at ${explanation.depotId}`;
  }
  return `all ${explanation.suitableVehicleCount} available ${labels.many} at ${explanation.depotId}`;
}
