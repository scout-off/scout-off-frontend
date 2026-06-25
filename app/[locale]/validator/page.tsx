'use client';
import { useRequireWallet } from '@/hooks/useRequireWallet';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

function ValidatorDashboardContent() {
  const { walletAddress: publicKey } = useRequireWallet();

  if (!publicKey) return null;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-bold text-white">Validator Dashboard</h1>
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <p className="text-gray-400">
          Welcome, validator {publicKey.slice(0, 4)}...{publicKey.slice(-4)}.
          Pending milestones will appear here.
        </p>
      </div>
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
