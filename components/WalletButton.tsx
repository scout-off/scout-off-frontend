'use client';
import { useTranslations } from 'next-intl';
import { useWallet } from '@/hooks/useWallet';
import { WALLET_PROVIDERS } from '@/context/WalletContext';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import type { WalletProvider } from '@/context/WalletContext';

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
      <button
        onClick={disconnect}
        title={t('disconnect')}
        className="flex items-center gap-2 text-sm bg-brand-card border border-brand-green text-brand-green px-4 py-2 rounded-lg hover:bg-brand-green hover:text-black transition"
      >
        {walletProviderInfo && (
          <span className="text-base" aria-hidden="true">
            {walletProviderInfo.icon}
          </span>
        )}
        <span>
          {publicKey.slice(0, 4)}…{publicKey.slice(-4)}
        </span>
        <span className="border-l border-current pl-2 opacity-80">
          {isLoadingBalance ? (
            <Spinner size="sm" />
          ) : (
            <span>{xlmBalance ?? '0.00'} XLM</span>
          )}
        </span>
      </button>
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
