/** Shared Asia/Colombo formatters in the Figma style ("Fri 25 Sep", "16:00"). */
const zone = 'Asia/Colombo';

const dayParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: zone,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const clockParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: zone,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const toDate = (value: string | number) =>
  new Date(typeof value === 'string' && value.length === 10 ? `${value}T12:00:00+05:30` : value);

/** "Fri 25 Sep" for an ISO date, an API timestamp or epoch milliseconds. */
export function shortDay(value: string | number): string {
  const parts = dayParts.formatToParts(toDate(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('weekday').slice(0, 3)} ${part('day')} ${part('month').slice(0, 3)}`;
}

/** "16:00" for an API timestamp or epoch milliseconds. */
export const clock = (value: string | number) => clockParts.format(toDate(value));

/** "Mon 28" for an ISO date, an API timestamp or epoch milliseconds. */
export const weekDay = (value: string | number) => shortDay(value).split(' ').slice(0, 2).join(' ');
