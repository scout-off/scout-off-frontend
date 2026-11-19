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

/**
 * Sponsorship pledge flow (prototype, issue #1678).
 *
 * Escrow model: a sponsor locks XLM/USDC in a Stellar claimable balance whose
 * predicates gate release. The player can claim only within the milestone
 * window `and(not(before_absolute_time(T1)), before_absolute_time(T2))`; the
 * sponsor can reclaim after the deadline via `not(before_absolute_time(T2))`.
 * Milestone gating (validator approval) is enforced by the platform co-signed
 * release flow (ADR option a); a Soroban escrow contract is future work.
 *
 * Pledge state is derived from chain data (Horizon claimable balances API),
 * never trusted from the client. The whole flow is behind a feature flag and
 * hidden on mainnet until compliance sign-off.
 */

// Feature flag: pledge flow is a testnet-only prototype until compliance
// sign-off. Hidden on mainnet (see lib/network.ts).
const PLEDGE_FLOW_ENABLED =
  process.env.NEXT_PUBLIC_SPONSORSHIP_PLEDGE_ENABLED === 'true' &&
  process.env.NEXT_PUBLIC_STELLAR_NETWORK !== 'mainnet';

// Compliance placeholder: per-pledge amount cap (mandatory before mainnet).
const MAX_PLEDGE_AMOUNT = 500;
// Players can be 14+ per onboarding validation; minors need guardian consent.
const MINOR_AGE = 18;

type PledgeStatus = 'pledged' | 'claimable' | 'claimed' | 'refunded';

interface FundingNeed {
  id: string;
  purpose: string;
  amount: number;
  asset: 'XLM' | 'USDC';
  deadline: string; // ISO date
  evidenceRequired: string;
}

interface Pledge {
  id: string;
  needId: string;
  amount: number;
  status: PledgeStatus;
  balanceId?: string;
}

const STATUS_LABELS: Record<PledgeStatus, string> = {
  pledged: 'Pledged',
  claimable: 'Claimable',
  claimed: 'Claimed',
  refunded: 'Refunded',
};

/**
 * Build the claimable-balance predicates for a pledge.
 * Player: and(not(before_absolute_time(T1)), before_absolute_time(T2))
 * Sponsor: not(before_absolute_time(T2))
 */
export function buildPledgePredicates(t1: number, t2: number) {
  return {
    player: {
      and: [
        { not: { abs_before: t1 } },
        { abs_before: t2 },
      ],
    },
    sponsor: { not: { abs_before: t2 } },
  };
}

export default function SponsorshipClient() {
  const t = useTranslations('sponsorship');

  const [email, setEmail] = useState('');
  const [interestType, setInterestType] = useState<InterestType>('fan');
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // ── Pledge flow state (prototype) ──────────────────────────────────────
  const [need, setNeed] = useState<FundingNeed | null>(null);
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [pledgeAmount, setPledgeAmount] = useState('');
  const [pledgeError, setPledgeError] = useState('');
  const [playerAge, setPlayerAge] = useState('');
  const [guardianConsent, setGuardianConsent] = useState(false);

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

  /**
   * Sponsor pledges: build a createClaimableBalance transaction with the
   * predicates above and sign it in the sponsor's wallet. The pledge state is
   * then derived from Horizon claimable balances, not from this client.
   */
  async function handlePledge(e: FormEvent) {
    e.preventDefault();
    setPledgeError('');

    if (!need) {
      setPledgeError('No funding need selected.');
      return;
    }

    const amount = Number(pledgeAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setPledgeError('Enter a valid pledge amount.');
      return;
    }
    if (amount > MAX_PLEDGE_AMOUNT) {
      setPledgeError(`Pledges are capped at ${MAX_PLEDGE_AMOUNT} per pledge.`);
      return;
    }

    // Compliance placeholder: guardian consent required for minors.
    const age = Number(playerAge);
    if (Number.isFinite(age) && age < MINOR_AGE && !guardianConsent) {
      setPledgeError('Guardian consent is required for players under 18.');
      return;
    }

    const t2 = Math.floor(new Date(need.deadline).getTime() / 1000);
    const t1 = Math.floor(Date.now() / 1000);
    const predicates = buildPledgePredicates(t1, t2);

    try {
      // Build + sign createClaimableBalance in the sponsor's wallet. The
      // wallet integration is provided by the platform; the predicates and
      // amount are the only inputs this flow owns.
      const { createSponsorshipPledge } = await import('@/lib/api');
      const result = await createSponsorshipPledge({
        needId: need.id,
        amount,
        asset: need.asset,
        predicates,
      });

      setPledges((prev) => [
        ...prev,
        {
          id: result.id,
          needId: need.id,
          amount,
          status: 'pledged',
          balanceId: result.balanceId,
        },
      ]);
      setPledgeAmount('');
    } catch (err: unknown) {
      setPledgeError(
        err instanceof Error ? err.message : 'Could not create pledge.',
      );
    }
  }

  /**
   * Release: on milestone verification (indexer event) the platform flow lets
   * the player claim. Refund: after the deadline the sponsor reclaims.
   */
  async function handleClaim(pledge: Pledge) {
    try {
      const { claimSponsorshipPledge } = await import('@/lib/api');
      const result = await claimSponsorshipPledge(pledge.id);
      setPledges((prev) =>
        prev.map((p) =>
          p.id === pledge.id ? { ...p, status: result.status } : p,
        ),
      );
    } catch (err: unknown) {
      setPledgeError(
        err instanceof Error ? err.message : 'Could not claim pledge.',
      );
    }
  }

  async function handleRefund(pledge: Pledge) {
    try {
      const { refundSponsorshipPledge } = await import('@/lib/api');
      const result = await refundSponsorshipPledge(pledge.id);
      setPledges((prev) =>
        prev.map((p) =>
          p.id === pledge.id ? { ...p, status: result.status } : p,
        ),
      );
    } catch (err: unknown) {
      setPledgeError(
        err instanceof Error ? err.message : 'Could not refund pledge.',
      );
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

      {/* ── Pledge flow (prototype, testnet only) ────────────────────────── */}
      {PLEDGE_FLOW_ENABLED && (
        <section className="px-4 max-w-md mx-auto w-full">
          <div className="bg-brand-card border border-gray-800 rounded-2xl p-6 sm:p-8 flex flex-col gap-4">
            <h2 className="font-semibold text-white text-base">
              Pledge to a verified need
            </h2>
            <p className="text-gray-400 text-sm">
              Funds are locked in a Stellar claimable balance and released only
              when the purpose is met, or returned to you after the deadline.
            </p>

            {need ? (
              <div className="text-sm text-gray-300">
                <p className="text-white font-medium">{need.purpose}</p>
                <p className="text-gray-400">
                  {need.amount} {need.asset} · deadline{' '}
                  {new Date(need.deadline).toLocaleDateString()}
                </p>
                <p className="text-gray-400">
                  Evidence required: {need.evidenceRequired}
                </p>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">
                No funding need selected yet.
              </p>
            )}

            <form onSubmit={handlePledge} className="flex flex-col gap-3">
              <div>
                <label
                  htmlFor="pledge-amount"
                  className="block text-sm text-gray-300 mb-1.5"
                >
                  Pledge amount (max {MAX_PLEDGE_AMOUNT})
                </label>
                <input
                  id="pledge-amount"
                  type="number"
                  min="0"
                  max={MAX_PLEDGE_AMOUNT}
                  step="0.01"
                  value={pledgeAmount}
                  onChange={(e) => setPledgeAmount(e.target.value)}
                  className="w-full bg-brand-dark border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-brand-green focus:outline-none transition"
                />
              </div>

              <div>
                <label
                  htmlFor="pledge-player-age"
                  className="block text-sm text-gray-300 mb-1.5"
                >
                  Player age
                </label>
                <input
                  id="pledge-player-age"
                  type="number"
                  min="14"
                  value={playerAge}
                  onChange={(e) => setPlayerAge(e.target.value)}
                  className="w-full bg-brand-dark border border-gray-700 rounded-xl px-4 py-2.5 text-white text-sm focus:border-brand-green focus:outline-none transition"
                />
              </div>

              {Number(playerAge) > 0 && Number(playerAge) < MINOR_AGE && (
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={guardianConsent}
                    onChange={(e) => setGuardianConsent(e.target.checked)}
                  />
                  Guardian consent obtained
                </label>
              )}

              {pledgeError && (
                <p className="text-red-400 text-sm">{pledgeError}</p>
              )}

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 bg-brand-green text-black font-semibold px-6 py-3 rounded-xl hover:opacity-90 active:scale-95 transition"
              >
                <Coins size={16} /> Pledge
              </button>
            </form>

            {pledges.length > 0 && (
              <ul className="flex flex-col gap-2">
                {pledges.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between text-sm text-gray-300 border border-gray-800 rounded-xl px-3 py-2"
                  >
                    <span>
                      {p.amount} · {STATUS_LABELS[p.status]}
                    </span>
                    {p.status === 'claimable' && (
                      <button
                        type="button"
                        onClick={() => handleClaim(p)}
                        className="text-brand-green text-xs font-semibold"
                      >
                        Claim
                      </button>
                    )}
                    {p.status === 'pledged' && (
                      <button
                        type="button"
                        onClick={() => handleRefund(p)}
                        className="text-gray-400 text-xs font-semibold"
                      >
                        Reclaim
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

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
                    Notify
                  </>
                )}
              </button>

              {status === 'error' && errorMessage && (
                <p className="text-red-400 text-sm">{errorMessage}</p>
              )}
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
