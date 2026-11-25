'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

export interface DataTableColumn<Row> {
  key: string;
  header: ReactNode;
  /** Plain-text column name for the live announcement when `header` is not a string. */
  label?: string;
  sortable?: boolean;
  /** Ascending comparator. Defaults to comparing `sortValue` (or `row[key]`). */
  compare?: (a: Row, b: Row) => number;
  /** Value used by the default comparator. */
  sortValue?: (row: Row) => string | number | Date | null | undefined;
  render: (row: Row) => ReactNode;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string | number;
  caption: string;
  /** Visually hide the caption (it is still announced). */
  captionHidden?: boolean;
  initialSort?: SortState;
  /** URL query param that persists the sort, e.g. `?sort=createdAt:desc`. */
  sortParam?: string;
  className?: string;
  rowClassName?: string;
  headerRowClassName?: string;
  bodyClassName?: string;
}

/** Ascending compare for numbers, dates and locale-aware strings; empty values sort last. */
export function compareValues(
  a: string | number | Date | null | undefined,
  b: string | number | Date | null | undefined,
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

/** Stable sort: equal rows keep their original order. */
export function sortRows<Row>(
  rows: readonly Row[],
  compare: (a: Row, b: Row) => number,
  direction: SortDirection,
): Row[] {
  const sign = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((x, y) => sign * compare(x.row, y.row) || x.index - y.index)
    .map((entry) => entry.row);
}

export function parseSortParam(value: string | null): SortState | null {
  if (!value) return null;
  const [key, direction] = value.split(':');
  if (!key || (direction !== 'asc' && direction !== 'desc')) return null;
  return { key, direction };
}

function readSortFromUrl(param: string): SortState | null {
  if (typeof window === 'undefined') return null;
  return parseSortParam(new URLSearchParams(window.location.search).get(param));
}

function writeSortToUrl(param: string, sort: SortState) {
  const url = new URL(window.location.href);
  url.searchParams.set(param, `${sort.key}:${sort.direction}`);
  window.history.replaceState(
    window.history.state,
    '',
    url.toString().replace(/%3A/gi, ':'),
  );
}

export default function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  captionHidden = false,
  initialSort,
  sortParam = 'sort',
  className = 'w-full text-sm text-left',
  rowClassName,
  headerRowClassName = 'text-gray-400 text-xs uppercase tracking-wide border-b border-gray-800',
  bodyClassName = 'divide-y divide-gray-800',
}: DataTableProps<Row>) {
  const t = useTranslations('dataTable');
  const locale = useLocale();
  const collator = useMemo(
    () => new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }),
    [locale],
  );
  const isSortable = (key: string) =>
    columns.some((c) => c.key === key && c.sortable);

  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);
  const [announcement, setAnnouncement] = useState('');

  // Restore from the URL after mount (avoids an SSR hydration mismatch).
  useEffect(() => {
    const fromUrl = readSortFromUrl(sortParam);
    if (fromUrl && columns.some((c) => c.key === fromUrl.key && c.sortable)) {
      setSort(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortParam]);

  const sortedRows = useMemo(() => {
    const column = sort && columns.find((c) => c.key === sort.key);
    if (!sort || !column?.sortable) return rows;
    const compare =
      column.compare ??
      ((a: Row, b: Row) => {
        const get =
          column.sortValue ??
          ((row: Row) =>
            (row as Record<string, unknown>)[column.key] as
              | string
              | number
              | null
              | undefined);
        return compareValues(get(a), get(b), collator);
      });
    return sortRows(rows, compare, sort.direction);
  }, [rows, columns, sort, collator]);

  const toggleSort = (column: DataTableColumn<Row>) => {
    const direction: SortDirection =
      sort?.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc';
    const next = { key: column.key, direction };
    setSort(next);
    writeSortToUrl(sortParam, next);
    const name =
      column.label ??
      (typeof column.header === 'string' ? column.header : column.key);
    setAnnouncement(
      t(direction === 'asc' ? 'sorted_ascending' : 'sorted_descending', {
        column: name,
      }),
    );
  };

  return (
    <div>
      <div
        className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green rounded"
        // A horizontally scrollable region must be focusable so keyboard
        // users can scroll it (WCAG 2.1.1).
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-label={t('scroll_region', { caption })}
      >
        <table className={className}>
          <caption
            className={
              captionHidden ? 'sr-only' : 'text-left text-sm text-gray-400 mb-2'
            }
          >
            {caption}
          </caption>
          <thead>
            <tr className={headerRowClassName}>
              {columns.map((column) => {
                const active =
                  sort?.key === column.key && isSortable(column.key);
                const ariaSort = column.sortable
                  ? active
                    ? sort!.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                  : undefined;
                const Icon = !active
                  ? ArrowUpDown
                  : sort!.direction === 'asc'
                    ? ArrowUp
                    : ArrowDown;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={column.headerClassName ?? 'py-2 pr-4'}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green rounded"
                      >
                        {column.header}
                        <Icon size={12} aria-hidden="true" />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className={bodyClassName}>
            {sortedRows.map((row) => (
              <tr key={rowKey(row)} className={rowClassName}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={column.className ?? 'py-2 pr-4'}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div aria-live="polite" role="status" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
