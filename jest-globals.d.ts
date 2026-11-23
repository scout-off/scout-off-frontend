import { jest as jestGlobal } from '@jest/globals';

declare global {
  const jest: typeof jestGlobal;
}

export {};
