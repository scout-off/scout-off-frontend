'use client';
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWallet } from '@/hooks/useWallet';
import { WALLET_PROVIDERS } from '@/context/WalletContext';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import type { WalletProvider } from '@/context/WalletContext';

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
        {copied ? (
          <>
            <polyline points="20 6 9 17 4 12" />
          </>
        ) : (
          <>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </>
        )}
      </svg>
    </button>
  );
}

export default function WalletButton() {
  const t = useTranslations('wallet');
  const {
    publicKey,
    connect,
    disconnect,
    isConnecting,
    xlmBalance,
    isLoadingBalance,
    walletProviderInfo,
    showWalletModal,
    closeWalletModal,
    connectWithProvider,
  } = useWallet();

  if (publicKey) {
    return (
      <div className="flex items-center gap-1 text-sm bg-brand-card border border-brand-green text-brand-green px-3 py-2 rounded-lg">
        <button
          onClick={disconnect}
          title={t('disconnect')}
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
          ) : (
            <span>{xlmBalance ?? '0.00'} XLM</span>
          )}
        </span>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={connect}
        disabled={isConnecting}
        aria-pressed={false}
        className="text-sm bg-brand-green text-black font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50"
      >
        {isConnecting ? t('connecting') : t('connect')}
      </button>

      {/* Wallet Selection Modal */}
      <Modal isOpen={showWalletModal} onClose={closeWalletModal}>
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">{t('selectProvider')}</h2>
          <p className="text-sm text-gray-400">{t('selectProviderHint')}</p>
          <div className="flex flex-col gap-2">
            {WALLET_PROVIDERS.length === 0 ? (
              <p className="text-sm text-gray-400">{t('noWalletDetected')}</p>
            ) : (
              WALLET_PROVIDERS.map((wp) => (
                <button
                  key={wp.provider}
                  type="button"
                  onClick={() =>
                    connectWithProvider(wp.provider as WalletProvider)
                  }
                  className="flex items-center gap-3 w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-left text-white hover:border-brand-green hover:bg-gray-800 transition"
                >
                  <span className="text-2xl" aria-hidden="true">
                    {wp.icon}
                  </span>
                  <div>
                    <p className="font-medium">{wp.label}</p>
                    <p className="text-xs text-gray-500">
                      {wp.provider === 'albedo'
                        ? t('installMobile')
                        : t('install')}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={closeWalletModal}
            className="text-sm text-gray-500 hover:text-gray-300 transition self-center"
          >
            {t('cancel')}
          </button>
        </div>
      </Modal>
    </>
  );
}
