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
        test: { name: 'planning', root: './packages/planning', include: ['test/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'api', root: './apps/api', include: ['test/**/*.test.ts'] },
      },
    ],
  },
});
