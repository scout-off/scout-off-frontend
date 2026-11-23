'use client';

import { useRequireWallet } from '@/hooks/useRequireWallet';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import BulkPlayerImport from '@/components/academy/BulkPlayerImport';

/**
 * Academy bulk player import.
 *
 * Access model: unlike `/admin` (gated to a single `NEXT_PUBLIC_ADMIN_ADDRESS`),
 * this page is gated only to "any connected wallet" via `useRequireWallet` —
 * there is no separate academy/organisation role in the contract or the rest
 * of the app today. Registering players still requires the connected wallet
 * to individually sign each `register_player` transaction, so on-chain
 * authorship of every bulk-imported player is attributable to whichever
 * wallet ran the import. See the PR description for the full reasoning.
 */
function BulkImportPageContent() {
  const { walletAddress } = useRequireWallet();

  if (!walletAddress) {
    return null; // Redirect handled by useRequireWallet
  }

  return (
    <div className="max-w-4xl mx-auto">
      <BulkPlayerImport />
    </div>
  );
}

export default function BulkImportPage() {
  return (
    <ErrorBoundary>
      <BulkImportPageContent />
    </ErrorBoundary>
  );
}
