import { describe, expect, it } from 'vitest';
import { diffRoute, stopIdsAtVersion } from '../delta.ts';
import { offlinePlanMovedPast } from '../versions.ts';

const stop = (id: string, seq: number) => ({
  id,
  orderId: `order-${id}`,
  seq,
  plannedArrival: '2026-10-09T07:10:00.000+05:30',
  status: 'pending' as const,
});

describe('offline plan version', () => {
  it('treats a newer trip version as a plan change', () => {
    expect(offlinePlanMovedPast(0, 1, [0])).toBe(true);
    expect(offlinePlanMovedPast(0, 0, [2])).toBe(true);
  });

  it('treats matching versions as outside the cached plan', () => {
    expect(offlinePlanMovedPast(0, 0, [0])).toBe(false);
    expect(offlinePlanMovedPast(3, 3, [1, 2])).toBe(false);
  });
});

describe('trip route diff', () => {
  const first = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaa1';
  const second = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaa2';
  const third = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaa3';
  const added = 'aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaa4';

  it('lists added, removed, and reordered stops against the cached version', () => {
    const current = [stop(second, 1), stop(added, 2), stop(first, 3)];
    expect(diffRoute([first, second, third], current)).toEqual({
      added: [stop(added, 2)],
      removed: [{ id: third }],
      reordered: [stop(second, 1), stop(first, 3)],
    });
  });

  it('reports an empty diff when the stop order is unchanged', () => {
    const current = [stop(first, 1), stop(second, 2)];
    expect(diffRoute([first, second], current)).toEqual({
      added: [],
      removed: [],
      reordered: [],
    });
  });

  it('reads the stop list stored at the requested version', () => {
    const audits = [
      {
        before: { version: 0, stopIds: [first, second] },
        after: { version: 1, stopIds: [second, first] },
      },
      {
        before: { version: 1, stopIds: [second, first] },
        after: { status: 'departed', version: 2 },
      },
    ];
    expect(stopIdsAtVersion(audits, 0, [second, first])).toEqual([first, second]);
    expect(stopIdsAtVersion(audits, 1, [second, first])).toEqual([second, first]);
    expect(stopIdsAtVersion(audits, 2, [second, first])).toEqual([second, first]);
  });
});
