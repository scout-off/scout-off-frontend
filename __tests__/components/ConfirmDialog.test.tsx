import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const defaultProps = {
  isOpen: true,
  onConfirm: jest.fn(),
  onCancel: jest.fn(),
  title: 'Revoke Milestone',
  message: 'Are you sure you want to revoke this milestone?',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ConfirmDialog', () => {
  it('does not render when isOpen is false', () => {
    render(<ConfirmDialog {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders title, message, confirm, and cancel buttons when isOpen is true', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Revoke Milestone')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to revoke this milestone?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', async () => {
    const onConfirm = jest.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = jest.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on Escape key press', () => {
    const onCancel = jest.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables confirm button when loading is true', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />);
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled();
  });

  it('disables cancel button when loading is true', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('renders custom confirmLabel and cancelLabel', () => {
    render(
      <ConfirmDialog {...defaultProps} confirmLabel="Yes, Revoke" cancelLabel="Keep It" />,
    );
    expect(screen.getByRole('button', { name: 'Yes, Revoke' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep It' })).toBeInTheDocument();
  });
});
