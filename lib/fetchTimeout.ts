/** Runs an upstream request with a timeout and optional caller cancellation. */
export async function withTimeoutSignal<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort(parentSignal?.reason);

  if (parentSignal?.aborted) {
    onParentAbort();
  } else {
    parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  }

  // #1778: abort with a TimeoutError reason (like AbortSignal.timeout) so
  // callers can tell a timeout from a caller cancellation.
  const timeout = setTimeout(
    () =>
      controller.abort(
        new DOMException(`Timed out after ${timeoutMs} ms`, 'TimeoutError'),
      ),
    timeoutMs,
  );

  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}

/** Whether `err` is the abort reason of a timed-out `withTimeoutSignal` call. */
export function isTimeoutError(err: unknown): boolean {
  return (
    (err instanceof Error || err instanceof DOMException) &&
    err.name === 'TimeoutError'
  );
}
