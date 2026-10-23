import Button from '@/components/ui/Button';
import TransactionStatus from '@/components/ui/TransactionStatus';
import type { TxStatus } from '@/components/ui/TransactionStatus';
import { sanitize } from '@/lib/sanitize';
import { AFRICAN_REGIONS } from '@/lib/regions';
import { FOOTBALL_POSITIONS } from '@/lib/positions';
import { formatShortCid } from '../wizardState';
import type { WizardData } from '../wizardState';

export interface ReviewStepProps {
  data: WizardData;
  txStatus: TxStatus | null;
  txHash: string | null;
  formError: string | undefined;
  isLoading: boolean;
  submitDisabledReason: string | undefined;
  headingRef: React.Ref<HTMLHeadingElement>;
  onBack: () => void;
  onSubmit: () => void;
}

export default function ReviewStep({
  data,
  txStatus,
  txHash,
  formError,
  isLoading,
  submitDisabledReason,
  headingRef,
  onBack,
  onSubmit,
}: ReviewStepProps) {
  const positionLabel =
    FOOTBALL_POSITIONS.find((p) => p.value === data.position)?.label ??
    data.position;
  const regionLabel =
    AFRICAN_REGIONS.find((r) => r.value === data.region)?.label ?? data.region;
  const shortCid = formatShortCid(data.ipfsHash);

  return (
    <div className="space-y-6">
      <div>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-white outline-none"
        >
          Review &amp; Confirm
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Check your details before submitting to the Stellar blockchain.
        </p>
      </div>

      <dl className="rounded-xl border border-gray-800 bg-gray-900/50 divide-y divide-gray-800">
        {(
          [
            ['Name', data.name],
            ['Age', data.age],
            ['Nationality', data.nationality],
            ['Region', regionLabel],
            ['Position', positionLabel],
            ...(data.bio.trim()
              ? [['Bio', sanitize(data.bio)] as [string, string]]
              : []),
            ['Highlight Reel (IPFS)', shortCid],
          ] as [string, string][]
        ).map(([label, value]) => (
          <div key={label} className="flex justify-between px-4 py-3 gap-4">
            <dt className="text-sm text-gray-400 shrink-0">{label}</dt>
            <dd className="text-sm text-white text-right break-all">{value}</dd>
          </div>
        ))}
      </dl>

      {txStatus && (
        <TransactionStatus
          status={txStatus}
          txHash={txHash}
          error={formError}
        />
      )}

      {!txStatus && formError && (
        <p role="alert" className="text-sm text-red-500 text-center">
          {formError}
        </p>
      )}

      <div className="flex gap-3">
        <Button
          id="wizard-register-button"
          type="button"
          variant="secondary"
          onClick={onBack}
          disabled={isLoading}
          className="flex-1"
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={onSubmit}
          isLoading={isLoading}
          disabled={isLoading}
          disabledReason={submitDisabledReason}
          className="flex-1"
        >
          {isLoading ? 'Registering...' : 'Register as Player'}
        </Button>
      </div>
    </div>
  );
}
