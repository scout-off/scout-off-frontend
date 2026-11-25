import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataTable, {
  compareValues,
  parseSortParam,
  sortRows,
  type DataTableColumn,
} from '@/components/ui/DataTable';

interface Row {
  id: string;
  name: string;
  score?: number;
  at: number;
}

const rows: Row[] = [
  { id: 'a', name: 'éclair', score: 2, at: 300 },
  { id: 'b', name: 'Apple', score: 5, at: 100 },
  { id: 'c', name: 'banana', score: 2, at: 200 },
  { id: 'd', name: 'Zed', at: 400 },
];

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Name', sortable: true, render: (r) => r.name },
  {
    key: 'score',
    header: 'Score',
    sortable: true,
    render: (r) => r.score ?? '—',
  },
  {
    key: 'at',
    header: <span>When</span>,
    label: 'When',
    sortable: true,
    sortValue: (r) => new Date(r.at),
    render: (r) => r.at,
  },
  { key: 'note', header: 'Note', render: () => 'n' },
];

const renderTable = (
  extra: Partial<React.ComponentProps<typeof DataTable<Row>>> = {},
) =>
  render(
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      caption="People"
      {...extra}
    />,
  );

const firstColumn = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent);

beforeEach(() => window.history.replaceState({}, '', '/admin'));

describe('DataTable helpers', () => {
  const collator = new Intl.Collator('en', {
    numeric: true,
    sensitivity: 'base',
  });

  it('compares numbers, dates, strings and empties', () => {
    expect(compareValues(1, 2, collator)).toBeLessThan(0);
    expect(compareValues(new Date(5), new Date(1), collator)).toBeGreaterThan(
      0,
    );
    expect(compareValues('item 10', 'item 9', collator)).toBeGreaterThan(0);
    expect(compareValues(undefined, 1, collator)).toBe(1);
    expect(compareValues(1, null, collator)).toBe(-1);
    expect(compareValues('', undefined, collator)).toBe(0);
  });

  it('sorts stably in both directions', () => {
    const items = [
      { k: 1, id: 'x' },
      { k: 0, id: 'y' },
      { k: 1, id: 'z' },
    ];
    const cmp = (a: { k: number }, b: { k: number }) => a.k - b.k;
    expect(sortRows(items, cmp, 'asc').map((i) => i.id)).toEqual([
      'y',
      'x',
      'z',
    ]);
    expect(sortRows(items, cmp, 'desc').map((i) => i.id)).toEqual([
      'x',
      'z',
      'y',
    ]);
  });

  it('parses sort params', () => {
    expect(parseSortParam('name:desc')).toEqual({
      key: 'name',
      direction: 'desc',
    });
    expect(parseSortParam('name:sideways')).toBeNull();
    expect(parseSortParam(':asc')).toBeNull();
    expect(parseSortParam(null)).toBeNull();
  });
});

describe('DataTable', () => {
  it('renders scoped headers, caption and a keyboard-scrollable region', () => {
    renderTable({ captionHidden: true });
    screen
      .getAllByRole('columnheader')
      .forEach((th) => expect(th).toHaveAttribute('scope', 'col'));
    expect(
      screen.getByRole('columnheader', { name: 'Note' }),
    ).not.toHaveAttribute('aria-sort');
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute(
      'aria-sort',
      'none',
    );
    expect(screen.getByText('People')).toHaveClass('sr-only');
    expect(screen.getByRole('region')).toHaveAttribute('tabindex', '0');
  });

  it('keeps original order until a column is sorted', () => {
    renderTable();
    expect(firstColumn()).toEqual(['éclair', 'Apple', 'banana', 'Zed']);
  });

  it('sorts locale-aware ascending then descending and announces it', () => {
    renderTable();
    const button = screen.getByRole('button', { name: /name/i });
    fireEvent.click(button);
    expect(firstColumn()).toEqual(['Apple', 'banana', 'éclair', 'Zed']);
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      /Sorted by Name, ascending|sorted_ascending/,
    );
    fireEvent.click(button);
    expect(firstColumn()).toEqual(['Zed', 'éclair', 'banana', 'Apple']);
    expect(screen.getByRole('columnheader', { name: /name/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
  });

  it('sorts numbers with missing values last and keeps ties stable', () => {
    renderTable();
    fireEvent.click(screen.getByRole('button', { name: /score/i }));
    expect(firstColumn()).toEqual(['éclair', 'banana', 'Apple', 'Zed']);
  });

  it('sorts by keyboard', async () => {
    const user = userEvent.setup();
    renderTable();
    screen.getByRole('button', { name: /when/i }).focus();
    await user.keyboard('{Enter}');
    expect(firstColumn()).toEqual(['Apple', 'banana', 'éclair', 'Zed']);
    await user.keyboard(' ');
    expect(firstColumn()).toEqual(['Zed', 'éclair', 'banana', 'Apple']);
  });

  it('persists the sort in the URL', () => {
    renderTable({ sortParam: 'peopleSort' });
    fireEvent.click(screen.getByRole('button', { name: /score/i }));
    expect(window.location.search).toBe('?peopleSort=score:asc');
  });

  it('restores the sort from the URL, ignoring unknown columns', () => {
    window.history.replaceState({}, '', '/admin?sort=name:desc');
    renderTable();
    expect(firstColumn()).toEqual(['Zed', 'éclair', 'banana', 'Apple']);
  });

  it('ignores URL sorts for non-sortable columns and uses initialSort', () => {
    window.history.replaceState({}, '', '/admin?sort=note:asc');
    renderTable({ initialSort: { key: 'at', direction: 'desc' } });
    expect(firstColumn()).toEqual(['Zed', 'éclair', 'banana', 'Apple']);
  });

  it('supports a custom compare function', () => {
    renderTable({
      columns: [
        {
          key: 'name',
          header: 'Name',
          sortable: true,
          compare: (a, b) => a.name.length - b.name.length,
          render: (r) => r.name,
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: /name/i }));
    expect(firstColumn()).toEqual(['Zed', 'Apple', 'éclair', 'banana']);
  });
});
