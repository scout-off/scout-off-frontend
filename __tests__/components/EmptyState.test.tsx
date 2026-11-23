import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import EmptyState from '@/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders with a required title prop', () => {
    render(<EmptyState title="No players found" />);
    expect(screen.getByText('No players found')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(
      <EmptyState title="Empty" description="Try adjusting your filters." />,
    );
    expect(screen.getByText('Try adjusting your filters.')).toBeInTheDocument();
  });

  it('does not render description when absent', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByRole('paragraph')).not.toBeInTheDocument();
  });

  it('renders action button when provided', () => {
    const onClick = jest.fn();
    render(
      <EmptyState title="Empty" action={{ label: 'Add Player', onClick }} />,
    );
    expect(
      screen.getByRole('button', { name: 'Add Player' }),
    ).toBeInTheDocument();
  });

  it('does not render action button when absent', () => {
    render(<EmptyState title="Empty" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls action.onClick when action button is clicked', () => {
    const onClick = jest.fn();
    render(
      <EmptyState title="Empty" action={{ label: 'Add Player', onClick }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add Player' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('matches snapshot', () => {
    const { container } = render(
      <EmptyState
        title="No data"
        description="Nothing here."
        action={{ label: 'Go', onClick: jest.fn() }}
      />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
