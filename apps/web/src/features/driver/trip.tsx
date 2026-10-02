import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import {
  type DeliveryStop,
  deliveryStopSchema,
  type Outlet,
  outletListResponseSchema,
  type TripStopDetail,
  tripDetailSchema,
} from '@waypoint/shared';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, ErrorState, LoadingState, StatusBadge } from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';
import { day, time } from '../store/shared';
import { useDepart, useDriverRefresh, useSendStopEvent } from './actions';
import { percent, stopBadge, stopTitle, tripBadge, windowRange } from './labels';
import { DriverHeader, DriverIcon, Strip, ThumbZone } from './shell';
import { useDriver } from './workspace';

export function useDriverOutlets(userId: string) {
  return useQuery({
    queryKey: queryKeys.driver.outlets(userId),
    queryFn: () => api('/outlets', outletListResponseSchema),
    staleTime: 5 * 60_000,
  });
}

/** Constraints a driver needs before arriving, as plain words (Figma info row). */
function stopNotes(outlet: Outlet | undefined, chilled: boolean, units: number): string {
  const notes: string[] = [];
  if (outlet?.parkingConstraint === 'van_only') notes.push('Van only');
  if (outlet?.mallWindow) notes.push(`Mall ${outlet.mallWindow.open}–${outlet.mallWindow.close}`);
  if (chilled) notes.push('Chilled');
  notes.push(`${units} ${units === 1 ? 'unit' : 'units'}`);
  return notes.join(' · ');
}

export function DepartError({ error, stale }: { error: Error | null; stale: boolean }) {
  if (!error) return null;
  return (
    <div className="driver-banner driver-banner--danger" role="alert">
      <strong>Trip not started</strong>
      <p>
        {stale
          ? 'The trip changed since you opened it. The latest version is shown; try again.'
          : message(error)}
      </p>
    </div>
  );
}

// DR02. The trip itself has the stop sequence and planned arrivals. Outlet windows come from the
// driver-scoped /outlets, and the shifted ETA from /stops/:id, which opens only after departure.
export function TripOverview() {
  const { tripId = '' } = useParams();
  const { user, online, eventFor } = useDriver();
  const navigate = useNavigate();
  const refresh = useDriverRefresh();
  const send = useSendStopEvent();
  const trip = useQuery({
    queryKey: queryKeys.driver.trip(user.id, tripId),
    queryFn: () => api(`/trips/${tripId}`, tripDetailSchema),
    refetchInterval: 30_000,
  });
  const outlets = useDriverOutlets(user.id);
  const departed = trip.data?.status === 'departed';
  const stopDetails = useQueries({
    queries: (departed ? (trip.data?.stops ?? []) : []).map((stop) => ({
      queryKey: queryKeys.driver.stop(user.id, stop.id),
      queryFn: () => api(`/stops/${stop.id}`, deliveryStopSchema),
    })),
  });
  const { depart, stale } = useDepart();
  // Same event path as the stop screen, so a retry replays the recorded arrival.
  const arrive = useMutation({
    mutationFn: (stop: DeliveryStop) =>
      send(
        eventFor({
          stopId: stop.id,
          tripVersion: stop.tripVersion,
          type: 'arrived',
          payload: {},
        }),
      ),
    onSuccess: (_, stop) => navigate(`/driver/stops/${stop.id}`),
    onSettled: refresh,
  });

  if (trip.isPending) return <LoadingState label="Loading the trip…" />;
  if (!trip.data) {
    return <ErrorState description={message(trip.error)} onRetry={() => void trip.refetch()} />;
  }
  const detail = trip.data;
  if (detail.run.status !== 'published') {
    return (
      <ErrorState
        title="Trip not published"
        description="This trip is still a planning draft. It appears once the dispatcher publishes it."
      />
    );
  }
  const stops = [...detail.stops].sort((left, right) => left.seq - right.seq);
  const liveById = new Map(
    stopDetails.flatMap((query) => (query.data ? [[query.data.id, query.data] as const] : [])),
  );
  const outletById = new Map((outlets.data?.items ?? []).map((outlet) => [outlet.id, outlet]));
  const next = stops.find((stop) => stop.status === 'pending' || stop.status === 'arrived');
  const nextLive = next ? liveById.get(next.id) : undefined;
  const done = stops.filter((stop) => stop.status === 'delivered' || stop.status === 'failed');
  const badge = tripBadge[detail.status];
  const nextName = next?.order.outletId ?? '';

  return (
    <>
      <DriverHeader
        back="/driver"
        backLabel="My trips"
        eyebrow={`${detail.vehicleId} · route v${detail.version}`}
        title={`Trip ${detail.tripNo}`}
        trailing={<StatusBadge status={badge.status} label={badge.label} />}
      />

      <section className="driver-card driver-progress" aria-label="Progress">
        <div className="driver-progress-head">
          <strong className="driver-hero-number">{done.length}</strong>
          <span>
            of {stops.length} {stops.length === 1 ? 'stop' : 'stops'} done
          </span>
          <span>{day(detail.run.serviceDate)}</span>
        </div>
        <div
          className="driver-bar"
          role="progressbar"
          aria-label="Stops done"
          aria-valuemin={0}
          aria-valuemax={stops.length}
          aria-valuenow={done.length}
        >
          <span style={{ width: `${percent(done.length, stops.length)}%` }} />
        </div>
      </section>

      <DepartError error={depart.error} stale={stale} />
      {arrive.error && (
        <div className="driver-banner driver-banner--danger" role="alert">
          <strong>Arrival not saved</strong>
          <p>{message(arrive.error)}</p>
          <p className="wp-muted">
            Press the same button again to retry. It will not be recorded twice.
          </p>
        </div>
      )}
      {(detail.status === 'published' || detail.status === 'loading') && (
        <Strip tone="neutral" icon={<DriverIcon name="info" size={16} />}>
          The loader has not finished this vehicle yet. You can start once it is marked ready.
        </Strip>
      )}
      {detail.status === 'blocked' && (
        <div className="driver-banner driver-banner--danger" role="alert">
          <strong>Trip blocked</strong>
          <p>The vehicle is unavailable for this trip. Contact the dispatcher.</p>
        </div>
      )}

      <ol className="driver-stops">
        {stops.map((stop) => (
          <li key={stop.id}>
            <StopCard
              stop={stop}
              live={liveById.get(stop.id)}
              outlet={outletById.get(stop.order.outletId)}
              next={departed && stop.id === next?.id}
              linked={departed}
            />
          </li>
        ))}
      </ol>
      {departed && !next && (
        <Strip tone="success" icon={<DriverIcon name="check" size={16} />}>
          Every stop on this trip has an outcome. Return to the depot.
        </Strip>
      )}

      {detail.status === 'ready' && (
        <ThumbZone>
          <Button
            className="driver-cta"
            busy={depart.isPending}
            disabled={!online}
            onClick={() => depart.mutate(detail)}
          >
            Start trip
          </Button>
        </ThumbZone>
      )}
      {departed && next?.status === 'pending' && (
        <ThumbZone>
          <Button
            className="driver-cta"
            busy={arrive.isPending}
            disabled={!online || !nextLive}
            onClick={() => nextLive && arrive.mutate(nextLive)}
          >
            Arrive at {nextName}
          </Button>
        </ThumbZone>
      )}
      {departed && next?.status === 'arrived' && (
        <ThumbZone>
          <Button asChild className="driver-cta">
            <Link to={`/driver/stops/${next.id}/outcome`}>Record delivery · {nextName}</Link>
          </Button>
        </ThumbZone>
      )}
    </>
  );
}

function StopCard({
  stop,
  live,
  outlet,
  next,
  linked,
}: {
  stop: TripStopDetail;
  live: DeliveryStop | undefined;
  outlet: Outlet | undefined;
  next: boolean;
  linked: boolean;
}) {
  const status = live?.status ?? stop.status;
  const badge = stopBadge(status, live?.late ?? false);
  const window = windowRange(outlet);
  const marker =
    status === 'delivered' ? (
      <span className="driver-seq driver-seq--done">
        <DriverIcon name="check-success" size={16} />
        <span className="wp-sr-only">Stop {stop.seq}</span>
      </span>
    ) : status === 'failed' ? (
      <span className="driver-seq driver-seq--failed">
        <DriverIcon name="x" size={16} />
        <span className="wp-sr-only">Stop {stop.seq}</span>
      </span>
    ) : (
      <span className={`driver-seq${next ? ' driver-seq--next' : ''}`}>{stop.seq}</span>
    );
  const body = (
    <>
      <div className="driver-stop-head">
        {marker}
        <strong>{stopTitle(stop.order.outletId, outlet)}</strong>
        {next && status === 'pending' ? (
          <StatusBadge status="departed" label="Next" />
        ) : status !== 'pending' ? (
          <StatusBadge status={badge.status} {...(badge.label ? { label: badge.label } : {})} />
        ) : null}
      </div>
      <p className="driver-stop-line">
        <DriverIcon name="clock" size={14} />
        <span>
          {live ? 'ETA' : 'Planned'} {time(live?.eta ?? stop.plannedArrival)}
        </span>
        {window && <span className="driver-faint">{window}</span>}
      </p>
      <p className="driver-stop-line driver-faint">
        <DriverIcon name="info" size={14} />
        <span>{stopNotes(outlet, stop.order.temp === 'chilled', stop.order.units)}</span>
      </p>
    </>
  );
  const className = `driver-card driver-stop${next ? ' driver-stop--next' : ''}`;
  return linked ? (
    <Link className={className} to={`/driver/stops/${stop.id}`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
