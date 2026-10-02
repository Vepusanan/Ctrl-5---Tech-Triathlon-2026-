import { SignOut } from '../auth/role-gate';
import { initials } from '../store/shared';
import { DriverHeader } from './shell';
import { useDriver } from './workspace';

// DR08, reduced to what the session knows: who is signed in, on which vehicle, and sign out.
export function DriverAccount() {
  const { user } = useDriver();
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
      <section className="driver-card driver-signout" aria-label="Session">
        <SignOut />
      </section>
    </>
  );
}
