import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlayerVitalsCard from '@/components/player/PlayerVitalsCard';
import type { PlayerVitals } from '@/types';

function makeVitals(overrides: Partial<PlayerVitals> = {}): PlayerVitals {
  return {
    name: 'Ada Lovelace',
    age: 21,
    position: 'ST',
    region: 'NG',
    nationality: 'Nigerian',
    ...overrides,
  };
}

describe('PlayerVitalsCard', () => {
  it('renders the player name as the section heading', () => {
    render(<PlayerVitalsCard vitals={makeVitals()} progressLevel={2} />);
    expect(
      screen.getByRole('heading', { name: 'Ada Lovelace', level: 2 }),
    ).toBeInTheDocument();
  });

  it('renders the position and region joined by a middle-dot separator', () => {
    render(
      <PlayerVitalsCard
        vitals={makeVitals({ position: 'ST', region: 'NG' })}
        progressLevel={2}
      />,
    );
    // Regex matcher over a single literal string: the subtitle renders
    // position + ' · ' + region as three separate React text children
    // inside <p>, and `getByText('ST · NG')` does not always coalesce
    // them across sibling text nodes. The regex preserves the test's
    // intent (both values present, separator between them) without
    // coupling to internal text-node boundaries.
    expect(screen.getByText(/ST\s*\u00b7\s*NG/)).toBeInTheDocument();
  });

  it('passes progressLevel through to ProgressBar\u2019s aria-valuenow', () => {
    render(
      <PlayerVitalsCard vitals={makeVitals()} progressLevel={3} />,
    );
    // ProgressBar exposes role="progressbar" with aria-valuenow=level. The
    // exact label changes per level (PROGRESS_LABELS in @/types), but the
    // numeric aria-valuenow is the data we want to lock in for the
    // pass-through contract from PlayerVitalsCard.
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
  });

  it('renders a different aria-valuenow when progressLevel changes', () => {
    const { rerender } = render(
      <PlayerVitalsCard vitals={makeVitals()} progressLevel={0} />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0',
    );

    rerender(
      <PlayerVitalsCard vitals={makeVitals()} progressLevel={1} />,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '1',
    );
  });

  it('renders name/position/region values containing HTML-unsafe characters as literal text', () => {
    // Smoke test: values come through React\u2019s text encoder. A raw
    // <script> in props must end up as literal text \u2014 not parsed as
    // markup. Guards against future regressions that might switch to
    // dangerouslySetInnerHTML.
    const vitals = makeVitals({
      name: '<img src=x onerror=alert(1)>',
      position: '<script>position</script>',
      region: '<iframe>region</iframe>',
    });

    const { container } = render(
      <PlayerVitalsCard vitals={vitals} progressLevel={2} />,
    );

    expect(
      screen.getByRole('heading', {
        name: '<img src=x onerror=alert(1)>',
        level: 2,
      }),
    ).toBeInTheDocument();
    // Assert the load-bearing safety property directly via DOM: no
    // <script> or <iframe> child of the subtitle <p> was created from
    // the position / region props. The headline value still surfaces as
    // literal text through React's text encoder. Query selectors are
    // scoped to `p` so unrelated top-level script / iframe elements later
    // in the tree cannot produce a false pass.
    expect(container.querySelector('p script')).toBeNull();
    expect(container.querySelector('p iframe')).toBeNull();
  });
});
