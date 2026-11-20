'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

/**
 * Accessible sortable table primitive (issue #1720).
 *
 * Sortable headers render a `<button>` inside `<th scope="col" aria-sort>`,
 * sort changes are announced through a polite live region, and the active
 * sort is persisted in the URL (`?sort=key:dir`, or a custom `sortParam` when
 * several tables share a page) so it survives reloads and can be shared.
 *
 * Only enable sorting where the full dataset is loaded; for server-paginated
 * tables pass `sortingEnabled={false}` until every page is fetched.
 */

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  /** Plain-text header for announcements when `header` isn't a string. */
  label?: string;
  sortable?: boolean;
  /** Custom compare; defaults to comparing `sortValue` (or `row[key]`). */
  compare?: (a: T, b: T) => number;
  /** Value used by the default compare (string, number, Date, or null). */
  sortValue?: (row: T) => string | number | Date | null | undefined;
  render: (row: T) => ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  caption: string;
  captionHidden?: boolean;
  initialSort?: SortState;
  /** URL query parameter holding this table's sort. */
  sortParam?: string;
  sortingEnabled?: boolean;
  className?: string;
  headerRowClassName?: string;
  rowClassName?: string;
}

type SortableValue = string | number | Date | null | undefined;

/** Locale-aware compare for strings, numbers, and dates; empty values sort last. */
export function compareValues(
  a: SortableValue,
  b: SortableValue,
  collator: Intl.Collator,
): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as Date).getTime() - new Date(b as Date).getTime();
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/** Stable sort: equal rows keep their original relative order. */
export function sortRows<T>(
  rows: T[],
  compare: (a: T, b: T) => number,
  direction: SortDirection,
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => sign * compare(x.row, y.row) || x.index - y.index)
    .map(({ row }) => row);
}

export function parseSortParam(value: string | null): SortState | null {
  if (!value) return null;
  const [key, direction] = value.split(':');
  if (!key || (direction !== 'asc' && direction !== 'desc')) return null;
  return { key, direction };
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  captionHidden = false,
  initialSort,
  sortParam = 'sort',
  sortingEnabled = true,
  className = 'w-full text-sm text-left',
  headerRowClassName = 'border-b border-gray-700',
  rowClassName = 'border-b border-gray-700/50 hover:bg-gray-800/50',
}: DataTableProps<T>) {
  const locale = useLocale();
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const [announcement, setAnnouncement] = useState('');

  // Restore from the URL after mount (not during render, to keep SSR output
  // and hydration identical).
  useEffect(() => {
    const fromUrl = parseSortParam(
      new URLSearchParams(window.location.search).get(sortParam),
    );
    if (fromUrl && columns.some((c) => c.key === fromUrl.key && c.sortable)) {
      setSort(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortParam]);

  const collator = useMemo(
    () => new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }),
    [locale],
  );

  const sortedRows = useMemo(() => {
    if (!sortingEnabled || !sort) return rows;
    const column = columns.find((c) => c.key === sort.key && c.sortable);
    if (!column) return rows;
    const compare =
      column.compare ??
      ((a: T, b: T) => {
        const get =
          column.sortValue ??
          ((row: T) =>
            (row as Record<string, unknown>)[column.key] as SortableValue);
        return compareValues(get(a), get(b), collator);
      });
    return sortRows(rows, compare, sort.direction);
  }, [rows, columns, sort, sortingEnabled, collator]);

  const toggleSort = (column: DataTableColumn<T>) => {
    const direction: SortDirection =
      sort?.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc';
    const next = { key: column.key, direction };
    setSort(next);

    const label =
      column.label ??
      (typeof column.header === 'string' ? column.header : column.key);
    setAnnouncement(
      `Sorted by ${label}, ${direction === 'asc' ? 'ascending' : 'descending'}`,
    );

    const url = new URL(window.location.href);
    url.searchParams.set(sortParam, `${next.key}:${next.direction}`);
    window.history.replaceState(window.history.state, '', url.toString());
  };

  return (
    <>
      <div
        className="overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={`${caption} (scrollable)`}
      >
        <table className={className}>
          <caption className={captionHidden ? 'sr-only' : 'mb-2 text-left'}>
            {caption}
          </caption>
          <thead>
            <tr className={headerRowClassName}>
              {columns.map((column) => {
                const sortable = sortingEnabled && column.sortable;
                const active = sortable && sort?.key === column.key;
                const thClass =
                  column.headerClassName ??
                  'py-2 pr-4 font-medium text-gray-400';
                if (!sortable) {
                  return (
                    <th key={column.key} scope="col" className={thClass}>
                      {column.header}
                    </th>
                  );
                }
                const Icon = active
                  ? sort.direction === 'asc'
                    ? ArrowUp
                    : ArrowDown
                  : ArrowUpDown;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={thClass}
                    aria-sort={active ? ARIA_SORT[sort.direction] : 'none'}
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className="inline-flex items-center gap-1 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green rounded"
                    >
                      {column.header}
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={rowKey(row)} className={rowClassName}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={
                      column.cellClassName ?? 'py-2 pr-4 text-gray-300'
                    }
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </>
  );
}
