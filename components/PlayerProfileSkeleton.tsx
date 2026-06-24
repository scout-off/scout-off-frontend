export default function PlayerProfileSkeleton({
  showContactButton = false,
}: {
  showContactButton?: boolean;
}) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading player profile"
      className="max-w-2xl mx-auto flex flex-col gap-8"
    >
      {/* Header — mirrors profile card: avatar + name/stats/progress */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex gap-6 items-start animate-pulse">
        <div
          aria-hidden="true"
          className="w-20 h-20 rounded-full bg-gray-700 shrink-0"
        />

        <div className="flex-1 flex flex-col min-w-0">
          <div
            aria-hidden="true"
            className="h-8 w-48 max-w-full rounded bg-gray-700"
          />
          <div
            aria-hidden="true"
            className="h-4 w-56 max-w-full rounded bg-gray-700 mt-1"
          />
          <div aria-hidden="true" className="mt-4 w-full">
            <div className="flex justify-between mb-1 gap-1">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-3 w-12 rounded bg-gray-700" />
              ))}
            </div>
            <div className="h-2 w-full rounded-full bg-gray-700" />
          </div>
        </div>
      </div>

      {/* Milestones — mirrors milestone card and list item layout */}
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 animate-pulse">
        <div aria-hidden="true" className="h-5 w-44 rounded bg-gray-700 mb-4" />
        <ul aria-hidden="true" className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="border-l-2 border-gray-700 pl-3 flex flex-col gap-1.5"
            >
              <div className="h-4 w-full max-w-sm rounded bg-gray-700" />
              <div className="h-3 w-40 rounded bg-gray-700" />
            </li>
          ))}
        </ul>
      </div>

      {showContactButton && (
        <div
          aria-hidden="true"
          className="h-12 w-full rounded-xl bg-gray-700 animate-pulse"
        />
      )}
    </div>
  );
}
