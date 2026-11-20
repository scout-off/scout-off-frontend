import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import DataTable, {
  compareValues,
  parseSortParam,
  sortRows,
  type DataTableColumn,
} from '@/components/ui/DataTable';

interface Row {
  id: string;
  name: string;
  severity: number;
  createdAt: Date | null;
}

const rows: Row[] = [
  { id: '1', name: 'éclair', severity: 2, createdAt: new Date('2026-03-01') },
  { id: '2', name: 'apple', severity: 3, createdAt: new Date('2026-01-01') },
  { id: '3', name: 'Banana', severity: 2, createdAt: null },
];

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Name', sortable: true, render: (r) => r.name },
  {
    key: 'severity',
    header: 'Severity',
    sortable: true,
    render: (r) => r.severity,
  },
  {
    key: 'createdAt',
    header: 'Created',
    sortable: true,
    render: (r) => r.createdAt?.toISOString().slice(0, 10) ?? '—',
  },
  { key: 'actions', header: 'Actions', render: () => 'x' },
];

const firstColumn = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent);

function renderTable(
  props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {},
) {
  return render(
    <DataTable
      caption="Test table"
      captionHidden
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      {...props}
    />,
  );
}

beforeEach(() => {
  window.history.replaceState(null, '', '/admin');
});

describe('DataTable', () => {
  it('renders headers with scope="col" and aria-sort="none" on sortable columns', () => {
    renderTable();
    const headers = screen.getAllByRole('columnheader');
    headers.forEach((th) => expect(th).toHaveAttribute('scope', 'col'));
    expect(headers[0]).toHaveAttribute('aria-sort', 'none');
    expect(headers[3]).not.toHaveAttribute('aria-sort');
    expect(within(headers[3]).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Test table')).toHaveClass('sr-only');
  });

  it('sorts ascending then descending with locale-aware compare', () => {
    renderTable();
    const button = screen.getByRole('button', { name: /Name/ });
    fireEvent.click(button);
    expect(firstColumn()).toEqual(['apple', 'Banana', 'éclair']);
    expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    fireEvent.click(button);
    expect(firstColumn()).toEqual(['éclair', 'Banana', 'apple']);
    expect(screen.getAllByRole('columnheader')[0]).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('is stable for equal values and keeps empty dates last', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /Severity/ }));
    expect(firstColumn()).toEqual(['éclair', 'Banana', 'apple']);
    fireEvent.click(screen.getByRole('button', { name: /Created/ }));
    expect(firstColumn()).toEqual(['apple', 'éclair', 'Banana']);
  });

  it('announces sort changes in a polite live region', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /Severity/ }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sorted by Severity, ascending',
    );
  });

  it('is keyboard operable via native buttons', () => {
    renderTable();
    const button = screen.getByRole('button', { name: /Name/ });
    button.focus();
    expect(button).toHaveFocus();
    expect(button.tagName).toBe('BUTTON');
    expect(button).toHaveAttribute('type', 'button');
  });

  it('persists the sort in the URL and restores it on mount', () => {
    const { unmount } = renderTable({ sortParam: 'flagsSort' });
    fireEvent.click(screen.getByRole('button', { name: /Severity/ }));
    fireEvent.click(screen.getByRole('button', { name: /Severity/ }));
    expect(window.location.search).toBe('?flagsSort=severity%3Adesc');
    unmount();

    renderTable({ sortParam: 'flagsSort' });
    expect(firstColumn()).toEqual(['apple', 'éclair', 'Banana']);
  });

  it('ignores URL sorts for unknown or non-sortable columns', () => {
    window.history.replaceState(null, '', '/admin?sort=actions:asc');
    renderTable();
    expect(firstColumn()).toEqual(['éclair', 'apple', 'Banana']);
  });

  it('applies initialSort and a custom compare', () => {
    renderTable({
      initialSort: { key: 'name', direction: 'asc' },
      columns: [
        {
          ...columns[0],
          compare: (a, b) => a.name.length - b.name.length,
        },
      ],
    });
    expect(firstColumn()).toEqual(['apple', 'éclair', 'Banana']);
  });

  it('renders plain headers when sorting is disabled', () => {
    renderTable({
      sortingEnabled: false,
      initialSort: { key: 'name', direction: 'asc' },
    });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(firstColumn()).toEqual(['éclair', 'apple', 'Banana']);
  });

  it('wraps the table in a focusable, labelled scroll region', () => {
    renderTable();
    const region = screen.getByRole('region', {
      name: 'Test table (scrollable)',
    });
    expect(region).toHaveAttribute('tabIndex', '0');
  });
});

describe('helpers', () => {
  const collator = new Intl.Collator('en', { numeric: true });

  it('compareValues handles numbers, dates, strings, and empties', () => {
    expect(compareValues(1, 2, collator)).toBeLessThan(0);
    expect(compareValues('item 10', 'item 9', collator)).toBeGreaterThan(0);
    expect(
      compareValues(new Date('2026-01-02'), new Date('2026-01-01'), collator),
    ).toBeGreaterThan(0);
    expect(compareValues(null, 'a', collator)).toBe(1);
    expect(compareValues('a', '', collator)).toBe(-1);
    expect(compareValues(undefined, null, collator)).toBe(0);
  });

  it('sortRows is stable', () => {
    const input = [
      { k: 1, id: 'a' },
      { k: 0, id: 'b' },
      { k: 1, id: 'c' },
    ];
    expect(
      sortRows(input, (a, b) => a.k - b.k, 'desc').map((r) => r.id),
    ).toEqual(['a', 'c', 'b']);
  });

  it('parseSortParam validates input', () => {
    expect(parseSortParam('createdAt:desc')).toEqual({
      key: 'createdAt',
      direction: 'desc',
    });
    expect(parseSortParam('createdAt:sideways')).toBeNull();
    expect(parseSortParam(':asc')).toBeNull();
    expect(parseSortParam(null)).toBeNull();
  });
});
