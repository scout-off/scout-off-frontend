import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';
import ChartDataTable, {
  type ChartDataColumn,
} from '@/components/admin/ChartDataTable';

expect.extend(toHaveNoViolations);

interface Point {
  id: string;
  day: string;
  count: number;
}

const rows: Point[] = [
  { id: 'a', day: 'Mon', count: 3 },
  { id: 'b', day: 'Tue', count: 7 },
];

const columns: ChartDataColumn<Point>[] = [
  { header: 'Day', render: (r) => r.day },
  { header: 'Count', render: (r) => String(r.count) },
];

function setup(data: Point[] = rows) {
  const utils = render(
    <ChartDataTable
      caption="Signups per day"
      rows={data}
      rowKey={(r) => r.id}
      columns={columns}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
  return utils;
}

describe('ChartDataTable', () => {
  it('is collapsed by default and toggles open', () => {
    render(
      <ChartDataTable
        caption="Signups per day"
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'Show as table' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide table' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('associates the caption with the table', () => {
    setup();
    expect(
      screen.getByRole('table', { name: 'Signups per day' }),
    ).toBeInTheDocument();
  });

  it('renders one header per column and one row per item', () => {
    setup();
    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual(['Day', 'Count']);
    // header row + one row per data item
    expect(within(table).getAllByRole('row')).toHaveLength(rows.length + 1);
    expect(
      within(table).getByRole('rowheader', { name: 'Tue' }),
    ).toBeInTheDocument();
    expect(within(table).getByRole('cell', { name: '7' })).toBeInTheDocument();
  });

  it('uses rowKey for row keys without React key warnings', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const rowKey = jest.fn((r: Point) => r.id);
    render(
      <ChartDataTable
        caption="Signups per day"
        rows={rows}
        rowKey={rowKey}
        columns={columns}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    expect(rowKey).toHaveBeenCalledWith(rows[0]);
    expect(rowKey).toHaveBeenCalledWith(rows[1]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('renders an empty tbody for an empty dataset', () => {
    setup([]);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(1);
    expect(within(table).getAllByRole('columnheader')).toHaveLength(2);
  });

  it('has no axe violations', async () => {
    const { container } = setup();
    expect(await axe(container)).toHaveNoViolations();
  });
});
