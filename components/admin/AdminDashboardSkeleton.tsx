/**
 * AdminDashboardSkeleton
 *
 * Mirrors the exact layout of AdminDashboardContent so there is zero layout
 * shift when real data replaces the skeleton.
 *
 * Sections match 1-to-1:
 *   1. Circuit Breaker  – status text + greyed-out button
 *   2. Platform Fees    – number placeholder + greyed-out button
 *   3. Add Validator    – input-shaped bar + add button bar
 *   4. Validators list  – 3 skeleton rows
 *   5. Activity Feed    – 5 skeleton rows
 */
export default function AdminDashboardSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading admin dashboard"
      className="max-w-3xl mx-auto flex flex-col gap-8"
    >
      {/* Page title */}
      <div
        aria-hidden="true"
        className="h-9 w-56 rounded bg-gray-700 animate-pulse"
      />

      {/* ── Circuit Breaker ── */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <div
          aria-hidden="true"
          className="h-6 w-36 rounded bg-gray-700 animate-pulse"
        />
        {/* "Status: …" line */}
        <div
          aria-hidden="true"
          className="h-4 w-48 rounded bg-gray-700 animate-pulse"
        />
        {/* Pause / Unpause button */}
        <div
          aria-hidden="true"
          className="h-9 w-36 rounded-lg bg-gray-700 animate-pulse"
        />
      </section>

      {/* ── Platform Fees ── */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <div
          aria-hidden="true"
          className="h-6 w-32 rounded bg-gray-700 animate-pulse"
        />
        {/* "Accumulated: X XLM" line */}
        <div
          aria-hidden="true"
          className="h-4 w-40 rounded bg-gray-700 animate-pulse"
        />
        {/* Withdraw button */}
        <div
          aria-hidden="true"
          className="h-9 w-32 rounded-lg bg-gray-700 animate-pulse"
        />
      </section>

      {/* ── Add Validator ── */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <div
          aria-hidden="true"
          className="h-6 w-28 rounded bg-gray-700 animate-pulse"
        />
        <div className="flex gap-3">
          <div
            aria-hidden="true"
            className="h-10 flex-1 rounded bg-gray-700 animate-pulse"
          />
          <div
            aria-hidden="true"
            className="h-10 w-16 rounded-lg bg-gray-700 animate-pulse"
          />
        </div>
      </section>

      {/* ── Validators list ── */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        {/* "Validators (…)" heading */}
        <div
          aria-hidden="true"
          className="h-6 w-32 rounded bg-gray-700 animate-pulse"
        />
        <ul aria-hidden="true" className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center justify-between gap-4">
              {/* address */}
              <div className="h-4 flex-1 max-w-sm rounded bg-gray-700 animate-pulse" />
              {/* Remove button */}
              <div className="h-4 w-14 rounded bg-gray-700 animate-pulse shrink-0" />
            </li>
          ))}
        </ul>
      </section>

      {/* ── Activity Feed ── */}
      <section className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        <div
          aria-hidden="true"
          className="h-6 w-20 rounded bg-gray-700 animate-pulse"
        />
        <ul
          aria-hidden="true"
          className="flex flex-col divide-y divide-gray-800"
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center gap-4 py-3 first:pt-0 last:pb-0"
            >
              <div className="h-4 w-32 rounded bg-gray-700 animate-pulse shrink-0" />
              <div className="h-4 w-20 rounded bg-gray-700 animate-pulse" />
              <div className="h-4 w-24 rounded bg-gray-700 animate-pulse ml-auto shrink-0" />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
