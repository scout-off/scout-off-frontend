'use client';

import { useState } from 'react';
import { Player } from '@/types';
import { useWallet } from '@/hooks/useWallet';
import useIsPaused from '@/hooks/useIsPaused';
import { updateProfile } from '@/lib/contract';
import { useToast } from '@/components/ui/Toast';
import { parseContractError } from '@/lib/contractErrorMessage';
import VideoUpload from '@/components/ui/VideoUpload';
import Button from '@/components/ui/Button';

interface UpdateProfileFormProps {
  player: Player;
  onSuccess: () => void;
}

export default function UpdateProfileForm({
  player,
  onSuccess,
}: UpdateProfileFormProps) {
  const { publicKey, signAndSubmit } = useWallet();
  const { show } = useToast();
  const isPaused = useIsPaused();
  const [newCid, setNewCid] = useState<string>('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  if (!publicKey || publicKey !== player.wallet) {
    return null;
  }

  const handleUpload = (cid: string) => {
    setNewCid(cid);
    setInlineError(null);
    setFileError(null);
  };

  const handleValidationError = (error: string | null) => {
    setFileError(error);
    // A new file selection always clears any previous submission error
    setInlineError(null);
    if (error) {
      // A validation failure invalidates any previously accepted CID
      setNewCid('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPaused) {
      show({
        message: 'Transactions are currently disabled',
        variant: 'error',
      });
      return;
    }
    if (!newCid || fileError || isSubmitting) return;

    setIsSubmitting(true);
    setInlineError(null);
    try {
      await updateProfile(publicKey, player.id, newCid, signAndSubmit);
      show({
        message: 'Profile media updated successfully',
        variant: 'success',
      });
      setNewCid('');
      onSuccess();
    } catch (err) {
      const msg = parseContractError(err);
      show({ message: msg, variant: 'error' });
      setInlineError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const ipfsGateway =
    process.env.NEXT_PUBLIC_IPFS_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs';
  const ipfsMediaUrl = `${ipfsGateway}/${player.ipfsHash}`;
  const truncatedCid = `${player.ipfsHash.slice(0, 8)}…${player.ipfsHash.slice(-8)}`;

  // Submit is only enabled when there is a valid CID and no pending file error
  const canSubmit = Boolean(newCid) && !fileError && !isSubmitting && !isPaused;

  return (
    <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 space-y-6">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-white">Update Profile Media</h2>
        <p className="text-sm text-gray-400">
          Manage your highlight reel and on-chain media.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">
            Current Media CID
          </label>
          <a
            href={ipfsMediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-green hover:underline font-mono text-sm"
          >
            {truncatedCid}
          </a>
        </div>

        <div className="bg-amber-900/20 border border-amber-900/50 p-4 rounded-lg">
          <p className="text-sm text-amber-500 font-medium">
            Warning: Updating your profile will replace your current media
            on-chain.
          </p>
        </div>

        <VideoUpload
          onUpload={handleUpload}
          onValidationError={handleValidationError}
        />

        <form onSubmit={handleSubmit}>
          {inlineError && (
            <div
              role="alert"
              aria-label="Form submission error"
              className="mb-4 rounded-md border border-red-500 bg-red-950/30 p-3"
            >
              <p className="text-sm text-red-400">{inlineError}</p>
            </div>
          )}
          <Button
            type="submit"
            disabled={!canSubmit}
            isLoading={isSubmitting}
            title={isPaused ? 'Contract is currently paused' : undefined}
            className="w-full"
          >
            Update Profile
          </Button>
        </form>
      </div>
    </div>
  );
}
