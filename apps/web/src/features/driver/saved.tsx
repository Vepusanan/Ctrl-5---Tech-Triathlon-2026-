import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Button, ErrorState } from '../../components/waypoint';
import { message } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';
import { time } from '../store/shared';
import { eventRef } from './labels';
import { loadStop, loadTrip } from './offline/queries';
import { Glyph, ThumbZone } from './shell';
import { StopSkeleton } from './skeletons';
import { useDriverOutlets } from './trip';
import { useDriver, useStopSync } from './workspace';

// DR05a `2046:5641`. Shown straight after an outcome is recorded: the delivery counts as soon as it
// is on the phone, and the card lists exactly what was stored and when it reaches the server.
export function StopSaved() {
  const { stopId = '' } = useParams();
  const { user, online } = useDriver();
  const stop = useQuery({
    queryKey: queryKeys.driver.stop(user.id, stopId),
    queryFn: () => loadStop(user.id, stopId),
    networkMode: 'always',
  });
  const tripId = stop.data?.tripId ?? '';
  const trip = useQuery({
    queryKey: queryKeys.driver.trip(user.id, tripId),
    queryFn: () => loadTrip(user.id, tripId),
    enabled: tripId !== '',
    networkMode: 'always',
  });
  const outlets = useDriverOutlets(user.id);
  const local = useStopSync(stopId);

  if (stop.isPending) return <StopSkeleton back={`/driver/stops/${stopId}`} backLabel="Stop" />;
  if (!stop.data) {
    return <ErrorState description={message(stop.error)} onRetry={() => void stop.refetch()} />;
  }
  const detail = stop.data;
  const entry = local.entries.findLast(
    (item) => item.type === 'delivered' || item.type === 'failed',
  );
  // Nothing recorded from this phone: the stop screen is the place to be.
  if (!entry) return <Navigate to={`/driver/stops/${detail.id}`} replace />;

  const placeOf = (outletId: string) =>
    outlets.data?.items.find((outlet) => outlet.id === outletId)?.district ?? outletId;
  const next = [...(trip.data?.stops ?? [])]
    .sort((left, right) => left.seq - right.seq)
    .find(
      (item) => item.id !== detail.id && (item.status === 'pending' || item.status === 'arrived'),
    );
  const delivered = entry.type === 'delivered';
  const waiting =
    entry.status === 'queued' || entry.status === 'syncing' || entry.status === 'local';
  const pod = [
    'Signature',
    detail.pod?.hasPhoto || entry.blobId ? 'photo' : null,
    entry.recipientName || detail.pod ? 'name' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <div className="driver-saved">
        <span
          className={`driver-saved-mark${delivered ? '' : ' driver-saved-mark--failed'}`}
          aria-hidden="true"
        >
          <span>
            <Glyph name={delivered ? 'check' : 'x'} size={40} />
          </span>
        </span>
        <h1 tabIndex={-1} className="driver-large-title">
          {delivered ? 'Delivered' : 'Not delivered'} · saved
        </h1>
        <p className="driver-saved-meta">
          {placeOf(detail.order.outletId)} · {time(entry.clientTime)} ·{' '}
          {waiting ? 'on this phone' : 'on the server'}
        </p>
      </div>

      <dl className="driver-card driver-card--inverse driver-record">
        <div>
          <dt>Event ID</dt>
          <dd className="driver-mono">{eventRef(entry.clientEventId)}</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>v{entry.tripVersion}</dd>
        </div>
        <div>
          <dt>{delivered ? 'POD' : 'Reason'}</dt>
          <dd>{delivered ? pod : (entry.reason ?? detail.failureReason ?? 'Not recorded')}</dd>
        </div>
        <div>
          <dt>Sync</dt>
          <dd>
            {entry.status === 'conflict'
              ? 'Not accepted · see Sync'
              : !waiting
                ? 'Sent to the server'
                : online
                  ? 'Sending now'
                  : 'When signal returns'}
          </dd>
        </div>
      </dl>

      <ThumbZone>
        <Button asChild className="driver-cta">
          {next ? (
            <Link to={`/driver/stops/${next.id}`}>Next stop · {placeOf(next.order.outletId)}</Link>
          ) : (
            <Link to={`/driver/trips/${detail.tripId}`}>Back to trip</Link>
          )}
        </Button>
      </ThumbZone>
    </>
  );
}
