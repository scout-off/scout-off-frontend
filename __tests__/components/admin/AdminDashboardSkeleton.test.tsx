import { render, screen } from '@testing-library/react';
import AdminDashboardSkeleton from '@/components/admin/AdminDashboardSkeleton';

describe('AdminDashboardSkeleton', () => {
  it('exposes a status live region with a localized loading label', () => {
    render(<AdminDashboardSkeleton />);

    const container = screen.getByRole('status');
    expect(container).toHaveAttribute('aria-busy', 'true');
    expect(container).toHaveAttribute('aria-label', 'Loading...');
  });

  it('renders skeleton rows for the validators, activity, and flagged-activity lists', () => {
    render(<AdminDashboardSkeleton />);

    const lists = screen.getAllByRole('list', { hidden: true });
    expect(lists).toHaveLength(3);
    expect(lists[0].children).toHaveLength(3);
    expect(lists[1].children).toHaveLength(5);
    expect(lists[2].children).toHaveLength(2);
  });
});
