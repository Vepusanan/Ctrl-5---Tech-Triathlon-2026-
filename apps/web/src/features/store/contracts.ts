import type { TemperatureRequirement } from '@waypoint/shared';

/**
 * What the Store Manager frames show that the API does not return yet. The pages read these
 * shapes from `data.ts`, which fills them from the Figma fixtures or derives them from the API
 * response. Each one is a backend gap listed in docs/IMPLEMENTATION.md §11.
 */

/** One catalogue line (S02). Gap: there is no product catalogue; an order is a size only. */
export interface Product {
  sku: string;
  name: string;
  temp: TemperatureRequirement;
  /** Weight and volume of one carton. */
  unitKg: number;
  unitM3: number;
  /** Cartons this outlet usually orders for this weekday. */
  usual: number;
}

/** Cartons of one product on an order. */
export interface OrderLine {
  product: Product;
  qty: number;
}

/** One past delivery in the "On-time arrivals" card (S01). `lateMin` is null when on time. */
interface Arrival {
  date: string;
  lateMin: number | null;
}
export interface Reliability {
  arrivals: Arrival[];
  /** Change against the month before, in percentage points. Null when unknown. */
  deltaPct: number | null;
}

/** A shortage planning already told the store about (S04, S06, S07). */
interface Shortage {
  sku: string;
  label: string;
  qty: number;
  toldAt: string;
  topUp: { vehicleId: string; tripNo: number; eta: string } | null;
}

/** Delivery details beyond `StoreOrderDetail.delivery` (S04, S06). */
export interface DeliveryExtras {
  driverName: string | null;
  driverPhone: string | null;
  vehicleLabel: string;
  stopNo: number | null;
  stopCount: number | null;
  /** First driver report of the trip; the recorded bar starts here. */
  recordedFrom: string | null;
  prepare: { icon: string; text: string }[];
  shortage: Shortage | null;
  /** When the driver's offline proof of delivery reached the server. */
  podSyncedAt: string | null;
}

/** One receipt line (S06). `handedOver` comes from the driver's proof of delivery. */
export interface ReceiptLine extends OrderLine {
  handedOver: number;
}

interface IssueEvent {
  at: string | null;
  text: string;
  done: boolean;
}
/** The numbers and history of an issue (S07). */
export interface IssueExtras {
  title: string;
  summary: string;
  reportedBy: string;
  ordered: number | null;
  received: number | null;
  short: number | null;
  unit: string;
  fix: { title: string; detail: string; status: string } | null;
  timeline: IssueEvent[];
}

/** Who decided a deferral, and the planning reason number (S05). */
export interface DeferralExtras {
  decidedBy: string | null;
  code: string;
}

/** A notification's wording and target beyond the API's type and entity id (I29). */
export interface NoteExtras {
  title: string;
  detail: string;
  /** Where the notice leads when that differs from the order's usual page. */
  to?: string;
}
