import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import "../globals.css";
import Navbar from "@/components/Navbar";
import { WalletProvider } from "@/context/WalletContext";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const { locale } = params;
  setRequestLocale(locale);
  // `title.default` (rather than a plain string) lets child segments — e.g. the
  // localized `not-found.tsx` — override the title with their own `generateMetadata`,
  // while pages that don't define one still fall back to this default. The
  // `template` is a passthrough ("%s") so an overriding title renders verbatim,
  // e.g. "Page introuvable — ScoutOff" rather than being suffixed again.
  return {
    title: {
      default: "ScoutOff — Decentralized Football Scouting",
      template: "%s",
    },
    description:
      "Tamper-proof player profiles and on-chain milestone verification on Stellar.",
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;

  // The [locale] segment acts as a catch-all, so guard against unknown values.
  if (!(routing.locales as readonly string[]).includes(locale)) {
    notFound();
  }

  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <WalletProvider>
            <Navbar />
            <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
          </WalletProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
