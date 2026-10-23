import {
  PINATA_NOT_CONFIGURED_ERROR,
  getMissingPinataEnvVars,
  getPinataCredentials,
} from '@/lib/pinataConfig';

describe('pinataConfig', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.PINATA_API_KEY;
    delete process.env.PINATA_SECRET;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('PINATA_NOT_CONFIGURED_ERROR', () => {
    it('is a non-empty string', () => {
      expect(typeof PINATA_NOT_CONFIGURED_ERROR).toBe('string');
      expect(PINATA_NOT_CONFIGURED_ERROR.length).toBeGreaterThan(0);
    });

    it('has the correct error message', () => {
      expect(PINATA_NOT_CONFIGURED_ERROR).toBe('IPFS uploads are not configured');
    });
  });

  describe('getMissingPinataEnvVars', () => {
    it('returns both var names when neither is set', () => {
      const missing = getMissingPinataEnvVars();
      expect(missing).toContain('PINATA_API_KEY');
      expect(missing).toContain('PINATA_SECRET');
      expect(missing).toHaveLength(2);
    });

    it('returns only PINATA_SECRET when PINATA_API_KEY is set', () => {
      process.env.PINATA_API_KEY = 'test-key';
      const missing = getMissingPinataEnvVars();
      expect(missing).toEqual(['PINATA_SECRET']);
    });

    it('returns only PINATA_API_KEY when PINATA_SECRET is set', () => {
      process.env.PINATA_SECRET = 'test-secret';
      const missing = getMissingPinataEnvVars();
      expect(missing).toEqual(['PINATA_API_KEY']);
    });

    it('returns an empty array when both env vars are set', () => {
      process.env.PINATA_API_KEY = 'test-key';
      process.env.PINATA_SECRET = 'test-secret';
      const missing = getMissingPinataEnvVars();
      expect(missing).toEqual([]);
    });

    it('treats an empty string as missing', () => {
      process.env.PINATA_API_KEY = '';
      process.env.PINATA_SECRET = '';
      const missing = getMissingPinataEnvVars();
      expect(missing).toContain('PINATA_API_KEY');
      expect(missing).toContain('PINATA_SECRET');
    });
  });

  describe('getPinataCredentials', () => {
    it('returns null when neither env var is set', () => {
      expect(getPinataCredentials()).toBeNull();
    });

    it('returns null when only PINATA_API_KEY is set', () => {
      process.env.PINATA_API_KEY = 'test-key';
      expect(getPinataCredentials()).toBeNull();
    });

    it('returns null when only PINATA_SECRET is set', () => {
      process.env.PINATA_SECRET = 'test-secret';
      expect(getPinataCredentials()).toBeNull();
    });

    it('returns credentials object when both env vars are set', () => {
      process.env.PINATA_API_KEY = 'my-api-key';
      process.env.PINATA_SECRET = 'my-secret';
      const creds = getPinataCredentials();
      expect(creds).not.toBeNull();
      expect(creds?.apiKey).toBe('my-api-key');
      expect(creds?.secret).toBe('my-secret');
    });

    it('returns null when PINATA_API_KEY is an empty string', () => {
      process.env.PINATA_API_KEY = '';
      process.env.PINATA_SECRET = 'test-secret';
      expect(getPinataCredentials()).toBeNull();
    });

    it('returns null when PINATA_SECRET is an empty string', () => {
      process.env.PINATA_API_KEY = 'test-key';
      process.env.PINATA_SECRET = '';
      expect(getPinataCredentials()).toBeNull();
    });

    it('returns an object with the exact shape of PinataCredentials', () => {
      process.env.PINATA_API_KEY = 'api-key-value';
      process.env.PINATA_SECRET = 'secret-value';
      const creds = getPinataCredentials();
      expect(creds).toEqual({
        apiKey: 'api-key-value',
        secret: 'secret-value',
      });
    });
  });
});
