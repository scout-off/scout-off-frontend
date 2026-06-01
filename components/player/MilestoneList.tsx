import type { Milestone } from '@/types';
import Badge from '@/components/ui/Badge';
import Tooltip from '@/components/ui/Tooltip';

function formatTs(ts: number) {
  return new Date(ts * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function MilestoneList({
  milestones,
}: {
  milestones: Milestone[];
}) {
  if (milestones.length === 0) {
    return <p className="text-gray-500 text-sm">No milestones yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {milestones.map((m) => (
        <li
          key={m.id}
          className="text-sm text-gray-300 border-l-2 border-brand-green pl-3 flex flex-col gap-1"
        >
          <span>{m.description}</span>
          <div className="flex items-center gap-2">
            <Tooltip
              content={`Validator: ${m.validator}\nVerified: ${formatTs(m.timestamp)}`}
            >
              <Badge variant="level2" label="Verified" size="sm" />
            </Tooltip>
            <span className="text-xs text-gray-500">
              {formatTs(m.timestamp)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
