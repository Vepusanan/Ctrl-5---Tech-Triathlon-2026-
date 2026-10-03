import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import type { DeliveryStop, Outlet, SyncTripChanged, TripStopDetail } from '@waypoint/shared';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, ErrorState, StatusBadge } from '../../components/waypoint';
import { message } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';
import { day, time } from '../store/shared';
import { useDepart } from './actions';
import { cartons, percent, stopBadge, stopTitle, tripBadge, windowRange } from './labels';
import { loadOutlets, loadStop, loadTrip } from './offline/queries';
import { cachedTrip, setRouteChange } from './offline/store';
import { Chip, DriverHeader, DriverIcon, Strip, ThumbZone } from './shell';
import { TripSkeleton } from './skeletons';
import { useDriver, useStopSync } from './workspace';

export function useDriverOutlets(userId: string) {
  return useQuery({
    queryKey: queryKeys.driver.outlets(userId),
    queryFn: () => loadOutlets(userId),
    staleTime: 5 * 60_000,
    networkMode: 'always',
  });
}

/** Constraints a driver needs before arriving, as plain words (Figma info row). */
function stopNotes(outlet: Outlet | undefined, chilled: boolean, units: number): string {
  const notes: string[] = [];
  if (outlet?.parkingConstraint === 'van_only') notes.push('Van only');
  if (outlet?.mallWindow) notes.push(`Mall ${outlet.mallWindow.open}–${outlet.mallWindow.close}`);
  if (chilled) notes.push('Chilled');
  notes.push(cartons(units));
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
  const { user, online, record, sync } = useDriver();
  const navigate = useNavigate();
  const trip = useQuery({
    queryKey: queryKeys.driver.trip(user.id, tripId),
    queryFn: () => loadTrip(user.id, tripId),
    refetchInterval: 30_000,
    networkMode: 'always',
  });
  const outlets = useDriverOutlets(user.id);
  const departed = trip.data?.status === 'departed';
  // Reading every stop while online also keeps it on the phone for the rest of the trip.
  const stopDetails = useQueries({
    queries: (departed ? (trip.data?.stops ?? []) : []).map((stop) => ({
      queryKey: queryKeys.driver.stop(user.id, stop.id),
      queryFn: () => loadStop(user.id, stop.id),
      networkMode: 'always' as const,
    })),
  });
  const routeChange = useQuery({
    queryKey: queryKeys.driver.route(user.id, tripId),
    queryFn: async () => (await cachedTrip(user.id, tripId))?.routeChange ?? null,
    networkMode: 'always',
  });
  const { depart, stale } = useDepart();
  // Saved on the phone first, then sent by the outbox (§8.2), so arriving works without signal.
  const arrive = useMutation({
    mutationFn: (stop: DeliveryStop) => record({ stop, type: 'arrived' }),
    onSuccess: (_, stop) => navigate(`/driver/stops/${stop.id}`),
    networkMode: 'always',
  });

  if (trip.isPending) return <TripSkeleton />;
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
          {sync.pending > 0 ? (
            <Chip tone="warning" icon="cloud">
              Saved here
            </Chip>
          ) : (
            <span>{day(detail.run.serviceDate)}</span>
          )}
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

      {routeChange.data && (
        <RouteChanged
          change={routeChange.data}
          onAcknowledge={() =>
            void setRouteChange(user.id, tripId, null, routeChange.data?.version)
          }
        />
      )}
      <DepartError error={depart.error} stale={stale} />
      {arrive.error && (
        <div className="driver-banner driver-banner--danger" role="alert">
          <strong>Arrival not saved on this phone</strong>
          <p>{message(arrive.error)}</p>
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
      {!online && (
        <p className="driver-note">
          <DriverIcon name="check" size={16} />
          All actions still work offline
        </p>
      )}
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
            disabled={!nextLive}
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
  const local = useStopSync(stop.id);
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
      {local.conflict ? (
        <p className="driver-stop-line driver-stop-sync driver-stop-sync--conflict">
          <DriverIcon name="info" size={14} />
          <span>Not accepted by the server · see Sync</span>
        </p>
      ) : local.pending ? (
        <p className="driver-stop-line driver-stop-sync">
          <DriverIcon name="clock" size={14} />
          <span>Saved on this phone · waiting to sync</span>
        </p>
      ) : null}
    </>
  );
  const recorded = status === 'delivered' || status === 'failed';
  const outcome = local.entries.findLast(
    (entry) => entry.type === status && entry.status !== 'conflict',
  );
  const at = live?.pod?.clientTime ?? outcome?.clientTime;
  // DR05 `2046:5417`: a recorded stop shrinks to one row, and says so while it waits on the phone.
  const compact = (
    <div className="driver-stop-done">
      {marker}
      <div className="driver-row-text">
        <strong>{outlet?.district ?? stop.order.outletId}</strong>
        <span>
          {status === 'delivered'
            ? `Delivered${at ? ` ${time(at)}` : ''} · POD saved`
            : `Not delivered${at ? ` ${time(at)}` : ''}${live?.failureReason ? ` · ${live.failureReason}` : ''}`}
        </span>
      </div>
      {local.conflict ? (
        <Chip tone="danger" icon="xoct">
          Conflict
        </Chip>
      ) : local.pending ? (
        <Chip tone="warning" icon="cloud">
          Saved
        </Chip>
      ) : (
        <StatusBadge status={badge.status} {...(badge.label ? { label: badge.label } : {})} />
      )}
    </div>
  );
  const className = `driver-card driver-stop${next ? ' driver-stop--next' : ''}`;
  const content = recorded ? compact : body;
  return linked ? (
    <Link className={className} to={`/driver/stops/${stop.id}`}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

/** §8.4: a published change reaches the driver as a notice they acknowledge, never silently. */
function RouteChanged({
  change,
  onAcknowledge,
}: {
  change: SyncTripChanged;
  onAcknowledge: () => void;
}) {
  const parts = [
    change.added.length > 0 ? `${change.added.length} added` : null,
    change.removed.length > 0 ? `${change.removed.length} removed` : null,
    change.reordered.length > 0 ? `${change.reordered.length} moved` : null,
  ].filter((part) => part !== null);
  return (
    <div className="driver-banner" role="alert">
      <strong>
        Route changed · v{change.since} to v{change.version}
      </strong>
      <p>The dispatcher changed this trip ({parts.join(', ')}). The stops below are the latest.</p>
      <Button variant="secondary" onClick={onAcknowledge}>
        Got it
      </Button>
    </div>
  );
}
