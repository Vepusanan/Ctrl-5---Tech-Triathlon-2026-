// SYSTEM_DESIGN §9.4: uploads are images under 2 MB, checked by magic bytes.
// §8.1's 300 KB figure is the driver's offline cache compression target, not this limit.

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/** Two images plus multipart framing. Fastify applies this before the per-file check. */
export const MAX_POD_BODY_BYTES = MAX_IMAGE_BYTES * 2 + 64 * 1024;

export type ImageKind = 'png' | 'jpeg' | 'gif' | 'webp';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG = [0xff, 0xd8, 0xff] as const;
const GIF = [0x47, 0x49, 0x46, 0x38] as const;

export function imageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) return null;
  if (startsWith(bytes, PNG)) return 'png';
  if (startsWith(bytes, JPEG)) return 'jpeg';
  if (startsWith(bytes, GIF) && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61) {
    return 'gif';
  }
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && hasWebp(bytes)) return 'webp';
  return null;
}

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

function hasWebp(bytes: Uint8Array): boolean {
  return bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}
