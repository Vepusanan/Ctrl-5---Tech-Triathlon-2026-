import type { SeedResult } from './run.ts';

export function formatSeedReport(result: SeedResult): string {
  const lines = [
    result.applied
      ? 'Waypoint demo seed applied.'
      : 'Waypoint demo seed already present. No rows changed.',
    `Demo date: ${result.serviceDate}`,
    `Source: ${result.source}`,
    '',
  ];
  for (const account of result.accounts) {
    lines.push(`${account.role.padEnd(14)} ${account.email}  ${account.scope}`);
  }
  lines.push('', `Password: ${result.password}`);
  if (!result.applied) {
    lines.push('Password hashes were kept from the first seed.');
  }
  return lines.join('\n');
}
