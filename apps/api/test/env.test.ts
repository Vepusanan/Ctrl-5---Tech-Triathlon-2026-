import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.ts';

const validEnv = {
  DATABASE_URL: 'postgres://waypoint:secret@localhost:5432/waypoint',
  SESSION_SECRET: 'x'.repeat(64),
};

describe('loadEnv', () => {
  it('applies defaults for optional settings', () => {
    expect(loadEnv(validEnv)).toEqual({
      ...validEnv,
      HOST: '0.0.0.0',
      PORT: 3000,
      LOG_LEVEL: 'info',
      DEMO_MODE: false,
    });
  });

  it('coerces PORT and DEMO_MODE from strings', () => {
    const env = loadEnv({ ...validEnv, PORT: '8080', DEMO_MODE: 'true', DEMO_DATE: '2026-06-01' });
    expect(env).toMatchObject({ PORT: 8080, DEMO_MODE: true, DEMO_DATE: '2026-06-01' });
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadEnv({ SESSION_SECRET: validEnv.SESSION_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-Postgres DATABASE_URL', () => {
    expect(() => loadEnv({ ...validEnv, DATABASE_URL: 'mysql://localhost/waypoint' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects a short SESSION_SECRET', () => {
    expect(() => loadEnv({ ...validEnv, SESSION_SECRET: 'short' })).toThrow(/SESSION_SECRET/);
  });

  it('rejects a malformed DEMO_DATE', () => {
    expect(() => loadEnv({ ...validEnv, DEMO_DATE: '03/10/2026' })).toThrow(/DEMO_DATE/);
  });
});
