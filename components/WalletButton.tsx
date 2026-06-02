'use client';
import { useWallet } from '@/hooks/useWallet';
import { WALLET_PROVIDERS } from '@/context/WalletContext';
import Modal from '@/components/ui/Modal';
import Spinner from '@/components/ui/Spinner';
import Button from '@/components/ui/Button';
import type { WalletProvider } from '@/context/WalletContext';

export default function WalletButton() {
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
      <Button
        type="button"
        onClick={disconnect}
        variant="secondary"
        className="flex items-center gap-2 text-sm"
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
      </Button>
    );
  }

  return (
    <>
      <Button
        type="button"
        onClick={connect}
        loading={isConnecting}
        aria-label="Connect wallet"
        aria-pressed={false}
      >
        {isConnecting ? 'Connecting…' : 'Connect Wallet'}
      </Button>

      {/* Wallet Selection Modal */}
      <Modal isOpen={showWalletModal} onClose={closeWalletModal}>
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-white">Select Wallet</h2>
          <p className="text-sm text-gray-400">
            Choose a Stellar wallet to connect with ScoutOff.
          </p>
          <div className="flex flex-col gap-2">
            {WALLET_PROVIDERS.map((wp) => (
              <Button
                key={wp.provider}
                type="button"
                variant="ghost"
                fullWidth
                className="justify-start text-left px-4 py-3"
                onClick={() =>
                  connectWithProvider(wp.provider as WalletProvider)
                }
              >
                <span className="text-2xl" aria-hidden="true">
                  {wp.icon}
                </span>
                <div>
                  <p className="font-medium">{wp.label}</p>
                  <p className="text-xs text-gray-500">
                    {wp.provider === 'freighter' && 'Browser extension'}
                    {wp.provider === 'albedo' && 'Browser extension / mobile'}
                    {wp.provider === 'lobstr' && 'Browser extension'}
                  </p>
                </div>
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="text-sm text-gray-500 hover:text-gray-300 self-center"
            onClick={closeWalletModal}
          >
            Cancel
          </Button>
        </div>
      </Modal>
    </>
  );
}
