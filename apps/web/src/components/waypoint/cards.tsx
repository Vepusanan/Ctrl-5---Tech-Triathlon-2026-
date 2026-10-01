import { type ReactNode, useId } from 'react';
import { Button } from '../ui/button';
import { Badge, FigmaIcon, Tag, type Tone } from './badges';
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <article className={`wp-card ${className}`}>{children}</article>;
}
export function CapacityBar({
  label,
  value,
  max = 100,
  unit = '',
  projected,
}: {
  label: string;
  value: number;
  max?: number;
  unit?: string;
  projected?: number;
}) {
  const id = useId();
  const valid = Number.isFinite(value) && Number.isFinite(max) && max > 0 && value >= 0;
  const percent = valid ? (value / max) * 100 : 0;
  const tone = percent > 100 ? 'danger' : percent >= 90 ? 'warning' : 'neutral';
  return (
    <div className={`wp-capacity capacity-${tone}`}>
      <div className="wp-between">
        <span id={id}>{label}</span>
        <strong>{valid ? `${Math.round(percent)}%` : 'Unavailable'}</strong>
      </div>
      <meter
        className="wp-sr-only"
        aria-labelledby={id}
        min={0}
        max={100}
        value={valid ? Math.min(100, percent) : 0}
        aria-valuetext={
          valid
            ? `${value} of ${max} ${unit}, ${Math.round(percent)}%${percent > 100 ? ', over capacity' : ''}`
            : 'Capacity unavailable'
        }
      />
      <div className="wp-track" aria-hidden="true">
        <span className="wp-track-fill" style={{ width: `${Math.min(100, percent)}%` }} />
        {valid && projected !== undefined && Number.isFinite(projected) && (
          <i style={{ left: `${Math.min(100, Math.max(0, (projected / max) * 100))}%` }} />
        )}
      </div>
      <small>
        {valid
          ? `${value.toLocaleString()} / ${max.toLocaleString()} ${unit}`
          : 'Enter a valid capacity'}
        {percent > 100 && ' · Over capacity'}
        {percent >= 90 && percent <= 100 && ' · Near capacity'}
        {projected !== undefined &&
          Number.isFinite(projected) &&
          ` · After change: ${projected} ${unit}`}
      </small>
    </div>
  );
}
export function MetricCard({
  label,
  value,
  delta,
  trend = 'success',
  icon,
  children,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  trend?: 'success' | 'danger' | 'neutral';
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="wp-metric">
      <div className="wp-between">
        <strong className="wp-number">{value}</strong>
        {delta && <Badge tone={trend}>{delta}</Badge>}
      </div>
      {children}
      <div className="wp-between">
        <p className="wp-muted">{label}</p>
        {icon && <span className="wp-icon-well">{icon}</span>}
      </div>
    </Card>
  );
}
export function HeroMetric({
  label,
  value,
  description,
  children,
  icon,
  inverse = true,
}: {
  label: string;
  value: ReactNode;
  description?: string;
  children?: ReactNode;
  icon?: ReactNode;
  inverse?: boolean;
}) {
  return (
    <Card className={`wp-hero ${inverse ? 'wp-inverse' : ''}`}>
      <div className="wp-between">
        <h3>{label}</h3>
        {icon && <span className="wp-icon-well">{icon}</span>}
      </div>
      <strong className="wp-hero-number">{value}</strong>
      {children}
      {description && <p className="wp-muted">{description}</p>}
    </Card>
  );
}
export function RecommendationCard({
  title,
  description,
  reasons = [],
  state = 'pending',
  onAccept,
  onModify,
  onReject,
}: {
  title: string;
  description: string;
  reasons?: string[];
  state?: 'pending' | 'applying' | 'accepted' | 'rejected';
  onAccept?: () => void;
  onModify?: () => void;
  onReject?: () => void;
}) {
  return (
    <Card>
      <div className="wp-recommendation">
        <div className="wp-between">
          <h3>{title}</h3>
          <Tag kind="recommended" />
        </div>
        <p>{description}</p>
        {reasons.length > 0 && (
          <details>
            <summary>Why this recommendation?</summary>
            <ul>
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </details>
        )}
        {state === 'pending' || state === 'applying' ? (
          <div className="wp-actions">
            <Button onClick={onAccept} disabled={!onAccept} busy={state === 'applying'}>
              {state === 'applying' ? 'Applying…' : 'Accept'}
            </Button>
            <Button
              variant="tertiary"
              onClick={onModify}
              disabled={!onModify || state === 'applying'}
            >
              Modify
            </Button>
            <Button
              variant="tertiary"
              onClick={onReject}
              disabled={!onReject || state === 'applying'}
            >
              Reject
            </Button>
          </div>
        ) : (
          <p role="status">
            <Badge tone={state === 'accepted' ? 'success' : 'neutral'}>
              {state === 'accepted' ? '✓ Accepted' : 'Rejected'}
            </Badge>
          </p>
        )}
      </div>
    </Card>
  );
}
export interface Violation {
  id: string;
  title: string;
  description: string;
  severity: 'warning' | 'danger';
  action?: { label: string; onClick: () => void };
}
export function ViolationPanel({
  violations,
  title = 'Validation',
}: {
  violations: Violation[];
  title?: string;
}) {
  return (
    <Card>
      <div className="wp-between">
        <h3>{title}</h3>
        <Badge
          tone={
            violations.some((v) => v.severity === 'danger')
              ? 'danger'
              : violations.length
                ? 'warning'
                : 'success'
          }
        >
          {violations.length} issues
        </Badge>
      </div>
      {violations.length === 0 ? (
        <p className="wp-muted">All checks passed. No violations found.</p>
      ) : (
        <ul className="wp-list">
          {violations.map((v) => (
            <li key={v.id} className={`wp-violation tone-${v.severity}`}>
              <FigmaIcon name={v.severity === 'danger' ? 'Xoct' : 'Alert'} />
              <div>
                <strong>{v.title}</strong>
                <p>{v.description}</p>
                {v.severity === 'danger' && <Tag kind="blocks-publish" />}
                {v.action && (
                  <Button variant="secondary" onClick={v.action.onClick}>
                    {v.action.label}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
export interface ActionItem {
  id: string;
  title: string;
  description?: string;
  tone?: Tone;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}
export function ActionList({
  title = 'Needs action',
  items,
  footer,
}: {
  title?: string;
  items: ActionItem[];
  footer?: ReactNode;
}) {
  return (
    <Card>
      <div className="wp-between">
        <h3>{title}</h3>
        <Badge tone={items.length ? 'warning' : 'success'}>{items.length}</Badge>
      </div>
      <ul className="wp-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              className="wp-action-row"
              type="button"
              onClick={item.onClick}
              disabled={item.disabled}
            >
              <span className={`wp-icon-well tone-${item.tone ?? 'neutral'}`}>
                {item.icon ?? <FigmaIcon name="Clock1" source="2037-861" />}
              </span>
              <span>
                <strong>{item.title}</strong>
                {item.description && <small>{item.description}</small>}
              </span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>
      {!items.length && <p className="wp-muted">You're all caught up.</p>}
      {footer}
    </Card>
  );
}
export function DeadlineCard({
  title,
  remaining,
  progress,
  state = 'upcoming',
  deadline,
}: {
  title: string;
  remaining: string;
  progress: number;
  state?: 'upcoming' | 'urgent' | 'overdue' | 'complete';
  deadline?: string;
}) {
  const elapsed = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
  const tones = {
    upcoming: 'neutral',
    urgent: 'warning',
    overdue: 'danger',
    complete: 'success',
  } as const;
  return (
    <Card className="wp-deadline">
      <div className="wp-between">
        <h3>{title}</h3>
        <Badge tone={tones[state]}>{state}</Badge>
      </div>
      <strong className="wp-display">{remaining}</strong>
      {deadline && <p className="wp-muted">{deadline}</p>}
      <div className={`wp-deadline-progress deadline-${state}`}>
        <div className="wp-between">
          <small>Time elapsed</small>
          <small>{elapsed}%</small>
        </div>
        <progress
          className="wp-sr-only"
          aria-label={`${title}: time elapsed`}
          value={elapsed}
          max={100}
        />
        <div className="wp-track" aria-hidden="true">
          <span className="wp-track-fill" style={{ width: `${elapsed}%` }} />
        </div>
      </div>
    </Card>
  );
}
export function EmptyState({
  title = 'Nothing here yet',
  description = 'Items will appear here when they are available.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Card className="wp-state">
      <span className="wp-icon-well">
        <FigmaIcon name="Box" />
      </span>
      <h3>{title}</h3>
      <p className="wp-muted">{description}</p>
      {action}
    </Card>
  );
}
export function ErrorState({
  title = 'Could not load data',
  description = 'Check your connection and try again.',
  onRetry,
  retrying = false,
}: {
  title?: string;
  description?: string;
  onRetry?: (() => void) | undefined;
  retrying?: boolean;
}) {
  return (
    <Card className="wp-state">
      <div role="alert">
        <span className="wp-icon-well tone-danger">
          <FigmaIcon name="Alert" />
        </span>
        <h3>{title}</h3>
        <p className="wp-muted">{description}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} busy={retrying}>
          {retrying ? 'Retrying…' : 'Try again'}
        </Button>
      )}
    </Card>
  );
}
export function LoadingState({
  label = 'Loading data…',
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <Card className="wp-loading">
      <p role="status">{label}</p>
      <div aria-hidden="true">
        {Array.from({ length: Math.min(10, Math.max(1, rows)) }, (_, i) => (
          <div className="wp-skeleton" key={`skeleton-${i.toString()}`} />
        ))}
      </div>
    </Card>
  );
}
