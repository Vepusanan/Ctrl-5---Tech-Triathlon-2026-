import { useQuery } from '@tanstack/react-query';
import type { TripDetail } from '@waypoint/shared';
import { Link, useNavigate } from 'react-router-dom';
import { Button, EmptyState, ErrorState, StatusBadge } from '../../components/waypoint';
import { message } from '../../lib/api';
import { queryKeys } from '../../lib/query-keys';
import { day, initials } from '../store/shared';
import { useDepart } from './actions';
import { cartons, tripBadge } from './labels';
import { loadTrips } from './offline/queries';
import { DriverHeader, DriverIcon, Glyph, Strip, ThumbZone } from './shell';
import { TripsSkeleton } from './skeletons';
import { DepartError, useDriverOutlets } from './trip';
import { tripFinished as finished, useDriver } from './workspace';

// DR01. GET /trips returns every trip on the vehicle, including unpublished planning drafts,
// so only trips of a published run are shown. The first unfinished trip is the hero card.
export function MyTrips() {
  const { user, online, stamp } = useDriver();
  const navigate = useNavigate();
  const { depart, stale } = useDepart();
  const trips = useQuery({
    queryKey: queryKeys.driver.trips(user.id),
    queryFn: () => loadTrips(user.id),
    networkMode: 'always',
    refetchInterval: 30_000,
  });
  const now = stamp();
  const header = (
    <DriverHeader
      eyebrow={`${day(now)} · ${user.vehicleId}`}
      title="My trips"
      large
      trailing={
        <span className="driver-avatar" title={user.name}>
          {initials(user.name)}
        </span>
      }
    />
  );
  if (trips.isPending) {
    return (
      <>
        {header}
        <TripsSkeleton />
      </>
    );
  }
  if (!trips.data) {
    return (
      <>
        {header}
        <ErrorState description={message(trips.error)} onRetry={() => void trips.refetch()} />
      </>
    );
  }
  const published = trips.data.items
    .filter((trip) => trip.run.status === 'published')
    .sort(
      (left, right) =>
        left.run.serviceDate.localeCompare(right.run.serviceDate) || left.tripNo - right.tripNo,
    );
  const current = published.find((trip) => !finished(trip));
  const others = published.filter((trip) => trip !== current);
  const today = now.slice(0, 10);

  return (
    <>
      {header}
      {published.length === 0 && (
        <EmptyState
          title="No published trips"
          description="Your trips appear here after the dispatcher publishes the plan."
        />
      )}
      {current && <TripHero trip={current} today={today} />}
      {current && <DepartError error={depart.error} stale={stale} />}
      {others.length > 0 && (
        <section className="driver-card driver-list-card" aria-label="Other trips">
          {others.map((trip) => (
            <Link
              key={trip.id}
              className="driver-row driver-row--link"
              to={`/driver/trips/${trip.id}`}
            >
              <span className="driver-well">
                <DriverIcon name="cal" size={20} />
              </span>
              <span className="driver-row-text">
                <strong>
                  {day(trip.run.serviceDate)} · Trip {trip.tripNo}
                </strong>
                <span>
                  {finished(trip) ? 'All stops done' : tripBadge[trip.status].label} ·{' '}
                  {trip.stops.length} {trip.stops.length === 1 ? 'stop' : 'stops'} ·{' '}
                  {cartons(trip.stops.reduce((total, stop) => total + stop.order.units, 0))}
                </span>
              </span>
              <DriverIcon name="chevron-right" size={16} />
            </Link>
          ))}
        </section>
      )}
      {current?.status === 'ready' && (
        <ThumbZone>
          <Button
            className="driver-cta"
            busy={depart.isPending}
            disabled={!online}
            onClick={() =>
              depart.mutate(current, {
                onSuccess: () => navigate(`/driver/trips/${current.id}`),
              })
            }
          >
            Start trip
          </Button>
        </ThumbZone>
      )}
      {current?.status === 'departed' && (
        <ThumbZone>
          <Button asChild className="driver-cta">
            <Link to={`/driver/trips/${current.id}`}>Continue trip</Link>
          </Button>
        </ThumbZone>
      )}
    </>
  );
}

function TripHero({ trip, today }: { trip: TripDetail; today: string }) {
  const { user } = useDriver();
  const outlets = useDriverOutlets(user.id);
  const place = new Map((outlets.data?.items ?? []).map((outlet) => [outlet.id, outlet.district]));
  const stops = [...trip.stops].sort((left, right) => left.seq - right.seq);
  const done = stops.filter((stop) => stop.status === 'delivered' || stop.status === 'failed');
  const units = stops.reduce((total, stop) => total + stop.order.units, 0);
  const badge = tripBadge[trip.status];
  const onDay = trip.run.serviceDate === today;
  return (
    <Link className="driver-card driver-hero" to={`/driver/trips/${trip.id}`}>
      <div className="driver-hero-head">
        <h2 className="driver-title">
          {onDay ? '' : `${day(trip.run.serviceDate)} · `}Trip {trip.tripNo}
        </h2>
        <StatusBadge status={badge.status} label={badge.label} />
      </div>
      <dl className="driver-stats">
        <div>
          <dt>{stops.length === 1 ? 'stop' : 'stops'}</dt>
          <dd>{stops.length}</dd>
        </div>
        <div>
          <dt>{units === 1 ? 'carton' : 'cartons'}</dt>
          <dd>{units}</dd>
        </div>
        <div>
          <dt>km</dt>
          <dd>{Math.round(trip.plannedKm)}</dd>
        </div>
      </dl>
      <ol className="driver-chips" aria-label="Stop order">
        {stops.map((stop) => (
          <li key={stop.id}>
            <span className="driver-chip-seq">{stop.seq}</span>
            {place.get(stop.order.outletId) ?? stop.order.outletId}
          </li>
        ))}
      </ol>
      {/* Every published trip read online is kept in IndexedDB (offline/queries.ts). */}
      <Strip tone="success" icon={<Glyph name="cloud" />}>
        Route v{trip.version} saved for offline
      </Strip>
      {(trip.status === 'published' || trip.status === 'loading') && (
        <Strip tone="neutral" icon={<DriverIcon name="info" size={16} />}>
          The loader has not finished this vehicle yet.
        </Strip>
      )}
      {trip.status === 'departed' && done.length > 0 && (
        <Strip tone="info" icon={<DriverIcon name="info-info" size={16} />}>
          {done.length} of {stops.length} stops done
        </Strip>
      )}
      {trip.status === 'blocked' && (
        <Strip tone="danger" icon={<DriverIcon name="info" size={16} />}>
          The vehicle is unavailable for this trip. Contact the dispatcher.
        </Strip>
      )}
    </Link>
  );
}
