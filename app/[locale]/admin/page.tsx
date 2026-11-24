'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import EmptyState from '@/components/ui/EmptyState';
import TransactionStatus from '@/components/ui/TransactionStatus';
import AdminDashboardSkeleton from '@/components/admin/AdminDashboardSkeleton';
import FraudFlagsPanel from '@/components/admin/FraudFlagsPanel';
import AcademyManager from '@/components/admin/AcademyManager';
import AdminAuditLog from '@/components/admin/AdminAuditLog';
import { recordAuditEntry } from '@/lib/adminAuditClient';
import type { TxStatus } from '@/components/ui/TransactionStatus';
import {
  getValidators,
  buildAddValidator,
  buildRemoveValidator,
  getPlatformFees,
  buildWithdrawFees,
  buildPauseContract,
  buildUnpauseContract,
  getContractPaused,
} from '@/lib/contract';
import { formatXlm } from '@/lib/formatXlm';
import {
  fetchActivityEvents,
  getReferralOverview,
  type ActivityEvent,
  type ActivityEventType,
} from '@/lib/api';
import type { ValidatorInfo, ReferralOverview } from '@/types';
import TruncatedAddress from '@/components/ui/TruncatedAddress';
import { parseContractError } from '@/lib/contractErrorMessage';
import ConfigStatus from '@/components/admin/ConfigStatus';

const ADMIN_ADDRESS = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
const CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? '';
const ACTIVITY_PAGE_SIZE = 20;
const COPIED_RESET_MS = 2000;

function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
  }
}

const EVENT_LABELS: Record<ActivityEventType, string> = {
  player_registered: 'Player Registered',
  milestone_approved: 'Milestone Approved',
  milestone_revoked: 'Milestone Revoked',
  scout_subscribed: 'Scout Subscribed',
  player_contacted: 'Player Contacted',
  fees_withdrawn: 'Fees Withdrawn',
};

type DialogAction = 'add' | 'remove' | 'withdraw' | 'pause' | 'unpause' | null;

function AdminDashboardContent() {
  const { publicKey, signAndSubmit } = useWallet();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const { show } = useToast();

  const [validators, setValidators] = useState<ValidatorInfo[]>([]);
  const [fees, setFees] = useState<number | null>(null);
  const [paused, setPaused] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [validatorInput, setValidatorInput] = useState('');
  const [removeTarget, setRemoveTarget] = useState('');

  const [withdrawTxStatus, setWithdrawTxStatus] = useState<TxStatus | null>(
    null,
  );
  const [withdrawTxHash, setWithdrawTxHash] = useState<string | null>(null);

  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [activityLoading, setActivityLoading] = useState(false);

  const [referralOverview, setReferralOverview] =
    useState<ReferralOverview | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);

  const [dialog, setDialog] = useState<{
    action: DialogAction;
    label: string;
    message: string;
  } | null>(null);

  const [contractIdCopied, setContractIdCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyResetTimer.current !== null) clearTimeout(copyResetTimer.current);
    },
    [],
  );

  const handleCopyContractId = useCallback(() => {
    copyToClipboard(CONTRACT_ID);
    setContractIdCopied(true);
    if (copyResetTimer.current !== null) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(
      () => setContractIdCopied(false),
      COPIED_RESET_MS,
    );
  }, []);

  // Gate: redirect non-admin
  useEffect(() => {
    if (!publicKey) return;
    if (publicKey !== ADMIN_ADDRESS) {
      show({
        message: 'Unauthorized: admin wallet required.',
        variant: 'error',
      });
      router.replace('/');
    }
  }, [publicKey, router, show]);

  useEffect(() => {
    if (publicKey !== ADMIN_ADDRESS) return;
    setFetchError(false);
    Promise.all([getValidators(), getPlatformFees(), getContractPaused()])
      .then(([v, f, p]) => {
        setValidators(v);
        setFees(f as number);
        setPaused(p as boolean);
      })
      .catch(() => {
        setFetchError(true);
        show({ message: 'Failed to load admin data.', variant: 'error' });
      })
      .finally(() => setLoading(false));
  }, [publicKey, show]);

  useEffect(() => {
    if (publicKey !== ADMIN_ADDRESS) return;
    setActivityLoading(true);
    fetchActivityEvents(activityPage, ACTIVITY_PAGE_SIZE)
      .then(({ events, total }) => {
        setActivity(events);
        setActivityTotal(total);
      })
      .catch(() =>
        show({ message: 'Failed to load activity.', variant: 'error' }),
      )
      .finally(() => setActivityLoading(false));
  }, [publicKey, activityPage, show]);

  useEffect(() => {
    if (publicKey !== ADMIN_ADDRESS) return;
    setReferralLoading(true);
    getReferralOverview()
      .then(setReferralOverview)
      .catch(() =>
        show({ message: 'Failed to load referral program data.', variant: 'error' }),
      )
      .finally(() => setReferralLoading(false));
  }, [publicKey, show]);

  async function execAction(action: DialogAction) {
    if (!publicKey) return;
    setActionLoading(true);
    try {
      let xdr: string;
      if (action === 'add') {
        xdr = await buildAddValidator(publicKey, validatorInput);
        const txHash = await signAndSubmit(xdr);
        recordAuditEntry({
          actionType: 'validator_add',
          target: validatorInput,
          txHash,
          status: 'submitted',
        }).catch(() => {});
        setValidators((v) => [
          ...v,
          {
            address: validatorInput,
            addedAt: Date.now() / 1000,
            addedBy: publicKey,
          },
        ]);
        setValidatorInput('');
        show({ message: 'Validator added.', variant: 'success' });
      } else if (action === 'remove') {
        xdr = await buildRemoveValidator(publicKey, removeTarget);
        const txHash = await signAndSubmit(xdr);
        recordAuditEntry({
          actionType: 'validator_remove',
          target: removeTarget,
          txHash,
          status: 'submitted',
        }).catch(() => {});
        setValidators((v) => v.filter((val) => val.address !== removeTarget));
        setRemoveTarget('');
        show({ message: 'Validator removed.', variant: 'success' });
      } else if (action === 'withdraw') {
        const amountStroops = fees ?? undefined;
        xdr = await buildWithdrawFees(publicKey);
        setWithdrawTxStatus('pending');
        const txHash = await signAndSubmit(xdr);
        recordAuditEntry({
          actionType: 'fee_withdrawal',
          amountStroops,
          txHash,
          status: 'submitted',
        }).catch(() => {});
        setWithdrawTxHash(txHash);
        setWithdrawTxStatus('success');
        const updatedFees = await getPlatformFees();
        setFees(updatedFees as number);
      } else if (action === 'pause') {
        xdr = await buildPauseContract(publicKey);
        const txHash = await signAndSubmit(xdr);
        recordAuditEntry({
          actionType: 'pause',
          txHash,
          status: 'submitted',
        }).catch(() => {});
        setPaused(true);
        show({ message: 'Contract paused.', variant: 'warning' });
      } else if (action === 'unpause') {
        xdr = await buildUnpauseContract(publicKey);
        const txHash = await signAndSubmit(xdr);
        recordAuditEntry({
          actionType: 'unpause',
          txHash,
          status: 'submitted',
        }).catch(() => {});
        setPaused(false);
        show({ message: 'Contract unpaused.', variant: 'success' });
      }
    } catch (e: any) {
      if (action === 'withdraw') setWithdrawTxStatus('error');
      show({ message: parseContractError(e), variant: 'error' });
    } finally {
      setActionLoading(false);
      setDialog(null);
    }
  }

  if (!publicKey || publicKey !== ADMIN_ADDRESS) return null;
  if (loading) return <AdminDashboardSkeleton />;
  if (fetchError)
    return (
      <div className="max-w-3xl mx-auto mt-20 flex flex-col items-center gap-4 text-center">
        <p className="text-gray-400">
          Failed to load admin data. Please check your connection and try again.
        </p>
        <button
          onClick={() => {
            setLoading(true);
            setFetchError(false);
            Promise.all([
              getValidators(),
              getPlatformFees(),
              getContractPaused(),
            ])
              .then(([v, f, p]) => {
                setValidators(v);
                setFees(f as number);
                setPaused(p as boolean);
              })
              .catch(() => {
                setFetchError(true);
                show({
                  message: 'Failed to load admin data.',
                  variant: 'error',
                });
              })
              .finally(() => setLoading(false));
          }}
          className="px-5 py-2 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition"
        >
          Retry
        </button>
      </div>
    );

  const activityTotalPages = Math.ceil(activityTotal / ACTIVITY_PAGE_SIZE);

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>

      {/* Contract Info */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">Contract</h2>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm text-gray-300 truncate">
            {CONTRACT_ID}
          </code>
          <button
            onClick={handleCopyContractId}
            aria-label="Copy contract ID to clipboard"
            className="shrink-0 rounded px-2 py-1 text-xs font-medium transition bg-gray-700 text-gray-300 hover:bg-gray-600"
          >
            {contractIdCopied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </section>

      {/* Circuit Breaker */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">Circuit Breaker</h2>
        <p className="text-sm text-gray-400">
          Status:{' '}
          <span
            className={
              paused
                ? 'text-red-400 font-medium'
                : 'text-brand-green font-medium'
            }
          >
            {paused ? 'Paused' : 'Active'}
          </span>
        </p>
        <button
          onClick={() =>
            setDialog(
              paused
                ? {
                    action: 'unpause',
                    label: 'Unpause Contract',
                    message: 'Are you sure you want to unpause the contract?',
                  }
                : {
                    action: 'pause',
                    label: 'Pause Contract',
                    message:
                      'Are you sure you want to pause the contract? All operations will halt.',
                  },
            )
          }
          className={`w-fit px-5 py-2 rounded-lg font-semibold transition ${paused ? 'bg-brand-green text-black hover:opacity-90' : 'bg-red-600 text-white hover:bg-red-700'}`}
        >
          {paused ? 'Unpause Contract' : 'Pause Contract'}
        </button>
      </section>

      {/* Platform Fees */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">Platform Fees</h2>
        <p className="text-sm text-gray-400">
          Accumulated:{' '}
          <span className="text-white font-medium">
            {formatXlm(fees ?? 0, locale)} XLM
          </span>
        </p>
        <button
          disabled={!fees || fees <= 0 || paused}
          onClick={() =>
            setDialog({
              action: 'withdraw',
              label: 'Withdraw Fees',
              message: `Withdraw ${formatXlm(fees ?? 0, locale)} XLM to your wallet?`,
            })
          }
          title={paused ? 'Contract is currently paused' : undefined}
          className="w-fit px-5 py-2 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition disabled:opacity-40"
        >
          Withdraw Fees
        </button>
        <TransactionStatus
          status={withdrawTxStatus}
          txHash={withdrawTxHash}
          onHide={() => {
            setWithdrawTxStatus(null);
            setWithdrawTxHash(null);
          }}
        />
      </section>

      {/* Runtime Configuration Status */}
      <ConfigStatus />

      {/* Add Validator */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">Add Validator</h2>
        <div className="flex gap-3">
          <input
            className="input flex-1"
            placeholder="Stellar public key (G...)"
            value={validatorInput}
            onChange={(e) => setValidatorInput(e.target.value)}
          />
          <button
            disabled={
              !validatorInput.startsWith('G') ||
              validatorInput.length !== 56 ||
              paused
            }
            onClick={() =>
              setDialog({
                action: 'add',
                label: 'Add Validator',
                message: `Add ${validatorInput} as a validator?`,
              })
            }
            title={paused ? 'Contract is currently paused' : undefined}
            className="px-5 py-2 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </section>

      {/* Validators List + Remove */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">
          Validators ({validators.length})
        </h2>
        {validators.length === 0 ? (
          <p className="text-sm text-gray-500">No validators authorized.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {validators.map((v) => (
              <li
                key={v.address}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span className="text-gray-300 font-mono truncate">
                  <TruncatedAddress
                    address={v.address}
                    className="text-gray-300"
                  />
                </span>
                <button
                  disabled={paused}
                  onClick={() => {
                    setRemoveTarget(v.address);
                    setDialog({
                      action: 'remove',
                      label: 'Remove Validator',
                      message: `Remove ${v.address.slice(0, 4)}…${v.address.slice(-4)} from validators?`,
                    });
                  }}
                  title={paused ? 'Contract is currently paused' : undefined}
                  className="text-red-400 hover:text-red-300 transition shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Academies (issue #663) — off-chain grouping of validator wallets
          under one institutional identity. See docs/academy-validator-model.md */}
      <AcademyManager />

      {/* Activity Feed */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">Activity</h2>
        {activityLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : activity.length === 0 ? (
          <EmptyState
            title="No activity yet"
            description="Contract events will appear here once transactions are recorded."
          />
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-gray-800">
              {activity.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center gap-4 py-3 text-sm first:pt-0 last:pb-0"
                >
                  <span className="text-gray-200 shrink-0">
                    {EVENT_LABELS[event.type]}
                  </span>
                  <span className="font-mono text-gray-500 truncate">
                    <TruncatedAddress
                      address={event.actor}
                      className="text-gray-500"
                    />
                  </span>
                  {event.subjectId && (
                    <span className="font-mono text-gray-500 truncate">
                      <TruncatedAddress
                        address={event.subjectId}
                        className="text-gray-500"
                      />
                    </span>
                  )}
                  <span className="text-gray-500 shrink-0 ml-auto">
                    {new Date(event.timestamp * 1000).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
            {activityTotal > ACTIVITY_PAGE_SIZE && (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                  disabled={activityPage <= 1}
                  className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 disabled:opacity-40 hover:border-brand-green transition"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-400">
                  Page {activityPage} of {activityTotalPages}
                </span>
                <button
                  onClick={() =>
                    setActivityPage((p) => Math.min(activityTotalPages, p + 1))
                  }
                  disabled={activityPage >= activityTotalPages}
                  className="px-4 py-2 rounded-lg border border-gray-700 text-gray-300 disabled:opacity-40 hover:border-brand-green transition"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* Referral Program */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">Referral Program</h2>
        {referralLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : !referralOverview || referralOverview.totalCodes === 0 ? (
          <EmptyState
            title="No referral activity yet"
            description="Codes and successful referrals generated by scouts will appear here."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Codes Generated
                </p>
                <p className="text-2xl font-semibold text-white">
                  {referralOverview.totalCodes}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Successful Referrals
                </p>
                <p className="text-2xl font-semibold text-white">
                  {referralOverview.totalSuccessfulReferrals}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">
                Top Referrers
              </h3>
              <ul className="flex flex-col divide-y divide-gray-800">
                {referralOverview.topReferrers.map((r) => (
                  <li
                    key={r.scoutWallet}
                    className="flex items-center justify-between gap-4 py-2 text-sm"
                  >
                    <span className="font-mono text-gray-300 truncate">
                      <TruncatedAddress
                        address={r.scoutWallet}
                        className="text-gray-300"
                      />
                    </span>
                    <span className="text-gray-400 shrink-0">
                      {r.successfulReferrals} referral
                      {r.successfulReferrals !== 1 ? 's' : ''} · {r.totalCodes}{' '}
                      code{r.totalCodes !== 1 ? 's' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>

      <AdminAuditLog />

      <FraudFlagsPanel />

      {dialog && (
        <ConfirmDialog
          isOpen
          title={dialog.label}
          message={dialog.message}
          confirmLabel={dialog.label}
          loading={actionLoading}
          onConfirm={() => execAction(dialog.action)}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <ErrorBoundary>
      <AdminDashboardContent />
    </ErrorBoundary>
  );
}
