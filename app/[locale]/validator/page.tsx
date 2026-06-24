'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import { checkIsValidator } from '@/lib/contract';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import EmptyState from '@/components/ui/EmptyState';
import ValidatorPlayerSearch from '@/components/validator/ValidatorPlayerSearch';
import ApproveForm from '@/components/validator/ApproveForm';
import RevokeForm from '@/components/validator/RevokeForm';
import type { Player } from '@/types';

function ValidatorDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Check if wallet is authorized as a validator
  useEffect(() => {
    if (!publicKey) {
      setAuthChecking(false);
      return;
    }

    checkIsValidator(publicKey)
      .then((result) => setIsAuthorized(result as boolean))
      .catch(() => setIsAuthorized(false))
      .finally(() => setAuthChecking(false));
  }, [publicKey]);

  const handlePlayerSelected = useCallback((player: Player) => {
    setSelectedPlayer(player);
  }, []);

  const handleSuccess = useCallback(() => {
    // Forms handle their own success states
  }, []);

  if (!publicKey) return null;

  // Show loading state while checking authorization
  if (authChecking) {
    return (
      <div className="flex flex-col gap-8">
        <h1 className="text-3xl font-bold text-white">Validator Dashboard</h1>
        <p className="text-gray-400 animate-pulse">
          Verifying validator status…
        </p>
      </div>
    );
  }

  // Show empty state if wallet is not authorized
  if (!isAuthorized) {
    return (
      <div className="flex flex-col gap-8">
        <h1 className="text-3xl font-bold text-white">Validator Dashboard</h1>
        <EmptyState
          title="Validator Access Only"
          description="Your wallet is not registered as an approved validator. Contact an administrator to request validator access."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">Validator Dashboard</h1>

      {/* Player search section */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Find a Player
        </h2>
        <ValidatorPlayerSearch onSelect={handlePlayerSelected} />
      </div>

      {/* Selected player section */}
      {selectedPlayer && (
        <div className="flex flex-col gap-6">
          {/* Player info header */}
          <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-2">
              {selectedPlayer.vitals.name}
            </h3>
            <p className="text-gray-400 text-sm">
              {selectedPlayer.vitals.position} · {selectedPlayer.vitals.region}
              · {selectedPlayer.vitals.nationality}
            </p>
            <p className="text-gray-500 text-xs mt-2 font-mono">
              ID: {selectedPlayer.id}
            </p>
          </div>

          {/* Approve form */}
          <ApproveForm onSuccess={handleSuccess} />

          {/* Revoke form */}
          <RevokeForm player={selectedPlayer} onSuccess={handleSuccess} />
        </div>
      )}
    </div>
  );
}

export default function ValidatorDashboard() {
  return (
    <ErrorBoundary>
      <ValidatorDashboardContent />
    </ErrorBoundary>
  );
}
