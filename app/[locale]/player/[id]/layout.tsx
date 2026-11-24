import { ReactNode } from 'react';
import type { Metadata } from 'next';
import Script from 'next/script';
import { fetchPlayerProfile } from '@/lib/api';
import { getBaseUrl } from '@/lib/seo';
import type { Player } from '@/types';
import { getExplorerAccountUrl } from '@/lib/network';

interface PlayerProfileLayoutProps {
  children: ReactNode;
  params: Promise<{
    locale: string;
    id: string;
  }>;
}

/**
 * Generates a schema.org/Person JSON-LD block for the player public profile.
 *
 * The structured data is fetched server-side and injected as a
 * <script type="application/ld+json"> tag so search engines can
 * understand the page as representing a person/athlete.
 */
export default async function PlayerProfileLayout(
  props: PlayerProfileLayoutProps,
) {
  const params = await props.params;

  const { children } = props;

  let player: Player | null = null;

  try {
    player = await fetchPlayerProfile(params.id);
  } catch {
    // Fetch failed — render children without JSON-LD rather than crashing
    return <>{children}</>;
  }

  if (!player) {
    return <>{children}</>;
  }

  const baseUrl = getBaseUrl();
  const profileUrl = `${baseUrl}/${params.locale}/player/${params.id}`;

  const sameAs: string[] = [];

  // Link to the Stellar account explorer for the player's wallet
  const stellarUrl = getExplorerAccountUrl(player.wallet);
  sameAs.push(stellarUrl);

  // The profile page itself (also listed in sameAs for discoverability)
  sameAs.push(profileUrl);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: player.vitals.name,
    nationality: player.vitals.nationality,
    description: `${player.vitals.position} · ${player.vitals.region} · Progress: Level ${player.progressLevel}`,
    url: profileUrl,
    identifier: player.id,
    sameAs,
  };

  return (
    <>
      <Script
        id="player-person-jsonld"
        type="application/ld+json"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {children}
    </>
  );
}

/**
 * Metadata for the player profile page.
 *
 * The parent `app/[locale]/layout.tsx` already provides a canonical URL
 * via `seoMetadata()`, so we don't need to duplicate it here.
 */
export async function generateMetadata(
  props: PlayerProfileLayoutProps,
): Promise<Metadata> {
  const params = await props.params;
  let player: Player | null = null;

  try {
    player = await fetchPlayerProfile(params.id);
  } catch {
    return {};
  }

  if (!player) {
    return {};
  }

  const baseUrl = getBaseUrl();
  const profileUrl = `${baseUrl}/${params.locale}/player/${params.id}`;
  // Dynamically generated per-player card — see ./opengraph-image.tsx
  const ogImageUrl = `${profileUrl}/opengraph-image`;

  return {
    title: `${player.vitals.name} — Player Profile — ScoutOff`,
    description: `View ${player.vitals.name}'s verified football profile on ScoutOff. ${player.vitals.position} · ${player.vitals.region} · On-chain milestones verified by validators.`,
    openGraph: {
      title: `${player.vitals.name} — ScoutOff Player Profile`,
      description: `${player.vitals.position} · ${player.vitals.region} · Level ${player.progressLevel} · Verified on-chain milestones.`,
      url: profileUrl,
      type: 'profile',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${player.vitals.name} — ScoutOff Player Profile`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${player.vitals.name} — ScoutOff Player Profile`,
      description: `${player.vitals.position} · ${player.vitals.region} · Level ${player.progressLevel} · Verified on-chain milestones.`,
      images: [ogImageUrl],
    },
  };
}
