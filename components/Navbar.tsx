"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import WalletButton from "./WalletButton";
import { useContractHealth } from "@/hooks/useContractHealth";

const LOCALES = [
  { code: "en", label: "EN" },
  { code: "fr", label: "FR" },
];

export default function Navbar() {
  const { paused } = useContractHealth();
  const t = useTranslations("navbar");
  const router = useRouter();
  const pathname = usePathname();

  // Detect current locale from the pathname prefix
  const currentLocale = LOCALES.find((l) => pathname.startsWith(`/${l.code}`))?.code ?? "en";

  function switchLocale(locale: string) {
    // Replace the locale segment in the current path
    const segments = pathname.split("/");
    segments[1] = locale;
    router.push(segments.join("/") || "/");
  }

  return (
    <>
      {paused && (
        <div className="bg-yellow-500 text-black text-center text-sm font-medium py-2 px-4">
          {t("maintenance")}
        </div>
      )}
      <nav className="border-b border-gray-800 bg-brand-dark">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="text-brand-green font-bold text-xl tracking-tight">
            {t("brand")}
          </Link>
          <div className="flex items-center gap-6 text-sm text-gray-300">
            <Link href="/scout" className="hover:text-white transition">{t("scoutDashboard")}</Link>
            <Link href="/player" className="hover:text-white transition">{t("playerDashboard")}</Link>

            {/* Language switcher */}
            <div className="flex items-center gap-1 border border-gray-700 rounded-lg overflow-hidden">
              {LOCALES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => switchLocale(l.code)}
                  aria-label={`Switch to ${l.label}`}
                  className={`px-2 py-1 text-xs font-medium transition ${
                    currentLocale === l.code
                      ? "bg-brand-green text-black"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <WalletButton />
          </div>
        </div>
      </nav>
    </>
  );
}
