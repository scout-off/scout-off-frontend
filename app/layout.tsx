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
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Anti-flicker: apply theme before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light'){document.documentElement.classList.remove('dark')}else if(t==='dark'){document.documentElement.classList.add('dark')}else if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="bg-white text-gray-900 dark:bg-brand-dark dark:text-gray-50 transition-colors duration-200">
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
