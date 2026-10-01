import { describe, expect, it } from 'vitest';
import { isArrivalLate, shiftedEta } from '../eta.ts';
import { imageKind, MAX_IMAGE_BYTES } from '../images.ts';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const WEBP = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe('proof of delivery images', () => {
  it('recognises images from magic bytes', () => {
    expect(imageKind(PNG)).toBe('png');
    expect(imageKind(JPEG)).toBe('jpeg');
    expect(imageKind(GIF)).toBe('gif');
    expect(imageKind(WEBP)).toBe('webp');
    expect(imageKind(Uint8Array.from(Buffer.from('not an image')))).toBeNull();
    expect(imageKind(new Uint8Array(MAX_IMAGE_BYTES + 1))).toBeNull();
  });
});

describe('operational ETA', () => {
  const first = new Date('2026-10-08T07:10:00.000+05:30');
  const second = new Date('2026-10-08T07:40:00.000+05:30');
  const stops = [
    { id: 'stop-1', seq: 1, plannedArrival: first },
    { id: 'stop-2', seq: 2, plannedArrival: second },
  ];

  it('keeps the planned arrival until an earlier stop is recorded', () => {
    expect(shiftedEta(stops, [], 'stop-2')?.toISOString()).toBe(second.toISOString());
  });

  it('shifts later stops by the latest earlier arrival delay', () => {
    const arrived = new Date('2026-10-08T08:30:00.000+05:30');
    const eta = shiftedEta(stops, [{ stopId: 'stop-1', clientTime: arrived }], 'stop-2');
    expect(eta?.toISOString()).toBe(new Date('2026-10-08T09:00:00.000+05:30').toISOString());
    expect(
      shiftedEta(stops, [{ stopId: 'stop-1', clientTime: arrived }], 'stop-1')?.toISOString(),
    ).toBe(first.toISOString());
  });

  it('uses the latest earlier arrival instead of summing every delay', () => {
    const third = new Date('2026-10-08T08:00:00.000+05:30');
    const three = [...stops, { id: 'stop-3', seq: 3, plannedArrival: third }];
    const eta = shiftedEta(
      three,
      [
        { stopId: 'stop-1', clientTime: new Date('2026-10-08T07:40:00.000+05:30') },
        { stopId: 'stop-2', clientTime: new Date('2026-10-08T07:45:00.000+05:30') },
      ],
      'stop-3',
    );
    expect(eta?.toISOString()).toBe(new Date('2026-10-08T08:05:00.000+05:30').toISOString());
  });

  it('carries a delay across midnight', () => {
    const lateEvening = new Date('2026-10-08T23:40:00.000+05:30');
    const last = new Date('2026-10-08T23:50:00.000+05:30');
    const eta = shiftedEta(
      [
        { id: 'stop-1', seq: 1, plannedArrival: lateEvening },
        { id: 'stop-2', seq: 2, plannedArrival: last },
      ],
      [{ stopId: 'stop-1', clientTime: new Date('2026-10-08T23:55:00.000+05:30') }],
      'stop-2',
    );
    expect(eta?.toISOString()).toBe(new Date('2026-10-09T00:05:00.000+05:30').toISOString());
  });

  it('marks late only after the service-date window close', () => {
    expect(isArrivalLate(new Date('2026-10-08T08:00:00.000+05:30'), '2026-10-08', '08:00:00')).toBe(
      false,
    );
    expect(isArrivalLate(new Date('2026-10-08T08:00:01.000+05:30'), '2026-10-08', '08:00:00')).toBe(
      true,
    );
  });
});
