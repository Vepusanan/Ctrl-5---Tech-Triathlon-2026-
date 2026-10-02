import { useMutation, useQuery } from '@tanstack/react-query';
import { deliveryStopSchema, type Outlet, tripDetailSchema } from '@waypoint/shared';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, ErrorState, LoadingState, StatusBadge, Tag } from '../../components/waypoint';
import { api, HttpError, message } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';
import { issueTypeLabel } from '../loader/labels';
import { orderName, time } from '../store/shared';
import { useDriverRefresh, useSendStopEvent } from './actions';
import { dockLabel, stopBadge } from './labels';
import { DriverHeader, DriverIcon, InverseCard, ListRow, Strip, ThumbZone } from './shell';
import { useDriverOutlets } from './trip';
import { useDriver } from './workspace';

const minutes = (clock: string) => {
  const [hours = 0, mins = 0] = clock.split(':').map(Number);
  return hours * 60 + mins;
};

/** Where the ETA falls inside the outlet window, as a percentage of the bar (Figma T2 · Window). */
function windowMarker(eta: string, outlet: Outlet): number {
  const open = minutes(outlet.window.open);
  const close = minutes(outlet.window.close);
  if (close <= open) return 0;
  const at = minutes(time(eta));
  return Math.min(100, Math.max(0, ((at - open) / (close - open)) * 100));
}

/** Arrived after the window, or still expected after it closes. */
function pastWindow(eta: string, outlet: Outlet, late: boolean, pending: boolean): boolean {
  return late || (pending && minutes(time(eta)) > minutes(outlet.window.close));
}

// DR03. Only moves the API allows from the current status are offered: pending → arrived here,
// then the outcome screen (DR04) records delivered with POD or failed with a reason.
export function StopDetail() {
  const { stopId = '' } = useParams();
  const { user, online, eventFor } = useDriver();
  const refresh = useDriverRefresh();
  const send = useSendStopEvent();
  const stop = useQuery({
    queryKey: queryKeys.driver.stop(user.id, stopId),
    queryFn: () => api(`/stops/${stopId}`, deliveryStopSchema),
  });
  const tripId = stop.data?.tripId ?? '';
  const trip = useQuery({
    queryKey: queryKeys.driver.trip(user.id, tripId),
    queryFn: () => api(`/trips/${tripId}`, tripDetailSchema),
    enabled: tripId !== '',
  });
  const outlets = useDriverOutlets(user.id);
  // A failed attempt keeps its event, so pressing the same button again replays it unchanged.
  const arrive = useMutation({
    mutationFn: (run: () => Promise<void>) => run(),
    onSettled: refresh,
  });
  // If the response was lost but the API recorded the event, the refreshed status moves on.
  // The earlier error no longer applies once it does.
  const status = stop.data?.status;
  const { reset } = arrive;
  useEffect(() => {
    if (status !== undefined) reset();
  }, [status, reset]);

  if (stop.isPending) return <LoadingState label="Loading the stop…" />;
  if (!stop.data) {
    const hidden = stop.error instanceof HttpError && stop.error.status === 404;
    return (
      <ErrorState
        {...(hidden ? { title: 'Stop not available' } : {})}
        description={
          hidden
            ? 'Stops open once your trip has started. Start the trip from its overview first.'
            : message(stop.error)
        }
        onRetry={() => void stop.refetch()}
      />
    );
  }
  const detail = stop.data;
  const outlet = outlets.data?.items.find((item) => item.id === detail.order.outletId);
  const badge = stopBadge(detail.status, detail.late);
  const ordered = [...(trip.data?.stops ?? [])].sort((left, right) => left.seq - right.seq);
  const next = ordered.find(
    (item) => item.id !== detail.id && (item.status === 'pending' || item.status === 'arrived'),
  );
  const shortfalls = (trip.data?.exceptions ?? []).filter(
    (issue) => issue.orderId === detail.order.id,
  );
  const place = outlet?.district ?? detail.order.outletId;
  const recordArrival = () =>
    arrive.mutate(() =>
      send(
        eventFor({
          stopId: detail.id,
          tripVersion: detail.tripVersion,
          type: 'arrived',
          payload: {},
        }),
      ),
    );

  return (
    <>
      <DriverHeader
        back={`/driver/trips/${detail.tripId}`}
        backLabel="Trip"
        eyebrow={`Stop ${detail.seq}${ordered.length ? ` of ${ordered.length}` : ''} · ${detail.order.outletId}`}
        title={place}
        trailing={
          <StatusBadge status={badge.status} {...(badge.label ? { label: badge.label } : {})} />
        }
      />

      <InverseCard>
        <div className="driver-window-head">
          <div>
            <span>{detail.status === 'pending' ? 'ETA' : 'Planned'}</span>
            <strong className="driver-hero-number">
              {time(detail.status === 'pending' ? detail.eta : detail.plannedArrival)}
            </strong>
          </div>
          <div>
            <span>Window</span>
            <strong className="driver-window-value">
              {outlet
                ? `${outlet.window.open}–${outlet.window.close}`
                : `closes ${detail.windowClose}`}
            </strong>
          </div>
        </div>
        {outlet && (
          <div className="driver-window-bar" aria-hidden="true">
            <span
              className={
                pastWindow(detail.eta, outlet, detail.late, detail.status === 'pending')
                  ? 'driver-window-bar--late'
                  : undefined
              }
            />
            <i style={{ left: `${windowMarker(detail.eta, outlet)}%` }} />
          </div>
        )}
      </InverseCard>

      <section className="driver-card driver-list-card" aria-label="Access">
        <ListRow
          icon={<DriverIcon name="nav" size={20} />}
          title={
            outlet
              ? `${dockLabel[outlet.dockType]}${outlet.parkingConstraint === 'van_only' ? ' · van only' : ''}`
              : 'Access'
          }
          detail={
            outlet?.mallWindow
              ? `Mall window ${outlet.mallWindow.open}–${outlet.mallWindow.close}`
              : `${orderName(detail.order.id)} · ${detail.order.weightKg.toFixed(0)} kg · ${detail.order.volumeM3.toFixed(2)} m³`
          }
        />
      </section>

      <section className="driver-card driver-items" aria-label="Goods">
        <div className="driver-items-head">
          <strong className="driver-big-number">{detail.order.units}</strong>
          <span className="driver-items-label">
            {detail.order.units === 1 ? 'unit' : 'units'} to hand over
          </span>
          <Tag kind={detail.order.temp === 'chilled' ? 'chilled' : 'ambient'} />
        </div>
        {shortfalls.map((issue) => (
          <Strip key={issue.id} tone="warning" icon={<DriverIcon name="info-warning" size={16} />}>
            {issue.qty} {issue.qty === 1 ? 'unit' : 'units'}{' '}
            {issueTypeLabel[issue.type].toLowerCase()} ·{' '}
            {issue.acknowledgedAt ? 'dispatcher informed' : 'waiting for the dispatcher'}
          </Strip>
        ))}
      </section>

      {arrive.error && (
        <div className="driver-banner driver-banner--danger" role="alert">
          <strong>Not saved</strong>
          <p>{message(arrive.error)}</p>
          <p className="wp-muted">
            Press the same button again to retry. It will not be recorded twice.
          </p>
        </div>
      )}
      {detail.status === 'arrived' && detail.late && (
        <Strip tone="warning" icon={<DriverIcon name="info-warning" size={16} />}>
          Arrived after the delivery window closed.
        </Strip>
      )}
      {detail.status === 'arrived' && detail.pod && (
        <Strip tone="info" icon={<DriverIcon name="info-info" size={16} />}>
          Proof of delivery already saved for {detail.pod.recipientName}. Complete the delivery to
          finish.
        </Strip>
      )}
      {detail.status === 'delivered' && (
        <div className="driver-banner driver-banner--success" role="status">
          <strong>Delivered{detail.late ? ' · late' : ''}</strong>
          {detail.pod && (
            <p>
              Received by {detail.pod.recipientName} at {time(detail.pod.clientTime)}
              {detail.pod.hasPhoto ? ' · photo attached' : ''}
            </p>
          )}
        </div>
      )}
      {detail.status === 'failed' && (
        <div className="driver-banner driver-banner--danger" role="status">
          <strong>Not delivered</strong>
          <p>Reason: {detail.failureReason ?? 'not recorded'}</p>
        </div>
      )}

      <ThumbZone>
        {detail.status === 'pending' && (
          <Button
            className="driver-cta"
            busy={arrive.isPending}
            disabled={!online}
            onClick={recordArrival}
          >
            I've arrived
          </Button>
        )}
        {detail.status === 'arrived' && (
          <Button asChild className="driver-cta">
            <Link to={`/driver/stops/${detail.id}/outcome`}>
              {detail.pod ? 'Complete delivery' : 'Record delivery'}
            </Link>
          </Button>
        )}
        {(detail.status === 'delivered' || detail.status === 'failed') &&
          (next ? (
            <Button asChild className="driver-cta">
              <Link to={`/driver/stops/${next.id}`}>
                Next stop · {next.seq}. {next.order.outletId}
              </Link>
            </Button>
          ) : (
            <Button asChild className="driver-cta">
              <Link to={`/driver/trips/${detail.tripId}`}>Back to trip</Link>
            </Button>
          ))}
      </ThumbZone>
    </>
  );
}
