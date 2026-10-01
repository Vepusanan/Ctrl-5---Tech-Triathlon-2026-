import { defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  ssr: {
    resolve: { conditions: ['@waypoint/source', ...defaultServerConditions] },
  },
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'shared', root: './packages/shared', include: ['test/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'planning', root: './packages/planning', include: ['test/**/*.test.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'api',
          root: './apps/api',
          include: ['test/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
          hookTimeout: 60_000,
          testTimeout: 30_000,
          // Auth and RBAC tests share one Postgres database.
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'database',
          root: './packages/database',
          include: ['test/**/*.test.ts'],
          hookTimeout: 60_000,
          testTimeout: 30_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
