import { Metadata } from "next";
import { getPlayer } from "@/lib/contract";
import { PROGRESS_LABELS } from "@/types";
import PlayerProfileClient from "./PlayerProfileClient";

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  try {
    const player = await getPlayer(params.id);
    if (!player) {
      return {
        title: "Player Not Found - ScoutOff",
      };
    }

    return {
      title: `${player.vitals.name} - ${player.vitals.position} - ScoutOff`,
      description: `View ${player.vitals.name}'s profile, stats, and on-chain milestones. ${PROGRESS_LABELS[player.progressLevel]} player from ${player.vitals.region}.`,
      openGraph: {
        title: `${player.vitals.name} - ${player.vitals.position}`,
        description: `${PROGRESS_LABELS[player.progressLevel]} · ${player.vitals.region} · Age ${player.vitals.age}`,
        type: "profile",
      },
    };
  } catch {
    return {
      title: "Player Not Found - ScoutOff",
    };
  }
}

export default async function PlayerProfile({ params }: PageProps) {
  try {
    const player = await getPlayer(params.id);
    if (!player) {
      return null; // Will trigger not-found.tsx
    }
    return <PlayerProfileClient player={player} />;
  } catch {
    return null; // Will trigger not-found.tsx
  }
}
