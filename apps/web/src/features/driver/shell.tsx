import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { time } from '../store/shared';

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

export type GlyphName =
  | 'arrow'
  | 'bell'
  | 'boxc'
  | 'check'
  | 'cloud'
  | 'cr'
  | 'eye'
  | 'info'
  | 'logout'
  | 'pen'
  | 'phone'
  | 'pin'
  | 'refresh'
  | 'route'
  | 'shield'
  | 'slash'
  | 'user'
  | 'wifi'
  | 'x'
  | 'xoct';

/** A Figma icon from public/waypoint/icons, drawn in the current text colour. */
export function Glyph({ name, size = 16 }: { name: GlyphName; size?: number }) {
  return (
    <span
      className="driver-glyph"
      aria-hidden="true"
      style={
        {
          '--driver-glyph': `url("/waypoint/icons/${name}.svg")`,
          width: size,
          height: size,
        } as CSSProperties
      }
    />
  );
}

/** Figma "Status" chip in the tones the driver screens use, with a tinted icon. */
export function Chip({
  tone,
  icon,
  children,
}: {
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  icon: GlyphName;
  children: ReactNode;
}) {
  return (
    <span className={`driver-chip driver-chip--${tone}`}>
      <Glyph name={icon} size={12} />
      {children}
    </span>
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
        {eyebrow !== null && <p className="driver-footnote">{eyebrow}</p>}
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

const pendingLabel = (pending: number) =>
  pending === 0 ? 'nothing waiting' : `${pending} waiting to sync`;

/**
 * Offline bar from the shell components (`2035:565`): the saved route version, the last sync and
 * the pending count. Tapping it opens the Sync center.
 */
export function OfflineBar({
  pending,
  lastSyncAt,
  routeVersion,
}: {
  pending: number;
  lastSyncAt: string | null;
  routeVersion: number | null;
}) {
  return (
    <Link className="driver-offline" to="/driver/sync" role="status">
      <DriverIcon name="wifi-off" size={20} />
      <span className="driver-offline-text">
        <strong>
          Offline · {routeVersion === null ? 'saved on this phone' : `saved route v${routeVersion}`}
        </strong>
        <small>
          {lastSyncAt === null ? 'Not synced yet on this phone' : `Last sync ${time(lastSyncAt)}`}
        </small>
      </span>
      <span className="driver-offline-count">{pending} pending</span>
    </Link>
  );
}

/** Back online with events still on the phone; they go automatically, oldest first. */
export function SyncingBar({ pending, conflicts }: { pending: number; conflicts: number }) {
  return (
    <Link className="driver-syncing" to="/driver/sync" role="status">
      <DriverIcon name={conflicts > 0 ? 'info-warning' : 'clock'} size={16} />
      <span>
        {pending > 0 ? `Online · ${pendingLabel(pending)}` : 'Online'}
        {conflicts > 0 ? ` · ${conflicts} not accepted` : ''}
      </span>
    </Link>
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

export function DriverTabBar({ pathname, pending }: { pathname: string; pending: number }) {
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
            {tab.to === '/driver/sync' && pending > 0 && (
              <span className="driver-tab-count">
                {pending}
                <span className="wp-sr-only"> waiting to sync</span>
              </span>
            )}
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
