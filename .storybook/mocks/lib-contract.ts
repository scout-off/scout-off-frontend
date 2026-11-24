// Storybook 8 has no module mocking, so `.storybook/main.ts` aliases
// `@/lib/contract` here. Everything re-exports the real module; stories can
// override `checkIsValidator` (e.g. ValidatorChip) to render a fixed status
// without a Soroban RPC call. Reset with `mockCheckIsValidator(null)`.
import * as actual from '../../lib/contract';

export * from '../../lib/contract';

let checkIsValidatorImpl: typeof actual.checkIsValidator | null = null;

export function mockCheckIsValidator(
  impl: typeof actual.checkIsValidator | null,
): void {
  checkIsValidatorImpl = impl;
}

export function checkIsValidator(address: string): Promise<boolean> {
  return (checkIsValidatorImpl ?? actual.checkIsValidator)(address);
}
