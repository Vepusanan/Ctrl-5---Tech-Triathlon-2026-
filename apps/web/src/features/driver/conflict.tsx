import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Button, Tag } from '../../components/waypoint';
import { queryKeys } from '../../lib/query-keys';
import { time } from '../store/shared';
import { cartons, eventRef } from './labels';
import { loadTrip } from './offline/queries';
import { Chip, DriverHeader, Glyph, ThumbZone } from './shell';
import { useDriverOutlets } from './trip';
import { useDriver } from './workspace';

const recorded = { arrived: 'Arrived', delivered: 'Delivered', failed: 'Failed' } as const;
const planned = {
  pending: 'Not arrived',
  arrived: 'Arrived',
  delivered: 'Delivered',
  failed: 'Failed',
} as const;

// DR05d `2046:6036`. One refused event, shown as two records side by side: what the driver
// recorded on the phone and what the plan on the server says. Nothing is resolved here; the
// server has already told the dispatcher (notification type `sync_conflict`).
export function SyncConflict() {
  const { eventId = '' } = useParams();
  const { user, sync, clockAt } = useDriver();
  const entry = sync.entries.find((item) => item.clientEventId === eventId);
  const tripId = entry?.tripId ?? '';
  const trip = useQuery({
    queryKey: queryKeys.driver.trip(user.id, tripId),
    queryFn: () => loadTrip(user.id, tripId),
    enabled: tripId !== '',
    networkMode: 'always',
  });
  const outlets = useDriverOutlets(user.id);
  // The outbox is read from IndexedDB after the first render; an unknown id goes back to Sync.
  if (!entry) return sync.entries.length > 0 ? <Navigate to="/driver/sync" replace /> : null;

  const place =
    outlets.data?.items.find((outlet) => outlet.id === entry.outletId)?.district ?? entry.outletId;
  const stop = trip.data?.stops.find((item) => item.id === entry.stopId);
  const version = trip.data?.version;

  return (
    <>
      <DriverHeader
        eyebrow={
          sync.lastSyncAt === null ? 'This phone' : `Synced ${time(clockAt(sync.lastSyncAt))}`
        }
        title={sync.conflicts === 1 ? 'One conflict' : `${sync.conflicts} conflicts`}
        large
        trailing={
          <Chip tone="danger" icon="xoct">
            Conflict
          </Chip>
        }
      />

      <div className="driver-compare">
        <section className="driver-card driver-card--inverse driver-compare-card">
          <span className="driver-inverse-muted">You recorded</span>
          <strong className="driver-big-number">{recorded[entry.type]}</strong>
          <span className="driver-inverse-muted">
            {place} · {time(entry.clientTime)} · route v{entry.tripVersion}
          </span>
          <Tag kind="observed" />
        </section>
        <section className="driver-card driver-compare-card">
          <span className="driver-footnote">
            {version === undefined ? 'The plan says' : `Plan v${version} says`}
          </span>
          <strong className="driver-big-number">
            {trip.isPending ? '…' : stop ? planned[stop.status] : 'Removed'}
          </strong>
          <span className="driver-footnote">
            {entry.detail ??
              (stop
                ? `${cartons(stop.order.units)} planned for this stop`
                : 'This stop is no longer on your trip')}
          </span>
        </section>
      </div>

      <section className="driver-card driver-happens" aria-label="What happens next">
        <p>
          <span className="driver-well driver-well--mini driver-well--success">
            <Glyph name="check" />
          </span>
          Your record stays on this phone
        </p>
        <p>
          <span className="driver-well driver-well--mini driver-well--success">
            <Glyph name="check" />
          </span>
          Nothing is deleted
        </p>
        <p>
          <span className="driver-well driver-well--mini">
            <Glyph name="user" />
          </span>
          Dispatcher decides the plan fix
        </p>
      </section>

      <p className="driver-plain">
        <Glyph name="info" size={14} />
        <span>Event {eventRef(entry.clientEventId)} · the dispatcher sees both records.</span>
      </p>

      <ThumbZone>
        <Button asChild className="driver-cta">
          <Link to="/driver/sync">Keep my record · tell dispatcher</Link>
        </Button>
        {version !== undefined && (
          <Link className="driver-link" to={`/driver/trips/${entry.tripId}`}>
            See route v{version}
          </Link>
        )}
      </ThumbZone>
    </>
  );
}
