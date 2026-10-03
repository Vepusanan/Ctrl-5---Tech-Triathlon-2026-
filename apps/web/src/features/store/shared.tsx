import type { ReasonCode } from '@waypoint/shared';
import { useEffect, useState } from 'react';

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

export const orderName = (id: string) => `ORD-${id.slice(0, 8).toUpperCase()}`;

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

export function initials(name: string) {
  return name
    .split(' ')
    .map((word) => word[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
