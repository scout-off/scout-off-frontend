'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import WalletButton from './WalletButton';
import { useContractStatus } from '@/hooks/useContractStatus';

const NAV_LINKS = [
  { href: '/scout', labelKey: 'nav.scout_dashboard' },
  { href: '/player', labelKey: 'nav.player_dashboard' },
];

const SPONSORSHIP_LINK = { href: '/sponsorship', labelKey: 'nav.sponsorship' };

const LOCALES = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
];

export default function Navbar() {
  const { isPaused } = useContractStatus();
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const [localeOpen, setLocaleOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const currentLocale = pathname.split('/')[1] || 'en';
  const locales = [
    { code: 'en', label: t('language.english') },
    { code: 'fr', label: t('language.french') },
    { code: 'sw', label: t('language.swahili') },
  ];

  const handleLanguageChange = (locale: string) => {
    const newPathname = pathname.replace(/^\/[a-z]{2}/, `/${locale}`);
    const target = pathname.startsWith(`/${currentLocale}`)
      ? newPathname
      : `/${locale}${pathname}`;
    router.push(target);
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`;
    setLocaleOpen(false);
    setMenuOpen(false);
  };

  return (
    <>
      {isPaused && (
        <div className="bg-yellow-500 text-black text-center text-sm font-medium py-2 px-4">
          {t('nav.maintenance_warning')}
        </div>
      )}
      <nav
        aria-label="Main navigation"
        className="border-b border-gray-800 bg-brand-dark"
      >
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            href={`/${currentLocale}`}
            className="text-brand-green font-bold text-xl tracking-tight"
          >
            {t('app_title')}
          </Link>

          <div className="hidden sm:flex items-center gap-6 text-sm text-gray-300">
            {NAV_LINKS.map(({ href, labelKey }) => (
              <Link
                key={href}
                href={`/${currentLocale}${href}`}
                className="hover:text-white transition"
              >
                {t(labelKey)}
              </Link>
            ))}

            <Link
              href={`/${currentLocale}${SPONSORSHIP_LINK.href}`}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition"
            >
              {t(SPONSORSHIP_LINK.labelKey)}
              <span className="text-[10px] uppercase tracking-wide border border-gray-700 rounded-full px-1.5 py-0.5">
                {t('nav.soon')}
              </span>
            </Link>

            <div className="relative">
              <button
                onClick={() => setLocaleOpen(!localeOpen)}
                className="hover:text-white transition flex items-center gap-1"
                type="button"
                aria-haspopup="true"
                aria-expanded={localeOpen}
                aria-label={t('language.select_language')}
              >
                {locales.find((l) => l.code === currentLocale)?.label ||
                  t('language.select_language')}
                <span className="text-xs">▼</span>
              </button>
              {localeOpen && (
                <div
                  role="menu"
                  aria-label={t('language.select_language')}
                  className="absolute right-0 mt-2 w-40 bg-brand-dark border border-gray-800 rounded-lg shadow-lg z-50"
                >
                  {locales.map((locale) => (
                    <button
                      key={locale.code}
                      type="button"
                      role="menuitem"
                      aria-current={currentLocale === locale.code}
                      onClick={() => handleLanguageChange(locale.code)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green hover:text-black transition ${
                        currentLocale === locale.code
                          ? 'bg-brand-green/20 text-brand-green'
                          : ''
                      }`}
                    >
                      {locale.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <WalletButton />
          </div>

          <button
            type="button"
            className="sm:hidden p-2 rounded text-gray-300 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={
              menuOpen ? 'Close navigation menu' : 'Open navigation menu'
            }
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <svg
              aria-hidden="true"
              focusable="false"
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {menuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div
            id="mobile-menu"
            className="sm:hidden border-t border-gray-800 bg-brand-dark px-4 py-3 flex flex-col gap-3 text-sm text-gray-300"
          >
            {NAV_LINKS.map(({ href, labelKey }) => (
              <Link
                key={href}
                href={`/${currentLocale}${href}`}
                aria-current={
                  pathname === `/${currentLocale}${href}` ? 'page' : undefined
                }
                className="hover:text-white transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green rounded py-1"
                onClick={() => setMenuOpen(false)}
              >
                {t(labelKey)}
              </Link>
            ))}
            <Link
              href={`/${currentLocale}${SPONSORSHIP_LINK.href}`}
              aria-current={
                pathname === `/${currentLocale}${SPONSORSHIP_LINK.href}`
                  ? 'page'
                  : undefined
              }
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-green rounded py-1"
              onClick={() => setMenuOpen(false)}
            >
              {t(SPONSORSHIP_LINK.labelKey)}
              <span className="text-[10px] uppercase tracking-wide border border-gray-700 rounded-full px-1.5 py-0.5">
                {t('nav.soon')}
              </span>
            </Link>
            <div className="border-t border-gray-800 pt-3">
              {locales.map((locale) => (
                <button
                  key={locale.code}
                  type="button"
                  aria-current={currentLocale === locale.code}
                  onClick={() => handleLanguageChange(locale.code)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-brand-green hover:text-black transition ${
                    currentLocale === locale.code
                      ? 'bg-brand-green/20 text-brand-green'
                      : ''
                  }`}
                >
                  {locale.label}
                </button>
              ))}
            </div>
            <WalletButton />
          </div>
        )}
      </nav>
    </>
  );
}
