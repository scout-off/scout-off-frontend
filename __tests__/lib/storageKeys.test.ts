import {
  THEME_STORAGE_KEY,
  CURRENCY_PREFERENCE_KEY,
  COOKIE_CONSENT_KEY,
  READ_RECEIPTS_ENABLED_KEY,
  REMEMBERED_ADDRESSES_KEY,
  WALLET_SESSION_KEY,
  SESSION_EXPIRY_KEY,
  SESSION_INVALIDATED_KEY,
  RECENTLY_VIEWED_KEY,
  BLOCKED_USERS_KEY,
  UPLOAD_RESUME_KEY,
  CONTRACT_PAUSED_DISMISSED_KEY,
  CONFIG_WARNING_DISMISSED_KEY,
} from '@/lib/storageKeys';

describe('storageKeys — exported values', () => {
  describe('device-scoped keys (localStorage, shared across wallets)', () => {
    it('THEME_STORAGE_KEY has the correct value', () => {
      expect(THEME_STORAGE_KEY).toBe('scoutoff_theme_preference');
    });

    it('CURRENCY_PREFERENCE_KEY has the correct value', () => {
      expect(CURRENCY_PREFERENCE_KEY).toBe('scoutoff_currency_preference');
    });

    it('COOKIE_CONSENT_KEY has the correct value', () => {
      expect(COOKIE_CONSENT_KEY).toBe('scoutoff:cookie-consent');
    });

    it('READ_RECEIPTS_ENABLED_KEY has the correct value', () => {
      expect(READ_RECEIPTS_ENABLED_KEY).toBe('read_receipts_enabled');
    });

    it('REMEMBERED_ADDRESSES_KEY has the correct value', () => {
      expect(REMEMBERED_ADDRESSES_KEY).toBe('scoutoff:remembered_addresses');
    });
  });

  describe('per-wallet keys (localStorage, tied to the connected wallet)', () => {
    it('WALLET_SESSION_KEY has the correct value', () => {
      expect(WALLET_SESSION_KEY).toBe('wallet_session');
    });

    it('SESSION_EXPIRY_KEY has the correct value', () => {
      expect(SESSION_EXPIRY_KEY).toBe('scoutoff:session_expiry');
    });

    it('SESSION_INVALIDATED_KEY has the correct value', () => {
      expect(SESSION_INVALIDATED_KEY).toBe('scoutoff:session-invalidated');
    });

    it('RECENTLY_VIEWED_KEY has the correct value', () => {
      expect(RECENTLY_VIEWED_KEY).toBe('scoutoff_recently_viewed');
    });

    it('BLOCKED_USERS_KEY has the correct value', () => {
      expect(BLOCKED_USERS_KEY).toBe('scoutoff_blocked_users');
    });

    it('UPLOAD_RESUME_KEY has the correct value', () => {
      expect(UPLOAD_RESUME_KEY).toBe('scout-off:upload-resume');
    });
  });

  describe('session-scoped keys (sessionStorage, cleared on tab close)', () => {
    it('CONTRACT_PAUSED_DISMISSED_KEY has the correct value', () => {
      expect(CONTRACT_PAUSED_DISMISSED_KEY).toBe(
        'scoutoff:contractPausedDismissed',
      );
    });

    it('CONFIG_WARNING_DISMISSED_KEY has the correct value', () => {
      expect(CONFIG_WARNING_DISMISSED_KEY).toBe(
        'scoutoff:configWarningDismissed',
      );
    });
  });

  describe('all keys are strings', () => {
    const allKeys = [
      THEME_STORAGE_KEY,
      CURRENCY_PREFERENCE_KEY,
      COOKIE_CONSENT_KEY,
      READ_RECEIPTS_ENABLED_KEY,
      REMEMBERED_ADDRESSES_KEY,
      WALLET_SESSION_KEY,
      SESSION_EXPIRY_KEY,
      SESSION_INVALIDATED_KEY,
      RECENTLY_VIEWED_KEY,
      BLOCKED_USERS_KEY,
      UPLOAD_RESUME_KEY,
      CONTRACT_PAUSED_DISMISSED_KEY,
      CONFIG_WARNING_DISMISSED_KEY,
    ];

    it('every exported key is a non-empty string', () => {
      for (const key of allKeys) {
        expect(typeof key).toBe('string');
        expect(key.length).toBeGreaterThan(0);
      }
    });

    it('all keys are unique (no accidental duplicates)', () => {
      const uniqueKeys = new Set(allKeys);
      expect(uniqueKeys.size).toBe(allKeys.length);
    });
  });
});
