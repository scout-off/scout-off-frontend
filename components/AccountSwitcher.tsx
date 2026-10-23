'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/components/ui/Toast';
import {
  getRememberedAddresses,
  removeRememberedAddress,
  clearAllRememberedAddresses,
  type RememberedAddress,
  WalletAccountMismatchError,
} from '@/context/WalletContext';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Spinner from '@/components/ui/Spinner';

export default function AccountSwitcher() {
  const locale = useLocale();
  const tWallet = useTranslations('wallet');
  const {
    publicKey,
    isAuthenticated,
    isConnecting,
    walletProvider,
    connectWithProvider,
  } = useWallet();
  const { show: showToast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [addresses, setAddresses] = useState<RememberedAddress[]>([]);
  const [removeTarget, setRemoveTarget] = useState<RememberedAddress | null>(
    null,
  );
  const [forgetAllOpen, setForgetAllOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load remembered addresses whenever wallet state changes
  useEffect(() => {
    setAddresses(getRememberedAddresses());
  }, [publicKey, isAuthenticated]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  const handleSwitch = useCallback(
    async (addr: RememberedAddress) => {
      if (addr.publicKey === publicKey) {
        setIsOpen(false);
        return;
      }
      setSwitchingTo(addr.publicKey);
      try {
        // Pass the target address as expectedPublicKey so doConnect can verify
        // the wallet adapter actually returned the account the user selected.
        // Wallet extension APIs (Freighter, Albedo, Ledger) always return their
        // currently-active account — they cannot be directed to a specific key —
        // so a mismatch is possible and must be caught explicitly here.
        await connectWithProvider(addr.provider, false, addr.publicKey);
        setIsOpen(false);
        showToast({
          variant: 'success',
          message: tWallet('accountSwitched'),
        });
      } catch (err) {
        if (err instanceof WalletAccountMismatchError) {
          // The wallet extension's active account differs from the one the user
          // selected.  Surface a clear, actionable message — the user must switch
          // the active account inside the extension themselves, since we cannot
          // do it for them.
          showToast({
            variant: 'error',
            message: tWallet('accountSwitchMismatch'),
          });
        } else {
          showToast({
            variant: 'error',
            message: tWallet('accountSwitchFailed'),
          });
        }
      } finally {
        setSwitchingTo(null);
      }
    },
    [publicKey, connectWithProvider, showToast, tWallet],
  );

  const handleRemove = useCallback((addr: RememberedAddress) => {
    removeRememberedAddress(addr.publicKey);
    setAddresses(getRememberedAddresses());
    setRemoveTarget(null);
  }, []);

  const handleForgetAll = useCallback(() => {
    clearAllRememberedAddresses();
    setAddresses([]);
    setForgetAllOpen(false);
    setIsOpen(false);
  }, []);

  // Only show if authenticated
  if (!isAuthenticated) return null;

  const otherAddresses = addresses.filter((a) => a.publicKey !== publicKey);
  const hasAddresses = addresses.length > 0;

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={tWallet('accountSwitcherLabel')}
          disabled={isConnecting}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-white transition disabled:opacity-50 px-2 py-1 rounded hover:bg-gray-800"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <polyline points="16 11 18 13 22 9" />
          </svg>
          <span className="text-xs">▾</span>
        </button>

        {isOpen && (
          <div
            role="listbox"
            aria-label={tWallet('accountSwitcherLabel')}
            className="absolute right-0 mt-2 w-72 sm:w-80 bg-brand-card border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-gray-800">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                {tWallet('switchAccountTitle')}
              </p>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {/* Current account */}
              {publicKey && (
                <div className="px-3 py-2 border-b border-gray-800 bg-brand-green/5">
                  <p className="text-xs text-brand-green font-medium mb-1">
                    {tWallet('currentAccount')}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white font-mono">
                      {publicKey.slice(0, 6)}…{publicKey.slice(-6)}
                    </span>
                    {walletProvider && (
                      <span className="text-xs text-gray-500 capitalize">
                        {walletProvider}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Other remembered addresses */}
              {otherAddresses.map((addr) => (
                <div
                  key={addr.publicKey}
                  className="flex items-center justify-between px-3 py-2.5 hover:bg-gray-800/50 transition group"
                >
                  <button
                    type="button"
                    disabled={isConnecting}
                    onClick={() => handleSwitch(addr)}
                    className="flex-1 text-left min-w-0"
                  >
                    <span className="text-sm text-gray-300 font-mono block truncate">
                      {addr.publicKey.slice(0, 6)}…{addr.publicKey.slice(-6)}
                    </span>
                    <span className="text-xs text-gray-600">
                      <span className="capitalize">{addr.provider}</span> ·{' '}
                      {new Date(addr.lastUsed).toLocaleDateString(locale)}
                    </span>
                  </button>

                  {switchingTo === addr.publicKey ? (
                    <Spinner size="sm" />
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRemoveTarget(addr);
                      }}
                      aria-label={`Remove ${addr.publicKey.slice(0, 6)}…`}
                      className="text-gray-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100 p-1"
                    >
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}

              {otherAddresses.length === 0 && (
                <p className="px-3 py-4 text-xs text-gray-600 text-center">
                  No other remembered accounts.
                </p>
              )}
            </div>

            {/* Forget all remembered devices — revoke action */}
            {hasAddresses && (
              <div className="border-t border-gray-800 px-3 py-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setForgetAllOpen(true);
                  }}
                  className="w-full text-left text-xs text-red-400 hover:text-red-300 transition py-1"
                >
                  {tWallet('forgetAllAccounts')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Remove single account confirmation */}
      <ConfirmDialog
        isOpen={removeTarget !== null}
        title={tWallet('removeAccountConfirmTitle')}
        message={tWallet('removeAccountConfirmMessage')}
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={() => {
          if (removeTarget) handleRemove(removeTarget);
        }}
        onCancel={() => setRemoveTarget(null)}
      />

      {/* Forget all remembered devices confirmation */}
      <ConfirmDialog
        isOpen={forgetAllOpen}
        title={tWallet('forgetAllConfirmTitle')}
        message={tWallet('forgetAllConfirmMessage')}
        confirmLabel="Forget all"
        cancelLabel="Keep"
        onConfirm={handleForgetAll}
        onCancel={() => setForgetAllOpen(false)}
      />
    </>
  );
}
