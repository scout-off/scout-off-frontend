/**
 * Unit tests for lib/eventStream.ts — the shared SSE subscription manager.
 *
 * jsdom has neither EventSource nor BroadcastChannel, so both are replaced
 * with minimal fakes that record instances for the test to drive.
 */
import {
  _resetEventStream,
  initEventStream,
  isHealthy,
  onEvent,
} from '@/lib/eventStream';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  listeners = new Map<string, (e: Event) => void>();
  closed = false;

  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (e: Event) => void) {
    this.listeners.set(type, listener);
  }

  close() {
    this.closed = true;
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  emitNamed(type: string, data: unknown) {
    this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  posted: unknown[] = [];
  listener: ((e: MessageEvent) => void) | null = null;

  constructor(public name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  postMessage(message: unknown) {
    this.posted.push(message);
  }

  addEventListener(_type: string, listener: (e: MessageEvent) => void) {
    this.listener = listener;
  }

  close() {}

  receive(data: unknown) {
    this.listener?.({ data } as MessageEvent);
  }
}

const g = globalThis as any;

beforeEach(() => {
  jest.useFakeTimers();
  FakeEventSource.instances = [];
  FakeBroadcastChannel.instances = [];
  g.EventSource = FakeEventSource;
  g.BroadcastChannel = FakeBroadcastChannel;
  delete (navigator as any).locks;
  _resetEventStream();
});

afterEach(() => {
  _resetEventStream();
  jest.useRealTimers();
  delete g.EventSource;
  delete g.BroadcastChannel;
  delete (navigator as any).locks;
});

function latestSource(): FakeEventSource {
  return FakeEventSource.instances[FakeEventSource.instances.length - 1];
}

describe('onEvent', () => {
  it('dispatches to type and wildcard handlers until unsubscribed', () => {
    initEventStream();
    const typed = jest.fn();
    const wildcard = jest.fn();
    const offTyped = onEvent('milestone_approved', typed);
    const offWildcard = onEvent('*', wildcard);

    latestSource().emit({ id: 1, type: 'milestone_approved' });
    expect(typed).toHaveBeenCalledWith({ id: 1, type: 'milestone_approved' });
    expect(wildcard).toHaveBeenCalledTimes(1);

    offTyped();
    offWildcard();
    latestSource().emit({ id: 2, type: 'milestone_approved' });
    expect(typed).toHaveBeenCalledTimes(1);
    expect(wildcard).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing handler from the others', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    initEventStream();
    const after = jest.fn();
    const wildcard = jest.fn(() => {
      throw new Error('wildcard boom');
    });
    onEvent('player_contacted', () => {
      throw new Error('boom');
    });
    onEvent('player_contacted', after);
    onEvent('*', wildcard);

    latestSource().emit({ id: 3, type: 'player_contacted' });

    expect(after).toHaveBeenCalled();
    expect(wildcard).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});

describe('initEventStream (no Web Locks: every tab connects)', () => {
  it('connects once, with the wallet filter in the URL', () => {
    initEventStream('GWALLET');
    initEventStream('GWALLET');

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(latestSource().url).toBe('/api/indexer/stream?wallet=GWALLET');
  });

  it('marks the stream healthy on open and broadcasts it', () => {
    initEventStream();
    expect(isHealthy()).toBe(false);

    latestSource().onopen?.();

    expect(isHealthy()).toBe(true);
    expect(FakeBroadcastChannel.instances[0].posted).toContainEqual({
      type: 'health',
      healthy: true,
    });
  });

  it('dispatches and rebroadcasts named events, ignoring malformed frames', () => {
    initEventStream();
    const handler = jest.fn();
    onEvent('fees_withdrawn', handler);
    const source = latestSource();

    source.emitNamed('fees_withdrawn', { id: 7, type: 'fees_withdrawn' });
    source.listeners.get('fees_withdrawn')?.({
      data: 'not json',
    } as MessageEvent);
    source.onmessage?.({ data: '{' } as MessageEvent);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(FakeBroadcastChannel.instances[0].posted).toContainEqual({
      type: 'event',
      payload: { id: 7, type: 'fees_withdrawn' },
    });
  });

  it('reconnects after an error, resuming from the last event id', () => {
    initEventStream();
    const first = latestSource();
    first.onopen?.();
    first.emit({ id: 42, type: 'scout_subscribed' });

    first.onerror?.();
    expect(first.closed).toBe(true);
    expect(isHealthy()).toBe(false);

    jest.advanceTimersByTime(3_000);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(latestSource().url).toBe('/api/indexer/stream?&lastEventId=42');
  });

  it('reconnects when the heartbeat goes quiet', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    initEventStream();
    const first = latestSource();
    first.onopen?.();

    jest.advanceTimersByTime(60_000);
    expect(first.closed).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    jest.advanceTimersByTime(1_000);
    expect(FakeEventSource.instances).toHaveLength(2);
    warnSpy.mockRestore();
  });
});

describe('initEventStream (Web Locks: one leader across tabs)', () => {
  it('connects only inside the lock callback', async () => {
    let grant: (() => Promise<void>) | null = null;
    (navigator as any).locks = {
      request: jest.fn((_name, _opts, cb) => {
        grant = cb;
        return Promise.resolve();
      }),
    };

    initEventStream();
    expect(FakeEventSource.instances).toHaveLength(0);

    void grant!();
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it('follower tabs dispatch events and health relayed over the channel', () => {
    (navigator as any).locks = { request: jest.fn(() => Promise.resolve()) };
    initEventStream();
    const handler = jest.fn();
    onEvent('player_registered', handler);
    const channel = FakeBroadcastChannel.instances[0];

    channel.receive({
      type: 'event',
      payload: { id: 1, type: 'player_registered' },
    });
    channel.receive({ type: 'health', healthy: true });

    expect(handler).toHaveBeenCalledWith({ id: 1, type: 'player_registered' });
    expect(isHealthy()).toBe(true);
  });
});
