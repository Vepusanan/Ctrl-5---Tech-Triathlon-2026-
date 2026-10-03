import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Button } from '../../components/waypoint';
import { queryKeys } from '../../lib/query-keys';
import { time } from '../store/shared';
import { eventRef } from './labels';
import { cachedTrip } from './offline/store';
import type { OutboxEntry } from './offline/types';
import { Chip, DriverHeader, Glyph, type GlyphName, ThumbZone } from './shell';
import { useDriverOutlets } from './trip';
import { useDriver } from './workspace';

/** One line of the event list: an outbox entry, or the proof of delivery it carries. */
interface Row {
  key: string;
  icon: GlyphName;
  title: string;
  detail: string;
  chip: {
    tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
    icon: GlyphName;
    label: string;
  };
  to?: string;
}

const waiting = (entry: OutboxEntry) => entry.status !== 'synced' && entry.status !== 'conflict';

function chipFor(entry: OutboxEntry): Row['chip'] {
  if (entry.status === 'conflict') return { tone: 'danger', icon: 'xoct', label: 'Conflict' };
  if (entry.status === 'syncing') return { tone: 'info', icon: 'refresh', label: 'Syncing' };
  if (entry.status === 'synced') {
    // The server already had this event id: ignored, never a second delivery (DR05c).
    return entry.result === 'duplicate'
      ? { tone: 'neutral', icon: 'slash', label: 'Duplicate' }
      : { tone: 'success', icon: 'check', label: 'Synced' };
  }
  return { tone: 'warning', icon: 'cloud', label: 'Queued' };
}

// DR05b `2046:5705` (queue waiting) and DR05c `2046:5840` (all synced). The same screen: what is
// still on this phone, in order, with stable event ids; then what the server did with each one.
export function DriverSync() {
  const { user, online, sync, clockAt, route } = useDriver();
  const outlets = useDriverOutlets(user.id);
  // Read once from the cache the Trip tab fills; no request of its own.
  const routeChange = useQuery({
    queryKey: queryKeys.driver.route(user.id, route?.tripId ?? ''),
    queryFn: async () => (await cachedTrip(user.id, route?.tripId ?? ''))?.routeChange ?? null,
    enabled: route !== null,
    networkMode: 'always',
  });
  const placeOf = (outletId: string) =>
    outlets.data?.items.find((outlet) => outlet.id === outletId)?.district ?? outletId;

  const rows: Row[] = sync.entries.flatMap((entry) => {
    const ref = eventRef(entry.clientEventId);
    const stamp = waiting(entry) ? `${ref} · ${time(entry.clientTime)}` : ref;
    const chip = chipFor(entry);
    const to =
      entry.status === 'conflict' ? `/driver/sync/conflicts/${entry.clientEventId}` : undefined;
    const base = { detail: entry.status === 'conflict' ? `${ref} · open to see why` : stamp, chip };
    if (entry.type === 'arrived') {
      return [
        {
          ...base,
          key: entry.clientEventId,
          icon: 'pin' as const,
          title: `Arrived · ${placeOf(entry.outletId)}`,
          ...(to ? { to } : {}),
        },
      ];
    }
    if (entry.type === 'failed') {
      return [
        {
          ...base,
          key: entry.clientEventId,
          icon: 'x' as const,
          title: `Not delivered · ${placeOf(entry.outletId)}`,
          ...(to ? { to } : {}),
        },
      ];
    }
    const delivered: Row = {
      ...base,
      key: entry.clientEventId,
      icon: 'boxc',
      title: `Delivered · ${placeOf(entry.outletId)}`,
      ...(to ? { to } : {}),
    };
    // A proof of delivery captured on this phone travels before its delivered event (§8.2).
    if (!entry.blobId && !entry.recipientName) return [delivered];
    const uploaded = entry.podId !== undefined || entry.status === 'synced';
    return [
      {
        key: `${entry.clientEventId}-pod`,
        icon: 'pen' as const,
        title: 'POD · signature + photo',
        detail: stamp,
        chip: uploaded
          ? { tone: 'success' as const, icon: 'check' as const, label: 'Synced' }
          : chip,
      },
      delivered,
    ];
  });

  const clear = sync.pending === 0;
  const total = sync.entries.length;
  const lastSync = sync.lastSyncAt === null ? null : time(clockAt(sync.lastSyncAt));
  const nextRetry = sync.entries
    .filter((entry) => waiting(entry) && entry.nextAttemptAt > Date.now())
    .map((entry) => entry.nextAttemptAt)
    .sort((left, right) => left - right)[0];

  return (
    <>
      <DriverHeader
        eyebrow="This phone"
        title="Sync"
        large
        trailing={
          online ? (
            <Chip tone="success" icon="wifi">
              Online
            </Chip>
          ) : undefined
        }
      />

      <section className="driver-card driver-sync-summary" aria-label="Sync status">
        <span className={`driver-donut${clear ? ' driver-donut--clear' : ''}`}>
          <strong>{clear ? total : sync.pending}</strong>
        </span>
        <div className="driver-row-text">
          <strong>
            {clear ? (total === 0 ? 'Nothing to sync' : 'All synced') : 'Waiting to sync'}
          </strong>
          <span>
            {clear
              ? lastSync
                ? `Last sync ${lastSync}`
                : 'Not synced yet on this phone'
              : sync.syncing
                ? 'Sending now'
                : 'Sends automatically'}
          </span>
        </div>
      </section>

      {rows.length > 0 ? (
        <section className="driver-card driver-list-card" aria-label="Events on this phone">
          {rows.map((row) => {
            const body = (
              <>
                <span className="driver-well driver-well--small">
                  <Glyph name={row.icon} />
                </span>
                <span className="driver-row-text">
                  <strong>{row.title}</strong>
                  <span>{row.detail}</span>
                </span>
                <Chip tone={row.chip.tone} icon={row.chip.icon}>
                  {row.chip.label}
                </Chip>
              </>
            );
            return row.to ? (
              <Link key={row.key} className="driver-row driver-row--link" to={row.to}>
                {body}
              </Link>
            ) : (
              <div key={row.key} className="driver-row">
                {body}
              </div>
            );
          })}
        </section>
      ) : (
        <p className="driver-plain">
          <Glyph name="info" />
          <span>Arrivals and deliveries you record appear here until the server has them.</span>
        </p>
      )}

      {clear && total > 0 && route && routeChange.data === null && (
        <section className="driver-card driver-card--inverse driver-route-current">
          <span className="driver-well driver-well--small driver-well--inverse">
            <Glyph name="route" />
          </span>
          <div className="driver-row-text">
            <strong>Route v{route.version} is still current</strong>
            <span>No changes while you were offline</span>
          </div>
        </section>
      )}
      {route && routeChange.data && (
        <Link
          className="driver-card driver-card--inverse driver-route-current"
          to={`/driver/trips/${route.tripId}`}
        >
          <span className="driver-well driver-well--small driver-well--inverse">
            <Glyph name="route" />
          </span>
          <span className="driver-row-text">
            <strong>
              Route changed · v{routeChange.data.since} to v{routeChange.data.version}
            </strong>
            <span>Open the trip to see the latest stops</span>
          </span>
        </Link>
      )}

      {!clear && (
        <p className="driver-plain driver-plain--card">
          <Glyph name="shield" />
          <span>Each event has an ID, so a retry never delivers twice.</span>
        </p>
      )}

      <ThumbZone>
        {clear && route ? (
          <Button asChild className="driver-cta">
            <Link to={`/driver/trips/${route.tripId}`}>Back to trip</Link>
          </Button>
        ) : (
          <Button
            className="driver-cta"
            busy={sync.syncing}
            disabled={!online || clear}
            onClick={() => void sync.syncNow(true)}
          >
            Sync now
          </Button>
        )}
        {!clear && !online && (
          <p className="driver-thumb-note">No signal · sends as soon as it returns</p>
        )}
        {!clear && online && nextRetry !== undefined && !sync.syncing && (
          <p className="driver-thumb-note">Next try at {time(clockAt(nextRetry))}</p>
        )}
      </ThumbZone>
    </>
  );
}
