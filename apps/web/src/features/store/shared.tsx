import type { OrderStatus, ReasonCode, StoreOrder, TemperatureRequirement } from '@waypoint/shared';
import { type ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, HeroMetric, type Status } from '../../components/waypoint';

export function StoreIcon({ name, source }: { name: string; source: string }) {
  return <img className="wp-icon" src={`/waypoint/store/${source}-imgIcon${name}.svg`} alt="" />;
}

const colombo = 'Asia/Colombo';

export const day = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: colombo,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(new Date(value.length === 10 ? `${value}T12:00:00+05:30` : value))
    : 'Not scheduled';

export const time = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: colombo,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(value))
    : '—';

export const clockLabel = (now: number) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: colombo,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);

function colomboHour(now: number) {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: colombo,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
}

export function greeting(now: number) {
  const hour = colomboHour(now);
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export const orderName = (id: string) => `ORD-${id.slice(0, 8).toUpperCase()}`;
export const tempName = (temp: string) => (temp === 'chilled' ? 'Chilled' : 'Dry');
export const tempsFor = (brand: string): TemperatureRequirement[] =>
  brand === 'Fresh' ? ['chilled', 'ambient'] : ['ambient'];

export const statusForOrder: Record<OrderStatus, Status> = {
  draft: 'draft',
  submitted: 'submitted',
  confirmed: 'confirmed',
  allocated: 'allocated',
  deferred: 'deferred',
  loading: 'loading',
  dispatched: 'departed',
  delivered: 'delivered',
  failed: 'failed',
  receipt_confirmed: 'receipt-confirmed',
  cancelled: 'cancelled',
};

export const reasonText: Record<ReasonCode, string> = {
  MIXED_BRAND_DISTRICT: 'A compatible route for this brand and district is not available.',
  REEFER_REQUIRED: 'A refrigerated vehicle is required for this chilled order.',
  VAN_REQUIRED: 'This outlet requires a van for access.',
  WRONG_DEPOT: 'The available vehicle is assigned to a different depot.',
  VEHICLE_UNAVAILABLE: 'The required vehicle is unavailable.',
  WEIGHT_CAP: 'There is not enough remaining vehicle weight capacity.',
  VOLUME_CAP: 'There is not enough remaining vehicle space.',
  TRIP_LIMIT: 'The vehicle has reached its daily trip limit.',
  FRESH_TIME_BUDGET: 'The route cannot be completed within the Fresh delivery time budget.',
  DAY_TIME_BUDGET: 'The route exceeds the daily operating time budget.',
  WINDOW_MISSED: 'The delivery cannot reach your outlet within its delivery window.',
  FUEL_QUOTA: 'The trip exceeds the vehicle’s remaining fuel quota.',
};

export function useServerNow(serverNow: string, updatedAt: number) {
  const [anchor, setAnchor] = useState(() => ({
    server: Date.parse(serverNow),
    local: performance.now(),
    stamp: updatedAt,
  }));
  const [now, setNow] = useState(anchor.server);
  useEffect(() => {
    const next = { server: Date.parse(serverNow), local: performance.now(), stamp: updatedAt };
    setAnchor(next);
    setNow(next.server);
  }, [serverNow, updatedAt]);
  useEffect(() => {
    const tick = () => setNow(anchor.server + performance.now() - anchor.local);
    const timer = window.setInterval(tick, 1000);
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

function remaining(cutoff: string | null, now: number) {
  if (!cutoff) return '—';
  const ms = Date.parse(cutoff) - now;
  if (ms <= 0) return 'Locked';
  const minutes = Math.ceil(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  return `${hours}h ${mins}m`;
}

export const cutoffClosed = (cutoff: string | null, now: number) =>
  !cutoff || now >= Date.parse(cutoff);

export const canEdit = (item: StoreOrder, now: number) =>
  item.editable && item.cutoffAt !== null && now < Date.parse(item.cutoffAt);

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="store-page-header">
      <div>
        <h1 tabIndex={-1}>{title}</h1>
        {description && <p className="wp-muted">{description}</p>}
      </div>
      <div className="wp-inline">{children}</div>
    </div>
  );
}

export function StoreLink({
  to,
  children,
  secondary = false,
}: {
  to: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Button asChild variant={secondary ? 'secondary' : 'primary'}>
      <Link to={to}>{children}</Link>
    </Button>
  );
}

export function CutoffCard({
  cutoff,
  now,
  nextDate,
}: {
  cutoff: string | null;
  now: number;
  nextDate?: string | null;
}) {
  const closed = cutoffClosed(cutoff, now);
  return (
    <HeroMetric
      label="Order cutoff"
      value={remaining(cutoff, now)}
      icon={<StoreIcon source="2047-5268" name="Clock" />}
      description={
        !cutoff
          ? 'No upcoming operating day is open for a new order.'
          : closed
            ? `This run is locked.${nextDate ? ` New orders are for ${day(nextDate)}.` : ' Choose the next available run.'}`
            : `Closes ${time(cutoff)}. Later orders go to the next operating day.`
      }
    />
  );
}

export function initials(name: string) {
  return name
    .split(' ')
    .map((word) => word[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function includesSunday(from: string, to: string) {
  const start = Date.parse(`${from}T12:00:00+05:30`);
  const end = Date.parse(`${to}T12:00:00+05:30`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  for (let cursor = start + 86_400_000; cursor < end; cursor += 86_400_000) {
    const weekday = new Intl.DateTimeFormat('en-GB', {
      timeZone: colombo,
      weekday: 'short',
    }).format(cursor);
    if (weekday === 'Sun') return true;
  }
  return false;
}
