import { useMutation, useQuery } from '@tanstack/react-query';
import {
  type IssueType,
  issueSchema,
  receiptSchema,
  type StoreOrderDetail,
  storeOrderDetailSchema,
} from '@waypoint/shared';
import { useState } from 'react';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingState,
  StatusBadge,
  Tag,
} from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { issueLabel } from './dashboard';
import { PlaceOrder } from './place-order';
import {
  canEdit,
  day,
  orderName,
  PageHeader,
  reasonText,
  StoreIcon,
  StoreLink,
  statusForOrder,
  tempName,
  time,
} from './shared';
import { storeKey, useStore } from './workspace';

export function StoreOrderPage() {
  const { id, '*': section = '' } = useParams();
  const { user, now, writable, refresh } = useStore();
  const detail = useQuery({
    queryKey: [...storeKey(user.id), 'order', id],
    queryFn: () => api(`/store/orders/${id ?? ''}`, storeOrderDetailSchema),
    enabled: Boolean(id),
  });
  if (!id) return <Navigate to="/store" replace />;
  if (detail.isPending) return <LoadingState label="Loading this order…" />;
  if (!detail.data) {
    return <ErrorState description={message(detail.error)} onRetry={() => void detail.refetch()} />;
  }
  const screen = section.split('/')[0] ?? '';
  if (screen === '' && detail.data.order.status === 'deferred') {
    return <Navigate to={`/store/orders/${id}/deferred`} replace />;
  }
  const page = (
    <OrderScreen
      detail={detail.data}
      screen={screen}
      now={now}
      writable={writable}
      onChanged={async () => {
        await refresh();
        await detail.refetch();
      }}
    />
  );
  return page;
}

function OrderScreen({
  detail,
  screen,
  now,
  writable,
  onChanged,
}: {
  detail: StoreOrderDetail;
  screen: string;
  now: number;
  writable: boolean;
  onChanged: () => Promise<void>;
}) {
  if (screen === 'confirmation') return <Confirmation detail={detail} />;
  if (screen === 'deferred') return <Deferred detail={detail} />;
  if (screen === 'receipt')
    return <Receipt detail={detail} writable={writable} onChanged={onChanged} />;
  if (screen === 'issue')
    return <IssueReport detail={detail} writable={writable} onChanged={onChanged} />;
  if (screen === 'edit') return <PlaceOrder />;
  return <Tracking detail={detail} now={now} />;
}

function Confirmation({ detail }: { detail: StoreOrderDetail }) {
  const [params] = useSearchParams();
  const location = useLocation();
  const requested = params.get('requested');
  const held = Boolean(requested && requested !== detail.order.requestedDate);
  const state = location.state;
  const companionId =
    state &&
    typeof state === 'object' &&
    'companionId' in state &&
    typeof state.companionId === 'string'
      ? state.companionId
      : null;
  return (
    <>
      <PageHeader
        title="Order received"
        description={`${orderName(detail.order.id)} is recorded for ${detail.outlet.id}.`}
      >
        <StatusBadge status={statusForOrder[detail.order.status]} />
      </PageHeader>
      <div className="store-split">
        <Card>
          <span className="wp-icon-well">
            <StoreIcon source="2177-26040" name="Check2" />
          </span>
          <h2>{orderName(detail.order.id)}</h2>
          <Tag kind={detail.order.temp === 'chilled' ? 'chilled' : 'ambient'} />
          <div className="store-chips">
            <span className="store-chip">
              <small>Requested</small>
              <strong>{day(detail.order.requestedDate)}</strong>
            </span>
            <span className="store-chip">
              <small>Units</small>
              <strong>{detail.order.units}</strong>
            </span>
            <span className="store-chip">
              <small>Weight</small>
              <strong>{detail.order.weightKg} kg</strong>
            </span>
            <span className="store-chip">
              <small>Volume</small>
              <strong>{detail.order.volumeM3} m³</strong>
            </span>
          </div>
          {held && (
            <div className="store-notice" role="status">
              <div>
                <strong>Held for the following run</strong>
                <p>
                  The 16:00 cutoff had passed for {day(requested)}. This order is on{' '}
                  {day(detail.order.requestedDate)} instead.
                </p>
              </div>
            </div>
          )}
          <p className="wp-muted">
            Submitted {day(detail.order.submittedAt)} · {time(detail.order.submittedAt)}. It stays
            editable until the cutoff, then planning locks it.
          </p>
          <div className="store-actions">
            <StoreLink secondary to={`/store/orders/${detail.order.id}`}>
              Track this order
            </StoreLink>
            <StoreLink to="/store">Back to store home</StoreLink>
          </div>
        </Card>
        {companionId && (
          <Card>
            <h2>Second order</h2>
            <p>The other temperature was submitted as its own order.</p>
            <StoreLink secondary to={`/store/orders/${companionId}/confirmation`}>
              View that confirmation
            </StoreLink>
          </Card>
        )}
      </div>
    </>
  );
}

function Tracking({ detail, now }: { detail: StoreOrderDetail; now: number }) {
  const arrival = detail.delivery?.eta ?? null;
  const late =
    detail.delivery?.late && ['delivered', 'receipt_confirmed'].includes(detail.order.status);
  return (
    <>
      <PageHeader
        title={orderName(detail.order.id)}
        description={`${tempName(detail.order.temp)} · requested ${day(detail.order.requestedDate)}`}
      >
        <StatusBadge status={late ? 'delivered-late' : statusForOrder[detail.order.status]} />
      </PageHeader>
      {detail.order.status === 'deferred' && detail.deferral && (
        <div className="store-notice" role="status">
          <div>
            <strong>This order was deferred</strong>
            <p>{reasonText[detail.deferral.reasonCode]}</p>
          </div>
          <StoreLink to={`/store/orders/${detail.order.id}/deferred`}>Read the notice</StoreLink>
        </div>
      )}
      <div className="store-split">
        <Card>
          <h2>Expected arrival</h2>
          {detail.delivery ? (
            <>
              <p className="store-move">
                <strong>{time(arrival)}</strong>
                <span>
                  {day(detail.delivery.serviceDate)}
                  <small>
                    Planned {time(detail.delivery.plannedArrival)}
                    {late ? ' · arrived after the window' : ''}
                  </small>
                </span>
              </p>
              <p className="wp-muted">
                {detail.delivery.vehicleId} · last update {day(detail.delivery.lastUpdatedAt)} ·{' '}
                {time(detail.delivery.lastUpdatedAt)}
              </p>
              {detail.delivery.updateDelayed && (
                <Badge tone="warning">
                  Running late to update. The last driver report is older than expected.
                </Badge>
              )}
              <p>
                Receiving window {detail.outlet.window.open}–{detail.outlet.window.close}
                {detail.outlet.mallWindow
                  ? ` · mall access ${detail.outlet.mallWindow.open}–${detail.outlet.mallWindow.close}`
                  : ''}
              </p>
              {detail.delivery.failureReason && (
                <p role="status">Not delivered: {detail.delivery.failureReason}</p>
              )}
              {detail.delivery.pod && (
                <p className="wp-muted">
                  Received by {detail.delivery.pod.recipientName}
                  {detail.delivery.pod.hasPhoto ? ' · photo on file' : ''}.
                </p>
              )}
            </>
          ) : (
            <p className="wp-muted">
              Arrival is shown after this order is placed on a published trip. Until then it stays
              in the planning queue.
            </p>
          )}
          <Steps detail={detail} />
        </Card>
        <div className="store-stack">
          <Summary detail={detail} />
          <div className="store-actions">
            {canEdit(
              { order: detail.order, cutoffAt: detail.cutoffAt, editable: detail.editable },
              now,
            ) && (
              <StoreLink secondary to={`/store/orders/${detail.order.id}/edit`}>
                Edit order
              </StoreLink>
            )}
            {detail.order.status === 'delivered' && (
              <StoreLink to={`/store/orders/${detail.order.id}/receipt`}>Confirm receipt</StoreLink>
            )}
            <StoreLink secondary to={`/store/orders/${detail.order.id}/issue`}>
              Report an issue
            </StoreLink>
          </div>
        </div>
      </div>
    </>
  );
}

function Steps({ detail }: { detail: StoreOrderDetail }) {
  const delivered = ['delivered', 'receipt_confirmed'].includes(detail.order.status);
  const dispatched =
    detail.delivery !== null && ['departed', 'completed'].includes(detail.delivery.tripStatus);
  const steps = [
    { label: 'Submitted', done: Boolean(detail.order.submittedAt), at: detail.order.submittedAt },
    {
      label: 'Confirmed',
      done:
        detail.order.lockedAt !== null ||
        [
          'confirmed',
          'allocated',
          'deferred',
          'loading',
          'dispatched',
          'delivered',
          'failed',
          'receipt_confirmed',
        ].includes(detail.order.status),
      at: detail.order.lockedAt,
    },
    { label: 'Planned', done: Boolean(detail.delivery), at: detail.delivery?.publishedAt ?? null },
    { label: 'Dispatched', done: dispatched, at: null },
    { label: 'Delivered', done: delivered, at: detail.delivery?.deliveredAt ?? null },
  ];
  return (
    <ol className="store-steps">
      {steps.map((step) => (
        <li key={step.label} data-complete={step.done}>
          <span className="wp-icon-well" aria-hidden="true">
            <StoreIcon
              source={step.done ? '2177-26040' : '2047-5268'}
              name={step.done ? 'Check' : 'Clock'}
            />
          </span>
          <strong>{step.label}</strong>
          <small>
            {step.done ? (step.at ? `${day(step.at)} ${time(step.at)}` : 'Recorded') : 'Pending'}
          </small>
        </li>
      ))}
    </ol>
  );
}

function Summary({ detail }: { detail: StoreOrderDetail }) {
  return (
    <Card>
      <div className="wp-between">
        <h2>Order</h2>
        <Tag kind={detail.order.temp === 'chilled' ? 'chilled' : 'ambient'} />
      </div>
      <div className="store-totals">
        <div>
          <strong>{detail.order.units}</strong>
          <small>units</small>
        </div>
        <div>
          <strong>{detail.order.weightKg}</strong>
          <small>kg</small>
        </div>
        <div>
          <strong>{detail.order.volumeM3}</strong>
          <small>m³</small>
        </div>
      </div>
    </Card>
  );
}

function Deferred({ detail }: { detail: StoreOrderDetail }) {
  const deferral = detail.deferral;
  return (
    <>
      <PageHeader title="This order was deferred" description={orderName(detail.order.id)}>
        <StatusBadge status="deferred" />
      </PageHeader>
      <div className="store-split">
        <Card>
          <span className="wp-icon-well">
            <StoreIcon source="2176-24573" name="Skip" />
          </span>
          {deferral ? (
            <>
              <h2>{reasonText[deferral.reasonCode]}</h2>
              <Badge tone={deferral.type === 'unavoidable' ? 'warning' : 'hold'}>
                {deferral.type === 'unavoidable'
                  ? 'Unavoidable constraint'
                  : 'Prioritized for another order'}
              </Badge>
              <p className="store-prewrap">{deferral.note ?? 'No additional note was recorded.'}</p>
              <p className="wp-muted">
                Recorded {day(deferral.createdAt)} · {time(deferral.createdAt)}
              </p>
            </>
          ) : (
            <p>
              The deferral reason is not on this order yet. Planning will record why it was not
              served.
            </p>
          )}
          <div className="store-chips">
            <span className="store-chip" data-kind="moved">
              <small>Requested</small>
              <strong>{day(detail.order.requestedDate)}</strong>
            </span>
            <span className="store-chip">
              <small>Next eligible run</small>
              <strong>{day(deferral?.nextEligibleDate)}</strong>
            </span>
          </div>
          <StoreLink to={`/store/orders/${detail.order.id}`}>View tracking</StoreLink>
        </Card>
        <Summary detail={detail} />
      </div>
    </>
  );
}

function Receipt({
  detail,
  writable,
  onChanged,
}: {
  detail: StoreOrderDetail;
  writable: boolean;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const confirm = useMutation({
    mutationFn: async () => {
      const stopId = detail.delivery?.stopId;
      if (!stopId) throw new Error('This delivery is not ready to confirm.');
      return api(`/stops/${stopId}/receipt`, receiptSchema, { method: 'POST' });
    },
    onSuccess: onChanged,
    onError: (cause) => setError(message(cause)),
  });
  const receipt = detail.delivery?.receipt ?? null;
  const ready = detail.order.status === 'delivered' && detail.delivery?.status === 'delivered';
  return (
    <>
      <PageHeader title="Confirm what arrived" description={orderName(detail.order.id)}>
        <StatusBadge status={receipt ? 'receipt-confirmed' : statusForOrder[detail.order.status]} />
      </PageHeader>
      <div className="store-split">
        <Card>
          <h2>{tempName(detail.order.temp)} goods</h2>
          <p>
            {detail.order.units} units · {detail.order.weightKg} kg · {detail.order.volumeM3} m³
          </p>
          <p className="wp-muted">
            {detail.delivery?.deliveredAt
              ? `Delivered ${day(detail.delivery.deliveredAt)} · ${time(detail.delivery.deliveredAt)}`
              : 'Delivery has not been recorded yet.'}
          </p>
          {receipt ? (
            <p role="status">
              Receipt confirmed {day(receipt.confirmedAt)} · {time(receipt.confirmedAt)}.
            </p>
          ) : (
            <p>Confirm the delivery if the quantity and condition match this order.</p>
          )}
          {error && (
            <p role="alert" className="store-error">
              {error}
            </p>
          )}
          {!receipt && (
            <Button
              disabled={!writable || !ready}
              busy={confirm.isPending}
              onClick={() => {
                setError('');
                confirm.mutate();
              }}
            >
              Confirm receipt
            </Button>
          )}
          {!ready && !receipt && (
            <p className="wp-muted">
              Receipt confirmation opens after the driver records a delivered stop.
            </p>
          )}
          <Button asChild variant="secondary">
            <Link to={`/store/orders/${detail.order.id}/issue`}>Report a discrepancy</Link>
          </Button>
        </Card>
        <Summary detail={detail} />
      </div>
    </>
  );
}

const issueTypes: IssueType[] = ['missing', 'damaged', 'incorrect'];

function IssueReport({
  detail,
  writable,
  onChanged,
}: {
  detail: StoreOrderDetail;
  writable: boolean;
  onChanged: () => Promise<void>;
}) {
  const [type, setType] = useState<IssueType>('missing');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const report = useMutation({
    mutationFn: () =>
      api('/issues', issueSchema, {
        method: 'POST',
        body: JSON.stringify({
          orderId: detail.order.id,
          type,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      }),
    onSuccess: async (issue) => {
      setNote('');
      setSent(issue.id);
      await onChanged();
    },
    onError: (cause) => setError(message(cause)),
  });
  return (
    <>
      <PageHeader title="Delivery issue" description={`Linked to ${orderName(detail.order.id)}`}>
        <StatusBadge status="issue-open" label="Report to planning" />
      </PageHeader>
      <div className="store-issues">
        <Card>
          <h2>What is wrong</h2>
          <fieldset className="store-issue-list">
            <legend className="wp-sr-only">Issue type</legend>
            {issueTypes.map((option) => (
              <label key={option} className="store-choice">
                <input
                  type="radio"
                  name="issue-type"
                  checked={type === option}
                  onChange={() => setType(option)}
                />
                <strong>{issueLabel(option)}</strong>
              </label>
            ))}
          </fieldset>
        </Card>
        <Card>
          <label className="store-field">
            Note for planning
            <textarea
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {sent && <p role="status">Issue sent. Planning can see it on this order.</p>}
          {error && (
            <p role="alert" className="store-error">
              {error}
            </p>
          )}
          <Button
            disabled={!writable}
            busy={report.isPending}
            onClick={() => {
              setError('');
              report.mutate();
            }}
          >
            Send issue
          </Button>
          {detail.issues.length > 0 && (
            <ul className="wp-list">
              {detail.issues.map((issue) => (
                <li key={issue.id}>
                  <StatusBadge status={issue.status === 'open' ? 'issue-open' : 'resolved'} />
                  <strong>{issueLabel(issue.type)}</strong>
                  <p className="store-prewrap">{issue.note ?? 'No additional note.'}</p>
                  <small>{day(issue.createdAt)}</small>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
