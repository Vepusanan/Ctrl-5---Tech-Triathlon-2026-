import { z } from 'zod';

export const databaseUrlSchema = z.url({ protocol: /^postgres(ql)?$/ });

const databaseEnvSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
});

export function loadDatabaseEnv(source: NodeJS.ProcessEnv): z.infer<typeof databaseEnvSchema> {
  const result = databaseEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid database environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
