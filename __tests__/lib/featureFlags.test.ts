import { isFeatureEnabled, clearFeatureFlagCache } from '@/lib/featureFlags';

const FLAG = 'DATA_EXPORT';
const ENV_KEY = 'NEXT_PUBLIC_FEATURE_DATA_EXPORT';

const ORIGINAL_ENV_KEY = process.env[ENV_KEY];
const ORIGINAL_RAW_KEY = process.env[FLAG];

function setEnv(value: string | undefined) {
  if (value === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = value;
}

beforeEach(() => {
  clearFeatureFlagCache();
});

afterEach(() => {
  setEnv(ORIGINAL_ENV_KEY);
  if (ORIGINAL_RAW_KEY === undefined) delete process.env[FLAG];
  else process.env[FLAG] = ORIGINAL_RAW_KEY;
  clearFeatureFlagCache();
});

describe('isFeatureEnabled — truthy value parsing', () => {
  it.each(['1', 'true', 'yes', 'TRUE', 'Yes', 'YES', '  true  '])(
    'treats %j as enabled',
    (value) => {
      setEnv(value);
      expect(isFeatureEnabled(FLAG)).toBe(true);
    },
  );

  it.each(['0', 'false', 'no', 'banana', ''])(
    'treats %j as disabled',
    (value) => {
      setEnv(value);
      expect(isFeatureEnabled(FLAG)).toBe(false);
    },
  );

  it('treats an unset env var as disabled', () => {
    setEnv(undefined);
    expect(isFeatureEnabled(FLAG)).toBe(false);
  });
});

describe('isFeatureEnabled — lookup key', () => {
  it('reads NEXT_PUBLIC_FEATURE_<flag>, not <flag> directly', () => {
    setEnv(undefined);
    process.env[FLAG] = 'true';

    expect(isFeatureEnabled(FLAG)).toBe(false);
  });

  it('reads the NEXT_PUBLIC_FEATURE_-prefixed var when set', () => {
    delete process.env[FLAG];
    setEnv('true');

    expect(isFeatureEnabled(FLAG)).toBe(true);
  });
});

describe('isFeatureEnabled — caching', () => {
  it('returns the cached result after the env var changes', () => {
    setEnv('true');
    expect(isFeatureEnabled(FLAG)).toBe(true);

    setEnv('false');
    expect(isFeatureEnabled(FLAG)).toBe(true);
  });

  it('reflects the new env value once clearFeatureFlagCache() is called', () => {
    setEnv('true');
    expect(isFeatureEnabled(FLAG)).toBe(true);

    setEnv('false');
    clearFeatureFlagCache();
    expect(isFeatureEnabled(FLAG)).toBe(false);
  });
});
