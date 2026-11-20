import {
  matchesSavedSearch,
  savedSearchDashboardHref,
  type MatchablePlayer,
} from '@/lib/savedSearchMatch';

function player(overrides: Partial<MatchablePlayer> = {}): MatchablePlayer {
  return {
    vitals: { region: 'nigeria', position: 'ST' },
    progressLevel: 1,
    archived: false,
    ...overrides,
  } as MatchablePlayer;
}

describe('matchesSavedSearch (mirrors the dashboard filter)', () => {
  it('matches everything when no criteria are set', () => {
    expect(matchesSavedSearch(player(), {})).toBe(true);
  });

  it('treats empty strings like "all", as PlayerFilterForm does', () => {
    expect(matchesSavedSearch(player(), { region: '', position: '' })).toBe(
      true,
    );
  });

  it('requires an exact region match', () => {
    expect(matchesSavedSearch(player(), { region: 'nigeria' })).toBe(true);
    expect(matchesSavedSearch(player(), { region: 'kenya' })).toBe(false);
  });

  it('requires an exact position match', () => {
    expect(matchesSavedSearch(player(), { position: 'ST' })).toBe(true);
    expect(matchesSavedSearch(player(), { position: 'GK' })).toBe(false);
  });

  it('requires the progress level to be at least minLevel', () => {
    expect(matchesSavedSearch(player(), { minLevel: 1 })).toBe(true);
    expect(matchesSavedSearch(player(), { minLevel: 0 })).toBe(true);
    expect(matchesSavedSearch(player(), { minLevel: 2 })).toBe(false);
  });

  it('combines criteria with AND', () => {
    expect(
      matchesSavedSearch(player(), {
        region: 'nigeria',
        position: 'GK',
        minLevel: 0,
      }),
    ).toBe(false);
  });

  it('never matches archived profiles', () => {
    expect(matchesSavedSearch(player({ archived: true }), {})).toBe(false);
  });
});

describe('savedSearchDashboardHref', () => {
  it('encodes the filter in the dashboard URL params', () => {
    expect(
      savedSearchDashboardHref({
        region: 'nigeria',
        position: 'ST',
        minLevel: 2,
      }),
    ).toBe('/scout?region=nigeria&position=ST&level=2');
  });

  it('links to the bare dashboard for an empty filter', () => {
    expect(savedSearchDashboardHref({ minLevel: 0 })).toBe('/scout');
  });
});
