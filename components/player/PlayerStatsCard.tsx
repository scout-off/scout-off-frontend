import type { Player } from "@/types";
import { PROGRESS_LABELS } from "@/types";
import ProgressBar from "@/components/ProgressBar";

export default function PlayerStatsCard({ player }: { player: Player }) {
  const { vitals, progressLevel, createdAt } = player;

  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
      <h2 className="font-semibold text-white mb-4">Player Stats</h2>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-400">Name</p>
          <p className="text-white font-medium">{vitals.name}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Age</p>
          <p className="text-white font-medium">{vitals.age}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Position</p>
          <p className="text-white font-medium">{vitals.position}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Region</p>
          <p className="text-white font-medium">{vitals.region}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Nationality</p>
          <p className="text-white font-medium">{vitals.nationality}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Progress Level</p>
          <p className="text-brand-green font-medium">{PROGRESS_LABELS[progressLevel]}</p>
        </div>
      </div>

      <div className="mt-6">
        <p className="text-xs text-gray-400 mb-2">Verification Progress</p>
        <ProgressBar level={progressLevel} />
      </div>

      <div className="mt-4 pt-4 border-t border-gray-800">
        <p className="text-xs text-gray-500">
          Profile created: {new Date(createdAt * 1000).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
