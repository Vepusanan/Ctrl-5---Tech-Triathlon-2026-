import type { OrderStatus, StoreOrder, TemperatureRequirement } from '@waypoint/shared';
import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Icon, MaskIcon, Tag, type Tone } from '../../components/waypoint';
import { clock, shortDay } from '../../lib/format';
import { useMedia } from '../../lib/use-media';

// ── Dates and times (Asia/Colombo) ─────────────────────────────────────────────────────────
const zone = 'Asia/Colombo';
const asDate = (value: string | number) =>
  new Date(typeof value === 'string' && value.length === 10 ? `${value}T12:00:00+05:30` : value);
const longDay = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'long' });
const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: zone });
const hour = new Intl.DateTimeFormat('en-GB', {
  timeZone: zone,
  hour: '2-digit',
  hourCycle: 'h23',
});

export const day = (value: string | number | null | undefined) =>
  value ? shortDay(value) : 'Not scheduled';
export const time = (value: string | number | null | undefined) => (value ? clock(value) : '—');
/** "Monday" */
export const weekdayName = (value: string | number) => longDay.format(asDate(value));
/** "2026-09-26" in Colombo for a timestamp or epoch milliseconds. */
export const isoDate = (value: string | number) => isoDay.format(asDate(value));
/** Minutes after midnight in Colombo, for placing a time on a timeline. */
export function minutesOfDay(value: string | number) {
  const [hours = '0', minutes = '0'] = clock(value).split(':');
  return Number(hours) * 60 + Number(minutes);
}
/** Minutes after midnight for "05:30". */
export function minutesOf(value: string) {
  const [hours = '0', minutes = '0'] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}
export const addDays = (date: string, days: number) =>
  isoDate(Date.parse(`${date}T12:00:00+05:30`) + days * 86_400_000);

export function greeting(now: number) {
  const value = Number(hour.format(now));
  if (value < 12) return 'Good morning';
  if (value < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "4h 20m", "48 min", or "Locked" once the moment has passed. */
export function remaining(until: string | null | undefined, now: number) {
  if (!until) return '—';
  const ms = Date.parse(until) - now;
  if (ms <= 0) return 'Locked';
  const minutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  return hours === 0 ? `${minutes} min` : `${hours}h ${minutes % 60}m`;
}

export const tempName = (temp: TemperatureRequirement) => (temp === 'chilled' ? 'Chilled' : 'Dry');
export const tempIcon = (temp: TemperatureRequirement) => (temp === 'chilled' ? 'snow' : 'box');
export const tempsFor = (brand: string): TemperatureRequirement[] =>
  brand === 'Fresh' ? ['chilled', 'ambient'] : ['ambient'];
export const canEdit = (item: StoreOrder, now: number) =>
  item.editable && item.cutoffAt !== null && now < Date.parse(item.cutoffAt);
export const kg = (value: number) => `${Number(value.toFixed(1)).toLocaleString('en-GB')} kg`;
export const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Where an order opens: its notice, its receipt, or its tracking page. */
export function orderPath(item: StoreOrder) {
  const base = `/store/orders/${item.order.id}`;
  if (item.order.status === 'deferred') return `${base}/deferred`;
  if (item.order.status === 'delivered' || item.order.status === 'receipt_confirmed')
    return `${base}/receipt`;
  return base;
}

// ── Hooks ──────────────────────────────────────────────────────────────────────────────────

/** True at phone width, where the frames S01m–S07m apply. */
export const usePhone = () => useMedia('(max-width: 800px)');

/** The server's clock, ticking locally between refreshes. */
export function useServerNow(serverNow: string, updatedAt: number) {
  const [anchor, setAnchor] = useState(() => ({
    server: Date.parse(serverNow),
    local: performance.now(),
  }));
  const [now, setNow] = useState(anchor.server);
  // `updatedAt` re-anchors the clock on every refetch, even when the server time text repeats.
  // biome-ignore lint/correctness/useExhaustiveDependencies: updatedAt is the refetch signal
  useEffect(() => {
    const next = { server: Date.parse(serverNow), local: performance.now() };
    setAnchor(next);
    setNow(next.server);
  }, [serverNow, updatedAt]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(anchor.server + performance.now() - anchor.local),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [anchor]);
  return now;
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

// ── Small pieces ───────────────────────────────────────────────────────────────────────────

/** Icons that `public/waypoint/icons` does not have yet, from the Store frames. */
const localIcons: Record<string, string> = {
  user: '/waypoint/store/2178-26528-imgIconUser.svg',
};
export function StoreIcon({ name, size = 16 }: { name: string; size?: number }) {
  const local = localIcons[name];
  return local ? <MaskIcon src={local} size={size} /> : <Icon name={name} size={size} />;
}

/** Status chip: always a symbol and a label, never colour alone. */
export function Pill({ tone, icon, children }: { tone: Tone; icon: string; children: ReactNode }) {
  return (
    <Badge tone={tone} icon={<StoreIcon name={icon} size={12} />}>
      {children}
    </Badge>
  );
}

const orderStatus: Record<OrderStatus, [label: string, tone: Tone, icon: string]> = {
  draft: ['Draft', 'neutral', 'pen'],
  submitted: ['Submitted', 'info', 'arrow'],
  confirmed: ['Confirmed', 'info', 'check'],
  allocated: ['Scheduled', 'info', 'route'],
  deferred: ['Deferred', 'warning', 'skip'],
  loading: ['Loading', 'info', 'pkg'],
  dispatched: ['On the way', 'info', 'truck'],
  delivered: ['Awaiting receipt', 'success', 'cc'],
  failed: ['Not delivered', 'danger', 'xoct'],
  receipt_confirmed: ['Receipt confirmed', 'success', 'cc'],
  cancelled: ['Cancelled', 'neutral', 'slash'],
};
export function OrderPill({ status, label }: { status: OrderStatus; label?: string }) {
  const [text, tone, icon] = orderStatus[status];
  return (
    <Pill tone={tone} icon={icon}>
      {label ?? text}
    </Pill>
  );
}
export const orderStatusLabel = (status: OrderStatus) => orderStatus[status][0];

export function TempTag({ temp }: { temp: TemperatureRequirement }) {
  return <Tag kind={temp === 'chilled' ? 'chilled' : 'ambient'} />;
}

type WellTone = 'neutral' | 'success' | 'warning' | 'info' | 'chilled' | 'danger' | 'inverse';
/** Round icon well. Sizes follow the frames: 36 in dark cards, 44 in lists, 48–52 as a lead. */
export function Well({
  icon,
  tone = 'neutral',
  size = 44,
}: {
  icon: string;
  tone?: WellTone;
  size?: 32 | 36 | 40 | 44 | 48 | 52;
}) {
  return (
    <span className="st-well" data-tone={tone} style={{ width: size, height: size }}>
      <StoreIcon name={icon} size={size >= 44 ? 20 : 16} />
    </span>
  );
}

/**
 * Page title block. The desktop frames show a title, a line under it and the actions on the
 * right. The phone frames show a small line above a large title, with an optional back button
 * and one icon action; the page's buttons move to the `ThumbZone`.
 */
export function PageHead({
  title,
  sub,
  phoneTitle,
  eyebrow,
  back,
  phoneAction,
  children,
}: {
  title: string;
  sub?: ReactNode;
  phoneTitle?: string;
  eyebrow?: ReactNode;
  back?: string | undefined;
  phoneAction?: ReactNode;
  children?: ReactNode;
}) {
  const phone = usePhone();
  if (phone) {
    return (
      <header className="st-phone-head" data-back={back ? true : undefined}>
        {back && (
          <Link className="st-back" to={back} aria-label="Back">
            <Icon name="cr" size={20} />
          </Link>
        )}
        <div>
          {(eyebrow ?? sub) && <p>{eyebrow ?? sub}</p>}
          <h1 tabIndex={-1}>{phoneTitle ?? title}</h1>
        </div>
        {phoneAction}
      </header>
    );
  }
  return (
    <header className="st-head">
      <div>
        <h1 tabIndex={-1}>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="st-head-actions">{children}</div>}
    </header>
  );
}

/** Card heading row: 16px icon, title, and whatever sits on the right. */
export function CardHead({
  icon,
  title,
  note,
  children,
}: {
  icon?: string;
  title: string;
  note?: string;
  children?: ReactNode;
}) {
  return (
    <div className="st-card-head">
      <h2>
        {icon && <StoreIcon name={icon} />}
        {title}
        {note && <small>{note}</small>}
      </h2>
      {children}
    </div>
  );
}

/** Quantity control: minus, the number, plus. 40px on desktop rows, 44–48px on the phone. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  size = 40,
  disabled = false,
  flag = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  size?: 36 | 40 | 44 | 48;
  disabled?: boolean;
  /** Draws the number in the warning colour (a count that differs). */
  flag?: boolean;
}) {
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  return (
    <div className="st-stepper" data-size={size} data-flag={flag || undefined}>
      <button
        type="button"
        aria-label={`Fewer: ${label}`}
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        <Icon name="minus" size={size >= 44 ? 18 : 16} />
      </button>
      <input
        inputMode="numeric"
        aria-label={label}
        value={String(value)}
        disabled={disabled}
        onChange={(event) => {
          const next = Number(event.target.value.replace(/\D/g, ''));
          onChange(clamp(Number.isFinite(next) ? next : min));
        }}
      />
      <button
        type="button"
        aria-label={`More: ${label}`}
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        <Icon name="plus" size={size >= 44 ? 18 : 16} />
      </button>
    </div>
  );
}

/** A row with an icon well, two lines of text and an optional chevron or status on the right. */
export function ListRow({
  icon,
  tone,
  size = 44,
  title,
  sub,
  to,
  href,
  end,
}: {
  icon?: string;
  tone?: WellTone;
  size?: 36 | 44;
  title: ReactNode;
  sub?: ReactNode;
  to?: string | undefined;
  href?: string | undefined;
  end?: ReactNode;
}) {
  const body = (
    <>
      {icon && <Well icon={icon} size={size} {...(tone ? { tone } : {})} />}
      <span className="st-row-text">
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
      </span>
      {end}
      {(to ?? href) && <Icon name="cr" size={16} className="st-row-chevron" />}
    </>
  );
  if (to) {
    return (
      <Link className="st-row" to={to}>
        {body}
      </Link>
    );
  }
  if (href) {
    return (
      <a className="st-row" href={href}>
        {body}
      </a>
    );
  }
  return <div className="st-row">{body}</div>;
}

/** Summary row in the sunken style: icon, name, a quiet count and a strong value. */
export function TempRow({
  temp,
  lines,
  value,
}: {
  temp: TemperatureRequirement;
  lines: string;
  value: string;
}) {
  return (
    <div className="st-temp-row">
      <StoreIcon name={tempIcon(temp)} size={18} />
      <span>{tempName(temp)}</span>
      <small>{lines}</small>
      <strong>{value}</strong>
    </div>
  );
}

/** Phone only: the page's main button, fixed above the tab bar where the thumb rests. */
export function ThumbZone({ children }: { children: ReactNode }) {
  return usePhone() ? <div className="st-thumb">{children}</div> : null;
}

/** A coloured strip with one icon and one line: a warning, a note, or a planned fix. */
export function Strip({
  tone,
  icon,
  children,
  end,
}: {
  tone: 'warning' | 'recommend' | 'danger' | 'success';
  icon: string;
  children: ReactNode;
  end?: ReactNode;
}) {
  return (
    <div className="st-strip" data-tone={tone} role={tone === 'danger' ? 'alert' : undefined}>
      <StoreIcon name={icon} />
      <div>{children}</div>
      {end}
    </div>
  );
}
