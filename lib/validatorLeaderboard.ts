export type ValidatorLeaderboardRange = 'week' | 'month' | 'all-time';

export const VALID_VALIDATOR_LEADERBOARD_RANGES: ValidatorLeaderboardRange[] = [
  'week',
  'month',
  'all-time',
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseValidatorLeaderboardRange(
  value: string | null | undefined,
): ValidatorLeaderboardRange {
  return value === 'week' || value === 'month' || value === 'all-time'
    ? value
    : 'all-time';
}

export function getValidatorLeaderboardRange(
  range: ValidatorLeaderboardRange,
): {
  start: number;
  end: number;
} {
  const end = Date.now();
  if (range === 'all-time') return { start: 0, end };
  return { start: end - (range === 'week' ? 7 : 30) * DAY_MS, end };
}
