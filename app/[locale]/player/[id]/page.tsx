'use client';
import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useWallet } from '@/hooks/useWallet';
import { usePlayer } from '@/hooks/usePlayer';
import { usePayToContact } from '@/hooks/usePayToContact';
import { useSubscription } from '@/hooks/useSubscription';
import { PLATFORM_CONTACT_FEE_XLM } from '@/lib/contract';
import ProgressBar from '@/components/ProgressBar';
import PlayerProfileSkeleton from '@/components/PlayerProfileSkeleton';
import PlayerStatsCard from '@/components/player/PlayerStatsCard';
import IPFSMediaGallery from '@/components/player/IPFSMediaGallery';
import TrialOfferForm from '@/components/scout/TrialOfferForm';
import Button from '@/components/ui/Button';
import QRModal from '@/components/ui/QRModal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import TransactionStatus from '@/components/ui/TransactionStatus';
import type { TxStatus } from '@/components/ui/TransactionStatus';

export default function PlayerProfile() {
  const { id } = useParams<{ id: string }>();
  const { publicKey } = useWallet();
  const t = useTranslations('player_profile');
  const { player, loading: playerLoading, refetch } = usePlayer(id ?? null);
  const { unlock, loading: contacting } = usePayToContact();
  const {
    subscription,
    isExpired,
    loading: subscriptionLoading,
  } = useSubscription();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [contactTxStatus, setContactTxStatus] = useState<TxStatus | null>(null);
  const shareButtonRef = useRef<HTMLButtonElement>(null);
  const milestones = player?.milestones ?? [];
  const profileUrl = typeof window !== 'undefined' ? window.location.href : '';

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const shareButtonRef = useRef<HTMLButtonElement>(null);

  const profileUrl =
    typeof window !== 'undefined' ? window.location.href : '';

  async function handleConfirm() {
    setContactTxStatus('pending');
    try {
      await unlock(id);
      setContactTxStatus('success');
    } catch {
      setContactTxStatus('error');
    }
    setConfirmOpen(false);
  }

  function handleDownload() {
    const payload = {
      playerId: player!.id,
      wallet: player!.wallet,
      progressLevel: player!.progressLevel,
      milestones: player!.milestones.map((m) => ({
        id: m.id,
        description: m.description,
        validator: m.validator,
        timestamp: m.timestamp,
      })),
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `player-${player!.id}-milestones.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const isScoutWithActiveSubscription = publicKey && subscription && !isExpired;
  const canLogTrialOffer =
    isScoutWithActiveSubscription && player && player.progressLevel < 3;

  if (playerLoading) {
    return <PlayerProfileSkeleton showContactButton={!!publicKey} />;
  }
  if (!player)
    return <p className="text-center text-gray-400 mt-20">Player not found.</p>;

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      {/* Back to Scout Dashboard */}
      <Link
        href="/scout"
        className="self-start text-sm text-gray-400 hover:text-white transition flex items-center gap-1"
      >
        {t('back_to_scout_dashboard')}
      </Link>

      {/* Header */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex gap-6 items-start">
        <div className="w-20 h-20 rounded-full bg-gray-700 overflow-hidden shrink-0">
          <IPFSMediaGallery cids={player.ipfsHash ? [player.ipfsHash] : []} />
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
                  Validator:{' '}
                  <TruncatedAddress
                    address={m.validator}
                    className="text-gray-500"
                  />{' '}
                  · {new Date(m.timestamp * 1000).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Download milestones */}
      {player.milestones.length > 0 && (
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
        <>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={contacting}
            className="bg-brand-green text-black font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50"
          >
            {contacting
              ? 'Processing…'
              : `Pay to Contact (${PLATFORM_CONTACT_FEE_XLM} XLM)`}
          </button>
          {contactTxStatus && (
            <TransactionStatus
              status={contactTxStatus}
              feePaid={
                contactTxStatus === 'success'
                  ? String(PLATFORM_CONTACT_FEE_XLM)
                  : undefined
              }
              onHide={() => setContactTxStatus(null)}
            />
          )}
          <ConfirmDialog
            isOpen={confirmOpen}
            onConfirm={handleConfirm}
            onCancel={() => setConfirmOpen(false)}
            title="Contact Player"
            message={`Unlock contact details for ${player.vitals.name}? Fee: ${PLATFORM_CONTACT_FEE_XLM} XLM will be deducted from your wallet.`}
            confirmLabel="Confirm"
            loading={contacting}
          />
        </>
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
                Your subscription has expired. Renew your subscription to log
                trial offers.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
