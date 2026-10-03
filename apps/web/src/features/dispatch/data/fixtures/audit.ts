/** D11 · Orders & audit (Figma 2043:4172). ORD-260926-0712 is copied from the frame. */
import type { z } from 'zod';
import type { AuditEvent, LifecycleStep, orderAuditSchema, QueueOrder } from '../../contracts';
import { dispatcher } from './guard';
import { orderId, state } from './orders';
import { fail, type MockRoute } from './router';

type Audit = z.infer<typeof orderAuditSchema>;

const day = (time: string) => `2026-09-26T${time}:00+05:30`;
const eve = (time: string) => `2026-09-25T${time}:00+05:30`;
const synced = { result: 'synced', syncedAt: null } as const;

const gampola: Audit = {
  id: orderId(712),
  reference: 'ORD-260926-0712',
  outlet: { code: 'WF-F071', name: 'Waypoint Fresh Gampola' },
  weightKg: 344,
  temp: 'chilled',
  step: 'received',
  deferred: false,
  events: [
    {
      ...synced,
      id: '1',
      at: day('06:15'),
      title: 'Receipt · 3 short',
      actor: 'T. Jayasinghe',
      actorRole: 'Store',
      source: 'phone',
      eventId: 'ev-7f2c1',
    },
    {
      id: '2',
      at: day('05:44'),
      title: 'POD captured',
      actor: 'S. Kumar',
      actorRole: 'Driver',
      source: 'offline',
      eventId: 'ev-51a09',
      result: 'synced',
      syncedAt: day('06:02'),
    },
    {
      id: '3',
      at: day('05:44'),
      title: 'POD captured',
      actor: 'S. Kumar',
      actorRole: 'Driver',
      source: 'replay',
      eventId: 'ev-51a09',
      result: 'duplicate',
      syncedAt: null,
    },
    {
      id: '4',
      at: day('05:41'),
      title: 'Arrived',
      actor: 'S. Kumar',
      actorRole: 'Driver',
      source: 'offline',
      eventId: 'ev-51a02',
      result: 'synced',
      syncedAt: day('06:02'),
    },
    {
      ...synced,
      id: '5',
      at: day('04:40'),
      title: 'Departed',
      actor: 'S. Kumar',
      actorRole: 'Driver',
      source: 'phone',
      eventId: 'ev-4d0f7',
    },
    {
      ...synced,
      id: '6',
      at: day('04:24'),
      title: 'Shortage notice',
      actor: 'System',
      actorRole: 'Plan v4.1',
      source: 'auto',
      eventId: 'ev-4c9e2',
    },
  ],
  pod: {
    recipient: 'T. Jayasinghe',
    photoUrl: null,
    signatureUrl: '/waypoint/dispatch/2043-4172-imgVector.svg',
    capturedAt: day('05:44'),
    capturedOffline: true,
    syncedAt: day('06:02'),
  },
  receipt: {
    received: 7,
    expected: 10,
    unit: 'cartons',
    note: '3 short were pre-notified at 04:24 and arrive on VEH007 T2 at 09:50.',
  },
};

/** A planning-stage record for every other order, from its place in the queue. */
function planning(order: QueueOrder): Audit {
  const step: LifecycleStep = order.state.kind === 'allocated' ? 'allocated' : 'confirmed';
  const events: AuditEvent[] = [
    {
      ...synced,
      id: 'confirmed',
      at: eve('16:00'),
      title: 'Confirmed at cutoff',
      actor: 'System',
      actorRole: 'Cutoff 16:00',
      source: 'auto',
      eventId: `ev-${order.reference.slice(-4)}c`,
    },
    {
      ...synced,
      id: 'submitted',
      at: eve('11:20'),
      title: 'Order submitted',
      actor: 'Store manager',
      actorRole: 'Store',
      source: 'web',
      eventId: `ev-${order.reference.slice(-4)}s`,
    },
  ];
  if (order.state.kind === 'allocated') {
    events.unshift({
      ...synced,
      id: 'allocated',
      at: eve('16:21'),
      title: `Allocated to ${order.state.vehicleId} T${order.state.tripNo}`,
      actor: 'System',
      actorRole: 'Auto-allocated',
      source: 'auto',
      eventId: `ev-${order.reference.slice(-4)}a`,
    });
  }
  if (order.state.kind === 'held') {
    events.unshift({
      ...synced,
      id: 'deferred',
      at: eve('17:40'),
      title: 'Deferred to the next run',
      actor: 'N. Fernando',
      actorRole: 'Dispatcher',
      source: 'web',
      eventId: `ev-${order.reference.slice(-4)}d`,
    });
  }
  return {
    id: order.id,
    reference: order.reference,
    outlet: { code: order.outlet.code, name: order.outlet.name },
    weightKg: order.weightKg,
    temp: order.temp,
    step,
    deferred: order.state.kind === 'held',
    events,
    pod: null,
    receipt: null,
  };
}

export const auditRoutes: MockRoute[] = [
  [
    'GET',
    '/orders',
    dispatcher(({ query }) => {
      const term = query.get('q')?.trim().toLowerCase() ?? '';
      const vehicle = query.get('vehicle');
      const items = state.orders
        .filter(
          (order) =>
            (!term ||
              `${order.reference} ${order.outlet.name} ${order.outlet.code}`
                .toLowerCase()
                .includes(term)) &&
            (!vehicle || (order.state.kind === 'allocated' && order.state.vehicleId === vehicle)),
        )
        // The Figma order comes first, so the page opens on it.
        .sort((a, b) => Number(b.id === gampola.id) - Number(a.id === gampola.id))
        .map((order) => ({
          id: order.id,
          reference: order.reference,
          outletName: order.outlet.name,
          outletCode: order.outlet.code,
        }));
      return { items, total: items.length };
    }),
  ],
  [
    'GET',
    '/orders/:id/audit',
    dispatcher(({ params }) => {
      if (params.id === gampola.id) return gampola;
      const order = state.orders.find((item) => item.id === params.id);
      return order ? planning(order) : fail(404, 'NOT_FOUND', 'That order does not exist.');
    }),
  ],
];
