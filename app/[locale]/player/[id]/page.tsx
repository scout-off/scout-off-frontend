import { notFound } from 'next/navigation';
import { unstable_cache } from 'next/cache';
import { getPlayer } from '@/lib/contract';
import type { Player } from '@/types';
import PlayerProfileClient from './PlayerProfileClient';

// Tag-based caching: the profile is revalidated on-demand by the indexer
// webhook (POST /api/revalidate/player) which calls revalidateTag for
// `player:{id}` and `player-milestones:{id}`. The time-based window is only
// a safety net, so it can be much longer than the old 60 s ISR window.
export const revalidate = 3600;

/**
 * Player public profile. Fetches the player on the server so the initial
 * HTML contains the name, position and milestones (for crawlers, link
 * previews and a faster LCP); interactive parts live in PlayerProfileClient.
 * The JSON-LD block is rendered server-side by ./layout.tsx.
 */
export default async function PlayerProfilePage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const params = await props.params;
  const id = params.id;

  const getCachedPlayer = unstable_cache(
    async () => (await getPlayer(id)) as Player | null,
    ['player', id],
    { tags: [`player:${id}`, `player-milestones:${id}`] },
  );

  let player: Player | null = null;
  try {
    player = await getCachedPlayer();
  } catch (err) {
    // Contract error 3 (PlayerNotFound) — parseContractError maps it to
    // this message. Any other failure (e.g. RPC outage) falls back to the
    // client-side fetch instead of a false 404.
    if (err instanceof Error && err.message === 'Player not found') {
      notFound();
    }
  }

  return <PlayerProfileClient initialPlayer={player} />;
}
