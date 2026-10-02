import { useMutation, useQuery } from '@tanstack/react-query';
import {
  type NotificationFeedItem,
  type NotificationType,
  notificationFeedItemSchema,
  notificationListResponseSchema,
  tripDetailSchema,
  tripListResponseSchema,
} from '@waypoint/shared';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, ErrorState, LoadingState } from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';
import { issueTypeLabel } from '../loader/labels';
import { day, time } from '../store/shared';
import { useDriverRefresh } from './actions';
import { DriverHeader, DriverIcon, InverseCard, ListRow, ThumbZone } from './shell';
import { useDriver } from './workspace';

const noticeTitle: Record<NotificationType, string> = {
  plan_changed: 'Route changed',
  plan_published: 'Route published',
  sync_conflict: 'Sync conflict',
  delivery_failed: 'Delivery failed',
  delivery_issue: 'Delivery issue',
  delivered: 'Delivered',
  loading_shortfall: 'Loading shortfall',
  order_confirmed: 'Order confirmed',
  order_deferred: 'Order deferred',
  receipt_discrepancy: 'Receipt discrepancy',
};

function useNotices() {
  const { user } = useDriver();
  return useQuery({
    queryKey: queryKeys.driver.notifications(user.id),
    queryFn: () => api('/notifications', notificationListResponseSchema),
    refetchInterval: 30_000,
  });
}

// DR07. The driver's own feed from GET /notifications: what needs an OK first, then the rest.
export function Notices() {
  const { user, stamp } = useDriver();
  const notices = useNotices();
  // Same query as My trips, so a trip notice can name its trip without another request.
  const trips = useQuery({
    queryKey: queryKeys.driver.trips(user.id),
    queryFn: () => api('/trips', tripListResponseSchema),
  });
  const tripLabel = new Map(
    (trips.data?.items ?? []).map((trip) => [
      trip.id,
      `${day(trip.run.serviceDate)} · Trip ${trip.tripNo}`,
    ]),
  );
  const header = (
    <DriverHeader eyebrow={`${user.vehicleId} · ${day(stamp())}`} title="Notices" large />
  );
  if (notices.isPending) {
    return (
      <>
        {header}
        <LoadingState label="Loading notices…" />
      </>
    );
  }
  if (!notices.data) {
    return (
      <>
        {header}
        <ErrorState description={message(notices.error)} onRetry={() => void notices.refetch()} />
      </>
    );
  }
  const items = [...notices.data.items].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const open = items.filter((item) => item.actionRequired);
  const earlier = items.filter((item) => !item.actionRequired);
  return (
    <>
      {header}
      <InverseCard>
        <div className="driver-count-hero">
          <strong className="driver-hero-number">{open.length}</strong>
          <div>
            <p>{open.length === 0 ? 'nothing needs your OK' : 'needs your OK'}</p>
            {open[0] && <small>{noticeTitle[open[0].type]}</small>}
          </div>
        </div>
      </InverseCard>
      {items.length === 0 && (
        <EmptyState
          title="No notices"
          description="Route changes from the dispatcher appear here."
        />
      )}
      {open.length > 0 && <NoticeList label="Needs you" items={open} tripLabel={tripLabel} />}
      {earlier.length > 0 && <NoticeList label="Earlier" items={earlier} tripLabel={tripLabel} />}
    </>
  );
}

function NoticeList({
  label,
  items,
  tripLabel,
}: {
  label: string;
  items: NotificationFeedItem[];
  tripLabel: ReadonlyMap<string, string>;
}) {
  return (
    <section className="driver-section" aria-label={label}>
      <h2 className="driver-section-label">{label}</h2>
      <div className="driver-card driver-list-card">
        {items.map((item) => (
          <Link key={item.id} className="driver-row-link" to={`/driver/notices/${item.id}`}>
            <ListRow
              icon={
                <DriverIcon name={item.actionRequired ? 'tab-trip' : 'check-success'} size={20} />
              }
              tone={item.actionRequired ? 'warning' : 'success'}
              title={noticeTitle[item.type]}
              detail={[
                item.entityType === 'trip' ? tripLabel.get(item.entityId) : undefined,
                item.actionRequired
                  ? 'Open to acknowledge'
                  : item.acknowledgedAt
                    ? `Acknowledged ${time(item.acknowledgedAt)}`
                    : 'For your information',
              ]
                .filter(Boolean)
                .join(' · ')}
              trailing={<span className="driver-faint">{time(item.createdAt)}</span>}
            />
          </Link>
        ))}
      </div>
    </section>
  );
}

// DR06. A trip notice opens the current route of that trip. The API does not keep the previous
// route, so the screen shows the version now in force, its stop order and any shortfalls.
export function NoticeDetail() {
  const { noticeId = '' } = useParams();
  const { user, online } = useDriver();
  const refresh = useDriverRefresh();
  const notices = useNotices();
  const notice = notices.data?.items.find((item) => item.id === noticeId);
  const tripId = notice?.entityType === 'trip' ? notice.entityId : '';
  const trip = useQuery({
    queryKey: queryKeys.driver.trip(user.id, tripId),
    queryFn: () => api(`/trips/${tripId}`, tripDetailSchema),
    enabled: tripId !== '',
  });
  const acknowledge = useMutation({
    mutationFn: (id: string) =>
      api(`/notifications/${id}/acknowledge`, notificationFeedItemSchema, { method: 'POST' }),
    onSettled: refresh,
  });

  if (notices.isPending) return <LoadingState label="Loading the notice…" />;
  if (!notice) {
    return (
      <ErrorState
        title="Notice not found"
        description={
          notices.error ? message(notices.error) : 'This notice is no longer in your feed.'
        }
        onRetry={() => void notices.refetch()}
      />
    );
  }
  const detail = trip.data;
  const stops = [...(detail?.stops ?? [])].sort((left, right) => left.seq - right.seq);

  return (
    <>
      <DriverHeader
        back="/driver/notices"
        backLabel="Notices"
        eyebrow={detail ? `${detail.vehicleId} · Trip ${detail.tripNo}` : user.vehicleId}
        title={noticeTitle[notice.type]}
      />
      {detail && (
        <InverseCard>
          <div className="driver-version">
            <strong className="driver-hero-number">v{detail.version}</strong>
          </div>
          <small className="driver-inverse-muted">
            Sent {time(notice.createdAt)} by dispatcher
          </small>
        </InverseCard>
      )}
      {trip.isPending && tripId !== '' && <LoadingState label="Loading the route…" rows={2} />}
      {trip.error && (
        <ErrorState description={message(trip.error)} onRetry={() => void trip.refetch()} />
      )}
      {detail && (
        <section className="driver-card driver-changes" aria-label="Current route">
          <h2 className="driver-headline">Current route</h2>
          {detail.exceptions.map((issue) => {
            const stop = stops.find((item) => item.order.id === issue.orderId);
            return (
              <div key={issue.id} className="driver-change driver-change--danger">
                <ListRow
                  icon={<DriverIcon name="minus-danger" size={20} />}
                  tone="surface"
                  title={`${stop?.order.outletId ?? 'Stop'} · ${issue.qty} ${issue.qty === 1 ? 'unit' : 'units'} ${issueTypeLabel[issue.type].toLowerCase()}`}
                  detail={
                    issue.acknowledgedAt ? 'Dispatcher informed' : 'Waiting for the dispatcher'
                  }
                />
              </div>
            );
          })}
          <div className="driver-change driver-change--success">
            <ListRow
              icon={<DriverIcon name="check-success" size={20} />}
              tone="surface"
              title={`${stops.length} ${stops.length === 1 ? 'stop' : 'stops'} in this order`}
              detail={stops.map((stop) => `${stop.seq} ${stop.order.outletId}`).join(' · ')}
            />
          </div>
        </section>
      )}
      {acknowledge.error && (
        <div className="driver-banner driver-banner--danger" role="alert">
          <strong>Not acknowledged</strong>
          <p>{message(acknowledge.error)}</p>
        </div>
      )}
      {!notice.actionRequired && notice.acknowledgedAt && (
        <p className="driver-note">
          <DriverIcon name="check" size={16} />
          Acknowledged {time(notice.acknowledgedAt)}
        </p>
      )}
      <ThumbZone>
        {notice.actionRequired ? (
          <Button
            className="driver-cta"
            busy={acknowledge.isPending}
            disabled={!online}
            onClick={() => acknowledge.mutate(notice.id)}
          >
            Acknowledge route
          </Button>
        ) : (
          detail && (
            <Button asChild className="driver-cta">
              <Link to={`/driver/trips/${detail.id}`}>Open trip</Link>
            </Button>
          )
        )}
      </ThumbZone>
    </>
  );
}
