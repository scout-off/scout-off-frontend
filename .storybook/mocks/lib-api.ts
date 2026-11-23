// Storybook 8 has no module mocking, so `.storybook/main.ts` aliases
// `@/lib/api` here. Everything re-exports the real module; stories can
// override the validator lookups ValidatorChip uses so it renders without
// hitting the indexer. Reset with `mockValidatorApi(null)`.
import * as actual from '../../lib/api';

export * from '../../lib/api';
export { default } from '../../lib/api';

type ValidatorApiMock = {
  milestoneCount: number | null;
  academy: Awaited<ReturnType<typeof actual.fetchAcademyForWallet>>;
};

let validatorApiMock: ValidatorApiMock | null = null;

export function mockValidatorApi(mock: ValidatorApiMock | null): void {
  validatorApiMock = mock;
}

export const fetchValidatorMilestoneCount: typeof actual.fetchValidatorMilestoneCount =
  (address, range) =>
    validatorApiMock
      ? Promise.resolve(validatorApiMock.milestoneCount)
      : actual.fetchValidatorMilestoneCount(address, range);

export const fetchAcademyForWallet: typeof actual.fetchAcademyForWallet = (
  wallet,
) =>
  validatorApiMock
    ? Promise.resolve(validatorApiMock.academy)
    : actual.fetchAcademyForWallet(wallet);
