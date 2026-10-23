import { renderHook, act, waitFor } from '@testing-library/react';

jest.mock('@/lib/api', () => ({
  subscribeToPush: jest.fn(),
  unsubscribeFromPush: jest.fn(),
}));

type PushHook = typeof import('@/hooks/usePushNotifications').usePushNotifications;

const WALLET = 'GWALLET';
// base64url for bytes [1, 2, 3, 4]
const VAPID = 'AQIDBA';

let usePushNotifications: PushHook;
let subscribeToPush: jest.Mock;
let unsubscribeFromPush: jest.Mock;

const pushManager = {
  getSubscription: jest.fn(),
  subscribe: jest.fn(),
};
const requestPermission = jest.fn();

function makeSub(endpoint = 'https://push.example/1') {
  return {
    endpoint,
    toJSON: jest.fn(() => ({ endpoint })),
    unsubscribe: jest.fn().mockResolvedValue(true),
  };
}

function installBrowser(opts: { permission?: string } = {}) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  });
  (window as unknown as Record<string, unknown>).PushManager = function () {};
  (window as unknown as Record<string, unknown>).Notification = Object.assign(
    function () {},
    {
      permission: opts.permission ?? 'default',
      requestPermission,
    },
  );
}

function uninstallBrowser() {
  delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  delete (window as unknown as Record<string, unknown>).PushManager;
  delete (window as unknown as Record<string, unknown>).Notification;
}

function load(vapid: string | undefined = VAPID) {
  if (vapid === undefined) delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = vapid;
  jest.isolateModules(() => {
    usePushNotifications =
      require('@/hooks/usePushNotifications').usePushNotifications;
    const api = require('@/lib/api');
    subscribeToPush = api.subscribeToPush;
    unsubscribeFromPush = api.unsubscribeFromPush;
  });
}

describe('usePushNotifications', () => {
  const originalKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    pushManager.getSubscription.mockResolvedValue(null);
    installBrowser();
  });

  afterEach(() => {
    uninstallBrowser();
    if (originalKey === undefined)
      delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    else process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = originalKey;
  });

  it('reports unsupported when the browser lacks Notification', async () => {
    load();
    delete (window as unknown as Record<string, unknown>).Notification;
    const { result } = renderHook(() => usePushNotifications(WALLET));
    await waitFor(() => expect(result.current.status).toBe('unsupported'));
    expect(pushManager.getSubscription).not.toHaveBeenCalled();
  });

  it('reports unsupported when there is no service worker', async () => {
    load();
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    const { result } = renderHook(() => usePushNotifications(WALLET));
    await waitFor(() => expect(result.current.status).toBe('unsupported'));
  });

  it('reports unsupported when the VAPID key is missing', async () => {
    load(undefined);
    const { result } = renderHook(() => usePushNotifications(WALLET));
    await waitFor(() => expect(result.current.status).toBe('unsupported'));
    expect(pushManager.getSubscription).not.toHaveBeenCalled();
  });

  it('reports denied when permission is denied and never subscribes', async () => {
    installBrowser({ permission: 'denied' });
    load();
    const { result } = renderHook(() => usePushNotifications(WALLET));
    await waitFor(() => expect(result.current.status).toBe('denied'));
    await act(async () => {
      await result.current.enable();
    });
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(result.current.status).toBe('denied');
  });

  it('starts as loading, then unsubscribed when no subscription exists', async () => {
    load();
    const { result } = renderHook(() => usePushNotifications(WALLET));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('unsubscribed'));
  });

  it('reports subscribed when an existing subscription is found on mount', async () => {
    pushManager.getSubscription.mockResolvedValue(makeSub());
    load();
    const { result } = renderHook(() => usePushNotifications(WALLET));
    await waitFor(() => expect(result.current.status).toBe('subscribed'));
  });

  it('falls back to unsubscribed if reading the subscription fails', async () => {
    pushManager.getSubscription.mockRejectedValue(new Error('nope'));
    load();
    const { result } = renderHook(() => usePushNotifications(WALLET));
    await waitFor(() => expect(result.current.status).toBe('unsubscribed'));
  });

  it('enable subscribes with the VAPID key and registers it with the backend', async () => {
    const sub = makeSub();
    requestPermission.mockResolvedValue('granted');
    pushManager.subscribe.mockResolvedValue(sub);
    load();
    const { result } = renderHook(() => usePushNotifications(WALLET));
    await waitFor(() => expect(result.current.status).toBe('unsubscribed'));

    await act(async () => {
      await result.current.enable();
    });

    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    const arg = pushManager.subscribe.mock.calls[0][0];
    expect(arg.userVisibleOnly).toBe(true);
    expect(Array.from(arg.applicationServerKey as Uint8Array)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(subscribeToPush).toHaveBeenCalledWith(WALLET, { endpoint: sub.endpoint });
    expect(result.current.status).toBe('subscribed');
  });

  it('enable does nothing without a wallet', async () => {
    load();
    const { result } = renderHook(() => usePushNotifications(null));
    await waitFor(() => expect(result.current.status).toBe('unsubscribed'));
    await act(async () => {
      await result.current.enable();
    });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('enable sets denied when the user rejects the permission prompt', async () => {
    requestPermission.mockResolvedValue('denied');
    load();
    const { result } = renderHook(() => usePushNotifications(WALLET));
    await waitFor(() => expect(result.current.status).toBe('unsubscribed'));
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.status).toBe('denied');
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('enable stays unsubscribed when the prompt is dismissed', async () => {
    requestPermission.mockResolvedValue('default');
    load();
    const { result } = renderHook(() => usePushNotifications(WALLET));
    await waitFor(() => expect(result.current.status).toBe('unsubscribed'));
    await act(async () => {
      await result.current.enable();
    });
    expect(result.current.status).toBe('unsubscribed');
  });

  it('enable throws and resets to unsubscribed when subscribe fails', async () => {
    requestPermission.mockResolvedValue('granted');
    pushManager.subscribe.mockRejectedValue(new Error('push service error'));
    load();
    const { result } = renderHook(() => usePushNotifications(WALLET));
    await waitFor(() => expect(result.current.status).toBe('unsubscribed'));

    await act(async () => {
      await expect(result.current.enable()).rejects.toThrow(
        'Could not enable push notifications',
      );
    });
    expect(result.current.status).toBe('unsubscribed');
    expect(subscribeToPush).not.toHaveBeenCalled();
  });

  it('disable unsubscribes locally and tells the backend', async () => {
    const sub = makeSub();
    pushManager.getSubscription.mockResolvedValue(sub);
    load();
    const { result } = renderHook(() => usePushNotifications(WALLET));
    await waitFor(() => expect(result.current.status).toBe('subscribed'));

    await act(async () => {
      await result.current.disable();
    });
    expect(unsubscribeFromPush).toHaveBeenCalledWith(WALLET, sub.endpoint);
    expect(sub.unsubscribe).toHaveBeenCalled();
    expect(result.current.status).toBe('unsubscribed');
  });

  it('disable throws and restores subscribed when unsubscribe fails', async () => {
    const sub = makeSub();
    sub.unsubscribe.mockRejectedValue(new Error('fail'));
    pushManager.getSubscription.mockResolvedValue(sub);
    load();
    const { result } = renderHook(() => usePushNotifications(WALLET));
    await waitFor(() => expect(result.current.status).toBe('subscribed'));

    await act(async () => {
      await expect(result.current.disable()).rejects.toThrow(
        'Could not disable push notifications',
      );
    });
    expect(result.current.status).toBe('subscribed');
  });
});
