import { validateConfig, isConfigValid } from '@/lib/config';

describe('validateConfig', () => {
  const ORIGINAL_CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID;

  afterEach(() => {
    process.env.NEXT_PUBLIC_CONTRACT_ID = ORIGINAL_CONTRACT_ID;
  });

  it('returns no warnings when NEXT_PUBLIC_CONTRACT_ID is set', () => {
    process.env.NEXT_PUBLIC_CONTRACT_ID = 'CCYKFR...validContractId';

    const warnings = validateConfig();

    expect(warnings).toHaveLength(0);
  });

  it('returns an error-level warning when NEXT_PUBLIC_CONTRACT_ID is missing', () => {
    delete process.env.NEXT_PUBLIC_CONTRACT_ID;

    const warnings = validateConfig();

    expect(warnings).toHaveLength(1);
    expect(warnings[0].key).toBe('NEXT_PUBLIC_CONTRACT_ID');
    expect(warnings[0].severity).toBe('error');
    expect(warnings[0].message).toMatch(/NEXT_PUBLIC_CONTRACT_ID/);
  });

  it('returns a warning when NEXT_PUBLIC_CONTRACT_ID is an empty string', () => {
    process.env.NEXT_PUBLIC_CONTRACT_ID = '';

    const warnings = validateConfig();

    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('error');
  });

  it('returns a warning when NEXT_PUBLIC_CONTRACT_ID is only whitespace', () => {
    process.env.NEXT_PUBLIC_CONTRACT_ID = '   ';

    const warnings = validateConfig();

    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe('error');
  });
});

describe('isConfigValid', () => {
  const ORIGINAL_CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID;

  afterEach(() => {
    process.env.NEXT_PUBLIC_CONTRACT_ID = ORIGINAL_CONTRACT_ID;
  });

  it('returns true when all config is valid', () => {
    process.env.NEXT_PUBLIC_CONTRACT_ID = 'CCYKFR...valid';

    expect(isConfigValid()).toBe(true);
  });

  it('returns false when config is invalid', () => {
    delete process.env.NEXT_PUBLIC_CONTRACT_ID;

    expect(isConfigValid()).toBe(false);
  });
});
