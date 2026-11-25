'use client';

import { useState } from 'react';
import { mutate as globalMutate } from 'swr';
import { useWallet } from '@/hooks/useWallet';
import { useDisputeQueue } from '@/hooks/useDisputeQueue';
import { useDisputeDetail } from '@/hooks/useDisputeDetail';
import { buildRevokeMilestone } from '@/lib/contract';
import { parseContractError } from '@/lib/contractErrorMessage';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import TruncatedAddress from '@/components/ui/TruncatedAddress';
import DisputeEvidenceForm from '@/components/player/DisputeEvidenceForm';
import type {
  MilestoneDispute,
  DisputeEvent,
  DisputeWithEvents,
} from '@/types';
import { useLocale, useTranslations } from 'next-intl';
import { formatDate } from '@/lib/localeFormat';
import type { Locale } from '@/lib/locales';

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { classes: string }> = {
  pending: {
    classes: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  under_review: {
    classes: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  },
  escalated: {
    classes: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  upheld: {
    classes: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
  },
  reversed: {
    classes: 'bg-green-500/15 text-green-400 border-green-500/30',
  },
};

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('admin.disputes.statuses');
  const known = status in STATUS_STYLES;
  const s = {
    label: known ? t(status as Parameters<typeof t>[0]) : status,
    classes: STATUS_STYLES[status]?.classes ?? 'bg-gray-700 text-gray-300',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.classes}`}
    >
      {s.label}
    </span>
  );
}

// ── Event icon ────────────────────────────────────────────────────────────────

function eventIcon(type: DisputeEvent['type']): string {
  switch (type) {
    case 'opened':
      return '📋';
    case 'evidence_added':
      return '📎';
    case 'validator_response':
      return '🛡️';
    case 'admin_note':
      return '📝';
    case 'decided':
      return '⚖️';
    case 'escalated':
      return '🚨';
    default:
      return '•';
  }
}

const KNOWN_EVENT_TYPES = new Set([
  'opened',
  'evidence_added',
  'validator_response',
  'admin_note',
  'decided',
  'escalated',
]);

// ── IPFS evidence thumbnail ───────────────────────────────────────────────────

function EvidenceThumbnail({
  cid,
  mimeType,
}: {
  cid: string;
  mimeType: string;
}) {
  const t = useTranslations('admin.disputes');
  const gateway =
    process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs';
  const url = `${gateway}/${cid}`;

  if (mimeType.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={t('evidence_alt')}
          className="mt-2 max-h-40 rounded-lg border border-gray-700 object-cover"
        />
      </a>
    );
  }
  if (mimeType.startsWith('video/')) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption -- user-uploaded dispute evidence has no caption track to attach.
      <video
        src={url}
        controls
        className="mt-2 max-h-40 w-full rounded-lg border border-gray-700"
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-1 text-xs text-brand-green underline"
    >
      📄 View file (IPFS)
    </a>
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

function DisputeTimeline({ events }: { events: DisputeEvent[] }) {
  const locale = useLocale() as Locale;
  const t = useTranslations('admin.disputes');
  if (events.length === 0) {
    return <p className="text-xs text-gray-500 italic">{t('no_events')}</p>;
  }
  return (
    <ol className="relative border-l border-gray-700 pl-4 flex flex-col gap-4">
      {events.map((ev) => (
        <li key={ev.id} className="relative">
          {/* dot */}
          <span className="absolute -left-[1.1rem] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 border border-gray-700 text-xs">
            {eventIcon(ev.type)}
          </span>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-gray-200">
              {KNOWN_EVENT_TYPES.has(ev.type)
                ? t(`events.${ev.type}`)
                : ev.type}
            </span>
            <span className="text-gray-500">·</span>
            <TruncatedAddress
              address={ev.actorWallet}
              className="text-gray-500"
            />
            <span className="text-gray-500">·</span>
            <time className="text-gray-600">
              {formatDate(new Date(ev.createdAt), locale, {
                dateStyle: undefined,
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </div>

          {ev.body && (
            <p className="mt-1 text-sm text-gray-300 whitespace-pre-wrap">
              {ev.body}
            </p>
          )}

          {ev.ipfsHash && ev.ipfsMimeType && (
            <EvidenceThumbnail cid={ev.ipfsHash} mimeType={ev.ipfsMimeType} />
          )}
        </li>
      ))}
    </ol>
  );
}

// ── Admin note form ───────────────────────────────────────────────────────────

function AdminNoteForm({
  disputeId,
  onAdded,
}: {
  disputeId: number;
  onAdded: () => void;
}) {
  const t = useTranslations('admin.disputes');
  const { submitEvidence } = useDisputeDetail(disputeId);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-gray-400 underline hover:text-white"
      >
        {t('add_note')}
      </button>
    );
  }
  return (
    <DisputeEvidenceForm
      submitLabel={t('save_note')}
      onSubmit={async (params) => {
        await submitEvidence(params);
        onAdded();
        setOpen(false);
      }}
    />
  );
}

// ── Decision form ─────────────────────────────────────────────────────────────

type PendingAction = 'upheld' | 'reversed' | null;

function DecisionForm({
  dispute,
  onDecide,
}: {
  dispute: MilestoneDispute;
  onDecide: (
    id: number,
    decision: {
      status: 'upheld' | 'reversed';
      resolutionNote?: string;
      revokeTxHash?: string;
    },
  ) => Promise<MilestoneDispute>;
}) {
  const t = useTranslations('admin.disputes');
  const { publicKey, signAndSubmit } = useWallet();
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState<PendingAction>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!confirming) return;
    setWorking(true);
    setError(null);
    try {
      if (confirming === 'reversed') {
        if (!publicKey) throw new Error(t('wallet_not_connected'));
        const xdr = await buildRevokeMilestone(
          publicKey,
          dispute.playerId,
          dispute.milestoneId,
        );
        const txHash = await signAndSubmit(xdr);
        await globalMutate(`player:${dispute.playerId}`);
        await globalMutate(`milestones:${dispute.playerId}`);
        await onDecide(dispute.id, {
          status: 'reversed',
          resolutionNote: note.trim() || undefined,
          revokeTxHash: txHash,
        });
      } else {
        await onDecide(dispute.id, {
          status: 'upheld',
          resolutionNote: note.trim() || undefined,
        });
      }
      setConfirming(null);
    } catch (err) {
      setError(parseContractError(err));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-gray-800 pt-3 mt-1">
      <p className="text-xs font-medium text-gray-400">{t('admin_decision')}</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('note_placeholder')}
        rows={2}
        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2
          text-xs text-white placeholder-gray-500 focus:border-brand-green
          focus:outline-none"
      />
      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          id={`dispute-uphold-${dispute.id}`}
          onClick={() => setConfirming('upheld')}
          className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium
            text-gray-300 hover:bg-gray-800 transition"
        >
          {t('uphold_decision')}
        </button>
        <button
          type="button"
          id={`dispute-reverse-${dispute.id}`}
          onClick={() => setConfirming('reversed')}
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5
            text-xs font-medium text-red-400 hover:bg-red-500/20 transition"
        >
          {t('reverse_and_revoke')}
        </button>
      </div>

      <ConfirmDialog
        isOpen={confirming !== null}
        onConfirm={handleConfirm}
        onCancel={() => setConfirming(null)}
        loading={working}
        title={
          confirming === 'reversed'
            ? t('reverse_milestone')
            : t('uphold_decision')
        }
        message={
          confirming === 'reversed' ? t('reverse_message') : t('uphold_message')
        }
        confirmLabel={confirming === 'reversed' ? t('reverse') : t('uphold')}
      />
    </div>
  );
}

// ── Expanded dispute card ─────────────────────────────────────────────────────

function DisputeCard({
  dispute: summary,
  onDecide,
}: {
  dispute: MilestoneDispute;
  onDecide: (
    id: number,
    decision: {
      status: 'upheld' | 'reversed';
      resolutionNote?: string;
      revokeTxHash?: string;
    },
  ) => Promise<MilestoneDispute>;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('admin.disputes');
  const [expanded, setExpanded] = useState(false);
  const {
    dispute,
    loading: detailLoading,
    refetch,
  } = useDisputeDetail(expanded ? summary.id : null);

  const isPending =
    summary.status === 'pending' ||
    summary.status === 'under_review' ||
    summary.status === 'escalated';

  return (
    <li className="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden">
      {/* Summary header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3
          text-left hover:bg-gray-800/40 transition"
        aria-expanded={expanded}
        id={`dispute-header-${summary.id}`}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-sm font-medium text-gray-100 truncate">
            {summary.milestoneDescription}
          </p>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <TruncatedAddress address={summary.playerWallet} />
            <span>·</span>
            <time>
              {formatDate(new Date(summary.createdAt), locale, {
                dateStyle: undefined,
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </time>
            {summary.status === 'pending' && (
              <>
                <span>·</span>
                <span className="text-amber-400/80">
                  {t('deadline', {
                    date: formatDate(
                      new Date(summary.responseDeadline),
                      locale,
                      {
                        dateStyle: undefined,
                        month: 'short',
                        day: 'numeric',
                      },
                    ),
                  })}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={summary.status} />
          <span className="text-gray-600 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-gray-800 px-4 py-4 flex flex-col gap-4">
          {/* Claim */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              {t('player_claim')}
            </p>
            <p className="text-sm text-gray-200">{summary.reason}</p>
          </div>

          {/* Parties */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-gray-500 mb-0.5">{t('player')}</p>
              <TruncatedAddress
                address={summary.playerWallet}
                className="text-gray-300"
              />
            </div>
            <div>
              <p className="text-gray-500 mb-0.5">{t('validator')}</p>
              <TruncatedAddress
                address={summary.validatorWallet}
                className="text-gray-300"
              />
            </div>
          </div>

          {/* Event timeline */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {t('timeline')}
            </p>
            {detailLoading ? (
              <p className="text-xs text-gray-500 animate-pulse">
                {t('loading_timeline')}
              </p>
            ) : dispute ? (
              <DisputeTimeline events={dispute.events} />
            ) : null}
          </div>

          {/* Admin actions */}
          {isPending && (
            <>
              <AdminNoteForm disputeId={summary.id} onAdded={refetch} />
              <DecisionForm dispute={summary} onDecide={onDecide} />
            </>
          )}

          {/* Decided summary */}
          {!isPending && summary.decidedAt && (
            <div className="rounded-lg border border-gray-700 bg-gray-800/50 px-3 py-2 text-xs">
              <p className="text-gray-400">
                {t.rich('decided_on', {
                  date: formatDate(new Date(summary.decidedAt), locale),
                  time: (chunks) => <time>{chunks}</time>,
                })}{' '}
                <TruncatedAddress address={summary.decidedBy ?? ''} />
              </p>
              {summary.resolutionNote && (
                <p className="mt-1 text-gray-300">{summary.resolutionNote}</p>
              )}
              {summary.revokeTxHash && (
                <p className="mt-1 text-gray-500 break-all">
                  {t('revoke_tx', { hash: summary.revokeTxHash })}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

const STATUS_TABS = [
  { value: undefined, key: 'all' },
  { value: 'pending' as const, key: 'pending' },
  { value: 'escalated' as const, key: 'escalated' },
  { value: 'under_review' as const, key: 'under_review' },
] as const;

/**
 * Admin review panel for disputed milestones.
 *
 * Now shows a full threaded timeline for each dispute — player claim,
 * validator response, attached evidence, admin notes, and the final
 * decision record (with revoke tx hash when reversed).
 *
 * Reversing a dispute reuses the existing validator revoke_milestone flow;
 * the admin wallet must be an authorised validator on-chain.
 */
export default function DisputedMilestonesPanel() {
  const t = useTranslations('admin.disputes');
  const tAdmin = useTranslations('admin');
  const [activeTab, setActiveTab] = useState<
    'pending' | 'under_review' | 'escalated' | undefined
  >(undefined);

  const { disputes, loading, error, decide } = useDisputeQueue(activeTab);

  return (
    <section
      className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4"
      aria-labelledby="disputed-milestones-heading"
    >
      <div>
        <h2
          id="disputed-milestones-heading"
          className="text-lg font-semibold text-white"
        >
          {t('title')}
        </h2>
        <p className="text-sm text-gray-400 mt-1">{t('description')}</p>
      </div>

      {/* Tab filter */}
      <div className="flex gap-1 border-b border-gray-800 pb-0.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.value as typeof activeTab)}
            className={`px-3 py-1 text-xs rounded-t-md transition font-medium ${
              activeTab === tab.value
                ? 'bg-gray-800 text-white border border-b-0 border-gray-700'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t(`tabs.${tab.key}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">{tAdmin('loading')}</p>
      ) : error ? (
        <p role="alert" className="text-sm text-red-400">
          {t('load_failed')}
        </p>
      ) : disputes.length === 0 ? (
        <EmptyState
          title={t('empty_title')}
          description={t('empty_description')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {disputes.map((dispute) => (
            <DisputeCard key={dispute.id} dispute={dispute} onDecide={decide} />
          ))}
        </ul>
      )}
    </section>
  );
}
