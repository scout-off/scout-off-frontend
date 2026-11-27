import React from 'react';
import { render, waitFor } from '@testing-library/react';

const mockAxe = jest.fn();
jest.mock('@axe-core/react', () => ({ __esModule: true, default: mockAxe }), {
  virtual: true,
});

import A11yDevAudit from '../../components/A11yDevAudit';

describe('A11yDevAudit', () => {
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.NODE_ENV;

  afterEach(() => {
    env.NODE_ENV = originalEnv;
    mockAxe.mockReset();
  });

  it('renders nothing', () => {
    const { container } = render(<A11yDevAudit />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not load axe outside development', async () => {
    env.NODE_ENV = 'production';
    render(<A11yDevAudit />);
    await Promise.resolve();
    expect(mockAxe).not.toHaveBeenCalled();
  });

  it('starts axe with React and ReactDOM in development', async () => {
    env.NODE_ENV = 'development';
    render(<A11yDevAudit />);
    await waitFor(() => expect(mockAxe).toHaveBeenCalledTimes(1));
    const [react, reactDom, debounce] = mockAxe.mock.calls[0];
    expect(react).toHaveProperty('createElement');
    expect(reactDom).toBeDefined();
    expect(debounce).toBe(1000);
  });
});
