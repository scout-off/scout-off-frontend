import ProgressBar from '@/components/ProgressBar';
import type { PlayerVitals, ProgressLevel } from '@/types';

interface PlayerVitalsCardProps {
  vitals: PlayerVitals;
  progressLevel: ProgressLevel;
}

/**
 * Player identity + progress card. Extracted from
 * app/[locale]/player/page.tsx so the page becomes fully composed of
 * section components and the vitals UX is unit-testable in isolation
 * (symmetrical to the MilestoneSection extraction).
 *
 * The DOM is byte-equivalent to the inline JSX it replaced: card chrome,
 * name heading, `position · region` subtitle, and a ProgressBar at the
 * given level. No i18n calls are needed here — the visible strings are
 * either user data (vitals.name / position / region) or typed constants
 * baked into @/types (PROGRESS_LABELS inside ProgressBar), so adding
 * translation keys would not change the rendered output.
 *
 * Note: vitals.age and vitals.nationality are accepted via the prop
 * type but are not rendered today. They are reserved for future UX
 * extensions (e.g. an expanded card showing age / nationality alongside
 * the name); the wider `PlayerVitals` shape keeps the prop contract
 * stable for those extensions without another API change.
 *
 * No `'use client'` directive is needed — this component is pure render
 * with no hooks, no event handlers, no client-only state. The parent
 * page is already a client component and renders the children as such.
 */
export default function PlayerVitalsCard({
  vitals,
  progressLevel,
}: PlayerVitalsCardProps) {
  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-white">{vitals.name}</h2>
      <p className="text-gray-400 text-sm">
        {vitals.position} · {vitals.region}
      </p>
      <ProgressBar level={progressLevel} />
    </div>
  );
}
