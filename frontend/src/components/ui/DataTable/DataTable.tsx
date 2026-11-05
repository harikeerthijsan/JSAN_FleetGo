import type { ReactNode } from 'react';
import { Spinner } from '../Spinner/Spinner';
import { EmptyState } from '../States/States';
import './DataTable.css';

export interface Column<T> {
  /** Unique column key. */
  key: string;
  header: ReactNode;
  /** Cell renderer. Receives the full row. */
  render: (row: T) => ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** Stable unique key extractor for each row. */
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
}

/**
 * Generic, reusable data table. Handles loading and empty states internally so
 * every module renders lists consistently. Business modules supply typed
 * columns; the component stays data-agnostic.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="fg-table-wrap">
      <table className="fg-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{ width: col.width, textAlign: col.align ?? 'left' }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length}>
                <Spinner block label="Loading…" />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>
                <EmptyState
                  title={emptyTitle}
                  description={emptyDescription}
                />
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? 'fg-table__row--clickable' : ''}
                tabIndex={onRowClick ? 0 : undefined}
                aria-label={onRowClick ? 'Open record details' : undefined}
                onKeyDown={onRowClick ? (event) => {
                  if (event.target === event.currentTarget && event.key === 'Enter') onRowClick(row);
                } : undefined}
                onClick={onRowClick ? (event) => {
                  if ((event.target as HTMLElement).closest('button, a, input, select, textarea, [role="button"]')) return;
                  onRowClick(row);
                } : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{ textAlign: col.align ?? 'left' }}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
