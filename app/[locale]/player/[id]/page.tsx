'use client';
import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useWallet } from '@/hooks/useWallet';
import { usePlayer } from '@/hooks/usePlayer';
import { usePayToContact } from '@/hooks/usePayToContact';
import { useSubscription } from '@/hooks/useSubscription';
import { PLATFORM_CONTACT_FEE_XLM } from '@/lib/contract';
import ProgressBar from '@/components/ProgressBar';
import PlayerProfileSkeleton from '@/components/PlayerProfileSkeleton';
import PlayerStatsCard from '@/components/player/PlayerStatsCard';
import TrialOfferForm from '@/components/scout/TrialOfferForm';
import Button from '@/components/ui/Button';

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const { publicKey } = useWallet();
  const { player, loading: playerLoading, refetch } = usePlayer(id ?? null);
  const { unlock, loading: contacting } = usePayToContact();
  const { subscription, isExpired, loading: subscriptionLoading } = useSubscription();

  async function handleContact() {
    await unlock(id);
  }

  const isScoutWithActiveSubscription = publicKey && subscription && !isExpired;
  const canLogTrialOffer = isScoutWithActiveSubscription && player && player.progressLevel < 3;

  if (playerLoading) {
    return <PlayerProfileSkeleton showContactButton={!!publicKey} />;
  }
  if (!player)
    return <p className="text-center text-gray-400 mt-20">Player not found.</p>;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      {/* Header */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex gap-6 items-start">
        <div className="w-20 h-20 rounded-full bg-gray-700 overflow-hidden shrink-0">
          {player.ipfsHash && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs'}/${player.ipfsHash}`}
              alt={player.vitals.name}
              className="w-full h-full object-cover"
            />
          )}
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">
            {player.vitals.name}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {player.vitals.position} · {player.vitals.region} · Age{' '}
            {player.vitals.age}
          </p>
          <div className="mt-4">
            <ProgressBar level={player.progressLevel} />
          </div>
        </div>
      </div>

      {/* Stats */}
      <PlayerStatsCard stats={player.stats} position={player.vitals.position} />

      {/* Milestones */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold text-white mb-4">On-Chain Milestones</h2>
        {player.milestones.length === 0 ? (
          <p className="text-gray-500 text-sm">No milestones recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {player.milestones.map((m) => (
              <li
                key={m.id}
                className="text-sm text-gray-300 border-l-2 border-brand-green pl-3"
              >
                {m.description}
                <span className="block text-xs text-gray-500 mt-0.5">
                  Validator: {m.validator.slice(0, 8)}… ·{' '}
                  {new Date(m.timestamp * 1000).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Download milestones */}
      {milestones.length > 0 && (
        <button
          onClick={handleDownload}
          className="self-start text-sm text-brand-green underline underline-offset-2 hover:opacity-80 transition"
        >
          Download Milestones
        </button>
      )}

      {/* Share via QR */}
      <button
        ref={shareButtonRef}
        onClick={() => setQrOpen(true)}
        className="self-start text-sm text-gray-400 border border-gray-700 px-3 py-1.5 rounded-lg hover:border-gray-500 hover:text-white transition"
      >
        Share via QR
      </button>
      <QRModal
        isOpen={qrOpen}
        onClose={() => {
          setQrOpen(false);
          shareButtonRef.current?.focus();
        }}
        url={profileUrl}
      />

      {/* Pay to contact */}
      {publicKey && (
        <button
          onClick={handleContact}
          disabled={contacting}
          className="bg-brand-green text-black font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50"
        >
          {contacting ? 'Processing…' : `Pay to Contact (${PLATFORM_CONTACT_FEE_XLM} XLM)`}
        </button>
      )}

      {/* Trial offer */}
      {publicKey && id && (
        <>
          {canLogTrialOffer ? (
            <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
              <h2 className="font-semibold text-white mb-4">Log Trial Offer</h2>
              <TrialOfferForm playerId={id} onSuccess={refetch} />
            </div>
          ) : player.progressLevel === 3 ? (
            <div className="bg-brand-card border border-brand-green rounded-xl p-6">
              <p className="text-sm text-brand-green">
                ✓ This player is already at Elite Tier (Level 3).
              </p>
            </div>
          ) : !subscriptionLoading && !subscription ? (
            <div className="bg-brand-card border border-gray-700 rounded-xl p-6">
              <p className="text-sm text-gray-400">
                Subscribe to log trial offers and advance players to Elite Tier.
              </p>
            </div>
          ) : !subscriptionLoading && isExpired ? (
            <div className="bg-brand-card border border-gray-700 rounded-xl p-6">
              <p className="text-sm text-gray-400">
                Your subscription has expired. Renew your subscription to log trial offers.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
