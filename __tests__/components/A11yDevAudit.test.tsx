import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import A11yDevAudit from '../../components/A11yDevAudit';

describe('A11yDevAudit', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.restoreAllMocks();
  });

  it('renders nothing when not in a dev-audit-enabled environment', () => {
    process.env.NODE_ENV = 'production';
    const { container } = render(<A11yDevAudit />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the audit trigger when enabled', () => {
    process.env.NODE_ENV = 'development';
    render(<A11yDevAudit />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('opens the audit overlay when the trigger is clicked', () => {
    process.env.NODE_ENV = 'development';
    render(<A11yDevAudit />);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
