import type { Metadata } from "next";
import PlayerProfileClient from "./PlayerProfileClient";

const ROOT_URL = "https://scoutoff.app";

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const url = `${ROOT_URL}/player/${params.id}`;

  return {
    openGraph: {
      url,
    },
    alternates: {
      canonical: url,
    },
  };
}

export default function PlayerProfilePage({ params }: { params: { id: string } }) {
  return <PlayerProfileClient id={params.id} />;
}
