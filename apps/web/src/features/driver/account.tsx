import { SignOut } from '../auth/role-gate';
import { initials } from '../store/shared';
import { DriverHeader, DriverIcon, Strip } from './shell';
import { driverSession, useDriver } from './workspace';

// DR08, reduced to what the session knows: who is signed in, on which vehicle, and sign out.
// Signing out forgets this phone's session, so it waits until nothing is left to sync.
export function DriverAccount() {
  const { user, online, sync } = useDriver();
  const waiting = sync.pending > 0;
  return (
    <>
      <DriverHeader eyebrow="Driver" title="Account" large />
      <section className="driver-card driver-profile" aria-label="Profile">
        <span className="driver-avatar driver-avatar--large">{initials(user.name)}</span>
        <div className="driver-row-text">
          <strong>{user.name}</strong>
          <span>Driver · {user.vehicleId}</span>
        </div>
      </section>
      {(waiting || !online) && (
        <Strip tone="warning" icon={<DriverIcon name="info-warning" size={16} />}>
          {waiting
            ? `Sign out is available once ${sync.pending === 1 ? 'the event' : `all ${sync.pending} events`} on this phone ${sync.pending === 1 ? 'has' : 'have'} synced.`
            : 'Reconnect to sign out.'}
        </Strip>
      )}
      <section className="driver-card driver-signout" aria-label="Session">
        <SignOut disabled={waiting || !online} offlineSession={driverSession} />
      </section>
    </>
  );
}
