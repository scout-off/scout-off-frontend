'use client';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Coins, Mail, Send, CheckCircle } from 'lucide-react';
import type { InterestType } from '@/lib/api';

const INTEREST_OPTIONS: { value: InterestType; label: string }[] = [
  { value: 'fan', label: "I'm a fan" },
  { value: 'investor', label: "I'm an investor" },
  { value: 'sponsor', label: "I'm a sponsor" },
];

type FormStatus = 'idle' | 'submitting' | 'success' | 'error' | 'duplicate';

export default function SponsorshipClient() {
  const t = useTranslations('sponsorship');

  const [email, setEmail] = useState('');
  const [interestType, setInterestType] = useState<InterestType>('fan');
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Basic client-side validation
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setStatus('error');
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setStatus('submitting');
    setErrorMessage('');

    try {
      const { joinSponsorshipWaitlist } = await import('@/lib/api');
      const result = await joinSponsorshipWaitlist(trimmed, interestType);

      if (result.message) {
        setStatus('success');
        setEmail('');
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.';

      if (msg.includes('already') || msg.includes('409')) {
        setStatus('duplicate');
      } else {
        setStatus('error');
        setErrorMessage(msg);
      }
    }
  }

  const isDisabled = status === 'submitting' || status === 'success';

  return (
    <div className="flex flex-col gap-12 pb-20">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section
        className="relative flex flex-col items-center text-center gap-6 py-24 px-4 overflow-hidden rounded-2xl"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,200,83,0.12) 0%, transparent 70%), linear-gradient(180deg, #0d1526 0%, #0A0F1E 100%)',
        }}
      >
        <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-brand-green border border-brand-green/30 bg-brand-green/10 px-4 py-1.5 rounded-full">
          <Coins size={12} />
          {t('badge')}
        </span>

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white leading-tight max-w-3xl">
          {t('title')}
        </h1>

        <p className="text-gray-400 max-w-xl text-base sm:text-lg leading-relaxed">
          {t('description')}
        </p>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className="px-4 max-w-2xl mx-auto text-center flex flex-col gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-white">
          {t('howItWorksTitle')}
        </h2>
        <p className="text-gray-400 text-sm sm:text-base leading-relaxed">
          {t('howItWorksDescription')}
        </p>
        <p className="text-gray-400 text-xs">{t('notice')}</p>
      </section>

      {/* ── Email capture form ───────────────────────────────────────────── */}
      <section className="px-4 max-w-md mx-auto w-full">
        <div className="bg-brand-card border border-gray-800 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-2">
            <Mail size={16} className="text-brand-green" />
            <h2 className="font-semibold text-white text-base">
              Get notified when we launch
            </h2>
          </div>
          <p className="text-gray-400 text-sm mb-6">
            Be the first to know when fractionalized player sponsorship goes
            live. No spam — just a launch announcement.
          </p>

          {status === 'success' ? (
            /* ── Success state ──────────────────────────────────────────── */
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <CheckCircle
                size={40}
                className="text-brand-green"
                aria-hidden="true"
              />
              <p className="text-white font-semibold">
                You&apos;re on the list!
              </p>
              <p className="text-gray-400 text-sm">
                We&apos;ll email you when fractionalized sponsorship launches.
              </p>
            </div>
          ) : status === 'duplicate' ? (
            /* ── Already signed up ──────────────────────────────────────── */
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <CheckCircle
                size={40}
                className="text-brand-green"
                aria-hidden="true"
              />
              <p className="text-white font-semibold">
                You&apos;re already on the list!
              </p>
              <p className="text-gray-400 text-sm">
                We have your email — we&apos;ll reach out when sponsorship
                launches.
              </p>
            </div>
          ) : (
            /* ── Form ───────────────────────────────────────────────────── */
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="sponsorship-email"
                  className="block text-sm text-gray-300 mb-1.5"
                >
                  Email address
                </label>
                <input
                  id="sponsorship-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isDisabled}
                  placeholder="you@example.com"
                  className="w-full bg-brand-dark border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-gray-400 focus:border-brand-green focus:outline-none transition disabled:opacity-50"
                />
              </div>

              <div>
                <label
                  htmlFor="sponsorship-interest"
                  className="block text-sm text-gray-300 mb-1.5"
                >
                  I am a...
                </label>
                <select
                  id="sponsorship-interest"
                  value={interestType}
                  onChange={(e) =>
                    setInterestType(e.target.value as InterestType)
                  }
                  disabled={isDisabled}
                  className="w-full bg-brand-dark border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-brand-green focus:outline-none transition disabled:opacity-50 appearance-none"
                >
                  {INTEREST_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isDisabled}
                className="inline-flex items-center justify-center gap-2 bg-brand-green text-black font-semibold px-6 py-3 rounded-xl hover:opacity-90 active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === 'submitting' ? (
                  <>
                    <div className="h-4 w-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Notify Me
                  </>
                )}
              </button>

              {status === 'error' && (
                <p role="alert" className="text-red-400 text-sm text-center">
                  {errorMessage}
                </p>
              )}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
