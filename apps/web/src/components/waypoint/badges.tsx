import type { ReactNode } from 'react';
export type Tone =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'hold'
  | 'predict'
  | 'recommend'
  | 'chilled';
export const statusMap = {
  draft: ['Draft', 'neutral', 'Pen'],
  submitted: ['Submitted', 'info', 'Arrow'],
  confirmed: ['Confirmed', 'info', 'Check1'],
  held: ['Held · next run', 'hold', 'Pause'],
  planning: ['In planning', 'info', 'Sliders'],
  allocated: ['Allocated', 'info', 'Route'],
  deferred: ['Deferred', 'warning', 'Skip'],
  'not-started': ['Not started', 'neutral', 'Circle'],
  loading: ['Loading', 'info', 'Pkg1'],
  'loading-exception': ['Loading exception', 'danger', 'Alert3'],
  ready: ['Ready', 'success', 'Check2'],
  departed: ['Departed', 'info', 'Truck1'],
  'in-progress': ['In progress', 'info', 'Nav'],
  arrived: ['Arrived', 'info', 'Pin'],
  delivered: ['Delivered', 'success', 'Cc1'],
  'delivered-late': ['Delivered · late', 'warning', 'Clock1'],
  late: ['Running late', 'warning', 'Clock1'],
  failed: ['Failed', 'danger', 'Xoct1'],
  'receipt-confirmed': ['Receipt confirmed', 'success', 'Cc1'],
  completed: ['Completed', 'success', 'Cc1'],
  cancelled: ['Cancelled', 'neutral', 'Slash'],
  blocked: ['Blocked', 'danger', 'Lock1'],
  'issue-open': ['Issue open', 'warning', 'Alert2'],
  resolved: ['Resolved', 'success', 'Check2'],
  online: ['Online', 'success', 'Wifi'],
  offline: ['Offline', 'neutral', 'Wifioff1'],
  pending: ['Pending sync', 'warning', 'Cloud'],
  syncing: ['Syncing', 'info', 'Refresh'],
  synced: ['Synced', 'success', 'Check2'],
  conflict: ['Conflict', 'danger', 'Xoct1'],
  stale: ['Stale data', 'warning', 'Clock1'],
} as const;
export type Status = keyof typeof statusMap;
export const tagMap = {
  chilled: ['Chilled', 'chilled', 'Snow'],
  ambient: ['Ambient', 'neutral', 'Box'],
  'van-only': ['Van only', 'neutral', 'Truck'],
  'mall-window': ['Mall window', 'neutral', 'Clock'],
  'tight-window': ['Tight window', 'warning', 'Clock1'],
  'repeat-deferral': ['Repeat deferral', 'warning', 'History'],
  fragile: ['Fragile', 'neutral', 'Pkg'],
  'high-value': ['High value', 'neutral', 'Shield'],
  reefer: ['Reefer', 'chilled', 'Snow'],
  'dry-box': ['Dry box', 'neutral', 'Box'],
  van: ['Van', 'neutral', 'Truck'],
  workshop: ['Workshop', 'danger', 'Lock1'],
  observed: ['Observed', 'neutral', 'Eye'],
  predicted: ['Predicted', 'predict', 'Trend'],
  recommended: ['Recommended', 'recommend', 'Bulb'],
  'auto-applied': ['Auto-applied', 'info', 'Zap'],
  risk: ['Risk', 'warning', 'Alert2'],
  'blocks-publish': ['Blocks publish', 'danger', 'Xoct1'],
  fresh: ['Fresh', 'neutral', ''],
  style: ['Style', 'neutral', ''],
  tech: ['Tech', 'hold', ''],
} as const;
export type TagKind = keyof typeof tagMap;
export function FigmaIcon({ name, source = '54-30' }: { name: string; source?: string }) {
  return (
    <img
      className="wp-icon"
      src={`/waypoint/${source}-imgIcon${name}.svg`}
      alt=""
      aria-hidden="true"
    />
  );
}
export function Badge({
  tone = 'neutral',
  children,
  icon,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span className={`wp-badge tone-${tone} ${className}`}>
      {icon}
      {children}
    </span>
  );
}
export function StatusBadge({ status, label }: { status: Status; label?: string | undefined }) {
  const [text, tone, icon] = statusMap[status];
  return (
    <Badge tone={tone} icon={<FigmaIcon name={icon} />} className="wp-status">
      {label ?? text}
    </Badge>
  );
}
export function Tag({ kind, children }: { kind: TagKind; children?: ReactNode }) {
  const [text, tone, icon] = tagMap[kind];
  return (
    <Badge
      tone={tone}
      icon={icon ? <FigmaIcon name={icon} /> : <span aria-hidden="true">●</span>}
      className="wp-tag"
    >
      {children ?? text}
    </Badge>
  );
}
export function ConnectivityBadge({
  state,
  lastSeen,
}: {
  state: 'online' | 'offline' | 'stale';
  lastSeen?: string | undefined;
}) {
  return (
    <span className="wp-inline" role="status">
      <StatusBadge status={state} />
      {lastSeen && <small>Last seen {lastSeen}</small>}
    </span>
  );
}
export function SyncBadge({
  state,
  pendingCount,
}: {
  state: 'pending' | 'syncing' | 'synced' | 'conflict';
  pendingCount?: number;
}) {
  return (
    <span role="status">
      <StatusBadge
        status={state}
        label={
          state === 'pending' && pendingCount !== undefined
            ? `${pendingCount} pending sync`
            : undefined
        }
      />
    </span>
  );
}
