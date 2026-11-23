/**
 * Unit tests for lib/approvalQueue.ts
 *
 * Same approach as __tests__/lib/onboardingSyncStore.test.ts: jsdom does not
 * implement IndexedDB, so `fake-indexeddb/auto` installs an in-memory
 * implementation before the module under test is imported.
 */
import 'fake-indexeddb/auto';

if (typeof (globalThis as any).structuredClone !== 'function') {
  (globalThis as any).structuredClone = (value: unknown) =>
    JSON.parse(JSON.stringify(value));
}

import {
  approvalIdempotencyKey,
  dismissApprovalIntent,
  enqueueApprovalIntent,
  getApprovalIntent,
  getApprovalIntents,
  isApprovalQueueAvailable,
  removeApprovalIntent,
  updateApprovalIntent,
} from '@/lib/approvalQueue';

let seq = 0;
function intentInput() {
  seq += 1;
  return {
    playerId: `player-${seq}`,
    milestone: `milestone-${seq}`,
    validator: 'GVALIDATOR',
  };
}

afterEach(async () => {
  for (const intent of await getApprovalIntents()) {
    await removeApprovalIntent(intent.idempotencyKey);
  }
});

describe('approvalIdempotencyKey', () => {
  it('is stable for the same input and differs across inputs', async () => {
    const input = intentInput();
    const a = await approvalIdempotencyKey(input);
    const b = await approvalIdempotencyKey({ ...input });
    const c = await approvalIdempotencyKey(intentInput());
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('falls back to a non-crypto hash when SubtleCrypto is unavailable', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', {
      value: {},
      configurable: true,
    });
    try {
      const input = intentInput();
      const key = await approvalIdempotencyKey(input);
      expect(key).toMatch(/^fallback-[0-9a-f]+$/);
      expect(await approvalIdempotencyKey(input)).toBe(key);
    } finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
    }
  });
});

describe('approval intent queue', () => {
  it('reports IndexedDB as available', () => {
    expect(isApprovalQueueAvailable()).toBe(true);
  });

  it('enqueues a pending intent and reads it back', async () => {
    const input = intentInput();
    const intent = await enqueueApprovalIntent(input);

    expect(intent).toMatchObject({
      ...input,
      status: 'pending',
      retryCount: 0,
    });
    expect(await getApprovalIntent(intent.idempotencyKey)).toEqual(intent);
  });

  it('returns the existing intent instead of queueing a duplicate', async () => {
    const input = intentInput();
    const first = await enqueueApprovalIntent(input);
    const second = await enqueueApprovalIntent({ ...input });

    expect(second).toEqual(first);
    expect(await getApprovalIntents()).toHaveLength(1);
  });

  it('lists intents oldest-first', async () => {
    // Pin the clock for each whole enqueue (not mockReturnValueOnce):
    // fake-indexeddb reads Date.now itself, which would consume a one-shot.
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(2_000);
    const later = await enqueueApprovalIntent(intentInput());
    now.mockReturnValue(1_000);
    const earlier = await enqueueApprovalIntent(intentInput());
    now.mockRestore();

    const keys = (await getApprovalIntents()).map((i) => i.idempotencyKey);
    expect(keys).toEqual([earlier.idempotencyKey, later.idempotencyKey]);
  });

  it('returns null for an unknown key', async () => {
    expect(await getApprovalIntent('missing')).toBeNull();
    expect(
      await updateApprovalIntent('missing', { status: 'failed' }),
    ).toBeNull();
  });

  it('patches an intent and bumps updatedAt', async () => {
    const intent = await enqueueApprovalIntent(intentInput());
    const now = jest.spyOn(Date, 'now').mockReturnValue(intent.updatedAt + 5);

    const updated = await updateApprovalIntent(intent.idempotencyKey, {
      status: 'confirmed',
      txHash: 'abc',
    });
    now.mockRestore();

    expect(updated).toMatchObject({
      status: 'confirmed',
      txHash: 'abc',
      updatedAt: intent.updatedAt + 5,
    });
    expect(await getApprovalIntent(intent.idempotencyKey)).toEqual(updated);
  });

  it('removes and dismisses intents', async () => {
    const a = await enqueueApprovalIntent(intentInput());
    const b = await enqueueApprovalIntent(intentInput());

    await removeApprovalIntent(a.idempotencyKey);
    await dismissApprovalIntent(b.idempotencyKey);

    expect(await getApprovalIntents()).toEqual([]);
  });
});
