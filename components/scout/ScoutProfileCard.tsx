import type { Scout } from "@/types";

const TIER_LABEL: Record<Scout["subscriptionTier"], string> = {
  basic: "Basic",
  pro: "Pro",
  elite: "Elite",
};

export default function ScoutProfileCard({ scout }: { scout: Scout }) {
  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-2">
      <h1 className="text-2xl font-bold text-white">{scout.name}</h1>
      <p className="text-gray-400 text-sm">{scout.organisation}</p>
      <div className="flex gap-3 mt-2 text-xs">
        <span className="bg-brand-green/10 text-brand-green border border-brand-green/30 rounded-full px-3 py-1 font-medium">
          {TIER_LABEL[scout.subscriptionTier]} Tier
        </span>
        <span className="text-gray-500 self-center font-mono">
          {scout.wallet.slice(0, 6)}…{scout.wallet.slice(-4)}
        </span>
      </div>
    </div>
  );
}
