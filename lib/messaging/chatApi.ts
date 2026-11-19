import api from '@/lib/api';

/**
 * Canonical client for the Node.js off-chain chat/comments API referenced in
 * CONTRIBUTING.md and the architecture diagram — persists message history
 * for a scout/player thread once pay-to-contact has been unlocked. Reuses the
 * shared axios instance from lib/api.ts (base URL resolution + interceptors).
 * The sender is always derived server-side from the session; never send it.
 */
const chatApi = api;

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
  status: 'sent' | 'delivered' | 'read';
}

export interface FetchThreadMessagesOptions {
  /** Return messages older than this message id (cursor pagination). */
  before?: string;
  /** Max number of messages to return. */
  limit?: number;
  signal?: AbortSignal;
}

export async function fetchThreadMessages(
  threadId: string,
  options: FetchThreadMessagesOptions | AbortSignal = {},
): Promise<ChatMessage[]> {
  // Backwards compatible: callers may still pass an AbortSignal directly.
  const opts: FetchThreadMessagesOptions =
    options instanceof AbortSignal ? { signal: options } : options;

  const params: Record<string, string | number> = {};
  if (opts.before) params.before = opts.before;
  if (typeof opts.limit === 'number') params.limit = opts.limit;

  const { data } = await chatApi.get<ChatMessage[]>(
    `/threads/${threadId}/messages`,
    { params, signal: opts.signal },
  );
  return data;
}

export async function sendThreadMessage(
  threadId: string,
  body: string,
): Promise<ChatMessage> {
  const { data } = await chatApi.post<ChatMessage>(
    `/threads/${threadId}/messages`,
    { body },
  );
  return data;
}

export async function markThreadRead(threadId: string): Promise<void> {
  await chatApi.post(`/threads/${threadId}/read`);
}

export default chatApi;
