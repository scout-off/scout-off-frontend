import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import type TurnstileType from '@/components/ui/Turnstile';

const SITE_KEY = 'test-site-key';

/**
 * Turnstile loads the Cloudflare script by appending a <script> tag to
 * document.head and waiting for its onload/onerror handlers. jsdom never
 * actually fetches the script, so we drive those handlers manually by
 * capturing the injected <script> element.
 */
function getInjectedScript(): HTMLScriptElement | null {
  return document.head.querySelector(
    'script[src^="https://challenges.cloudflare.com/turnstile"]',
  );
}

// Turnstile.tsx keeps a module-scoped `scriptLoadPromise` cache so the
// Cloudflare script is only ever injected once per page. Several tests below
// need to exercise that "no script yet" branch from a clean slate, so each
// test re-requires the component from a reset module registry.
//
// Captures the already-loaded 'react' instance and pins the next require()
// of it back to this exact object (same technique as __tests__/app/layout
// .test.tsx's production-layout test) — without this, resetModules() would
// hand the freshly required Turnstile component a *second* copy of 'react',
// distinct from the one react-dom (bound at this file's top-level import via
// @testing-library/react) already set its hooks dispatcher on, which
// surfaces as "Cannot read properties of null" from inside useRef/useEffect.
const actualReact = jest.requireActual('react');

function loadFreshTurnstile(): typeof TurnstileType {
  jest.resetModules();
  jest.doMock('react', () => actualReact);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return (
    require('@/components/ui/Turnstile') as { default: typeof TurnstileType }
  ).default;
}

describe('Turnstile', () => {
  const originalTurnstile = window.turnstile;

  beforeEach(() => {
    delete window.turnstile;
    document.head.innerHTML = '';
  });

  afterEach(() => {
    window.turnstile = originalTurnstile;
    jest.resetModules();
  });

  it('renders a container div for the widget', () => {
    const FreshTurnstile = loadFreshTurnstile();
    const onVerify = jest.fn();
    render(<FreshTurnstile siteKey={SITE_KEY} onVerify={onVerify} />);

    expect(screen.getByTestId('turnstile-widget')).toBeInTheDocument();
  });

  it('injects the Cloudflare script and renders the widget once loaded', async () => {
    const FreshTurnstile = loadFreshTurnstile();
    const onVerify = jest.fn();
    const renderWidget = jest.fn().mockReturnValue('widget-id-1');
    render(<FreshTurnstile siteKey={SITE_KEY} onVerify={onVerify} />);

    const script = getInjectedScript();
    expect(script).not.toBeNull();
    expect(script?.async).toBe(true);
    expect(script?.defer).toBe(true);

    window.turnstile = { render: renderWidget, remove: jest.fn() };

    await act(async () => {
      script?.onload?.(new Event('load'));
      // Let the loadTurnstileScript() promise chain resolve.
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(renderWidget).toHaveBeenCalledTimes(1);
    });

    const [container, options] = renderWidget.mock.calls[0];
    expect(container).toBe(screen.getByTestId('turnstile-widget'));
    expect(options.sitekey).toBe(SITE_KEY);
    expect(options.theme).toBe('auto');
    expect(typeof options.callback).toBe('function');

    // The callback passed to turnstile.render should be onVerify itself.
    options.callback('token-abc');
    expect(onVerify).toHaveBeenCalledWith('token-abc');
  });

  it('forwards expire and error callbacks when the widget is already available', async () => {
    const FreshTurnstile = loadFreshTurnstile();
    const onVerify = jest.fn();
    const onExpire = jest.fn();
    const onError = jest.fn();
    const renderWidget = jest.fn().mockReturnValue('widget-id-2');
    window.turnstile = { render: renderWidget, remove: jest.fn() };

    render(
      <FreshTurnstile
        siteKey={SITE_KEY}
        onVerify={onVerify}
        onExpire={onExpire}
        onError={onError}
      />,
    );

    // window.turnstile already exists, so loadTurnstileScript() resolves
    // immediately without injecting a script tag.
    await waitFor(() => {
      expect(renderWidget).toHaveBeenCalledTimes(1);
    });
    expect(getInjectedScript()).toBeNull();

    const [, options] = renderWidget.mock.calls[0];
    options['expired-callback']();
    expect(onExpire).toHaveBeenCalledTimes(1);

    options['error-callback']();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('calls onError when the script fails to load', async () => {
    const FreshTurnstile = loadFreshTurnstile();
    const onVerify = jest.fn();
    const onError = jest.fn();
    render(
      <FreshTurnstile
        siteKey={SITE_KEY}
        onVerify={onVerify}
        onError={onError}
      />,
    );

    const script = getInjectedScript();
    expect(script).not.toBeNull();

    await act(async () => {
      script?.onerror?.(new Event('error'));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call onError when the script fails and no onError handler was provided', async () => {
    const FreshTurnstile = loadFreshTurnstile();
    const onVerify = jest.fn();

    expect(() =>
      render(<FreshTurnstile siteKey={SITE_KEY} onVerify={onVerify} />),
    ).not.toThrow();

    const script = getInjectedScript();

    await act(async () => {
      expect(() => script?.onerror?.(new Event('error'))).not.toThrow();
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it('does not render the widget if unmounted before the script finishes loading', async () => {
    const FreshTurnstile = loadFreshTurnstile();
    const onVerify = jest.fn();
    const removeWidget = jest.fn();
    const renderWidget = jest.fn().mockReturnValue('widget-id-3');

    const { unmount } = render(
      <FreshTurnstile siteKey={SITE_KEY} onVerify={onVerify} />,
    );

    const script = getInjectedScript();
    unmount();

    window.turnstile = { render: renderWidget, remove: removeWidget };

    await act(async () => {
      script?.onload?.(new Event('load'));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Effect cleanup ran before the script finished loading, so the
    // `cancelled` flag should prevent render() from ever being called, and
    // remove() has nothing to clean up since a widget was never created.
    expect(renderWidget).not.toHaveBeenCalled();
    expect(removeWidget).not.toHaveBeenCalled();
  });

  it('removes the rendered widget on unmount when already loaded', async () => {
    const FreshTurnstile = loadFreshTurnstile();
    const onVerify = jest.fn();
    const removeWidget = jest.fn();
    const renderWidget = jest.fn().mockReturnValue('widget-id-4');
    window.turnstile = { render: renderWidget, remove: removeWidget };

    const { unmount } = render(
      <FreshTurnstile siteKey={SITE_KEY} onVerify={onVerify} />,
    );

    await waitFor(() => {
      expect(renderWidget).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(removeWidget).toHaveBeenCalledWith('widget-id-4');
  });

  it('re-renders (removes the old widget and creates a new one) when siteKey changes', async () => {
    const FreshTurnstile = loadFreshTurnstile();
    const onVerify = jest.fn();
    const removeWidget = jest.fn();
    const renderWidget = jest
      .fn()
      .mockReturnValueOnce('widget-a')
      .mockReturnValueOnce('widget-b');
    window.turnstile = { render: renderWidget, remove: removeWidget };

    const { rerender } = render(
      <FreshTurnstile siteKey="key-a" onVerify={onVerify} />,
    );

    await waitFor(() => {
      expect(renderWidget).toHaveBeenCalledTimes(1);
    });
    expect(renderWidget.mock.calls[0][1].sitekey).toBe('key-a');

    rerender(<FreshTurnstile siteKey="key-b" onVerify={onVerify} />);

    await waitFor(() => {
      expect(renderWidget).toHaveBeenCalledTimes(2);
    });
    expect(removeWidget).toHaveBeenCalledWith('widget-a');
    expect(renderWidget.mock.calls[1][1].sitekey).toBe('key-b');
  });
});
