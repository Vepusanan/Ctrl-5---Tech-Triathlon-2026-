import { Button, StatusBadge } from '../../components/waypoint';
import { time } from '../store/shared';
import type { OutboxEntry } from './offline/types';
import { DriverHeader, DriverIcon, ListRow, Strip, syncTime, ThumbZone } from './shell';
import { eventLabel } from './stop';
import { useDriver } from './workspace';

const chip: Record<
  OutboxEntry['status'],
  { status: 'pending' | 'syncing' | 'synced' | 'conflict'; label: string }
> = {
  local: { status: 'pending', label: 'On phone' },
  queued: { status: 'pending', label: 'Queued' },
  syncing: { status: 'syncing', label: 'Syncing' },
  synced: { status: 'synced', label: 'Synced' },
  conflict: { status: 'conflict', label: 'Conflict' },
};

function entryDetail(entry: OutboxEntry, clockAt: (deviceMs: number) => string): string {
  const parts = [time(entry.clientTime), `ID ${entry.clientEventId.slice(0, 8)}`];
  if (entry.status === 'synced' && entry.result === 'duplicate')
    parts.push('already on the server');
  if (entry.status === 'conflict') parts.push(entry.detail ?? 'refused by the server');
  if (entry.status === 'queued' && entry.attempts > 0) {
    parts.push(
      `retry ${entry.attempts}${entry.nextAttemptAt > Date.now() ? ` at ${time(clockAt(entry.nextAttemptAt))}` : ''}`,
    );
  }
  return parts.join(' · ');
}

// DR05 + DR05b. What is still on this phone, what reached the server, and what it refused.
export function DriverSync() {
  const { online, sync, clockAt } = useDriver();
  const newest = [...sync.entries].reverse();
  const clear = sync.pending === 0;
  return (
    <>
      <DriverHeader eyebrow="This phone" title="Sync" large />

      <section className="driver-card driver-sync-summary" aria-label="Sync status">
        <span className={`driver-sync-ring${clear ? ' driver-sync-ring--clear' : ''}`}>
          <strong className="driver-hero-number">{sync.pending}</strong>
        </span>
        <div className="driver-row-text">
          <strong>{clear ? 'All synced' : 'Waiting to sync'}</strong>
          <span>
            {online ? 'Online' : 'Offline'} ·{' '}
            {syncTime(sync.lastSyncAt === null ? null : clockAt(sync.lastSyncAt))}
          </span>
        </div>
      </section>

      {sync.conflicts > 0 && (
        <div className="driver-banner driver-banner--danger" role="alert">
          <strong>
            {sync.conflicts} {sync.conflicts === 1 ? 'event' : 'events'} not accepted
          </strong>
          <p>The server refused these. They stay here until the dispatcher resolves them.</p>
        </div>
      )}

      {newest.length > 0 ? (
        <section className="driver-card driver-list-card" aria-label="Events on this phone">
          {newest.map((entry) => {
            const badge = chip[entry.status];
            return (
              <ListRow
                key={entry.clientEventId}
                icon={
                  <DriverIcon
                    name={
                      entry.status === 'synced'
                        ? 'check-success'
                        : entry.status === 'conflict'
                          ? 'x'
                          : 'clock'
                    }
                    size={20}
                  />
                }
                tone={
                  entry.status === 'synced'
                    ? 'success'
                    : entry.status === 'conflict'
                      ? 'danger'
                      : 'warning'
                }
                title={`${eventLabel[entry.type]} · ${entry.outletId}`}
                detail={entryDetail(entry, clockAt)}
                trailing={<StatusBadge status={badge.status} label={badge.label} />}
              />
            );
          })}
        </section>
      ) : (
        <Strip tone="neutral" icon={<DriverIcon name="info" size={16} />}>
          Nothing recorded on this phone yet.
        </Strip>
      )}

      <Strip tone="info" icon={<DriverIcon name="info-info" size={16} />}>
        Each event has an ID, so a retry never delivers twice.
      </Strip>

      <ThumbZone>
        <Button
          className="driver-cta"
          busy={sync.syncing}
          disabled={!online || clear}
          onClick={() => void sync.syncNow(true)}
        >
          Sync now
        </Button>
      </ThumbZone>
    </>
  );
}
