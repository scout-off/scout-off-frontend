import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { ToastProvider } from "@/components/ui/Toast";
import { WalletProvider } from "@/context/WalletContext";

export const metadata: Metadata = {
  title: "ScoutOff — Decentralized Football Scouting",
  description: "Tamper-proof player profiles and on-chain milestone verification on Stellar.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
