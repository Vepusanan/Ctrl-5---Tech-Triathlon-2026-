import type { ReactNode } from 'react';

// Figma X03 "System states · Loading": blocks in the subtle surface colour that take the radius of
// the content they stand in for, and pulse gently.
type Shape = 'line' | 'title' | 'number' | 'block' | 'field' | 'button' | 'circle';
type Size = number | string;

/** One placeholder block. `on` names the surface it sits on, so it stays visible there. */
export function Skeleton({
  shape = 'line',
  width,
  height,
  on = 'surface',
}: {
  shape?: Shape;
  width?: Size;
  height?: Size;
  on?: 'surface' | 'subtle' | 'inverse';
}) {
  return (
    <span
      className={`wp-skeleton wp-skeleton--${shape}`}
      data-on={on === 'surface' ? undefined : on}
      style={{ width, height: height ?? (shape === 'circle' ? width : undefined) }}
      aria-hidden="true"
    />
  );
}

/** What a screen reader hears while the skeleton shows. Takes no space in the layout. */
export function LoadingLabel({ label }: { label: string }) {
  return (
    <p className="wp-sr-only" role="status">
      {label}
    </p>
  );
}

const LINE_WIDTHS = ['100%', '66%', '82%', '54%'] as const;
const lineWidth = (index: number) => LINE_WIDTHS[index % LINE_WIDTHS.length] ?? '100%';
const keys = (count: number, prefix: string) =>
  Array.from({ length: Math.max(0, count) }, (_, index) => `${prefix}-${index.toString()}`);

/** Text lines of a paragraph that has not arrived yet. */
export function SkeletonLines({
  lines = 2,
  on,
}: {
  lines?: number;
  on?: 'surface' | 'subtle' | 'inverse';
}) {
  return (
    <>
      {keys(lines, 'line').map((key, index) => (
        <Skeleton key={key} width={lineWidth(index)} {...(on ? { on } : {})} />
      ))}
    </>
  );
}

/** A content card: a heading (real text when it is known), an optional block, then lines. */
export function SkeletonCard({
  title,
  lines = 2,
  block = false,
  className = '',
}: {
  title?: ReactNode;
  lines?: number;
  block?: boolean;
  className?: string;
}) {
  return (
    <article className={`wp-card ${className}`}>
      {title ? <h2>{title}</h2> : <Skeleton shape="title" width={180} />}
      {block && <Skeleton shape="block" />}
      <SkeletonLines lines={lines} />
    </article>
  );
}

/**
 * Stands in for a `MetricCard`: the number on top, the label below.
 * @public
 */
export function SkeletonMetric() {
  return (
    <article className="wp-card wp-metric">
      <Skeleton shape="number" width={72} />
      <Skeleton width="60%" />
    </article>
  );
}

/** List rows: an optional icon well, a title line and a detail line. */
export function SkeletonRows({
  rows = 3,
  well = false,
  on,
}: {
  rows?: number;
  well?: boolean;
  on?: 'surface' | 'subtle' | 'inverse';
}) {
  const tone = on ? { on } : {};
  return (
    <div className="wp-skeleton-rows" aria-hidden="true">
      {keys(rows, 'row').map((key, index) => (
        <div className="wp-skeleton-row" key={key}>
          {well && <Skeleton shape="circle" width={36} {...tone} />}
          <div className="wp-skeleton-stack">
            <Skeleton width={index % 2 ? '48%' : '62%'} {...tone} />
            <Skeleton width={index % 2 ? '70%' : '40%'} {...tone} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Body rows for a table whose header is already on screen. One cell per column. */
export function SkeletonTableRows({
  columns,
  rows = 6,
}: {
  columns: readonly { id: string; numeric?: boolean }[];
  rows?: number;
}) {
  return (
    <>
      {keys(rows, 'row').map((key, row) => (
        <tr key={key}>
          {columns.map((column, index) => (
            <td key={column.id} className={column.numeric ? 'wp-numeric' : ''}>
              <Skeleton width={column.numeric ? 40 : lineWidth(row + index)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
