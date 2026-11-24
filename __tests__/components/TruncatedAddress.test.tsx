import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TruncatedAddress from '@/components/ui/TruncatedAddress';

// Use the real 'common' translations (mocked in jest.setup.ts via mockTranslatedNamespaces).

describe('TruncatedAddress', () => {
  const ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMNOPQRSTU';

  describe('copy button accessibility', () => {
    it('renders a button with a non-empty aria-label', () => {
      render(<TruncatedAddress address={ADDRESS} />);
      const btn = screen.getByRole('button');
      expect(btn).toHaveAttribute('aria-label');
      expect(btn.getAttribute('aria-label')).not.toBe('');
    });

    it('renders a button with a matching title attribute', () => {
      render(<TruncatedAddress address={ADDRESS} />);
      const btn = screen.getByRole('button');
      const ariaLabel = btn.getAttribute('aria-label');
      const title = btn.getAttribute('title');
      expect(title).toBe(ariaLabel);
    });

    it('aria-label reflects copy state before copy', () => {
      render(<TruncatedAddress address={ADDRESS} />);
      const btn = screen.getByRole('button');
      // Before copy: should indicate "copy" intent, not "copied".
      expect(btn.getAttribute('aria-label')).toMatch(/copy/i);
    });

    it('aria-label updates to copied state after clicking', async () => {
      // Mock clipboard API
      const writeText = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText },
      });

      render(<TruncatedAddress address={ADDRESS} />);
      const btn = screen.getByRole('button');

      fireEvent.click(btn);

      await waitFor(() => {
        expect(btn.getAttribute('aria-label')).toMatch(/copied/i);
      });
    });
  });

  describe('truncation', () => {
    it('truncates long addresses to first 4 and last 4 chars', () => {
      render(<TruncatedAddress address={ADDRESS} />);
      const expected = `${ADDRESS.slice(0, 4)}…${ADDRESS.slice(-4)}`;
      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it('renders short addresses without truncation', () => {
      render(<TruncatedAddress address="GABC" />);
      expect(screen.getByText('GABC')).toBeInTheDocument();
    });
  });

  describe('non-copyable mode', () => {
    it('renders a span, not a button, when copyable=false', () => {
      render(<TruncatedAddress address={ADDRESS} copyable={false} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getByText(`${ADDRESS.slice(0, 4)}…${ADDRESS.slice(-4)}`)).toBeInTheDocument();
    });
  });

  describe('null guard', () => {
    it('renders nothing when address is empty string', () => {
      const { container } = render(<TruncatedAddress address="" />);
      expect(container).toBeEmptyDOMElement();
    });
  });
});
