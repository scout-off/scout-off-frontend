'use client';

import { useState } from 'react';
import { Player } from '@/types';
import { useWallet } from '@/hooks/useWallet';
import { ipfsUrl } from '@/lib/ipfs';
import { updateProfile } from '@/lib/contract';
import { useToast } from '@/components/ui/Toast';
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
  const { publicKey } = useWallet();
  const { show } = useToast();
  const [newCid, setNewCid] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!publicKey || publicKey !== player.wallet) {
    return null;
  }

  const handleUpload = (cid: string) => {
    setNewCid(cid);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await updateProfile(publicKey, player.id, newCid);
      show({
        message: 'Profile media updated successfully',
        variant: 'success',
      });
      setNewCid('');
      onSuccess();
    } catch (err) {
      console.error('Update profile failed:', err);
      show({ message: 'Failed to update profile media', variant: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const truncatedCid = `${player.ipfsHash.slice(0, 8)}…${player.ipfsHash.slice(-8)}`;

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
            href={ipfsUrl(player.ipfsHash)}
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

        <VideoUpload onUpload={handleUpload} />

        <form onSubmit={handleSubmit}>
          <Button
            type="submit"
            disabled={!newCid || isSubmitting}
            isLoading={isSubmitting}
            className="w-full"
          >
            Update Profile
          </Button>
        </form>
      </div>
    </div>
  );
}
