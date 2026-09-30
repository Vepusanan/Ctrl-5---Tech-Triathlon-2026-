import { createHash } from 'node:crypto';

// Name-based ids so a reset inserts the same primary keys. Version nibble is 5.
export function seedUuid(key: string): string {
  const hash = createHash('sha256').update(`waypoint-seed:${key}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  const sixth = bytes[6] ?? 0;
  const eighth = bytes[8] ?? 0;
  bytes[6] = (sixth & 0x0f) | 0x50;
  bytes[8] = (eighth & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function colombo(date: string, time: string): Date {
  return new Date(`${date}T${time}+05:30`);
}

export function previousCalendarDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map((part) => Number(part));
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Expected an ISO date, received ${isoDate}`);
  }
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}
