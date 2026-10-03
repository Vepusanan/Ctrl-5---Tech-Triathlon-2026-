// D11 · Orders & audit (Figma 2043:4172): one order's full story.
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Avatar,
  Button,
  Dropdown,
  EmptyState,
  ErrorState,
  Icon,
  LoadingState,
  ProgressBar,
  type Status,
  StatusBadge,
  Tag,
} from '../../components/waypoint';
import { downloadCsv } from '../../lib/csv';
import { clock } from '../../lib/format';
import {
  type AuditEvent,
  type LifecycleStep,
  orderAuditSchema,
  orderIndexSchema,
} from './contracts';
import { api, message } from './data/client';
import { CardHead, DarkCard } from './ui';
import { Page, useDispatch } from './workspace';
import './orders.css';

const steps: { key: LifecycleStep; label: string; icon: string }[] = [
  { key: 'submitted', label: 'Submitted', icon: 'pen' },
  { key: 'confirmed', label: 'Confirmed', icon: 'check' },
  { key: 'planned', label: 'Planned', icon: 'layers' },
  { key: 'allocated', label: 'Allocated', icon: 'truck' },
  { key: 'loaded', label: 'Loaded', icon: 'pkg' },
  { key: 'departed', label: 'Departed', icon: 'nav' },
  { key: 'arrived', label: 'Arrived', icon: 'pin' },
  { key: 'delivered', label: 'Delivered', icon: 'boxc' },
  { key: 'received', label: 'Received', icon: 'store' },
  { key: 'completed', label: 'Completed', icon: 'cc' },
];

const stepStatus: Record<LifecycleStep, Status> = {
  submitted: 'submitted',
  confirmed: 'confirmed',
  planned: 'planning',
  allocated: 'allocated',
  loaded: 'ready',
  departed: 'departed',
  arrived: 'arrived',
  delivered: 'delivered',
  received: 'receipt-confirmed',
  completed: 'completed',
};

const sources: Record<AuditEvent['source'], { label: string; icon: string }> = {
  phone: { label: 'Phone', icon: 'phone' },
  tablet: { label: 'Tablet', icon: 'panel' },
  web: { label: 'Web', icon: 'panel' },
  offline: { label: 'Offline', icon: 'wifioff' },
  replay: { label: 'Replay', icon: 'refresh' },
  auto: { label: 'Auto', icon: 'zap' },
};

function Result({ event }: { event: AuditEvent }) {
  if (event.result === 'duplicate')
    return <StatusBadge status="cancelled" label="Duplicate ignored" />;
  if (event.result === 'conflict') return <StatusBadge status="conflict" />;
  if (event.result === 'pending') return <StatusBadge status="pending" />;
  return (
    <StatusBadge
      status="synced"
      label={event.syncedAt ? `Synced ${clock(event.syncedAt)}` : undefined}
    />
  );
}

export function OrdersAudit() {
  const { date } = useDispatch();
  const [params, setParams] = useSearchParams();
  const [source, setSource] = useState<AuditEvent['source'] | ''>('');
  const term = params.get('q') ?? '';
  const vehicle = params.get('vehicle') ?? '';
  const index = useQuery({
    queryKey: ['orders', date, 'index', term, vehicle],
    queryFn: () =>
      api(
        `/orders?date=${date}&q=${encodeURIComponent(term)}&vehicle=${encodeURIComponent(vehicle)}`,
        orderIndexSchema,
      ),
  });
  const orderId = params.get('order') ?? index.data?.items[0]?.id;
  const audit = useQuery({
    queryKey: ['orders', orderId, 'audit'],
    queryFn: () => api(`/orders/${orderId}/audit`, orderAuditSchema),
    enabled: orderId !== undefined,
  });
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'order') next.delete('order');
    setParams(next);
  };

  const picker: ReactNode = (
    <form
      className="oa-search"
      onSubmit={(event) => {
        event.preventDefault();
        set('q', String(new FormData(event.currentTarget).get('q') ?? '').trim());
      }}
    >
      <Icon name="search" />
      <label className="wp-sr-only" htmlFor="oa-q">
        Find an order
      </label>
      <input
        key={term}
        id="oa-q"
        name="q"
        type="search"
        defaultValue={term}
        placeholder="Order, outlet or code"
      />
    </form>
  );
  const matches = index.data?.items ?? [];
  const choose = matches.length > 1 && orderId && (
    <Dropdown
      label="Order"
      value={orderId}
      options={matches
        .slice(0, 50)
        .map((item) => ({ value: item.id, label: `${item.reference} · ${item.outletName}` }))}
      onChange={(id) => set('order', id)}
    />
  );

  if (index.isPending || (orderId !== undefined && audit.isPending)) {
    return (
      <Page title="Orders & audit" actions={picker}>
        <LoadingState label="Loading the order…" rows={6} />
      </Page>
    );
  }
  if (index.isSuccess && !orderId) {
    return (
      <Page title="Orders & audit" description="One order’s full story" actions={picker}>
        <EmptyState
          title="No order matches"
          description={
            vehicle
              ? `No order is planned on ${vehicle}. Search for another order.`
              : 'Search by order number, outlet name or outlet code.'
          }
          action={
            (term || vehicle) && (
              <Button variant="secondary" size="md" onClick={() => setParams({ date })}>
                Clear the search
              </Button>
            )
          }
        />
      </Page>
    );
  }
  if (!audit.data) {
    return (
      <Page title="Orders & audit" actions={picker}>
        <ErrorState
          description={message(index.error ?? audit.error)}
          onRetry={() => void (index.data ? audit.refetch() : index.refetch())}
        />
      </Page>
    );
  }

  const order = audit.data;
  const position = steps.findIndex((step) => step.key === order.step);
  const events = source ? order.events.filter((event) => event.source === source) : order.events;
  const used = [...new Set(order.events.map((event) => event.source))];
  const exportCsv = () =>
    downloadCsv(
      `${order.reference}-audit.csv`,
      ['Time', 'Event', 'By', 'Role', 'Source', 'Event ID', 'Result'],
      order.events.map((event) => [
        event.at,
        event.title,
        event.actor,
        event.actorRole,
        event.source,
        event.eventId,
        event.result,
      ]),
    );

  return (
    <Page
      title={order.reference}
      description={`${order.outlet.code} ${order.outlet.name} · ${order.weightKg} kg · ${order.temp}`}
      actions={
        <>
          {picker}
          {choose}
          {order.deferred ? (
            <StatusBadge status="deferred" />
          ) : (
            <StatusBadge status={stepStatus[order.step]} />
          )}
          <Button variant="secondary" size="md" onClick={exportCsv}>
            Export
          </Button>
          <Button asChild variant="secondary" size="md">
            <Link to={`/dispatcher/outlets?date=${date}&outlet=${order.outlet.code}`}>
              Open outlet
            </Link>
          </Button>
        </>
      }
    >
      <div className="oa-row">
        <div className="oa-stack">
          <section className="wp-card oa-lifecycle" aria-label="Lifecycle">
            <div className="d-head oa-lifecycle-head">
              <h2 className="d-title">
                <Icon name="route" />
                Lifecycle
              </h2>
              <span>
                {position + 1} of {steps.length} steps
              </span>
            </div>
            <ol className="wp-list">
              {steps.map((step, at) => (
                <li
                  key={step.key}
                  data-state={at < position ? 'done' : at === position ? 'current' : 'upcoming'}
                  aria-current={at === position ? 'step' : undefined}
                >
                  <span className="oa-step">
                    <Icon name={step.icon} />
                  </span>
                  {step.label}
                </li>
              ))}
            </ol>
          </section>
          <section className="wp-card oa-log" aria-label="Event log">
            <CardHead title="Event log" icon="history">
              <Dropdown
                label="Source"
                value={source}
                options={[
                  { value: '', label: 'All sources' },
                  ...used.map((value) => ({ value, label: sources[value].label })),
                ]}
                onChange={setSource}
              />
            </CardHead>
            {events.length === 0 ? (
              <p className="wp-muted">No events from this source.</p>
            ) : (
              <div className="dq-scroll">
                <table className="wp-rows oa-events">
                  <caption className="wp-sr-only">
                    Events recorded for this order, newest first
                  </caption>
                  <thead>
                    <tr>
                      <th className="oa-col-time">Time</th>
                      <th className="oa-col-event">Event</th>
                      <th className="oa-col-by">By</th>
                      <th className="oa-col-source">Source</th>
                      <th className="oa-col-id">Event ID</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td>{clock(event.at)}</td>
                        <td>{event.title}</td>
                        <td>
                          <strong>{event.actor}</strong>
                          <small>{event.actorRole}</small>
                        </td>
                        <td>
                          <span className="oa-source">
                            <Icon name={sources[event.source].icon} size={14} />
                            {sources[event.source].label}
                          </span>
                        </td>
                        <td className="wp-mono">{event.eventId}</td>
                        <td>
                          <Result event={event} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
        <div className="oa-stack">
          <section className="wp-card oa-pod" aria-label="Proof of delivery">
            <CardHead title="Proof of delivery">
              <Tag kind="observed" />
            </CardHead>
            {!order.pod && <p className="wp-muted">No proof of delivery has been recorded yet.</p>}
            {order.pod && (
              <>
                <div className="oa-proof">
                  <span className="oa-photo">
                    {order.pod.photoUrl ? (
                      <img src={order.pod.photoUrl} alt="Delivery, taken by the driver" />
                    ) : (
                      <>
                        <Icon name="camera" size={22} />
                        <span className="wp-sr-only">No photo attached</span>
                      </>
                    )}
                  </span>
                  <span className="oa-signature">
                    {order.pod.signatureUrl ? (
                      <img
                        src={order.pod.signatureUrl}
                        alt={`Signature of ${order.pod.recipient}`}
                      />
                    ) : (
                      <span className="wp-muted">No signature</span>
                    )}
                  </span>
                </div>
                <p className="oa-recipient">
                  <Avatar name={order.pod.recipient} size={28} />
                  <span>
                    <strong>{order.pod.recipient}</strong>
                    Captured {clock(order.pod.capturedAt)}
                    {order.pod.capturedOffline ? ' offline' : ''}
                    {order.pod.syncedAt ? ` · synced ${clock(order.pod.syncedAt)}` : ''}
                  </span>
                </p>
              </>
            )}
          </section>
          <DarkCard title="Store receipt" icon="boxc">
            {order.receipt ? (
              <>
                <p className="d-hero">
                  <strong>{order.receipt.received}</strong>
                  <span>
                    / {order.receipt.expected} {order.receipt.unit}
                  </span>
                </p>
                <ProgressBar
                  label="Received against expected"
                  track="inverse"
                  tone="positive"
                  value={
                    order.receipt.expected > 0
                      ? (order.receipt.received / order.receipt.expected) * 100
                      : 0
                  }
                />
                {order.receipt.note && <p>{order.receipt.note}</p>}
              </>
            ) : (
              <p>The store has not confirmed a receipt yet.</p>
            )}
          </DarkCard>
        </div>
      </div>
    </Page>
  );
}
