/**
 * Unit tests for lib/offlineQueue.ts
 *
 * offlineQueue.ts is backed by IndexedDB, which jsdom does not implement.
 * `fake-indexeddb/auto` installs an in-memory IndexedDB implementation on
 * the global object before the module under test is imported, so the real
 * (unmocked) module code — including the `onupgradeneeded` object-store
 * creation path — runs against a working, spec-compliant IndexedDB.
 */
import 'fake-indexeddb/auto';

// jest-environment-jsdom does not expose Node's global `structuredClone` on
// the jsdom global object, but fake-indexeddb uses it to clone values on
// insertion (mirroring real IndexedDB's structured-clone storage semantics).
if (typeof (globalThis as any).structuredClone !== 'function') {
  (globalThis as any).structuredClone = (value: unknown) =>
    JSON.parse(JSON.stringify(value));
}

import {
  enqueueAction,
  getQueuedActions,
  removeAction,
  markRetry,
  getQueueLength,
  registerHandler,
  processQueue,
  hasQueuedActions,
  getFailedActions,
  getFailedCount,
  discardFailedAction,
  discardAllFailedActions,
  OfflineQueueError,
  OfflineQueueConflictError,
  MAX_RETRIES,
  MAX_DELAY_MS,
  type FailedAction,
  type QueuedAction,
} from '@/lib/offlineQueue';

// The module caches its IDBDatabase connection in a module-level variable,
// and registered handlers live in a module-level Map — both persist across
// tests in this file. Draining both stores after each test keeps tests
// independent without fighting the module's intentional singleton-connection design.
async function drainQueue(): Promise<void> {
  const actions = await getQueuedActions();
  for (const action of actions) {
    await removeAction(action.id);
  }
}

async function drainFailed(): Promise<void> {
  await discardAllFailedActions();
}

afterEach(async () => {
  await drainQueue();
  await drainFailed();
  jest.restoreAllMocks();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Enqueue actions with guaranteed distinct queuedAt timestamps by awaiting a
 * 1ms gap between enqueues. This is required because the queuedAt index in
 * IndexedDB only guarantees non-decreasing order — ties are unspecified.
 */
async function enqueueSequential(
  type: string,
  payloads: unknown[],
): Promise<string[]> {
  const ids: string[] = [];
  for (const payload of payloads) {
    ids.push(await enqueueAction(type, payload));
    await new Promise((r) => setTimeout(r, 1));
  }
  return ids;
}

// ── OfflineQueueError ────────────────────────────────────────────────────────

describe('OfflineQueueError', () => {
  it('creates a permanent error with permanent=true', () => {
    const err = new OfflineQueueError('Validation failed', { permanent: true });
    expect(err.permanent).toBe(true);
    expect(err.message).toBe('Validation failed');
    expect(err.name).toBe('OfflineQueueError');
    expect(err).toBeInstanceOf(Error);
  });

  it('creates a transient error with permanent=false', () => {
    const err = new OfflineQueueError('Service unavailable', {
      permanent: false,
    });
    expect(err.permanent).toBe(false);
  });
});

// ── enqueueAction ────────────────────────────────────────────────────────────

describe('enqueueAction', () => {
  it('returns a generated id prefixed with the action type', async () => {
    const id = await enqueueAction('update_profile', { name: 'Ada' });
    expect(id).toMatch(/^update_profile_\d+_[a-z0-9]+$/);
  });

  it('persists the action so it shows up in getQueuedActions', async () => {
    const id = await enqueueAction('update_profile', { name: 'Ada' });
    const actions = await getQueuedActions();
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      id,
      type: 'update_profile',
      payload: { name: 'Ada' },
      retryCount: 0,
    });
    expect(typeof actions[0].queuedAt).toBe('number');
  });

  it('assigns distinct ids to successive enqueues of the same type', async () => {
    const id1 = await enqueueAction('submit_comment', { text: 'a' });
    const id2 = await enqueueAction('submit_comment', { text: 'b' });
    expect(id1).not.toBe(id2);
  });
});

// ── getQueuedActions ─────────────────────────────────────────────────────────

describe('getQueuedActions', () => {
  it('returns an empty array when nothing is queued', async () => {
    await expect(getQueuedActions()).resolves.toEqual([]);
  });

  it('returns actions sorted non-decreasing by queuedAt', async () => {
    // Use sequential enqueue to guarantee distinct timestamps.
    await enqueueSequential('type_abc', [{}, {}, {}]);

    const actions = await getQueuedActions();
    expect(actions).toHaveLength(3);
    for (let i = 1; i < actions.length; i++) {
      expect(actions[i].queuedAt).toBeGreaterThanOrEqual(
        actions[i - 1].queuedAt,
      );
    }
  });
});

// ── removeAction ─────────────────────────────────────────────────────────────

describe('removeAction', () => {
  it('removes the matching action from the queue', async () => {
    const [id1, id2] = await enqueueSequential('type_rm', [{}, {}]);

    await removeAction(id1);

    const remaining = await getQueuedActions();
    expect(remaining.map((a) => a.id)).toEqual([id2]);
  });

  it('resolves without throwing when the id does not exist', async () => {
    await expect(removeAction('nonexistent-id')).resolves.toBeUndefined();
  });
});

// ── markRetry ────────────────────────────────────────────────────────────────

describe('markRetry', () => {
  it('increments retryCount for the matching action', async () => {
    const id = await enqueueAction('type_a', {});

    await markRetry(id);

    const [action] = await getQueuedActions();
    expect(action.retryCount).toBe(1);
  });

  it('sets nextRetryAt to a future time', async () => {
    const before = Date.now();
    const id = await enqueueAction('type_a', {});

    await markRetry(id);

    const [action] = await getQueuedActions();
    expect(action.nextRetryAt).toBeGreaterThan(before);
  });

  it('uses increasing backoff on successive calls', async () => {
    const id = await enqueueAction('type_a', {});

    // First markRetry: retryCount 0→1, delay based on 2^0 * BASE_DELAY
    await markRetry(id);
    const [a1] = await getQueuedActions();
    const t1 = a1.nextRetryAt ?? 0;

    // Second markRetry: retryCount 1→2, delay based on 2^1 * BASE_DELAY
    await markRetry(id);
    const [a2] = await getQueuedActions();
    const t2 = a2.nextRetryAt ?? 0;

    // The second window should be set to a time after the first
    expect(t2).toBeGreaterThanOrEqual(t1);
  });

  it('caps the delay at MAX_DELAY_MS', async () => {
    const id = await enqueueAction('type_a', {});

    // Call markRetry many times to exhaust the exponential cap
    for (let i = 0; i < 10; i++) {
      await markRetry(id);
    }
    const [updated] = await getQueuedActions();
    const maxPossible = Date.now() + MAX_DELAY_MS + 1_000; // +1s epsilon for test timing
    expect(updated.nextRetryAt ?? 0).toBeLessThanOrEqual(maxPossible);
  });

  it('increments again on a second call', async () => {
    const id = await enqueueAction('type_a', {});

    await markRetry(id);
    await markRetry(id);

    const [action] = await getQueuedActions();
    expect(action.retryCount).toBe(2);
  });

  it('resolves without throwing when the id does not exist', async () => {
    await expect(markRetry('nonexistent-id')).resolves.toBeUndefined();
  });
});

// ── getQueueLength / hasQueuedActions ────────────────────────────────────────

describe('getQueueLength', () => {
  it('returns 0 for an empty queue', async () => {
    await expect(getQueueLength()).resolves.toBe(0);
  });

  it('returns the number of queued actions', async () => {
    await enqueueAction('type_a', {});
    await enqueueAction('type_b', {});

    await expect(getQueueLength()).resolves.toBe(2);
  });
});

describe('hasQueuedActions', () => {
  it('returns false for an empty queue', async () => {
    await expect(hasQueuedActions()).resolves.toBe(false);
  });

  it('returns true when at least one action is queued', async () => {
    await enqueueAction('type_a', {});
    await expect(hasQueuedActions()).resolves.toBe(true);
  });
});

// ── Dead-letter store operations ─────────────────────────────────────────────

describe('getFailedActions / getFailedCount', () => {
  it('returns an empty array when nothing is failed', async () => {
    await expect(getFailedActions()).resolves.toEqual([]);
    await expect(getFailedCount()).resolves.toBe(0);
  });
});

describe('discardFailedAction', () => {
  it('resolves without throwing when the id does not exist', async () => {
    await expect(discardFailedAction('nonexistent')).resolves.toBeUndefined();
  });
});

describe('discardAllFailedActions', () => {
  it('resolves without throwing when there is nothing to clear', async () => {
    await expect(discardAllFailedActions()).resolves.toBeUndefined();
  });
});

// ── registerHandler / processQueue ───────────────────────────────────────────

describe('registerHandler / processQueue — basic behaviour', () => {
  it('processes a queued action with a registered handler and removes it', async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    registerHandler('process_success', handler);

    await enqueueAction('process_success', { foo: 'bar' });
    const processed = await processQueue();

    expect(processed).toBe(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'process_success',
        payload: { foo: 'bar' },
      }),
    );
    await expect(getQueuedActions()).resolves.toEqual([]);
  });

  it('skips actions whose type has no registered handler', async () => {
    await enqueueAction('no_handler_registered_type_x', {});
    const processed = await processQueue();

    expect(processed).toBe(0);
    const remaining = await getQueuedActions();
    expect(remaining).toHaveLength(1);
  });

  it('processes multiple successful actions in enqueue order', async () => {
    const order: number[] = [];
    registerHandler('process_multi_order2', (a) => {
      order.push((a.payload as { n: number }).n);
      return Promise.resolve();
    });

    // Use sequential enqueue to guarantee distinct queuedAt timestamps
    // so the IDB queuedAt index returns them in insertion order.
    await enqueueSequential('process_multi_order2', [{ n: 1 }, { n: 2 }]);

    const processed = await processQueue();

    expect(processed).toBe(2);
    expect(order).toEqual([1, 2]);
    await expect(getQueuedActions()).resolves.toEqual([]);
  });

  it('returns 0 when the queue is empty', async () => {
    await expect(processQueue()).resolves.toBe(0);
  });
});

// ── Acceptance criterion 1: no head-of-line blocking ─────────────────────────

describe('Acceptance: head-of-line-blocking fix', () => {
  /**
   * AC1 — Enqueue 3 actions where the first's handler always rejects
   * (permanent-style error). The second and third must still be attempted
   * and can succeed — not blocked behind the first.
   */
  it('continues past a permanently-failing first action and processes later actions', async () => {
    const successLog: string[] = [];

    // First action: always fails with a permanent error
    registerHandler('perm_fail_type', () =>
      Promise.reject(
        new OfflineQueueError('422 validation error', { permanent: true }),
      ),
    );

    // Second and third: succeed
    registerHandler('ok_type_ac1', (a) => {
      successLog.push((a.payload as { n: number }).n.toString());
      return Promise.resolve();
    });

    // Use sequential enqueue so the queue order is deterministic
    const [id1] = await enqueueSequential('perm_fail_type', [{ data: 'bad' }]);
    await enqueueSequential('ok_type_ac1', [{ n: 2 }, { n: 3 }]);

    const processed = await processQueue();

    // Second and third actions succeeded
    expect(processed).toBe(2);
    expect(successLog.sort()).toEqual(['2', '3']);

    // First action moved to dead-letter, not in active queue
    const remaining = await getQueuedActions();
    expect(remaining.find((a) => a.id === id1)).toBeUndefined();

    const failed = await getFailedActions();
    expect(failed).toHaveLength(1);
    expect(failed[0].type).toBe('perm_fail_type');
    expect(failed[0].lastError).toBe('422 validation error');
  });

  it('continues past a transient-failing first action and processes later actions in the same pass', async () => {
    const successLog: string[] = [];

    registerHandler('transient_blocker', () =>
      Promise.reject(new Error('network blip')),
    );
    registerHandler('ok_type_ac1b', (a) => {
      successLog.push((a.payload as { n: number }).n.toString());
      return Promise.resolve();
    });

    const [failId] = await enqueueSequential('transient_blocker', [
      { data: 'will-retry' },
    ]);
    await enqueueSequential('ok_type_ac1b', [{ n: 2 }, { n: 3 }]);

    const processed = await processQueue();

    // Second and third succeed; first is rescheduled
    expect(processed).toBe(2);
    expect(successLog.sort()).toEqual(['2', '3']);

    // First action remains in active queue (transient, within retry cap)
    const remaining = await getQueuedActions();
    const failedAction = remaining.find((a) => a.id === failId);
    expect(failedAction).toBeDefined();
    expect(failedAction!.retryCount).toBe(1);
    expect(failedAction!.nextRetryAt).toBeGreaterThan(Date.now());

    // Nothing in dead-letter yet
    await expect(getFailedCount()).resolves.toBe(0);
  });
});

// ── Acceptance criterion 2: transient vs. permanent failure handling ──────────

describe('Acceptance: transient vs. permanent failure classification', () => {
  /**
   * AC2a — A permanent failure (OfflineQueueError permanent=true) is
   * evicted to the dead-letter store immediately, without waiting for MAX_RETRIES.
   */
  it('dead-letters an action on the first permanent failure', async () => {
    registerHandler('perm_fail_instant', () =>
      Promise.reject(
        new OfflineQueueError('Cannot process — payload invalid', {
          permanent: true,
        }),
      ),
    );

    const id = await enqueueAction('perm_fail_instant', { bad: true });
    await processQueue();

    // Removed from active queue
    const active = await getQueuedActions();
    expect(active.find((a) => a.id === id)).toBeUndefined();

    // In dead-letter store
    const failed = await getFailedActions();
    expect(failed).toHaveLength(1);
    expect(failed[0].id).toBe(id);
    expect(failed[0].lastError).toBe('Cannot process — payload invalid');
    expect(typeof failed[0].failedAt).toBe('number');
    // retryCount stays at 0 — we dead-lettered without going through markRetry
    expect(failed[0].retryCount).toBe(0);
  });

  /**
   * AC2b — A transient failure does NOT evict the action after a single
   * failure. It remains in the active queue for retry.
   */
  it('keeps an action in the active queue after a single transient failure', async () => {
    let calls = 0;
    registerHandler('transient_single', () => {
      calls++;
      return Promise.reject(new Error('503 service unavailable'));
    });

    const id = await enqueueAction('transient_single', {});
    await processQueue();

    expect(calls).toBe(1);

    const active = await getQueuedActions();
    const action = active.find((a) => a.id === id);
    expect(action).toBeDefined();
    expect(action!.retryCount).toBe(1);

    // Not in dead-letter
    await expect(getFailedCount()).resolves.toBe(0);
  });

  /**
   * AC2c — A transient failure that reaches MAX_RETRIES IS dead-lettered.
   * We set up a handler that always fails, then use Date.now mock to make
   * nextRetryAt always appear elapsed, and drive retryCount to MAX_RETRIES.
   */
  it('dead-letters a transient-failing action that has reached MAX_RETRIES', async () => {
    registerHandler('transient_exhausted2', () =>
      Promise.reject(new Error('persistent network error')),
    );

    const id = await enqueueAction('transient_exhausted2', { v: 2 });

    // Mock Date.now to always return a far-future value.
    // This means nextRetryAt set by markRetry will be farFuture + delay,
    // but our processQueue also reads Date.now() = farFuture, so we need
    // nextRetryAt <= now for the action to be eligible.
    //
    // Strategy: mock Date.now to always advance so nextRetryAt is always
    // less than "current" time on the next processQueue call.
    // We use a counter that increments by MAX_DELAY_MS * 2 each call.
    let mockTime = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => {
      mockTime += MAX_DELAY_MS * 2;
      return mockTime;
    });

    // Drive MAX_RETRIES failures
    for (let i = 0; i < MAX_RETRIES; i++) {
      await processQueue();
    }

    // At this point retryCount == MAX_RETRIES; the next pass should dead-letter
    await processQueue();

    jest.restoreAllMocks();

    const finalActive = await getQueuedActions();
    expect(finalActive.find((a) => a.id === id)).toBeUndefined();

    const failed = await getFailedActions();
    const deadAction = failed.find((a) => a.id === id);
    expect(deadAction).toBeDefined();
    expect(deadAction!.lastError).toBe('persistent network error');
    expect(deadAction!.retryCount).toBe(MAX_RETRIES);
  });

  /**
   * AC2d — A plain Error (not OfflineQueueError) is treated as transient.
   */
  it('treats a plain Error as transient (not permanently evicted)', async () => {
    registerHandler('plain_error_type', () =>
      Promise.reject(new Error('something went wrong')),
    );

    const id = await enqueueAction('plain_error_type', {});
    await processQueue();

    const active = await getQueuedActions();
    expect(active.find((a) => a.id === id)).toBeDefined();
    await expect(getFailedCount()).resolves.toBe(0);
  });

  /**
   * AC2e — OfflineQueueError with permanent=false is treated as transient.
   */
  it('treats OfflineQueueError(permanent=false) as transient', async () => {
    registerHandler('transient_oeq_type', () =>
      Promise.reject(
        new OfflineQueueError('temporarily unavailable', { permanent: false }),
      ),
    );

    const id = await enqueueAction('transient_oeq_type', {});
    await processQueue();

    const active = await getQueuedActions();
    expect(active.find((a) => a.id === id)).toBeDefined();
    await expect(getFailedCount()).resolves.toBe(0);
  });
});

// ── Acceptance criterion 3: rapid triggers do not hammer within backoff ───────

describe('Acceptance: rapid triggers respect backoff schedule', () => {
  /**
   * AC3 — Repeated processQueue() calls triggered quickly (simulating rapid
   * online events) do NOT re-attempt an action within its backoff window.
   * The action is skipped on subsequent passes until nextRetryAt has elapsed.
   */
  it('skips a recently-failed action when its nextRetryAt is in the future', async () => {
    let callCount = 0;
    registerHandler('backoff_test_type', () => {
      callCount++;
      return Promise.reject(new Error('transient'));
    });

    await enqueueAction('backoff_test_type', {});

    // First pass: action is eligible (no nextRetryAt), so it gets attempted
    await processQueue();
    expect(callCount).toBe(1);

    // Subsequent rapid passes: nextRetryAt is in the future, so action is skipped
    await processQueue();
    await processQueue();
    await processQueue();
    expect(callCount).toBe(1); // still only 1 attempt

    // Action remains in queue
    const active = await getQueuedActions();
    expect(active).toHaveLength(1);
    expect(active[0].retryCount).toBe(1);
  });

  it('retries the action after nextRetryAt has elapsed', async () => {
    let callCount = 0;
    registerHandler('backoff_elapsed_type2', () => {
      callCount++;
      if (callCount < 3) return Promise.reject(new Error('still transient'));
      return Promise.resolve(); // succeeds on 3rd attempt
    });

    await enqueueAction('backoff_elapsed_type2', {});

    // First pass: attempted, fails, nextRetryAt set to future
    await processQueue();
    expect(callCount).toBe(1);

    // Verify it's skipped when backoff hasn't elapsed
    await processQueue();
    expect(callCount).toBe(1);

    // Mock Date.now to return a value far past the nextRetryAt
    // Get the current nextRetryAt and simulate time passing beyond it
    const [action] = await getQueuedActions();
    const futureTime = (action.nextRetryAt ?? 0) + MAX_DELAY_MS + 1;

    jest.spyOn(Date, 'now').mockReturnValue(futureTime);

    // Second pass: nextRetryAt is now in the past, action is eligible again
    await processQueue();
    expect(callCount).toBe(2);

    // Third pass: action attempted again — succeeds
    // But since the second failure also sets nextRetryAt, we need to advance time again
    const [action2] = await getQueuedActions();
    const futureTime2 = (action2.nextRetryAt ?? 0) + MAX_DELAY_MS + 1;
    jest.spyOn(Date, 'now').mockReturnValue(futureTime2);

    await processQueue();
    expect(callCount).toBe(3);

    jest.restoreAllMocks();

    // Action removed after success
    await expect(getQueuedActions()).resolves.toHaveLength(0);
  });
});

// ── Dead-letter store: discard operations ────────────────────────────────────

describe('discardFailedAction / discardAllFailedActions', () => {
  it('discardFailedAction removes a single failed action from the dead-letter store', async () => {
    registerHandler('perm_fail_discard1', () =>
      Promise.reject(new OfflineQueueError('gone', { permanent: true })),
    );

    const [id1, id2] = await enqueueSequential('perm_fail_discard1', [
      { n: 1 },
      { n: 2 },
    ]);
    await processQueue();

    let failed = await getFailedActions();
    expect(failed).toHaveLength(2);

    await discardFailedAction(id1);

    failed = await getFailedActions();
    expect(failed).toHaveLength(1);
    expect(failed[0].id).toBe(id2);
  });

  it('discardAllFailedActions clears every dead-lettered action', async () => {
    registerHandler('perm_fail_discard_all', () =>
      Promise.reject(new OfflineQueueError('gone', { permanent: true })),
    );

    await enqueueSequential('perm_fail_discard_all', [{ n: 1 }, { n: 2 }]);
    await processQueue();

    await expect(getFailedCount()).resolves.toBe(2);

    await discardAllFailedActions();

    await expect(getFailedCount()).resolves.toBe(0);
    await expect(getFailedActions()).resolves.toEqual([]);
  });

  it('discardFailedAction resolves silently for a non-existent id', async () => {
    await expect(
      discardFailedAction('non-existent-id'),
    ).resolves.toBeUndefined();
  });
});

// ── FailedAction shape ────────────────────────────────────────────────────────

describe('FailedAction shape in dead-letter store', () => {
  it('preserves the original action fields and adds failedAt and lastError', async () => {
    registerHandler('shape_check_type', () =>
      Promise.reject(
        new OfflineQueueError('Bad payload — will not be accepted', {
          permanent: true,
        }),
      ),
    );

    const before = Date.now();
    const id = await enqueueAction('shape_check_type', { key: 'value' });
    await processQueue();
    const after = Date.now();

    const failed = await getFailedActions();
    expect(failed).toHaveLength(1);

    const f = failed[0] as FailedAction;
    expect(f.id).toBe(id);
    expect(f.type).toBe('shape_check_type');
    expect(f.payload).toEqual({ key: 'value' });
    expect(f.retryCount).toBe(0);
    expect(f.failedAt).toBeGreaterThanOrEqual(before);
    expect(f.failedAt).toBeLessThanOrEqual(after + 100);
    expect(f.lastError).toBe('Bad payload — will not be accepted');
  });
});

// ── Ordering guarantee ────────────────────────────────────────────────────────

describe('Ordering: same-type actions process in enqueue order', () => {
  it('processes successful same-type actions in enqueue order', async () => {
    const processed: number[] = [];
    registerHandler('ordered_type2', (a) => {
      processed.push((a.payload as { seq: number }).seq);
      return Promise.resolve();
    });

    // Sequential enqueue guarantees distinct queuedAt timestamps and thus
    // deterministic ordering from the queuedAt index.
    await enqueueSequential('ordered_type2', [
      { seq: 1 },
      { seq: 2 },
      { seq: 3 },
      { seq: 4 },
      { seq: 5 },
    ]);

    await processQueue();

    expect(processed).toEqual([1, 2, 3, 4, 5]);
  });
});

// ── Acceptance criterion 4 (issue #1178): multi-tab/device conflict resolution ─

describe('Acceptance: conflict resolution for the same record from multiple tabs/devices', () => {
  /**
   * A tiny in-memory stand-in for "the backend" — a single versioned record,
   * shared by the handler across this describe block, mimicking a server
   * enforcing optimistic concurrency (compare-and-swap on `version`).
   */
  function makeFakeServerRecord(initialValue: string) {
    return { value: initialValue, version: 1 };
  }

  /**
   * A handler that behaves like a real optimistic-concurrency-checked API:
   * accepts the queued action's `baseVersion`, rejects with
   * `OfflineQueueConflictError` (as if the server had returned 409) when it
   * no longer matches the record's current version, and otherwise applies
   * the write and bumps the version — exactly the contract
   * `lib/notificationPreferencesStore.ts`'s `setWithVersionCheck` /
   * `app/api/notification-preferences/route.ts` implement for real.
   */
  function makeVersionCheckedHandler(record: {
    value: string;
    version: number;
  }) {
    return async (action: QueuedAction) => {
      const { value } = action.payload as { value: string };
      if (
        action.baseVersion !== undefined &&
        action.baseVersion !== record.version
      ) {
        throw new OfflineQueueConflictError(
          'Record changed elsewhere since this action was queued',
          { serverVersion: record.version, serverPayload: record.value },
        );
      }
      record.value = value;
      record.version += 1;
    };
  }

  it('carries baseVersion on the queued action, captured at enqueue time', async () => {
    const id = await enqueueAction(
      'versioned_type_carry',
      { value: 'x' },
      { baseVersion: 7 },
    );
    const [action] = await getQueuedActions();
    expect(action.id).toBe(id);
    expect(action.baseVersion).toBe(7);
  });

  it('does not set baseVersion when the caller omits it (single-tab happy path unaffected)', async () => {
    await enqueueAction('versioned_type_omit', { value: 'x' });
    const [action] = await getQueuedActions();
    expect(action.baseVersion).toBeUndefined();
  });

  /**
   * The core acceptance scenario: two tabs (or devices) each queue an
   * update to the *same* record while offline, both based on the record's
   * original version. After reconnect, both queues flush. The first flush
   * to reach the server succeeds and advances the record's version; the
   * second must be detected as a conflict (its `baseVersion` is now stale)
   * and rejected — not silently applied on top of the first.
   */
  it('detects a conflict when two tabs both flush a queued update to the same record', async () => {
    const record = makeFakeServerRecord('original');
    const handlerType = 'update_shared_record';
    registerHandler(handlerType, makeVersionCheckedHandler(record));

    // Both tabs read the record at version 1 before going offline, then
    // each queues its own (different) edit based on that same version.
    const originalVersionSeenByBothTabs = record.version; // 1
    const tabAActionId = await enqueueAction(
      handlerType,
      { value: 'edited-by-tab-A' },
      { baseVersion: originalVersionSeenByBothTabs },
    );
    // Guarantee a distinct queuedAt so processing order is deterministic.
    await new Promise((r) => setTimeout(r, 1));
    const tabBActionId = await enqueueAction(
      handlerType,
      { value: 'edited-by-tab-B' },
      { baseVersion: originalVersionSeenByBothTabs },
    );

    // Reconnect: both queues flush in the same pass (simulating near-
    // simultaneous 'online' events across tabs/devices).
    const processed = await processQueue();

    // Tab A's write landed first and applied cleanly.
    expect(processed).toBe(1);
    expect(record.value).toBe('edited-by-tab-A');
    expect(record.version).toBe(2);

    // Tab A's action is gone from both the active queue and dead-letter store.
    const active = await getQueuedActions();
    expect(active.find((a) => a.id === tabAActionId)).toBeUndefined();

    // Tab B's action was NOT silently applied on top of Tab A's write —
    // it was detected as a conflict and dead-lettered instead of
    // clobbering the record or being blindly retried.
    expect(active.find((a) => a.id === tabBActionId)).toBeUndefined();
    expect(record.value).not.toBe('edited-by-tab-B');

    const failed = await getFailedActions();
    const tabBFailure = failed.find((a) => a.id === tabBActionId);
    expect(tabBFailure).toBeDefined();
    expect(tabBFailure!.conflict).toBe(true);
    expect(tabBFailure!.serverVersion).toBe(2);
    expect(tabBFailure!.serverPayload).toBe('edited-by-tab-A');
    expect(tabBFailure!.lastError).toBe(
      'Record changed elsewhere since this action was queued',
    );
  });

  it('does not retry a conflicted action on a later pass (retrying would not help — baseVersion is stale)', async () => {
    const record = makeFakeServerRecord('original');
    const handlerType = 'update_shared_record_no_retry';
    const handler = jest.fn(makeVersionCheckedHandler(record));
    registerHandler(handlerType, handler);

    await enqueueAction(handlerType, { value: 'first' }, { baseVersion: 1 });
    await processQueue(); // applies, version -> 2

    await enqueueAction(handlerType, { value: 'stale' }, { baseVersion: 1 });
    await processQueue(); // conflict, dead-lettered
    handler.mockClear();

    // A later pass (e.g. the user retries, or another 'online' event fires)
    // must not re-invoke the handler for the dead-lettered conflict.
    await processQueue();
    expect(handler).not.toHaveBeenCalled();

    await expect(getFailedCount()).resolves.toBe(1);
  });

  it('applies cleanly with no conflict when only one tab has queued a change (single-tab happy path)', async () => {
    const record = makeFakeServerRecord('original');
    const handlerType = 'update_shared_record_single_tab';
    registerHandler(handlerType, makeVersionCheckedHandler(record));

    await enqueueAction(
      handlerType,
      { value: 'solo-edit' },
      { baseVersion: record.version },
    );

    const processed = await processQueue();

    expect(processed).toBe(1);
    expect(record.value).toBe('solo-edit');
    await expect(getQueuedActions()).resolves.toEqual([]);
    await expect(getFailedCount()).resolves.toBe(0);
  });
});

// ── Regression: old blocking test rewritten ──────────────────────────────────

describe('Regression: processQueue no longer blocks on first failure', () => {
  /**
   * The old test asserted blocking behaviour ("stops processing on handler failure").
   * The new behaviour is the opposite: failures are isolated and the queue continues.
   * This test is the canonical regression guard.
   */
  it('continues processing the queue past a failing first action', async () => {
    const failingHandler = jest
      .fn()
      .mockRejectedValue(new Error('network down'));
    const successHandler = jest.fn().mockResolvedValue(undefined);

    registerHandler('regression_fail', failingHandler);
    registerHandler('regression_success', successHandler);

    await enqueueSequential('regression_fail', [{}]);
    await enqueueSequential('regression_success', [{ n: 2 }, { n: 3 }]);

    const processed = await processQueue();

    // The two success actions were processed
    expect(processed).toBe(2);
    expect(successHandler).toHaveBeenCalledTimes(2);

    // The failing action was attempted exactly once (not zero — not skipped entirely)
    expect(failingHandler).toHaveBeenCalledTimes(1);

    // Failing action remains in active queue (transient error, within retry cap)
    const remaining = await getQueuedActions();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].type).toBe('regression_fail');
  });
});
