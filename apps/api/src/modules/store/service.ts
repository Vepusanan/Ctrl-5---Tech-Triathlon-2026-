import {
  calendarDays,
  type Database,
  deferrals,
  orders,
  outlets,
  planningRuns,
  receipts,
  stopEvents,
  tripStops,
  trips,
} from '@waypoint/database';
import {
  DRIVER_STALE_AFTER_MS,
  orderStateMachine,
  type StoreOrder,
  type StoreOrderDetail,
  type StoreWorkspace,
  type User,
} from '@waypoint/shared';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import type { AuditRecorder } from '../../plugins/audit.ts';
import type { OperatingClock } from '../../plugins/clock.ts';
import type { DomainEventBus } from '../../plugins/domain-events.ts';
import { ApiError } from '../../plugins/errors.ts';
import { shiftedEta } from '../deliveries/eta.ts';
import { createDeliveryRepo } from '../deliveries/repo.ts';
import { colomboDate, formatColomboTimestamp, isAtOrAfterCutoff } from '../orders/cutoff.ts';
import { createOrderRepo } from '../orders/repo.ts';
import { type OrderRow, toOrder } from '../orders/serialize.ts';
import { nextEligibleServiceDate } from '../orders/service.ts';
import { createReceiptService } from '../receipts/service.ts';
import { toOutlet } from '../reference/serialize.ts';

export function createStoreService(
  db: Database,
  clock: OperatingClock,
  audit: AuditRecorder,
  events: DomainEventBus,
) {
  const orderRepo = createOrderRepo();
  const deliveryRepo = createDeliveryRepo();
  const receiptService = createReceiptService(db, audit, events, clock);
  function manager(user: User | null) {
    if (!user) throw new ApiError('UNAUTHENTICATED', 'Sign in required');
    if (user.role !== 'store_manager')
      throw new ApiError('FORBIDDEN', 'Store Manager access required');
    return user;
  }
  async function outlet(id: string) {
    const [row] = await db.select().from(outlets).where(eq(outlets.id, id));
    if (!row) throw new ApiError('NOT_FOUND', 'Outlet not found');
    return toOutlet(row);
  }
  async function cutoff(date: string) {
    const previous = await orderRepo.previousOperatingDate(db, date);
    return previous ? `${previous}T16:00:00.000+05:30` : null;
  }
  async function access(row: OrderRow, now: Date): Promise<StoreOrder> {
    const previous = await orderRepo.previousOperatingDate(db, row.requestedDate);
    return {
      order: toOrder(row),
      cutoffAt: previous ? `${previous}T16:00:00.000+05:30` : null,
      editable:
        row.lockedAt === null &&
        orderStateMachine.canTransition(row.status, 'cancelled') &&
        previous !== null &&
        !isAtOrAfterCutoff(now, previous),
    };
  }
  return {
    async workspace(user: User | null): Promise<StoreWorkspace> {
      const own = manager(user);
      const now = clock.now();
      const today = colomboDate(now);
      const [ownOutlet, orderRows, issueList, days, nextServiceDate] = await Promise.all([
        outlet(own.outletId),
        db
          .select()
          .from(orders)
          .where(eq(orders.outletId, own.outletId))
          .orderBy(desc(orders.requestedDate), desc(orders.submittedAt)),
        receiptService.listIssues(own),
        db
          .select({ date: calendarDays.date })
          .from(calendarDays)
          .where(and(gt(calendarDays.date, today), eq(calendarDays.isOperating, true)))
          .orderBy(asc(calendarDays.date))
          .limit(14),
        orderRepo.nextOperatingDate(db, today),
      ]);
      let eligibleServiceDate: string | null = null;
      try {
        eligibleServiceDate = await nextEligibleServiceDate(orderRepo, db, now);
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') throw error;
      }
      return {
        serverNow: formatColomboTimestamp(now),
        outlet: ownOutlet,
        orders: await Promise.all(orderRows.map((row) => access(row, now))),
        issues: issueList.items,
        nextServiceDate,
        eligibleServiceDate,
        cutoffAt: nextServiceDate ? await cutoff(nextServiceDate) : null,
        serviceDates: await Promise.all(
          days.map(async (day) => ({ date: day.date, cutoffAt: await cutoff(day.date) })),
        ),
      };
    },
    async detail(user: User | null, id: string): Promise<StoreOrderDetail> {
      const own = manager(user);
      const [row] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.outletId, own.outletId)));
      if (!row) throw new ApiError('NOT_FOUND', 'Order not found');
      const now = clock.now();
      const [ownOutlet, orderAccess, issueList, [deferred], [stop]] = await Promise.all([
        outlet(own.outletId),
        access(row, now),
        receiptService.listIssues(own),
        db
          .select({ deferral: deferrals, serviceDate: planningRuns.serviceDate })
          .from(deferrals)
          .innerJoin(planningRuns, eq(planningRuns.id, deferrals.runId))
          .where(eq(deferrals.orderId, id))
          .orderBy(desc(deferrals.createdAt), desc(deferrals.id))
          .limit(1),
        db
          .select({ stop: tripStops, trip: trips, run: planningRuns })
          .from(tripStops)
          .innerJoin(trips, eq(trips.id, tripStops.tripId))
          .innerJoin(planningRuns, eq(planningRuns.id, trips.runId))
          .where(and(eq(tripStops.orderId, id), eq(planningRuns.status, 'published')))
          .limit(1),
      ]);
      let delivery: StoreOrderDetail['delivery'] = null;
      if (stop?.run.publishedAt) {
        const [stops, arrivals, pod, failureReason, [receipt], activity] = await Promise.all([
          deliveryRepo.listStops(db, stop.trip.id),
          deliveryRepo.listArrivals(db, stop.trip.id),
          deliveryRepo.findPod(db, stop.stop.id),
          deliveryRepo.failureReason(db, stop.stop.id),
          db.select().from(receipts).where(eq(receipts.stopId, stop.stop.id)).limit(1),
          db
            .select({
              stopId: stopEvents.stopId,
              type: stopEvents.type,
              at: stopEvents.serverTime,
              clientAt: stopEvents.clientTime,
            })
            .from(stopEvents)
            .innerJoin(tripStops, eq(tripStops.id, stopEvents.stopId))
            .where(eq(tripStops.tripId, stop.trip.id))
            .orderBy(desc(stopEvents.serverTime)),
        ]);
        const eta = shiftedEta(stops, arrivals, stop.stop.id) ?? stop.stop.plannedArrival;
        const lastUpdated = activity[0]?.at ?? stop.run.publishedAt;
        const delivered = activity.find(
          (event) => event.stopId === stop.stop.id && event.type === 'delivered',
        );
        delivery = {
          stopId: stop.stop.id,
          vehicleId: stop.trip.vehicleId,
          tripStatus: stop.trip.status,
          status: stop.stop.status,
          serviceDate: stop.run.serviceDate,
          plannedArrival: formatColomboTimestamp(stop.stop.plannedArrival),
          eta: formatColomboTimestamp(eta),
          late: stop.stop.late,
          publishedAt: formatColomboTimestamp(stop.run.publishedAt),
          lastUpdatedAt: formatColomboTimestamp(lastUpdated),
          updateDelayed:
            stop.trip.status === 'departed' &&
            stop.stop.status === 'pending' &&
            now.getTime() - lastUpdated.getTime() > DRIVER_STALE_AFTER_MS,
          deliveredAt: delivered ? formatColomboTimestamp(delivered.clientAt) : null,
          failureReason,
          pod: pod ? { ...pod, clientTime: formatColomboTimestamp(pod.clientTime) } : null,
          receipt: receipt
            ? { ...receipt, confirmedAt: formatColomboTimestamp(receipt.confirmedAt) }
            : null,
        };
      }
      return {
        ...orderAccess,
        serverNow: formatColomboTimestamp(now),
        outlet: ownOutlet,
        delivery,
        deferral: deferred
          ? {
              reasonCode: deferred.deferral.reasonCode,
              type: deferred.deferral.type,
              note: deferred.deferral.note,
              createdAt: formatColomboTimestamp(deferred.deferral.createdAt),
              serviceDate: deferred.serviceDate,
              nextEligibleDate: await orderRepo.nextOperatingDate(db, deferred.serviceDate),
            }
          : null,
        issues: issueList.items.filter((issue) => issue.orderId === id),
      };
    },
  };
}
