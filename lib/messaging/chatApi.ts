import axios from 'axios';

/**
 * Client for the Node.js off-chain chat/comments API referenced in
 * CONTRIBUTING.md and the architecture diagram — persists message history
 * for a scout/player thread once pay-to-contact has been unlocked.
 */
const chatApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  headers: { 'Content-Type': 'application/json' },
  timeout: 5000,
});

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: string;
  status: 'sent' | 'delivered' | 'read';
}

export async function fetchThreadMessages(
  threadId: string,
): Promise<ChatMessage[]> {
  const { data } = await chatApi.get<ChatMessage[]>(
    `/threads/${threadId}/messages`,
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
