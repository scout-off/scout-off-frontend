'use client';
import { useEffect, useState } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Inline copy: this page replaces the root layout, so the next-intl, theme
 * and wallet providers (any of which may be what failed) are unavailable.
 */
const COPY = {
  en: {
    title: 'Something went wrong',
    body: 'ScoutOff hit an unexpected error. Please try again.',
    reference: 'Error reference',
    retry: 'Try again',
    home: 'Go home',
  },
  fr: {
    title: 'Une erreur est survenue',
    body: 'ScoutOff a rencontré une erreur inattendue. Veuillez réessayer.',
    reference: "Référence de l'erreur",
    retry: 'Réessayer',
    home: "Retour à l'accueil",
  },
  sw: {
    title: 'Hitilafu imetokea',
    body: 'ScoutOff imekumbana na hitilafu isiyotarajiwa. Tafadhali jaribu tena.',
    reference: 'Kumbukumbu ya hitilafu',
    retry: 'Jaribu tena',
    home: 'Rudi nyumbani',
  },
} as const;

type Lang = keyof typeof COPY;

function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  const lang = navigator.language?.slice(0, 2).toLowerCase();
  return lang in COPY ? (lang as Lang) : 'en';
}

function reportToSentry(error: Error) {
  try {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    // Dynamic import via variable to avoid TS type error when @sentry/nextjs is not installed
    const pkg = '@sentry/nextjs';
    (import(/* webpackIgnore: true */ pkg) as Promise<any>)
      .then(({ captureException }) => captureException(error))
      .catch(() => {
        /* Sentry unavailable — silent */
      });
  } catch {
    // Never let reporting crash the error UI
  }
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const [lang, setLang] = useState<Lang>('en');

  useEffect(() => {
    setLang(detectLang());
  }, []);

  useEffect(() => {
    console.error('[ScoutOff] Unhandled root layout error:', error);
    reportToSentry(error);
  }, [error]);

  const t = COPY[lang];

  return (
    <html lang={lang}>
      <body className="bg-black text-white antialiased">
        <main
          role="alert"
          aria-live="assertive"
          className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center"
        >
          <div className="flex max-w-md flex-col items-center gap-3">
            <h1 className="text-2xl font-bold">{t.title}</h1>
            <p className="text-sm leading-relaxed text-gray-400">{t.body}</p>
            {error.digest && (
              <p className="text-xs text-gray-500">
                {t.reference}: <code>{error.digest}</code>
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-xl bg-green-500 px-6 py-2.5 font-semibold text-black transition hover:opacity-90"
            >
              {t.retry}
            </button>
            {/* Plain anchor: next/link may depend on the failed app shell. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="rounded-xl border border-gray-700 px-6 py-2.5 text-gray-300 transition hover:border-gray-500"
            >
              {t.home}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
