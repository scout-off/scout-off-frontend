function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Returns a usable message for any thrown value, never an empty string. */
export function getErrorMessage(
  error: unknown,
  fallback = 'An unexpected error occurred.',
): string {
  const fallbackMessage =
    nonEmptyString(fallback) ?? 'An unexpected error occurred.';
  if (isRecord(error)) {
    const response = error.response;
    const responseData = isRecord(response) ? response.data : undefined;
    const upstreamMessage = isRecord(responseData)
      ? nonEmptyString(responseData.error)
      : undefined;
    if (upstreamMessage) return upstreamMessage;
  }

  if (error instanceof Error) {
    return nonEmptyString(error.message) ?? fallbackMessage;
  }

  const message = isRecord(error) ? nonEmptyString(error.message) : undefined;
  if (message) return message;
  return nonEmptyString(error) ?? fallbackMessage;
}
