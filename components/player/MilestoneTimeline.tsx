import type { Milestone } from "@/types";

export default function MilestoneTimeline({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) {
    return (
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold text-white mb-4">Milestone History</h2>
        <p className="text-gray-500 text-sm">No milestones recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
      <h2 className="font-semibold text-white mb-4">Milestone History</h2>
      <div className="flex flex-col gap-4">
        {milestones.map((milestone, index) => (
          <div key={milestone.id} className="relative pl-6 pb-4 border-l-2 border-brand-green last:pb-0">
            <div className="absolute left-[-5px] top-0 w-2.5 h-2.5 bg-brand-green rounded-full" />
            <div className="flex flex-col gap-1">
              <p className="text-white font-medium">{milestone.description}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>Validator: {milestone.validator.slice(0, 8)}…{milestone.validator.slice(-4)}</span>
                <span>{new Date(milestone.timestamp * 1000).toLocaleDateString()}</span>
              </div>
              {milestone.evidenceHash && (
                <a
                  href={`https://gateway.pinata.cloud/ipfs/${milestone.evidenceHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-green hover:underline"
                >
                  View Evidence (IPFS)
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
