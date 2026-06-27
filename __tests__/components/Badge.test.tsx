import React from 'react';
import { render, screen } from '@testing-library/react';
import Badge from '@/components/ui/Badge';

describe('Badge', () => {
  it('renders default variant correctly', () => {
    render(<Badge>Default Badge</Badge>);
    expect(screen.getByText('Default Badge')).toBeInTheDocument();
    expect(screen.getByText('Default Badge')).toHaveClass('bg-brand-green');
  });

  it('renders elite variant with gold/amber styling', () => {
    render(<Badge variant="elite">Elite Tier</Badge>);
    const badge = screen.getByText('Elite Tier');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('bg-amber-500');
    expect(badge).toHaveClass('border-amber-300');
  });

  it('applies custom className', () => {
    render(<Badge className="custom-class">Test</Badge>);
    expect(screen.getByText('Test')).toHaveClass('custom-class');
  });
});
