import { argon2id, argon2Verify } from 'hash-wasm';

// Fixed salt so reset writes the same hash. This is the demo seed, not a per-user production salt.
const DEMO_SALT = new TextEncoder().encode('waypoint-demo-v1');

export async function hashSeedPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: DEMO_SALT,
    parallelism: 1,
    iterations: 2,
    memorySize: 19_456,
    hashLength: 32,
    outputType: 'encoded',
  });
}

export async function verifySeedPassword(password: string, encoded: string): Promise<boolean> {
  return argon2Verify({ password, hash: encoded });
}
