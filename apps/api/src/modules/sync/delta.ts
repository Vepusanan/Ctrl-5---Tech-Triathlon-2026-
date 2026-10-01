import type { SyncRemovedStop, SyncRouteStop } from '@waypoint/shared';

export interface RouteAudit {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface RouteDiff {
  added: SyncRouteStop[];
  removed: SyncRemovedStop[];
  reordered: SyncRouteStop[];
}

// Stop order at `since`, taken from the trip audit. Without a snapshot the
// current order is the baseline, so a version bump that did not edit stops
// reports an empty diff.
export function stopIdsAtVersion(
  audits: readonly RouteAudit[],
  since: number,
  currentIds: readonly string[],
): string[] {
  let snapshot: string[] | null = null;
  for (const audit of audits) {
    const before = readStopIds(audit.before, since);
    if (before !== null) snapshot = before;
    const after = readStopIds(audit.after, since);
    if (after !== null) snapshot = after;
  }
  return snapshot ?? [...currentIds];
}

export function diffRoute(
  previousIds: readonly string[],
  current: readonly SyncRouteStop[],
): RouteDiff {
  const previousIndex = new Map(previousIds.map((id, index) => [id, index]));
  const added: SyncRouteStop[] = [];
  const reordered: SyncRouteStop[] = [];
  for (const [index, stop] of current.entries()) {
    const before = previousIndex.get(stop.id);
    if (before === undefined) {
      added.push(stop);
      continue;
    }
    if (before !== index) reordered.push(stop);
  }
  const currentIds = new Set(current.map((stop) => stop.id));
  const removed = previousIds.filter((id) => !currentIds.has(id)).map((id) => ({ id }));
  return { added, removed, reordered };
}

function readStopIds(value: Record<string, unknown> | null, version: number): string[] | null {
  if (value === null || value.version !== version) return null;
  const stopIds = value.stopIds;
  if (!Array.isArray(stopIds)) return null;
  const ids: string[] = [];
  for (const id of stopIds) {
    if (typeof id !== 'string') return null;
    ids.push(id);
  }
  return ids;
}
