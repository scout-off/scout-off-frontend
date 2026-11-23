// Mock the session module BEFORE importing
jest.mock('@/lib/session', () => ({
  getSessionWallet: jest.fn(),
}));

// Mock next/server
jest.mock('next/server', () => ({
  NextRequest: class MockNextRequest {
    url: string;
    cookies: any;
    constructor(url: string) {
      this.url = url;
      this.cookies = {
        get: jest.fn(),
        getAll: jest.fn(() => []),
        set: jest.fn(),
        delete: jest.fn(),
        has: jest.fn(),
      };
    }
  },
}));

import { requireAdminWallet } from '@/lib/adminAuth';
import { getSessionWallet } from '@/lib/session';
import { NextRequest } from 'next/server';

describe('requireAdminWallet', () => {
  const ADMIN_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDEFGHIJKLMN';
  const NON_ADMIN_ADDRESS = 'G1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJK';

  const originalAdminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;

  function createMockRequest(cookieValue: string | null): NextRequest {
    const req = new NextRequest('http://localhost:3000/api/admin/test');

    // Override cookies
    req.cookies = {
      get: jest.fn((name: string) => {
        if (name === 'session' && cookieValue) {
          return { name: 'session', value: cookieValue };
        }
        return undefined;
      }),
      getAll: jest.fn(() => []),
      set: jest.fn(),
      delete: jest.fn(),
      has: jest.fn((name: string) => name === 'session' && !!cookieValue),
    };

    return req;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN_ADDRESS;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS = originalAdminAddress;
  });

  describe('No session cookie present', () => {
    it('should return null when session cookie is missing', () => {
      const req = createMockRequest(null);
      (getSessionWallet as jest.Mock).mockReturnValue(null);

      const result = requireAdminWallet(req);

      expect(result).toBeNull();
      expect(getSessionWallet).toHaveBeenCalledWith(req);
    });

    it('should return null when getSessionWallet returns null', () => {
      const req = createMockRequest('some-value');
      (getSessionWallet as jest.Mock).mockReturnValue(null);

      const result = requireAdminWallet(req);

      expect(result).toBeNull();
      expect(getSessionWallet).toHaveBeenCalledWith(req);
    });
  });

  describe('Session cookie present but not admin', () => {
    it('should return null when session cookie value does not match admin address', () => {
      const req = createMockRequest(NON_ADMIN_ADDRESS);
      (getSessionWallet as jest.Mock).mockReturnValue(NON_ADMIN_ADDRESS);

      const result = requireAdminWallet(req);

      expect(result).toBeNull();
      expect(getSessionWallet).toHaveBeenCalledWith(req);
    });

    it('should return null when session cookie value is empty string', () => {
      const req = createMockRequest('');
      (getSessionWallet as jest.Mock).mockReturnValue('');

      const result = requireAdminWallet(req);

      expect(result).toBeNull();
      expect(getSessionWallet).toHaveBeenCalledWith(req);
    });
  });

  describe('Session cookie matches admin address', () => {
    it('should return the wallet address when session cookie matches admin address', () => {
      const req = createMockRequest(ADMIN_ADDRESS);
      (getSessionWallet as jest.Mock).mockReturnValue(ADMIN_ADDRESS);

      const result = requireAdminWallet(req);

      expect(result).toBe(ADMIN_ADDRESS);
      expect(getSessionWallet).toHaveBeenCalledWith(req);
    });
  });

  describe('Empty/unset ADMIN_ADDRESS env var', () => {
    it('should return null when env var is empty and session has admin address', () => {
      process.env.NEXT_PUBLIC_ADMIN_ADDRESS = '';
      const req = createMockRequest(ADMIN_ADDRESS);
      (getSessionWallet as jest.Mock).mockReturnValue(ADMIN_ADDRESS);

      const result = requireAdminWallet(req);

      expect(result).toBeNull();
      expect(getSessionWallet).toHaveBeenCalledWith(req);
    });

    it('should return null when env var is undefined and session has admin address', () => {
      delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
      const req = createMockRequest(ADMIN_ADDRESS);
      (getSessionWallet as jest.Mock).mockReturnValue(ADMIN_ADDRESS);

      const result = requireAdminWallet(req);

      expect(result).toBeNull();
      expect(getSessionWallet).toHaveBeenCalledWith(req);
    });

    it('should return null when both env var and session cookie are empty strings', () => {
      process.env.NEXT_PUBLIC_ADMIN_ADDRESS = '';
      const req = createMockRequest('');
      (getSessionWallet as jest.Mock).mockReturnValue('');

      const result = requireAdminWallet(req);

      expect(result).toBeNull();
      expect(getSessionWallet).toHaveBeenCalledWith(req);
    });
  });

  describe('Case sensitivity', () => {
    it('should reject same address with different case (Stellar addresses are case-sensitive)', () => {
      const lowerCaseAdmin = ADMIN_ADDRESS.toLowerCase();
      const req = createMockRequest(lowerCaseAdmin);
      (getSessionWallet as jest.Mock).mockReturnValue(lowerCaseAdmin);

      const result = requireAdminWallet(req);

      expect(result).toBeNull();
      expect(getSessionWallet).toHaveBeenCalledWith(req);
    });

    it('should accept exact case match', () => {
      const req = createMockRequest(ADMIN_ADDRESS);
      (getSessionWallet as jest.Mock).mockReturnValue(ADMIN_ADDRESS);

      const result = requireAdminWallet(req);

      expect(result).toBe(ADMIN_ADDRESS);
      expect(getSessionWallet).toHaveBeenCalledWith(req);
    });
  });

  describe('Env var read fresh on each call', () => {
    it('should read NEXT_PUBLIC_ADMIN_ADDRESS fresh on each call', () => {
      const firstAdmin = 'GAAAAAFIRSTADMIN1234567890ABCDEFGHIJKLMNOPQRSTUVWX';
      const secondAdmin = 'GAAAAASECONDADMIN1234567890ABCDEFGHIJKLMNOPQRSTUV';

      process.env.NEXT_PUBLIC_ADMIN_ADDRESS = firstAdmin;
      const req1 = createMockRequest(firstAdmin);
      (getSessionWallet as jest.Mock).mockReturnValue(firstAdmin);

      const result1 = requireAdminWallet(req1);
      expect(result1).toBe(firstAdmin);

      process.env.NEXT_PUBLIC_ADMIN_ADDRESS = secondAdmin;
      const req2 = createMockRequest(secondAdmin);
      (getSessionWallet as jest.Mock).mockReturnValue(secondAdmin);

      const result2 = requireAdminWallet(req2);
      expect(result2).toBe(secondAdmin);

      expect(result1).not.toBe(result2);
      expect(getSessionWallet).toHaveBeenCalledTimes(2);
    });

    it('should update behavior immediately when env var changes between calls', () => {
      process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN_ADDRESS;
      const req = createMockRequest(ADMIN_ADDRESS);
      (getSessionWallet as jest.Mock).mockReturnValue(ADMIN_ADDRESS);

      const result1 = requireAdminWallet(req);
      expect(result1).toBe(ADMIN_ADDRESS);

      process.env.NEXT_PUBLIC_ADMIN_ADDRESS = '';

      const result2 = requireAdminWallet(req);
      expect(result2).toBeNull();

      expect(getSessionWallet).toHaveBeenCalledTimes(2);
    });
  });
});
