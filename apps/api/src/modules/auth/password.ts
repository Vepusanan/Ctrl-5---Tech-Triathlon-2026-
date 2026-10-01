import { argon2id, argon2Verify } from 'hash-wasm';

// Same OWASP argon2id floor the demo seed uses. Verification reads cost from the encoded hash.
const ARGON2 = {
  parallelism: 1,
  iterations: 2,
  memorySize: 19_456,
  hashLength: 32,
} as const;

let dummyHash: Promise<string> | undefined;

function dummyPasswordHash(): Promise<string> {
  dummyHash ??= argon2id({
    password: 'waypoint-dummy-password',
    salt: crypto.getRandomValues(new Uint8Array(16)),
    ...ARGON2,
    outputType: 'encoded',
  });
  return dummyHash;
}

// Unknown emails still run argon2 so the response time does not reveal whether the account exists.
export async function passwordMatches(password: string, encoded: string | null): Promise<boolean> {
  const hash = encoded ?? (await dummyPasswordHash());
  let matches = false;
  try {
    matches = await argon2Verify({ password, hash });
  } catch {
    matches = false;
  }
  return encoded !== null && matches;
}
