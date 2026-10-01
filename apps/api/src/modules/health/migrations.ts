import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const journalSchema = z.object({ entries: z.array(z.unknown()).min(1) });

// Resolved from both src/ and dist/ so the Docker image and the dev server share one path.
export function expectedMigrationCount(): number {
  const journalPath = fileURLToPath(
    new URL('../../../../../packages/database/migrations/meta/_journal.json', import.meta.url),
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(journalPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unreadable journal';
    throw new Error(`Could not read migration journal at ${journalPath}: ${message}`);
  }
  const journal = journalSchema.safeParse(parsed);
  if (!journal.success) {
    throw new Error(`Migration journal at ${journalPath} has no entries`);
  }
  return journal.data.entries.length;
}
