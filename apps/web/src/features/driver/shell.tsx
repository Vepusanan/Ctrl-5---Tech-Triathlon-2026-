import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

// Phone shell from Figma section C (DR01–DR08): an in-page nav bar, one primary action in the
// thumb zone and a four-tab bar. Icons are the Figma exports in public/waypoint/driver.

export type DriverIconName =
  | 'back'
  | 'cal'
  | 'check'
  | 'check-success'
  | 'chevron-right'
  | 'clock'
  | 'clock-large'
  | 'info'
  | 'info-info'
  | 'info-warning'
  | 'lock-inverse'
  | 'minus'
  | 'minus-danger'
  | 'more'
  | 'nav'
  | 'plus'
  | 'slash'
  | 'tab-account'
  | 'tab-account-active'
  | 'tab-notices'
  | 'tab-notices-active'
  | 'tab-sync'
  | 'tab-sync-active'
  | 'tab-trip'
  | 'tab-trip-active'
  | 'user'
  | 'wifi-off'
  | 'x'
  | 'xoct';

const iconUrl = (name: DriverIconName) => `/waypoint/driver/${name}.svg`;

export const OFFLINE_ICON = iconUrl('wifi-off');

export function DriverIcon({ name, size }: { name: DriverIconName; size: number }) {
  return (
    <img
      className="driver-icon"
      src={iconUrl(name)}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}

/** The Figma nav bar: optional round back button, a footnote above the title, one trailing slot. */
export function DriverHeader({
  back,
  backLabel = 'Back',
  eyebrow,
  title,
  large = false,
  trailing,
}: {
  back?: string;
  backLabel?: string;
  eyebrow: ReactNode;
  title: ReactNode;
  large?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <header className="driver-nav">
      {back && (
        <Link className="driver-round" to={back} aria-label={backLabel}>
          <DriverIcon name="back" size={20} />
        </Link>
      )}
      <div className="driver-nav-text">
        <p className="driver-footnote">{eyebrow}</p>
        <h1 tabIndex={-1} className={large ? 'driver-large-title' : 'driver-title'}>
          {title}
        </h1>
      </div>
      {trailing}
    </header>
  );
}

/** Stays above the tab bar (or the screen edge on stop screens) so the action is always reachable. */
export function ThumbZone({ children }: { children: ReactNode }) {
  return <div className="driver-thumb">{children}</div>;
}

/** Offline bar from the shell components. Recording still needs a connection until Phase 4. */
export function OfflineBar() {
  return (
    <div className="driver-offline" role="status">
      <DriverIcon name="wifi-off" size={20} />
      <div>
        <p>Offline</p>
        <small>Reconnect to start trips and record stops.</small>
      </div>
    </div>
  );
}

const tabs = [
  { to: '/driver', label: 'Trip', icon: 'tab-trip' },
  { to: '/driver/sync', label: 'Sync', icon: 'tab-sync' },
  { to: '/driver/notices', label: 'Notices', icon: 'tab-notices' },
  { to: '/driver/account', label: 'Account', icon: 'tab-account' },
] as const;

// Trip stays active across its trip and stop screens; the other tabs own their own paths.
function tripActive(pathname: string) {
  return !['/driver/sync', '/driver/notices', '/driver/account'].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export function DriverTabBar({ pathname }: { pathname: string }) {
  return (
    <nav className="driver-tabs" aria-label="Driver">
      {tabs.map((tab) => {
        const active =
          tab.to === '/driver'
            ? tripActive(pathname)
            : pathname === tab.to || pathname.startsWith(`${tab.to}/`);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={`driver-tab${active ? ' driver-tab--active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <DriverIcon name={active ? `${tab.icon}-active` : tab.icon} size={24} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Black hero tile used for the arrival window (DR03) and the route version (DR06). */
export function InverseCard({ children }: { children: ReactNode }) {
  return <section className="driver-card driver-card--inverse">{children}</section>;
}

/** One row of an icon list (Figma "list row"): icon well, title, footnote, optional trailing. */
export function ListRow({
  icon,
  tone,
  title,
  detail,
  trailing,
}: {
  icon: ReactNode;
  tone?: 'warning' | 'success' | 'danger' | 'surface';
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="driver-row">
      <span className={`driver-well${tone ? ` driver-well--${tone}` : ''}`}>{icon}</span>
      <div className="driver-row-text">
        <strong>{title}</strong>
        {detail && <span>{detail}</span>}
      </div>
      {trailing}
    </div>
  );
}

/** Small full-width strip inside a card (Figma "row" with a tinted fill). */
export function Strip({
  tone,
  icon,
  children,
}: {
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <p className={`driver-strip driver-strip--${tone}`}>
      {icon}
      <span>{children}</span>
    </p>
  );
}
