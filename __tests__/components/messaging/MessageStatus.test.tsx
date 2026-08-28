import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MessageStatus from '@/components/messaging/MessageStatus';
import type { ChatMessage } from '@/lib/messaging/chatApi';

// MessageStatus is a pure presentational component — no hooks or contexts to
// mock. It receives a single `status` prop matching ChatMessage['status'].

type Status = ChatMessage['status'];

describe('MessageStatus', () => {
  // ── sent ────────────────────────────────────────────────────────────────────
  it('renders nothing for the "sent" status', () => {
    const { container } = render(<MessageStatus status="sent" />);
    // Component returns null for 'sent'
    expect(container.firstChild).toBeNull();
  });

  it('does not render any accessible label for "sent"', () => {
    render(<MessageStatus status="sent" />);
    expect(screen.queryByLabelText('Delivered')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Read')).not.toBeInTheDocument();
  });

  // ── delivered ────────────────────────────────────────────────────────────────
  it('renders a visible indicator for the "delivered" status', () => {
    render(<MessageStatus status="delivered" />);
    const indicator = screen.getByLabelText('Delivered');
    expect(indicator).toBeInTheDocument();
  });

  it('renders the single-checkmark glyph for "delivered"', () => {
    render(<MessageStatus status="delivered" />);
    const indicator = screen.getByLabelText('Delivered');
    expect(indicator).toHaveTextContent('✓');
    // Must not display the double-check (that belongs to "read")
    expect(indicator.textContent).not.toBe('✓✓');
  });

  it('applies the grey colour class for "delivered"', () => {
    render(<MessageStatus status="delivered" />);
    const indicator = screen.getByLabelText('Delivered');
    expect(indicator.className).toContain('text-gray-400');
    expect(indicator.className).not.toContain('text-blue-500');
  });

  it('exposes the accessible title "Delivered"', () => {
    render(<MessageStatus status="delivered" />);
    const indicator = screen.getByTitle('Delivered');
    expect(indicator).toBeInTheDocument();
  });

  // ── read ─────────────────────────────────────────────────────────────────────
  it('renders a visible indicator for the "read" status', () => {
    render(<MessageStatus status="read" />);
    const indicator = screen.getByLabelText('Read');
    expect(indicator).toBeInTheDocument();
  });

  it('renders the double-checkmark glyph for "read"', () => {
    render(<MessageStatus status="read" />);
    const indicator = screen.getByLabelText('Read');
    expect(indicator).toHaveTextContent('✓✓');
  });

  it('applies the blue colour class for "read"', () => {
    render(<MessageStatus status="read" />);
    const indicator = screen.getByLabelText('Read');
    expect(indicator.className).toContain('text-blue-500');
    expect(indicator.className).not.toContain('text-gray-400');
  });

  it('exposes the accessible title "Read"', () => {
    render(<MessageStatus status="read" />);
    const indicator = screen.getByTitle('Read');
    expect(indicator).toBeInTheDocument();
  });

  // ── mutual exclusivity ───────────────────────────────────────────────────────
  it('"delivered" indicator is absent when status is "read"', () => {
    render(<MessageStatus status="read" />);
    expect(screen.queryByLabelText('Delivered')).not.toBeInTheDocument();
  });

  it('"read" indicator is absent when status is "delivered"', () => {
    render(<MessageStatus status="delivered" />);
    expect(screen.queryByLabelText('Read')).not.toBeInTheDocument();
  });

  // ── distinct markup per status ───────────────────────────────────────────────
  it('each status renders distinct, accessible markup', () => {
    const statuses: Status[] = ['sent', 'delivered', 'read'];
    const results = statuses.map((status) => {
      const { container } = render(<MessageStatus status={status} />);
      return container.innerHTML;
    });

    // "sent" renders nothing, the other two render different content
    expect(results[0]).toBe('');
    expect(results[1]).not.toBe('');
    expect(results[2]).not.toBe('');
    expect(results[1]).not.toBe(results[2]);
  });
});
