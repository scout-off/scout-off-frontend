'use client';

/**
 * AcademyManager (issue #663)
 *
 * Lets an admin group several validator wallets under one academy identity
 * (e.g. head coach, assistant coaches, academy director all approving
 * milestones on behalf of "FC Sahel"). This is purely an off-chain grouping
 * layer — see docs/academy-validator-model.md for the full design and why
 * on-chain authorization (add_validator/approve_milestone) stays untouched
 * and per-wallet. Each member wallet still needs to be added as a validator
 * via the "Validators" section above for its approvals to be authorized
 * on-chain; this panel flags members that aren't (yet).
 */

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import TruncatedAddress from '@/components/ui/TruncatedAddress';
import { checkIsValidator } from '@/lib/contract';
import {
  fetchAcademies,
  createAcademy,
  addAcademyMember,
  removeAcademyMember,
  fetchAcademyMilestoneRollup,
} from '@/lib/api';
import type { Academy, AcademyMilestoneRollupEntry } from '@/types';

const ROLLUP_RANGE_OPTIONS: { value: number | 'all'; label: string }[] = [
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

function isStellarAddress(value: string): boolean {
  return value.startsWith('G') && value.length === 56;
}

type DialogState =
  | { action: 'add-member'; academyId: string; wallet: string }
  | { action: 'remove-member'; academyId: string; wallet: string }
  | null;

export default function AcademyManager() {
  const { show } = useToast();

  const [academies, setAcademies] = useState<Academy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [newName, setNewName] = useState('');
  const [newOwnerWallet, setNewOwnerWallet] = useState('');
  const [memberInputs, setMemberInputs] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<DialogState>(null);
  // Draft quorum input per academy, keyed by academy id, seeded lazily from
  // the academy's current value the first time its input is touched — see
  // quorumDraftFor below.
  const [quorumInputs, setQuorumInputs] = useState<Record<string, string>>({});
  const [quorumSaving, setQuorumSaving] = useState<string | null>(null);

  // Per-wallet on-chain validator status, so the panel can flag academy
  // members that haven't (yet) been added as validators via the section
  // above — academy membership and on-chain authorization are independent.
  const [onChainStatus, setOnChainStatus] = useState<
    Record<string, boolean | null>
  >({});

  // Academy-scoped milestone-approval rollup (issue #1172). Keyed by
  // academyId so each academy's card can show its own total; null while
  // loading or when the indexer is unreachable for the current range.
  const [rollupRangeDays, setRollupRangeDays] = useState<number | 'all'>(30);
  const [rollupByAcademy, setRollupByAcademy] = useState<
    Record<string, AcademyMilestoneRollupEntry>
  >({});
  const [rollupIndexerAvailable, setRollupIndexerAvailable] = useState(true);
  const [rollupLoading, setRollupLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetchAcademies()
      .then(setAcademies)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const wallets = academies.flatMap((a) => a.members.map((m) => m.wallet));
    const unchecked = wallets.filter((w) => !(w in onChainStatus));
    if (unchecked.length === 0) return;

    unchecked.forEach((wallet) => {
      checkIsValidator(wallet)
        .then((isValidator) =>
          setOnChainStatus((s) => ({ ...s, [wallet]: Boolean(isValidator) })),
        )
        .catch(() => setOnChainStatus((s) => ({ ...s, [wallet]: null })));
    });
    // Only re-run when the set of known member wallets changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academies]);

  useEffect(() => {
    if (academies.length === 0) {
      setRollupByAcademy({});
      return;
    }
    let cancelled = false;
    setRollupLoading(true);
    fetchAcademyMilestoneRollup(rollupRangeDays)
      .then((rollup) => {
        if (cancelled) return;
        setRollupIndexerAvailable(rollup.indexerAvailable);
        setRollupByAcademy(
          Object.fromEntries(rollup.academies.map((e) => [e.academyId, e])),
        );
      })
      .catch(() => {
        if (!cancelled) setRollupIndexerAvailable(false);
      })
      .finally(() => {
        if (!cancelled) setRollupLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch when the academy list changes (new/removed academy) or the range changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academies, rollupRangeDays]);

  async function handleCreate() {
    if (!newName.trim() || !isStellarAddress(newOwnerWallet)) return;
    setActionLoading(true);
    try {
      const academy = await createAcademy(newName.trim(), newOwnerWallet);
      setAcademies((list) => [academy, ...list]);
      setNewName('');
      setNewOwnerWallet('');
      show({
        message: `Academy "${academy.name}" created.`,
        variant: 'success',
      });
    } catch (e: any) {
      show({
        message: e?.message ?? 'Failed to create academy.',
        variant: 'error',
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddMember(academyId: string) {
    const wallet = (memberInputs[academyId] ?? '').trim();
    if (!isStellarAddress(wallet)) return;
    setActionLoading(true);
    try {
      const academy = await addAcademyMember(academyId, wallet);
      setAcademies((list) =>
        list.map((a) => (a.id === academyId ? academy : a)),
      );
      setMemberInputs((s) => ({ ...s, [academyId]: '' }));
      show({ message: 'Signer wallet added to academy.', variant: 'success' });
    } catch (e: any) {
      show({
        message: e?.message ?? 'Failed to add signer wallet.',
        variant: 'error',
      });
    } finally {
      setActionLoading(false);
      setDialog(null);
    }
  }

  async function handleRemoveMember(academyId: string, wallet: string) {
    setActionLoading(true);
    try {
      await removeAcademyMember(academyId, wallet);
      setAcademies((list) =>
        list.map((a) =>
          a.id === academyId
            ? { ...a, members: a.members.filter((m) => m.wallet !== wallet) }
            : a,
        ),
      );
      show({
        message: 'Signer wallet removed from academy.',
        variant: 'success',
      });
    } catch (e: any) {
      show({
        message: e?.message ?? 'Failed to remove signer wallet.',
        variant: 'error',
      });
    } finally {
      setActionLoading(false);
      setDialog(null);
    }
  }

  function quorumDraftFor(academy: Academy): string {
    return quorumInputs[academy.id] ?? (academy.quorum?.toString() ?? '');
  }

  /**
   * Saves an academy's milestone-approval quorum (issue #1185) — an empty
   * input clears the quorum (back to today's default, no-quorum-configured
   * behavior); any other value must be a positive integer.
   */
  async function handleSaveQuorum(academy: Academy) {
    const raw = quorumDraftFor(academy).trim();
    const quorum = raw === '' ? null : Number(raw);
    if (quorum !== null && (!Number.isInteger(quorum) || quorum < 1)) {
      show({
        message: 'Quorum must be a positive whole number, or empty to clear it.',
        variant: 'error',
      });
      return;
    }

    setQuorumSaving(academy.id);
    try {
      const updated = await setAcademyQuorum(academy.id, quorum);
      setAcademies((list) =>
        list.map((a) => (a.id === academy.id ? updated : a)),
      );
      setQuorumInputs((s) => {
        const next = { ...s };
        delete next[academy.id];
        return next;
      });
      show({
        message:
          quorum === null
            ? 'Quorum cleared.'
            : `Quorum set to ${quorum} signer${quorum !== 1 ? 's' : ''}.`,
        variant: 'success',
      });
    } catch (e: any) {
      show({ message: e?.message ?? 'Failed to set quorum.', variant: 'error' });
    } finally {
      setQuorumSaving(null);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-400">Loading academies…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-red-400">
        Failed to load academies.{' '}
        <button onClick={load} className="underline hover:text-red-300">
          Retry
        </button>
      </p>
    );
  }

  return (
    <>
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">Create Academy</h2>
        <p className="text-xs text-gray-400">
          Groups several signer wallets (head coach, assistant coaches, academy
          director) under one institutional identity. Each signer must still be
          added as a validator above for its milestone approvals to be
          authorized on-chain — an academy record is an off-chain label, not a
          replacement for validator authorization.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            className="input flex-1"
            placeholder="Academy name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="input flex-1"
            placeholder="Owner's Stellar public key (G...)"
            value={newOwnerWallet}
            onChange={(e) => setNewOwnerWallet(e.target.value)}
          />
          <button
            disabled={
              !newName.trim() ||
              !isStellarAddress(newOwnerWallet) ||
              actionLoading
            }
            onClick={handleCreate}
            className="px-5 py-2 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </section>

      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">
            Academies ({academies.length})
          </h2>
          {academies.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-gray-400">
              Milestones approved
              <select
                className="input text-xs py-1"
                value={String(rollupRangeDays)}
                onChange={(e) =>
                  setRollupRangeDays(
                    e.target.value === 'all' ? 'all' : Number(e.target.value),
                  )
                }
              >
                {ROLLUP_RANGE_OPTIONS.map((opt) => (
                  <option key={String(opt.value)} value={String(opt.value)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {academies.length > 0 && !rollupLoading && !rollupIndexerAvailable && (
          <p className="text-xs text-amber-400">
            Milestone counts are unavailable right now (indexer unreachable).
          </p>
        )}
        {academies.length === 0 ? (
          <p className="text-sm text-gray-400">No academies created.</p>
        ) : (
          <ul className="flex flex-col gap-6">
            {academies.map((academy) => (
              <li
                key={academy.id}
                className="border border-gray-800 rounded-lg p-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white font-semibold">{academy.name}</p>
                    <p className="text-xs text-gray-400">
                      Owner:{' '}
                      <TruncatedAddress
                        address={academy.ownerWallet}
                        className="text-gray-400"
                      />
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-gray-400 block">
                      {academy.members.length} signer
                      {academy.members.length !== 1 ? 's' : ''}
                    </span>
                    {rollupIndexerAvailable &&
                      rollupByAcademy[academy.id]?.approvedMilestones !==
                        null &&
                      rollupByAcademy[academy.id]?.approvedMilestones !==
                        undefined && (
                        <span
                          className="text-xs text-brand-green block"
                          title="Total milestones approved across this academy's registered signer wallets. Excludes approvals from before a wallet joined; see docs/academy-validator-model.md for the historical-attribution caveat on removed wallets."
                        >
                          {rollupByAcademy[academy.id]!.approvedMilestones}{' '}
                          milestone
                          {rollupByAcademy[academy.id]!.approvedMilestones !==
                          1
                            ? 's'
                            : ''}{' '}
                          approved
                        </span>
                      )}
                  </div>
                </div>

                {/* Milestone approval quorum (issue #1185) — optional,
                    off-chain-only. Unset by default: an academy that never
                    touches this behaves identically to before this feature
                    existed. See docs/academy-validator-model.md. */}
                <div className="flex items-center gap-2 border-t border-gray-800 pt-3">
                  <label
                    htmlFor={`quorum-${academy.id}`}
                    className="text-xs text-gray-400 shrink-0"
                  >
                    Milestone-verification quorum
                  </label>
                  <input
                    id={`quorum-${academy.id}`}
                    type="number"
                    min={1}
                    step={1}
                    placeholder="Not configured"
                    className="input w-28 text-sm"
                    value={quorumDraftFor(academy)}
                    onChange={(e) =>
                      setQuorumInputs((s) => ({
                        ...s,
                        [academy.id]: e.target.value,
                      }))
                    }
                  />
                  <button
                    onClick={() => handleSaveQuorum(academy)}
                    disabled={quorumSaving === academy.id}
                    className="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:border-brand-green transition text-xs disabled:opacity-40 shrink-0"
                  >
                    {quorumSaving === academy.id ? 'Saving…' : 'Save'}
                  </button>
                  {academy.quorum ? (
                    <span className="text-xs text-emerald-400 shrink-0">
                      {academy.quorum} signer
                      {academy.quorum !== 1 ? 's' : ''} required
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500 shrink-0">
                      Not configured
                    </span>
                  )}
                </div>

                {academy.members.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {academy.members.map((m) => (
                      <li
                        key={m.wallet}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <TruncatedAddress
                            address={m.wallet}
                            className="text-gray-300"
                          />
                          {onChainStatus[m.wallet] === false && (
                            <span
                              className="text-xs text-amber-400"
                              title="Not currently authorized on-chain — add via the Validators section above"
                            >
                              not on-chain
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() =>
                            setDialog({
                              action: 'remove-member',
                              academyId: academy.id,
                              wallet: m.wallet,
                            })
                          }
                          className="text-red-400 hover:text-red-300 transition text-xs shrink-0"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex gap-2">
                  <input
                    className="input flex-1 text-sm"
                    placeholder="Add signer wallet (G...)"
                    value={memberInputs[academy.id] ?? ''}
                    onChange={(e) =>
                      setMemberInputs((s) => ({
                        ...s,
                        [academy.id]: e.target.value,
                      }))
                    }
                  />
                  <button
                    disabled={
                      !isStellarAddress(memberInputs[academy.id] ?? '') ||
                      actionLoading
                    }
                    onClick={() =>
                      setDialog({
                        action: 'add-member',
                        academyId: academy.id,
                        wallet: (memberInputs[academy.id] ?? '').trim(),
                      })
                    }
                    className="px-4 py-2 rounded-lg bg-brand-green text-black text-sm font-semibold hover:opacity-90 transition disabled:opacity-40 shrink-0"
                  >
                    Add
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dialog && (
        <ConfirmDialog
          isOpen
          title={
            dialog.action === 'add-member'
              ? 'Add Signer Wallet'
              : 'Remove Signer Wallet'
          }
          message={
            dialog.action === 'add-member'
              ? `Add ${dialog.wallet} as a signer wallet for this academy?`
              : `Remove ${dialog.wallet.slice(0, 4)}…${dialog.wallet.slice(-4)} from this academy?`
          }
          confirmLabel={
            dialog.action === 'add-member' ? 'Add Signer' : 'Remove Signer'
          }
          loading={actionLoading}
          onConfirm={() =>
            dialog.action === 'add-member'
              ? handleAddMember(dialog.academyId)
              : handleRemoveMember(dialog.academyId, dialog.wallet)
          }
          onCancel={() => setDialog(null)}
        />
      )}
    </>
  );
}
