import type { ProgressLevel } from "@/types";
import { PROGRESS_LABELS } from "@/types";

const STEPS: ProgressLevel[] = [0, 1, 2, 3];

export default function ProgressBar({ level }: { level: ProgressLevel }) {
  return (
    <div className="w-full">
      <div className="flex justify-between mb-1">
        {STEPS.map((step) => (
          <span
            key={step}
            className={`text-xs ${step <= level ? "text-brand-green" : "text-gray-500"}`}
          >
            {PROGRESS_LABELS[step]}
          </span>
        ))}
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-green rounded-full transition-all duration-500"
          style={{ width: `${(level / 3) * 100}%` }}
        />
      </div>
    </div>
  );
}
