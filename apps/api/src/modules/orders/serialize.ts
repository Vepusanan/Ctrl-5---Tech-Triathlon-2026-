import type { orders } from '@waypoint/database';
import { type Order, orderSchema } from '@waypoint/shared';
import { ApiError } from '../../plugins/errors.ts';
import { formatColomboTimestamp } from './cutoff.ts';

export type OrderRow = typeof orders.$inferSelect;

export function toOrder(row: OrderRow): Order {
  const parsed = orderSchema.safeParse({
    id: row.id,
    outletId: row.outletId,
    brand: row.brand,
    temp: row.temp,
    requestedDate: row.requestedDate,
    units: row.units,
    weightKg: row.weightKg,
    volumeM3: row.volumeM3,
    status: row.status,
    submittedAt: row.submittedAt === null ? null : formatColomboTimestamp(row.submittedAt),
    lockedAt: row.lockedAt === null ? null : formatColomboTimestamp(row.lockedAt),
    version: row.version,
  });
  if (!parsed.success) {
    throw new ApiError('INTERNAL_ERROR', 'Stored order is invalid');
  }
  return parsed.data;
}

export function orderSnapshot(order: Order): Record<string, unknown> {
  return {
    id: order.id,
    outletId: order.outletId,
    brand: order.brand,
    temp: order.temp,
    requestedDate: order.requestedDate,
    units: order.units,
    weightKg: order.weightKg,
    volumeM3: order.volumeM3,
    status: order.status,
    submittedAt: order.submittedAt,
    lockedAt: order.lockedAt,
    version: order.version,
  };
}
