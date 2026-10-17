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

  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', onParentAbort);
  }
}
