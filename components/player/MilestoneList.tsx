import type { Milestone } from "@/types";
import EmptyState from "@/components/ui/EmptyState";

interface MilestoneListProps {
  milestones: Milestone[];
}

export default function MilestoneList({ milestones }: MilestoneListProps) {
  if (milestones.length === 0) {
    return (
      <EmptyState
        title="No milestones yet"
        description="Milestones will appear here once a validator approves them."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3" aria-label="milestone list">
      {milestones.map((m) => (
        <li
          key={m.id}
          className="text-sm text-gray-300 border-l-2 border-brand-green pl-3"
        >
          <span className="block">{m.description}</span>
          <span className="block text-xs text-gray-500 mt-0.5">
            Validator:{" "}
            <span aria-label={`validator ${m.validator}`}>
              {m.validator.slice(0, 8)}…{m.validator.slice(-4)}
            </span>
            {" · "}
            <time dateTime={new Date(m.timestamp * 1000).toISOString()}>
              {new Date(m.timestamp * 1000).toLocaleDateString()}
            </time>
          </span>
        </li>
      ))}
    </ul>
  );
}
