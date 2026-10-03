import { session } from '../context';

/** Figma scenario clock: Fri 25 Sep 2026, 17:05 Asia/Colombo, planning the run for Sat 26 Sep. */
const SCENARIO_NOW = Date.parse('2026-09-25T17:05:00+05:30');
export const SERVICE_DATE = '2026-09-26';
const startedAt = Date.now();

/** Scenario time that keeps ticking from page load, as an API timestamp (+05:30). */
export function scenarioNow(): string {
  const local = new Date(SCENARIO_NOW + (Date.now() - startedAt) + 5.5 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 19)}+05:30`;
}

/** The signed-in dispatcher, so fixture records can show who acted. */
export const currentUser = () => ({ name: session.name });
