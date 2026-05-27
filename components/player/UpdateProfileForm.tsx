"use client";

import { useState, type FormEvent } from "react";
import { useWallet } from "@/hooks/useWallet";
import { updateProfile } from "@/lib/contract";
import { ipfsUrl } from "@/lib/ipfs";
import { useToast } from "@/components/ui/Toast";
import Button from "@/components/ui/Button";
import VideoUpload from "@/components/ui/VideoUpload";
import type { Player } from "@/types";

interface UpdateProfileFormProps {
  player: Player;
  onSuccess: () => void;
}

function truncateCid(cid: string) {
  if (cid.length <= 16) return cid;
  return `${cid.slice(0, 8)}…${cid.slice(-8)}`;
}

export default function UpdateProfileForm({ player, onSuccess }: UpdateProfileFormProps) {
  const { publicKey } = useWallet();
  const { show } = useToast();
  const [newCid, setNewCid] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!publicKey || publicKey !== player.wallet) {
    return null;
  }

  const currentMediaUrl = ipfsUrl(player.ipfsHash);
  const canSubmit = Boolean(newCid && newCid !== player.ipfsHash && !isSubmitting);

  const handleUpload = (cid: string) => {
    setNewCid(cid);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);

    try {
      await updateProfile(publicKey, player.id, newCid);
      show({ message: "Profile updated successfully.", variant: "success" });
      setNewCid("");
      onSuccess();
    } catch (error: unknown) {
      show({
        message:
          error instanceof Error
            ? error.message
            : "Unable to update profile. Please try again.",
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-brand-card border border-gray-800 rounded-xl p-6">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-white">Update Profile Media</h2>
        <p className="text-sm text-gray-400">
          Updating your profile will replace your current media on-chain.
        </p>
      </div>

      <div className="rounded-xl border border-gray-700 bg-gray-900 p-4">
        <p className="text-sm text-gray-400">Current media CID</p>
        <a
          href={currentMediaUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm text-brand-green hover:underline"
        >
          {truncateCid(player.ipfsHash)}
        </a>
      </div>

      <VideoUpload onUpload={handleUpload} />

      {newCid && newCid === player.ipfsHash && (
        <p className="text-sm text-yellow-300">
          The uploaded file matches your current CID. Upload a different video to update your profile.
        </p>
      )}

      <Button type="submit" isLoading={isSubmitting} disabled={!canSubmit} className="w-full">
        {isSubmitting ? "Updating profile…" : "Update profile"}
      </Button>
    </form>
  );
}
