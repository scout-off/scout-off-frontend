'use client';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { Key, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useWallet } from '@/hooks/useWallet';
import { useBackupWallet } from '@/hooks/useBackupWallet';
import Spinner from '@/components/ui/Spinner';

type RecoveryStep = 'intro' | 'connect' | 'verify' | 'success' | 'error';

export default function AccountRecoveryPage() {
  const t = useTranslations('recovery');
  const router = useRouter();
  const { publicKey, isConnecting, connect } = useWallet();
  const { claim, loading: claiming, error: claimError } = useBackupWallet();

  const [step, setStep] = useState<RecoveryStep>('intro');
  const [primaryWallet, setPrimaryWallet] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  const validateWalletAddress = (address: string): boolean => {
    return /^G[A-Z2-7]{55}$/.test(address.trim());
  };

  const handleProceedToConnect = useCallback(() => {
    const trimmed = primaryWallet.trim();
    if (!trimmed) {
      setInputError(t('errorEmptyAddress'));
      return;
    }
    if (!validateWalletAddress(trimmed)) {
      setInputError(t('errorInvalidAddress'));
      return;
    }
    setPrimaryWallet(trimmed);
    setInputError(null);
    setStep('connect');
  }, [primaryWallet, t]);

  const handleConnectBackupWallet = useCallback(async () => {
    try {
      await connect();
      setStep('verify');
    } catch (err) {
      setRecoveryError(
        err instanceof Error ? err.message : t('errorConnectFailed'),
      );
      setStep('error');
    }
  }, [connect, t]);

  const handleVerifyAndRecover = useCallback(async () => {
    if (!publicKey) {
      setRecoveryError(t('errorNotConnected'));
      setStep('error');
      return;
    }

    try {
      setRecoveryError(null);
      const result = await claim(primaryWallet, publicKey);

      // Success - redirect to player dashboard
      router.push(`/player/${result.playerId}`);
      setStep('success');
    } catch (err) {
      const message =
        err instanceof Error && err.message.includes('not found')
          ? t('errorNoAccountFound')
          : err instanceof Error
            ? err.message
            : t('errorRecoverFailed');
      setRecoveryError(message);
      setStep('error');
    }
  }, [publicKey, primaryWallet, claim, router, t]);

  const handleReset = useCallback(() => {
    setPrimaryWallet('');
    setInputError(null);
    setRecoveryError(null);
    setStep('intro');
  }, []);

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-4">
            <Key className="w-12 h-12 text-brand-green" />
          </div>
          <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
          <p className="text-gray-400">{t('subtitle')}</p>
        </div>

        {step === 'intro' && (
          <div className="bg-brand-card border border-gray-800 rounded-xl p-6 space-y-6">
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">
                {t('howItWorks')}
              </h2>
              <ol className="space-y-3 text-sm text-gray-300">
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-green text-black flex items-center justify-center text-xs font-semibold">
                    1
                  </span>
                  <span>{t('step1')}</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-green text-black flex items-center justify-center text-xs font-semibold">
                    2
                  </span>
                  <span>{t('step2')}</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-green text-black flex items-center justify-center text-xs font-semibold">
                    3
                  </span>
                  <span>{t('step3')}</span>
                </li>
              </ol>
            </div>

            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
              <p className="text-xs text-yellow-200">
                <span className="font-semibold">{t('noteLabel')}</span>{' '}
                {t('noteText')}
              </p>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-300 mb-2 block">
                {t('primaryWalletLabel')}
              </label>
              <input
                type="text"
                placeholder={t('primaryWalletPlaceholder')}
                value={primaryWallet}
                onChange={(e) => {
                  setPrimaryWallet(e.target.value);
                  setInputError(null);
                }}
                className="input w-full"
              />
              {inputError && (
                <p className="text-sm text-red-400 mt-2">{inputError}</p>
              )}
            </div>

            <div className="flex gap-3">
              <Link
                href="/"
                className="flex-1 px-4 py-3 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-600 transition text-center"
              >
                {t('backToHome')}
              </Link>
              <button
                onClick={handleProceedToConnect}
                disabled={isConnecting || claiming}
                className="flex-1 px-4 py-3 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition disabled:opacity-50"
              >
                {t('next')}
              </button>
            </div>
          </div>
        )}

        {step === 'connect' && (
          <div className="bg-brand-card border border-gray-800 rounded-xl p-6 space-y-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-white">
                {t('connectBackupTitle')}
              </h2>
              <p className="text-sm text-gray-400">{t('connectBackupDesc')}</p>
            </div>

            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
              <p className="text-xs text-gray-400 mb-2">
                Primary wallet (to recover):
              </p>
              <p className="text-sm font-mono text-gray-300 break-all">
                {primaryWallet}
              </p>
            </div>

            <button
              onClick={handleConnectBackupWallet}
              disabled={isConnecting || claiming}
              className="w-full px-4 py-3 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isConnecting && <Spinner size="sm" />}
              {isConnecting ? t('connecting') : t('connectBackupButton')}
            </button>

            <button
              onClick={handleReset}
              className="w-full px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-600 transition"
            >
              {t('back')}
            </button>
          </div>
        )}

        {step === 'verify' && publicKey && (
          <div className="bg-brand-card border border-gray-800 rounded-xl p-6 space-y-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-white">
                {t('verifyTitle')}
              </h2>
              <p className="text-sm text-gray-400">{t('verifyDesc')}</p>
            </div>

            <div className="space-y-3">
              <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-2">
                  Primary wallet (lost access):
                </p>
                <p className="text-sm font-mono text-gray-300 break-all">
                  {primaryWallet}
                </p>
              </div>
              <div className="bg-gray-900/50 border border-brand-green rounded-lg p-4">
                <p className="text-xs text-gray-400 mb-2">
                  Backup wallet (connected):
                </p>
                <p className="text-sm font-mono text-gray-300 break-all">
                  {publicKey}
                </p>
                <p className="text-xs text-brand-green mt-2">
                  {t('connected')}
                </p>
              </div>
            </div>

            <button
              onClick={handleVerifyAndRecover}
              disabled={claiming}
              className="w-full px-4 py-3 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {claiming && <Spinner size="sm" />}
              {claiming ? t('verifying') : t('recoverButton')}
            </button>

            <button
              onClick={handleReset}
              disabled={claiming}
              className="w-full px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-600 transition disabled:opacity-50"
            >
              {t('cancel')}
            </button>
          </div>
        )}

        {step === 'success' && (
          <div className="bg-brand-card border border-brand-green rounded-xl p-6 space-y-6">
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="w-12 h-12 text-brand-green" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-lg font-semibold text-white">
                {t('successTitle')}
              </h2>
              <p className="text-sm text-gray-400">{t('successRedirect')}</p>
            </div>
            <Spinner size="md" />
          </div>
        )}

        {step === 'error' && (
          <div className="bg-brand-card border border-red-500/30 rounded-xl p-6 space-y-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {t('errorTitle')}
                </h2>
                <p className="text-sm text-gray-400 mt-1">{recoveryError}</p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-gray-400">
              <p>
                <span className="font-semibold">{t('troubleshooting')}</span>
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>{t('troubleshootingTip1')}</li>
                <li>{t('troubleshootingTip2')}</li>
                <li>{t('troubleshootingTip3')}</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <Link
                href="/"
                className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-gray-300 hover:border-gray-600 transition text-center"
              >
                {t('backToHome')}
              </Link>
              <button
                onClick={handleReset}
                className="flex-1 px-4 py-2 rounded-lg bg-brand-green text-black font-semibold hover:opacity-90 transition"
              >
                {t('tryAgain')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
