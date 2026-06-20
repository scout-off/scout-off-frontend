import { useId } from 'react';
import ProgressBar from '@/components/ProgressBar';
import type { PlayerVitals, ProgressLevel } from '@/types';

interface PlayerVitalsCardProps {
  vitals: PlayerVitals;
  progressLevel: ProgressLevel;
  /**
   * Heading level used for the player name. Defaults to 2 for primary
   * detail views (player dashboard). Use 3 when composing into a card that
   * is one of many in a grid (e.g. scout dashboard tile).
   */
  headingLevel?: 2 | 3;
  /**
   * Whether to wrap the card in an ARIA section landmark whose accessible
   * name comes from the heading text. Defaults to true for primary detail
   * views. Set to false when composing into an already-labeled container
   * (e.g. PlayerCard's role="article" wrapper) so a grid of cards does
   * not pollute the landmark tree with one region per card.
   */
  landmark?: boolean;
  /**
   * Whether to apply the bg-brand-card visual chrome (border, rounded
   * corners, padding, vertical stack) on the inner wrapper. Defaults to
   * true. Set to false when composing into a wrapper that already
   * provides its own card chrome (e.g. PlayerCard's outer rounded
   * article) to avoid nested card visuals.
   */
  chrome?: boolean;
}

/**
 * Player identity + progress card. Canonical renderer for the four pieces
 * of player identity (name, position + region, ProgressBar) that the
 * player dashboard and the scout dashboard tiles share. Two prop axes
 * control how PlayerVitalsCard sits in its host:
 *
 *   - `landmark` (default true): wraps the card in an ARIA section
 *     landmark whose accessible name comes from the heading text. Use the
 *     default for primary detail views (player dashboard). Set to false
 *     when the card is one of many on the page — for example the scout
 *     tiles — so each grid item does not expose its own region to
 *     assistive tech.
 *
 *   - `chrome` (default true): applies the bg-brand-card visual styling
 *     on the inner wrapper (border, rounded corners, padding, vertical
 *     stack). Set to false when composing into a wrapper that already
 *     provides its own card chrome — for example PlayerCard's outer
 *     role="article" rounded card — so we don't end up with nested card
 *     visuals.
 *
 * Note: vitals.age and vitals.nationality are accepted via the prop type
 * but are not rendered today. They are reserved for future UX extensions
 * (e.g. an expanded card showing age / nationality alongside the name);
 * the wider PlayerVitals shape keeps the prop contract stable for those
 * extensions without another API change.
 *
 * No `'use client'` directive is needed — this component uses React's
 * useId (a small hook safe to call from both server and client
 * components) and is otherwise a pure render. The parent page is already
 * a client component and renders the children as such.
 */
export default function PlayerVitalsCard({
  vitals,
  progressLevel,
  headingLevel = 2,
  landmark = true,
  chrome = true,
}: PlayerVitalsCardProps) {
  // Per-instance id so multiple PlayerVitalsCards on the same page (e.g.
  // the scout dashboard tiles) don't collide on a section
  // aria-labelledby target. The id is unconditionally emitted so deep-link
  // anchors and tests can rely on it regardless of whether landmark is
  // on.
  const headingId = `vitals-heading-${useId()}`;
  const HeadingTag = headingLevel === 3 ? 'h3' : 'h2';
  const content = (
    <>
      <HeadingTag
        id={headingId}
        className="text-xl font-semibold text-white"
      >
        {vitals.name}
      </HeadingTag>
      <p className="text-gray-400 text-sm">
        {vitals.position} · {vitals.region}
      </p>
      <ProgressBar level={progressLevel} />
    </>
  );

  if (landmark && chrome) {
    return (
      <section aria-labelledby={headingId}>
        <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
          {content}
        </div>
      </section>
    );
  }
  if (landmark && !chrome) {
    return <section aria-labelledby={headingId}>{content}</section>;
  }
  if (!landmark && chrome) {
    return (
      <div className="bg-brand-card border border-gray-800 rounded-xl p-6 flex flex-col gap-4">
        {content}
      </div>
    );
  }
  // !landmark && !chrome: pure content for composition into a wrapper
  // that provides its own landmark and visual chrome.
  return <>{content}</>;
}
