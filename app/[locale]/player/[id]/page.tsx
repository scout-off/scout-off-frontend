import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPlayer } from "@/lib/contract";
import type { Player } from "@/types";
import PlayerProfile from "./PlayerProfile";

// Upper bound on the contract read so a slow/unreachable testnet still resolves
// to a 404 instead of hanging the page. Any failure or timeout → missing → 404.
const READ_TIMEOUT_MS = 8000;

// Memoized per request so `generateMetadata` and the page render share a single
// contract read instead of fetching the player twice.
const fetchPlayer = cache(async (id: string): Promise<Player | null> => {
  try {
    const result = await Promise.race([
      getPlayer(id),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), READ_TIMEOUT_MS)),
    ]);
    return result ?? null;
  } catch {
    return null;
  }
});

// When the player is missing, the document title should be the localized
// "Page not found" title. Next resolves a not-found's title from the matched
// leaf segment (this page), so we return it here for the missing case; for an
// existing player we return no title and fall back to the layout's default.
export async function generateMetadata({
  params,
}: {
  params: { locale: string; id: string };
}): Promise<Metadata> {
  setRequestLocale(params.locale);
  const player = await fetchPlayer(params.id);
  if (!player) {
    const t = await getTranslations("not_found");
    return { title: t("title") };
  }
  return {};
}

// Server component: reads the player from the contract during SSR. When the
// contract has no player for this id (the read returns null/throws, e.g. the
// `PlayerNotFound` case), `notFound()` renders the nearest localized
// `not-found.tsx` with a real 404 status instead of an inline English message.
export default async function PlayerPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  setRequestLocale(params.locale);
  const player = await fetchPlayer(params.id);
  if (!player) notFound();
  return <PlayerProfile player={player} playerId={params.id} />;
}
