import chatApi from './chatApi';

/**
 * Read-receipt helpers layered on top of the chat API. Read state is only
 * broadcast to the sender when the recipient has not opted out via the
 * notification-preferences panel (see NOTIFICATION_PREF_READ_RECEIPTS_KEY).
 */
export const NOTIFICATION_PREF_READ_RECEIPTS_KEY = 'read_receipts_enabled';

export function readReceiptsEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = window.localStorage.getItem(
    NOTIFICATION_PREF_READ_RECEIPTS_KEY,
  );
  return stored === null ? true : stored === 'true';
}

export function setReadReceiptsEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    NOTIFICATION_PREF_READ_RECEIPTS_KEY,
    String(enabled),
  );
}

export async function reportThreadRead(threadId: string): Promise<void> {
  if (!readReceiptsEnabled()) return;
  await chatApi.post(`/threads/${threadId}/read`);
}
