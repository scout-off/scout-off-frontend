export default function PlayerCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="bg-brand-card border border-gray-800 rounded-xl p-5 flex flex-col gap-4 animate-pulse"
    >
      {/* Avatar */}
      <div className="w-16 h-16 rounded-full bg-gray-700" />

      {/* Name / position / level */}
      <div className="flex flex-col gap-2">
        <div className="h-4 w-32 rounded bg-gray-700" />
        <div className="h-3 w-24 rounded bg-gray-700" />
        <div className="h-3 w-20 rounded bg-gray-700" />
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full rounded bg-gray-700" />

      {/* Button */}
      <div className="h-8 w-full rounded-lg bg-gray-700" />
    </div>
  );
}
