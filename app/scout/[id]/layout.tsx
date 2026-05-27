import type { Metadata } from "next";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // params.id is the scout wallet address used as the route identifier
  const wallet = params.id;
  const short = `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;

  return {
    title: `Scout ${short} — ScoutOff`,
    description: `View the public scouting profile for ${short} on ScoutOff.`,
    openGraph: {
      title: `Scout ${short} — ScoutOff`,
      description: `Public scout profile on ScoutOff. Wallet: ${wallet}`,
      url: `/scout/${wallet}`,
      siteName: "ScoutOff",
      type: "profile",
    },
  };
}

export default function ScoutProfileLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
