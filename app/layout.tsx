import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ToastProvider } from "@/components/ui/Toast";
import { WalletProvider } from "@/context/WalletContext";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://scoutoff.app";

export const metadata: Metadata = {
  title: "ScoutOff — Decentralized Football Scouting",
  description:
    "Tamper-proof player profiles, verifiable milestones, and direct scout-to-player connections — powered by Stellar Soroban smart contracts.",
  manifest: "/manifest.json",
  themeColor: "#0f172a",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ScoutOff",
  },
  openGraph: {
    title: "ScoutOff — Decentralized Football Scouting",
    description:
      "Tamper-proof player profiles, verifiable milestones, and direct scout-to-player connections — powered by Stellar Soroban smart contracts.",
    url: APP_URL,
    siteName: "ScoutOff",
    type: "website",
    images: [
      {
        url: `${APP_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "ScoutOff — Decentralized Football Scouting on Stellar",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ScoutOff — Decentralized Football Scouting",
    description:
      "Tamper-proof player profiles, verifiable milestones, and direct scout-to-player connections — powered by Stellar Soroban smart contracts.",
    images: [`${APP_URL}/og-image.png`],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f172a" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body>
        <WalletProvider>
          <ToastProvider>
            <Navbar />
            <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
          </ToastProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
