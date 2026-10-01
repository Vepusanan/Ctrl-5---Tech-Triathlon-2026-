// SYSTEM_DESIGN A3 / §8.6. ETA is the planned arrival shifted by recorded stop events.
// The shift is the latest earlier arrival's client time minus that stop's planned arrival.
// No GPS, and a stop's own arrival does not replace its planned time.

export interface EtaStop {
  id: string;
  seq: number;
  plannedArrival: Date;
}

export interface ArrivalFact {
  stopId: string;
  clientTime: Date;
}

const WINDOW_CLOSE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?/;

export function shiftedEta(
  stops: readonly EtaStop[],
  arrivals: readonly ArrivalFact[],
  stopId: string,
): Date | null {
  const ordered = [...stops].sort(
    (left, right) => left.seq - right.seq || left.id.localeCompare(right.id),
  );
  const target = ordered.find((stop) => stop.id === stopId);
  if (target === undefined) return null;

  const earliest = new Map<string, number>();
  for (const arrival of arrivals) {
    const at = arrival.clientTime.getTime();
    const current = earliest.get(arrival.stopId);
    if (current === undefined || at < current) earliest.set(arrival.stopId, at);
  }

  let shiftMs = 0;
  for (const stop of ordered) {
    if (stop.seq >= target.seq) break;
    const arrivedAt = earliest.get(stop.id);
    if (arrivedAt !== undefined) shiftMs = arrivedAt - stop.plannedArrival.getTime();
  }
  return new Date(target.plannedArrival.getTime() + shiftMs);
}

/** Late when the client arrival is after the service date's window close. Equality is on time. */
export function isArrivalLate(clientTime: Date, serviceDate: string, windowClose: string): boolean {
  const close = windowCloseInstant(serviceDate, windowClose);
  if (close === null) throw new Error(`Invalid window close: ${windowClose}`);
  return clientTime.getTime() > close.getTime();
}

export function formatWindowClose(windowClose: string): string {
  const parts = windowParts(windowClose);
  if (parts === null) throw new Error(`Invalid window close: ${windowClose}`);
  return `${parts.hour}:${parts.minute}`;
}

function windowCloseInstant(serviceDate: string, windowClose: string): Date | null {
  const parts = windowParts(windowClose);
  if (parts === null) return null;
  const instant = new Date(`${serviceDate}T${parts.hour}:${parts.minute}:${parts.second}+05:30`);
  if (Number.isNaN(instant.getTime())) return null;
  return instant;
}

function windowParts(windowClose: string): { hour: string; minute: string; second: string } | null {
  const match = WINDOW_CLOSE.exec(windowClose.trim());
  if (match === null) return null;
  const hour = match[1];
  const minute = match[2];
  if (hour === undefined || minute === undefined) return null;
  return { hour, minute, second: match[3] ?? '00' };
}
