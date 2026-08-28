import { Suspense } from 'react';
import { getLeaderboardData } from './data';
import LeaderboardContent from './LeaderboardContent';
import LeaderboardLoading from './loading';
import {
  parseValidatorLeaderboardRange,
  type ValidatorLeaderboardRange,
} from '@/lib/validatorLeaderboard';

export const revalidate = 300;

export default async function ValidatorLeaderboardPage({
  searchParams,
}: {
  searchParams?: { range?: string };
}) {
  const range = parseValidatorLeaderboardRange(searchParams?.range);
  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Validator Leaderboard</h1>
        <p className="text-gray-400 text-sm mt-1">
          Validators ranked by approved milestones. Anyone can view this page —
          no wallet connection required.
        </p>
      </div>

      <Suspense fallback={<LeaderboardLoading />}>
        <LeaderboardData range={range} />
      </Suspense>
    </div>
  );
}

async function LeaderboardData({
  range,
}: {
  range: ValidatorLeaderboardRange;
}) {
  const entries = await getLeaderboardData(range);
  return <LeaderboardContent entries={entries} range={range} />;
}
