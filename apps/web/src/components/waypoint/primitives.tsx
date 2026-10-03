import type { CSSProperties, ReactNode } from 'react';

/** Single-colour Figma icon tinted with the current text colour. Geometry comes from the SVG. */
export function MaskIcon({
  src,
  size = 18,
  className = '',
}: {
  src: string;
  size?: number;
  className?: string | undefined;
}) {
  return (
    <span
      className={`wp-mask-icon ${className}`}
      aria-hidden="true"
      style={{ '--wp-icon': `url("${src}")`, width: size, height: size } as CSSProperties}
    />
  );
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

/** "Nirosha Fernando" becomes "Nirosha F." as in the sidebar user card. */
export function shortName(name: string) {
  const [first = '', ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

export function Avatar({ name, size = 40 }: { name: string; size?: 28 | 32 | 40 }) {
  return (
    <span className="wp-avatar" style={{ width: size, height: size }} title={name}>
      {initials(name)}
    </span>
  );
}

/**
 * Signed change pill. Good is green with dark ink; bad is soft red. A fall is bad unless `bad`
 * says otherwise, as for a cost, where a rise is the bad direction.
 */
export function DeltaBadge({
  value,
  unit = '',
  bad = value < 0,
}: {
  value: number;
  unit?: string;
  bad?: boolean;
}) {
  return (
    <span className="wp-delta" data-negative={bad || undefined}>
      {value > 0 ? '+' : value < 0 ? '−' : ''}
      {Math.abs(value)}
      {unit}
    </span>
  );
}

export function SegmentedControl<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <fieldset className="wp-segmented">
      <legend className="wp-sr-only">{label}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

/** Sunken pill select that sits top-right of the card it controls. */
export function Dropdown<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value) => void;
}) {
  return (
    <label className="wp-dropdown">
      <span className="wp-sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as Value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <img src="/waypoint/shell/2008-285-imgIconCd.svg" alt="" />
    </label>
  );
}

/** Thin progress bar. `tone` colours the fill; the value is clamped to 0–100 for drawing. */
export function ProgressBar({
  label,
  value,
  tone = 'neutral',
  marker,
  size = 6,
  track = 'subtle',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger' | 'accent';
  marker?: number | undefined;
  size?: 6 | 8;
  track?: 'subtle' | 'muted' | 'inverse';
}) {
  const clamp = (input: number) => Math.max(0, Math.min(100, Number.isFinite(input) ? input : 0));
  return (
    <span className="wp-progress" data-tone={tone} data-track={track} style={{ height: size }}>
      <progress className="wp-sr-only" aria-label={label} value={clamp(value)} max={100} />
      <span className="wp-progress-fill" aria-hidden="true" style={{ width: `${clamp(value)}%` }} />
      {marker !== undefined && <i aria-hidden="true" style={{ left: `${clamp(marker)}%` }} />}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  inShell,
  children,
}: {
  title: string;
  description?: string | undefined;
  /** The shell's top bar already shows this title on tablet and phone, so it is hidden there. */
  inShell?: boolean | undefined;
  children?: ReactNode;
}) {
  return (
    <header className="wp-page-header" data-in-shell={inShell || undefined}>
      <div>
        <h1 tabIndex={-1}>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="wp-page-actions">{children}</div>}
    </header>
  );
}

/**
 * Ring chart: one value against a total, drawn clockwise from the top.
 * Decorative by default; the caller's `children` (the centre text) carry the meaning.
 */
export function Ring({
  size,
  stroke,
  percent,
  segments,
  children,
}: {
  size: number;
  stroke: number;
  /** A single accent arc. Use `segments` for more than one. */
  percent?: number;
  /** Arcs drawn one after another, clockwise from the top. */
  segments?: readonly { percent: number; tone: 'accent' | 'positive' | 'warning' | 'danger' }[];
  children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const clamp = (input: number) => Math.max(0, Math.min(100, Number.isFinite(input) ? input : 0));
  const arcs = segments ?? [{ percent: percent ?? 0, tone: 'accent' as const }];
  let start = 0;
  return (
    <span className="wp-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        {arcs.map((arc) => {
          const offset = start;
          start += clamp(arc.percent);
          return (
            <circle
              key={`${arc.tone}-${offset}`}
              data-tone={arc.tone}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={stroke}
              pathLength={100}
              strokeDasharray={`${clamp(arc.percent)} 100`}
              strokeDashoffset={-offset}
            />
          );
        })}
      </svg>
      {children && <span className="wp-ring-center">{children}</span>}
    </span>
  );
}

/** In-context banner. Title says what happened; the body gives the consequence and next step. */
export function Banner({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const icon = { info: 'info', warning: 'alert', danger: 'xoct', success: 'cc' }[tone];
  return (
    <div className={`wp-banner tone-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <MaskIcon src={`/waypoint/icons/${icon}.svg`} size={16} className="wp-banner-icon" />
      <div>
        <strong>{title}</strong>
        {children && <p>{children}</p>}
      </div>
      {action}
    </div>
  );
}
