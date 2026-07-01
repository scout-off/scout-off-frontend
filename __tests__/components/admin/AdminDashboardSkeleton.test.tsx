import { render, screen } from '@testing-library/react';
import AdminDashboardSkeleton from '@/components/admin/AdminDashboardSkeleton';

describe('AdminDashboardSkeleton', () => {
  it('renders a busy, labelled loading placeholder', () => {
    render(<AdminDashboardSkeleton />);

    const container = screen.getByLabelText('Loading admin dashboard');
    expect(container).toHaveAttribute('aria-busy', 'true');
  });

  it('renders skeleton rows for the validators and activity lists', () => {
    render(<AdminDashboardSkeleton />);

    const lists = screen.getAllByRole('list', { hidden: true });
    expect(lists).toHaveLength(2);
    expect(lists[0].children).toHaveLength(3);
    expect(lists[1].children).toHaveLength(5);
  });
});
