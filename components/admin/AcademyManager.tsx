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
} from '@/lib/api';
import type { Academy } from '@/types';

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

  // Per-wallet on-chain validator status, so the panel can flag academy
  // members that haven't (yet) been added as validators via the section
  // above — academy membership and on-chain authorization are independent.
  const [onChainStatus, setOnChainStatus] = useState<
    Record<string, boolean | null>
  >({});

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
        <h2 className="text-lg font-semibold text-white">
          Academies ({academies.length})
        </h2>
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
                  <span className="text-xs text-gray-400 shrink-0">
                    {academy.members.length} signer
                    {academy.members.length !== 1 ? 's' : ''}
                  </span>
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
