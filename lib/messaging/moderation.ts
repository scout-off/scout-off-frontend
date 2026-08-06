import chatApi from './chatApi';

/**
 * Report/block actions for direct messaging threads. Reports route to a
 * moderation queue on the chat API; blocks are enforced server-side to stop
 * further messages and pay-to-contact unlocks from the blocked party.
 */
export interface BlockedUser {
  userId: string;
  blockedAt: string;
}

const BLOCKED_USERS_KEY = 'scoutoff_blocked_users';

export async function reportUser(
  threadId: string,
  counterpartId: string,
  reason: string,
): Promise<void> {
  await chatApi.post('/moderation/reports', {
    threadId,
    counterpartId,
    reason,
  });
}

export async function blockUser(counterpartId: string): Promise<void> {
  await chatApi.post('/moderation/blocks', { counterpartId });
  const blocked = getBlockedUsers();
  if (!blocked.some((b) => b.userId === counterpartId)) {
    blocked.push({
      userId: counterpartId,
      blockedAt: new Date().toISOString(),
    });
    persistBlockedUsers(blocked);
  }
}

export async function unblockUser(counterpartId: string): Promise<void> {
  await chatApi.delete(`/moderation/blocks/${counterpartId}`);
  persistBlockedUsers(
    getBlockedUsers().filter((b) => b.userId !== counterpartId),
  );
}

export function getBlockedUsers(): BlockedUser[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(BLOCKED_USERS_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function isUserBlocked(counterpartId: string): boolean {
  return getBlockedUsers().some((b) => b.userId === counterpartId);
}

function persistBlockedUsers(blocked: BlockedUser[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify(blocked));
}
