export default function LeaderboardLoading() {
  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-3">
      {[1, 2, 3].map((n) => (
        <div key={n} className="h-14 rounded-lg bg-gray-800/50 animate-pulse" />
      ))}
    </div>
  );
}
