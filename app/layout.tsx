import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ToastProvider } from "@/components/ui/Toast";
import { WalletProvider } from "@/context/WalletContext";

export const metadata: Metadata = {
  title: "ScoutOff — Decentralized Football Scouting",
  description:
    "Tamper-proof player profiles, verifiable milestones, and direct scout-to-player connections — powered by Stellar Soroban smart contracts.",
  openGraph: {
    title: "ScoutOff — Decentralized Football Scouting",
    description:
      "Tamper-proof player profiles, verifiable milestones, and direct scout-to-player connections — powered by Stellar Soroban smart contracts.",
    url: "https://scoutoff.app",
    siteName: "ScoutOff",
    type: "website",
    images: [
      {
        url: "https://scoutoff.app/og-image.png",
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
    images: ["https://scoutoff.app/og-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-brand-green focus:text-black focus:px-6 focus:py-3 focus:rounded-lg focus:font-semibold"
        >
          Skip to main content
        </a>
        <WalletProvider>
          <ToastProvider>
            <Navbar />
            <main id="main-content" className="max-w-6xl mx-auto px-4 py-8">{children}</main>
          </ToastProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
