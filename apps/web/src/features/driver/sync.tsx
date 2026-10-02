import { DriverHeader, DriverIcon, ListRow } from './shell';
import { useDriver } from './workspace';

// Sync tab. Every action is sent when it is recorded, so nothing waits on the phone yet; the
// queue and Sync center (DR05, DR05b) arrive with offline mode.
export function DriverSync() {
  const { online } = useDriver();
  return (
    <>
      <DriverHeader eyebrow="This phone" title="Sync" large />
      <section className="driver-card driver-list-card" aria-label="Connection">
        <ListRow
          icon={<DriverIcon name={online ? 'check-success' : 'slash'} size={20} />}
          tone={online ? 'success' : 'danger'}
          title={online ? 'Connected' : 'Offline'}
          detail={
            online
              ? 'Each action is sent when you record it. Nothing is waiting on this phone.'
              : 'Reconnect to start trips and record stops.'
          }
        />
      </section>
    </>
  );
}
