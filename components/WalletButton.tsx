'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@/hooks/useWallet';
import {
  WALLET_PROVIDERS,
  WALLET_INSTALL_URLS,
  isWalletInstalled,
} from '@/context/WalletContext';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import type { WalletProvider } from '@/context/WalletContext';
import { Copy, Check } from 'lucide-react';

async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    return document.execCommand('copy');
  } finally {
    document.body.removeChild(textarea);
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? 'Copied' : 'Copy address'}
      aria-label={copied ? 'Address copied' : 'Copy wallet address'}
      className="p-1 rounded hover:bg-brand-green/20 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green"
    >
      {copied ? (
        <Check className="w-4 h-4" aria-hidden="true" />
      ) : (
        <Copy className="w-4 h-4" aria-hidden="true" />
      )}
    </button>
  );
}

export default function WalletButton({
  hideBalance = false,
}: {
  hideBalance?: boolean;
}) {
  const t = useTranslations('wallet');
  const { show: showToast } = useToast();
  const {
    publicKey,
    connect,
    disconnect,
    isConnecting,
    connectingProvider,
    xlmBalance,
    balanceError,
    isLoadingBalance,
    walletProviderInfo,
    showWalletModal,
    closeWalletModal,
    connectWithProvider,
  } = useWallet();

  // ── Remember me state ────────────────────────────────────────────────────
  const [rememberMe, setRememberMe] = useState(false);

  // ── Wallet install detection ─────────────────────────────────────────────
  const [installedMap, setInstalledMap] = useState<
    Partial<Record<WalletProvider, boolean>>
  >({});

  useEffect(() => {
    if (!showWalletModal) return;
    let cancelled = false;
    Promise.all(
      WALLET_PROVIDERS.filter((wp) => !wp.comingSoon).map(async (wp) => {
        const provider = wp.provider as WalletProvider;
        return [provider, await isWalletInstalled(provider)] as const;
      }),
    )
      .then((results) => {
        if (cancelled) return;
        setInstalledMap(Object.fromEntries(results));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showWalletModal]);

  const availableProviders = WALLET_PROVIDERS.filter((wp) => !wp.comingSoon);
  const allChecked = availableProviders.every(
    (wp) => installedMap[wp.provider as WalletProvider] !== undefined,
  );
  const noneInstalled =
    allChecked &&
    availableProviders.every(
      (wp) => installedMap[wp.provider as WalletProvider] === false,
    );

  // ── Disconnect confirmation state ────────────────────────────────────────
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnectConfirm = useCallback(async () => {
    setIsDisconnecting(true);
    try {
      await disconnect();
    } finally {
      setIsDisconnecting(false);
      setDisconnectOpen(false);
    }
  }, [disconnect]);

  // ── Provider connection ──────────────────────────────────────────────────
  async function handleConnectWithProvider(provider: WalletProvider) {
    try {
      await connectWithProvider(provider, rememberMe);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to connect wallet';
      showToast({ variant: 'error', message });
    }
  }

  if (publicKey) {
    return (
      <>
        <div
          className="flex items-center gap-1 text-sm bg-brand-card border border-brand-green text-brand-green px-3 py-2 rounded-lg"
          data-tour="wallet-button"
        >
          <button
            onClick={() => setDisconnectOpen(true)}
            title={t('disconnect')}
            aria-label={`${t('disconnect')} — ${publicKey.slice(0, 4)}…${publicKey.slice(-4)}`}
            className="flex items-center gap-2 hover:opacity-80 transition"
          >
            {walletProviderInfo && (
              <span className="text-base" aria-hidden="true">
                {walletProviderInfo.icon}
              </span>
            )}
            <span>
              {publicKey.slice(0, 4)}…{publicKey.slice(-4)}
            </span>
          </button>

          <CopyButton text={publicKey} />

          <span className="border-l border-current pl-2 opacity-80">
            {isLoadingBalance ? (
              <Spinner size="sm" />
            ) : balanceError ? (
              <span
                className="text-yellow-400"
                title={t('balanceError')}
                aria-label={t('balanceError')}
              >
                ⚠ XLM
              </span>
            ) : (
              <span>{xlmBalance ?? '0.00'} XLM</span>
            )}
          </span>
        </div>

        <ConfirmDialog
          isOpen={disconnectOpen}
          title="Disconnect wallet?"
          message="You will need to reconnect and sign again to access your dashboard."
          confirmLabel="Disconnect"
          cancelLabel="Cancel"
          loading={isDisconnecting}
          onConfirm={handleDisconnectConfirm}
          onCancel={() => setDisconnectOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <button
        onClick={connect}
        disabled={isConnecting}
        aria-pressed={false}
        aria-label={isConnecting ? t('connecting') : t('connect')}
        data-tour="wallet-button"
        className="text-sm bg-brand-green text-black font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
      >
        {isConnecting ? t('connecting') : t('connect')}
      </button>

      {/* Wallet Selection Modal */}
      <Modal isOpen={showWalletModal} onClose={closeWalletModal}>
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">
            {t('selectProvider')}
          </h2>
          <p className="text-sm text-gray-400">{t('selectProviderHint')}</p>
          {noneInstalled && (
            <div
              role="status"
              className="rounded-lg border border-yellow-700 bg-yellow-950 px-4 py-3 text-sm text-yellow-300"
            >
              {t('noWalletInstalledBanner')}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {WALLET_PROVIDERS.length === 0 ? (
              <p className="text-sm text-gray-400">{t('noWalletDetected')}</p>
            ) : (
              WALLET_PROVIDERS.map((wp) => {
                const isThisConnecting = connectingProvider === wp.provider;
                const isOtherConnecting =
                  isConnecting && connectingProvider !== wp.provider;
                return (
                  <button
                    key={wp.provider}
                    type="button"
                    onClick={
                      wp.comingSoon
                        ? undefined
                        : () =>
                            handleConnectWithProvider(
                              wp.provider as WalletProvider,
                            )
                    }
                    disabled={
                      wp.comingSoon || isThisConnecting || isOtherConnecting
                    }
                    aria-disabled={wp.comingSoon}
                    className="flex items-center gap-3 w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-left text-white hover:border-brand-green hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="text-2xl shrink-0" aria-hidden="true">
                      {wp.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{wp.label}</p>
                      <p className="text-xs text-gray-400">
                        {wp.comingSoon
                          ? t('comingSoon')
                          : wp.provider === 'ledger'
                            ? t('ledgerConnect')
                            : wp.provider === 'albedo'
                              ? t('installMobile')
                              : t('install')}
                      </p>
                      {wp.provider === 'ledger' && (
                        <p className="text-xs text-yellow-400 mt-1">
                          {t('ledgerInstructions')}
                        </p>
                      )}
                    </div>
                    {isThisConnecting && (
                      <span className="flex items-center gap-2 text-sm text-brand-green shrink-0">
                        <Spinner size="sm" />
                        {t('connecting')}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* ── Remember this device checkbox ── */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-800 text-brand-green focus:ring-brand-green focus:ring-offset-0 cursor-pointer"
            />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-gray-200 group-hover:text-white transition">
                {t('rememberDevice')}
              </span>
              <span className="text-xs text-gray-500">
                {t('rememberDeviceHint')}
              </span>
            </div>
          </label>

          <button
            type="button"
            onClick={closeWalletModal}
            className="text-sm text-gray-400 hover:text-gray-300 transition self-center"
          >
            {t('cancel')}
          </button>
        </div>
      </Modal>
    </>
  );
}
