import { ipfsUrl } from "@/lib/ipfs";

export default function IPFSMediaGallery({ ipfsHash }: { ipfsHash: string }) {
  if (!ipfsHash) {
    return (
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold text-white mb-4">Media Gallery</h2>
        <p className="text-gray-500 text-sm">No media uploaded yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
      <h2 className="font-semibold text-white mb-4">Media Gallery</h2>
      <div className="aspect-video bg-gray-700 rounded-lg overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ipfsUrl(ipfsHash)}
          alt="Player highlight reel"
          className="w-full h-full object-cover"
        />
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Content stored on IPFS for decentralized, tamper-proof access.
      </p>
    </div>
  );
}
