import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { EmptyState, ErrorState, LoadingState } from './cards';
export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  numeric?: boolean;
}
function Selection({
  label,
  checked,
  mixed,
  onChange,
}: {
  label: string;
  checked: boolean;
  mixed?: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!mixed;
  }, [mixed]);
  return (
    <label className="wp-checkbox-target">
      <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={onChange} />
    </label>
  );
}
export function DataTable<T>({
  caption,
  rows,
  columns,
  rowKey,
  selection,
  onSelectionChange,
  loading,
  error,
  onRetry,
  emptyMessage = 'No records found.',
}: {
  caption: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  selection?: string[];
  onSelectionChange?: (keys: string[]) => void;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  emptyMessage?: string;
}) {
  const [sort, setSort] = useState<{ id: string; direction: 'ascending' | 'descending' }>();
  if (loading) return <LoadingState label={`Loading ${caption.toLowerCase()}…`} />;
  if (error) return <ErrorState description={error} onRetry={onRetry} />;
  if (!rows.length) return <EmptyState title={emptyMessage} />;
  const col = columns.find((c) => c.id === sort?.id);
  const sorted = col?.sortValue
    ? [...rows].sort((a, b) => {
        const x = col.sortValue?.(a) ?? '';
        const y = col.sortValue?.(b) ?? '';
        const result =
          typeof x === 'number' && typeof y === 'number'
            ? x - y
            : String(x).localeCompare(String(y), undefined, { numeric: true });
        return result * (sort?.direction === 'descending' ? -1 : 1);
      })
    : rows;
  const selected = new Set(selection ?? []);
  const all = rows.every((row) => selected.has(rowKey(row)));
  const some = rows.some((row) => selected.has(rowKey(row)));
  return (
    <div className="wp-card wp-table-card">
      {onSelectionChange && (
        <div className="wp-between wp-table-toolbar">
          <span role="status">
            {rows.filter((row) => selected.has(rowKey(row))).length} selected
          </span>
          <Button
            variant="tertiary"
            onClick={() => onSelectionChange([])}
            disabled={!selected.size}
          >
            Clear selection
          </Button>
        </div>
      )}
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The overflow region must be keyboard-scrollable. */}
      <section className="wp-table-scroll" tabIndex={0} aria-label={`${caption}, scrollable table`}>
        <table className="wp-table">
          <caption>{caption}</caption>
          <thead>
            <tr>
              {onSelectionChange && (
                <th scope="col">
                  <Selection
                    label="Select all rows"
                    checked={all}
                    mixed={some && !all}
                    onChange={() => {
                      const next = new Set(selected);
                      for (const row of rows) {
                        if (all) next.delete(rowKey(row));
                        else next.add(rowKey(row));
                      }
                      onSelectionChange([...next]);
                    }}
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={column.numeric ? 'wp-numeric' : ''}
                  aria-sort={
                    column.sortValue
                      ? sort?.id === column.id
                        ? sort.direction
                        : 'none'
                      : undefined
                  }
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSort({
                          id: column.id,
                          direction:
                            sort?.id === column.id && sort.direction === 'ascending'
                              ? 'descending'
                              : 'ascending',
                        })
                      }
                    >
                      {column.header}{' '}
                      <span aria-hidden="true">
                        {sort?.id === column.id
                          ? sort.direction === 'ascending'
                            ? '↑'
                            : '↓'
                          : '↕'}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const key = rowKey(row);
              return (
                <tr key={key} data-selected={selected.has(key)}>
                  {onSelectionChange && (
                    <td>
                      <Selection
                        label={`Select ${key}`}
                        checked={selected.has(key)}
                        onChange={() => {
                          const next = new Set(selected);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          onSelectionChange([...next]);
                        }}
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.id} className={column.numeric ? 'wp-numeric' : ''}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
