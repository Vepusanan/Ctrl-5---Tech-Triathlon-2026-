import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Skeleton, StatusBadge } from '../../components/waypoint';
import { initials } from '../store/shared';

// Tablet shell from Figma section B (L01–L07, 1180 × 820): a 68 px app bar, a page heading,
// cards on the canvas and a white action bar at the foot of the screen.

type LoaderIconName =
  | 'bell-button'
  | 'box'
  | 'check'
  | 'check-large'
  | 'chevron-right'
  | 'clock-inverse'
  | 'file'
  | 'info'
  | 'minus'
  | 'plus'
  | 'refresh'
  | 'truck'
  | 'truck-empty'
  | 'truck-large'
  | 'user'
  | 'wifi-off-danger';

export function LoaderIcon({ name, size }: { name: LoaderIconName; size: number }) {
  return (
    <img
      className="loader-icon"
      src={`/waypoint/loader/${name}.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}

/** An icon from the shared Waypoint export (public/waypoint), for glyphs both roles use. */
export function SharedIcon({ src, size }: { src: string; size: number }) {
  return (
    <img
      className="loader-icon"
      src={`/waypoint/${src}.svg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}

/** "Kasun Perera" → "Kasun P.", as the app bar shows the person on the shared tablet. */
export const shortName = (name: string) => {
  const [first = name, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last[0]}.` : first;
};

export function TabletAppBar({
  title,
  subtitle,
  planVersion,
  planPending = false,
  online,
  name,
  notices,
}: {
  title: string;
  subtitle: string;
  planVersion: number | null;
  /** The trips are still loading: the pill keeps its place so the bar does not move. */
  planPending?: boolean;
  online: boolean;
  name: string;
  notices: number;
}) {
  return (
    <header className="loader-appbar">
      <span className="loader-mark" aria-hidden="true">
        W
      </span>
      <div className="loader-appbar-title">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </div>
      <span className="loader-appbar-spacer" />
      <span
        className="loader-bell"
        role="img"
        aria-label={notices === 0 ? 'No notices need you' : `${notices} notices need you`}
      >
        <LoaderIcon name="bell-button" size={44} />
        {notices > 0 && <span className="loader-bell-count">{notices}</span>}
      </span>
      {planVersion !== null ? (
        <span className="loader-pill">
          <LoaderIcon name="file" size={14} />
          Plan v{planVersion}
        </span>
      ) : (
        planPending && (
          <span className="loader-pill" aria-hidden="true">
            <LoaderIcon name="file" size={14} />
            <Skeleton width={40} height={12} on="subtle" />
          </span>
        )
      )}
      <StatusBadge status={online ? 'online' : 'offline'} />
      <div className="loader-user">
        <span className="loader-avatar">{initials(name)}</span>
        <span className="loader-user-name">{shortName(name)}</span>
        <Link className="loader-switch" to="/loader/switch">
          <LoaderIcon name="user" size={18} />
          Switch user
        </Link>
      </div>
    </header>
  );
}

/** Page heading row: optional round back link, title, footnote and one status on the right. */
export function PageHead({
  back,
  backLabel = 'Back',
  title,
  detail,
  leading,
  status,
}: {
  back?: string;
  backLabel?: string;
  title: ReactNode;
  detail?: ReactNode;
  leading?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <div className="loader-head">
      {back && (
        <Link className="loader-round" to={back} aria-label={backLabel}>
          <img src="/waypoint/driver/back.svg" width={24} height={24} alt="" aria-hidden="true" />
        </Link>
      )}
      {leading}
      <div className="loader-head-text">
        <h1 tabIndex={-1}>{title}</h1>
        {detail && <p>{detail}</p>}
      </div>
      {status}
    </div>
  );
}

/** Round "Refresh" pill at the right of the L01 heading (Figma G02–G05). */
export function RefreshButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button type="button" className="loader-refresh" disabled={busy} onClick={onClick}>
      <LoaderIcon name="refresh" size={16} />
      {busy ? 'Refreshing…' : 'Refresh'}
    </button>
  );
}

/** The one card of an empty (G04) or failed (G05) screen: icon well, what happened, one action. */
export function StateCard({
  tone = 'neutral',
  icon,
  title,
  description,
  children,
}: {
  tone?: 'neutral' | 'danger';
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <section className="loader-card loader-state">
      <span className={`loader-state-well${tone === 'danger' ? ' loader-state-well--danger' : ''}`}>
        {icon}
      </span>
      <div role={tone === 'danger' ? 'alert' : undefined}>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}

/** White bar at the foot of the screen: what is blocking or done on the left, actions right. */
export function ActionBar({ status, children }: { status?: ReactNode; children?: ReactNode }) {
  return (
    <div className="loader-actionbar">
      <div className="loader-actionbar-status">{status}</div>
      <div className="loader-actionbar-actions">{children}</div>
    </div>
  );
}

/** Dark tile with a headline, a corner icon and a large value (L01 countdown, L04a, L06). */
export function DarkTile({
  title,
  icon,
  value,
  unit,
  detail,
}: {
  title: string;
  icon: ReactNode;
  value: ReactNode;
  unit?: string;
  detail?: ReactNode;
}) {
  return (
    <section className="loader-dark" aria-label={title}>
      <div className="loader-dark-head">
        <strong>{title}</strong>
        <span className="loader-dark-icon">{icon}</span>
      </div>
      <div>
        <p className="loader-dark-value">
          {value}
          {unit && <span>{unit}</span>}
        </p>
        {detail && <p className="loader-dark-detail">{detail}</p>}
      </div>
    </section>
  );
}

export function Seq({ value, tone = 'dark' }: { value: number; tone?: 'dark' | 'subtle' }) {
  return <span className={`loader-seq loader-seq--${tone}`}>{value}</span>;
}

/** Load progress as a ring (L02 header) using the data tokens. */
export function ProgressRing({
  value,
  total,
  label,
}: {
  value: number;
  total: number;
  label: string;
}) {
  const radius = 27;
  const circumference = 2 * Math.PI * radius;
  const share = total === 0 ? 0 : Math.min(1, value / total);
  return (
    <span className="loader-ring" role="img" aria-label={label}>
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
        <circle className="loader-ring-track" cx="32" cy="32" r={radius} />
        {share > 0 && (
          <circle
            className="loader-ring-fill"
            cx="32"
            cy="32"
            r={radius}
            strokeDasharray={`${share * circumference} ${circumference}`}
            transform="rotate(-90 32 32)"
          />
        )}
      </svg>
      <span>{value}</span>
    </span>
  );
}

export function Stepper({
  value,
  max,
  min = 0,
  label,
  disabled = false,
  showMax = true,
  large = false,
  onChange,
}: {
  value: number;
  max: number;
  min?: number;
  label: string;
  disabled?: boolean;
  showMax?: boolean;
  large?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <fieldset className={`loader-stepper${large ? ' loader-stepper--large' : ''}`}>
      <legend className="wp-sr-only">{label}</legend>
      <button
        type="button"
        aria-label="One less"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
      >
        <LoaderIcon name="minus" size={24} />
      </button>
      <output aria-live="polite">{showMax ? `${value} / ${max}` : value}</output>
      <button
        type="button"
        aria-label="One more"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <LoaderIcon name="plus" size={24} />
      </button>
    </fieldset>
  );
}
