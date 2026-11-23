'use client';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LeaderboardError({ error, reset }: ErrorProps) {
  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-6">
      <p className="text-red-400 text-sm">
        Could not load the validator leaderboard. Please try again later.
      </p>
      <button
        onClick={reset}
        className="mt-4 text-sm text-blue-400 hover:text-blue-300 transition"
      >
        Try again
      </button>
    </div>
  );
}
