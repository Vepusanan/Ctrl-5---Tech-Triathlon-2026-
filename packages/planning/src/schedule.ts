import { LIMIT_EPSILON } from './constants.ts';
import { PlanningInputError } from './errors.ts';

const MINUTES_PER_DAY = 24 * 60;

export function exceedsLimit(actual: number, limit: number): boolean {
  return actual > limit + LIMIT_EPSILON;
}

export function parseTimeOfDay(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  const hours = match?.[1];
  const minutes = match?.[2];
  if (hours === undefined || minutes === undefined) {
    throw new Error(`Invalid time of day: ${value}`);
  }
  return Number(hours) * 60 + Number(minutes);
}

export function formatClock(totalMinutes: number): string {
  const rounded = Math.round(totalMinutes);
  const dayOffset = Math.floor(rounded / MINUTES_PER_DAY);
  const minuteOfDay = rounded - dayOffset * MINUTES_PER_DAY;
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  if (dayOffset <= 0) return clock;
  if (dayOffset === 1) return `${clock} next day`;
  return `${clock} +${dayOffset} days`;
}

export function formatQuantity(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1000) / 1000);
}

const SECONDS_PER_DAY = MINUTES_PER_DAY * 60;

function padTwo(value: number): string {
  return String(value).padStart(2, '0');
}

function isLeapYear(year: number): boolean {
  if (year % 400 === 0) return true;
  if (year % 100 === 0) return false;
  return year % 4 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

/** Calendar shift that does not read the system clock. */
function addCalendarDays(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  const yearText = match?.[1];
  const monthText = match?.[2];
  const dayText = match?.[3];
  if (!yearText || !monthText || !dayText) {
    throw new PlanningInputError(`Invalid service date: ${isoDate}`);
  }
  let year = Number(yearText);
  let month = Number(monthText);
  let day = Number(dayText) + days;
  while (day > daysInMonth(year, month)) {
    day -= daysInMonth(year, month);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  while (day < 1) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    day += daysInMonth(year, month);
  }
  return `${String(year).padStart(4, '0')}-${padTwo(month)}-${padTwo(day)}`;
}

/** Asia/Colombo wall time on `serviceDate`, plus whole days when the minute count wraps. */
export function formatColomboTimestamp(serviceDate: string, absoluteMinutes: number): string {
  const totalSeconds = Math.max(0, Math.round(absoluteMinutes * 60));
  const dayOffset = Math.floor(totalSeconds / SECONDS_PER_DAY);
  const secondOfDay = totalSeconds - dayOffset * SECONDS_PER_DAY;
  const hours = Math.floor(secondOfDay / 3600);
  const minutes = Math.floor((secondOfDay % 3600) / 60);
  const seconds = secondOfDay % 60;
  const date = addCalendarDays(serviceDate, dayOffset);
  return `${date}T${padTwo(hours)}:${padTwo(minutes)}:${padTwo(seconds)}+05:30`;
}
