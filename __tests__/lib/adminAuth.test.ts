import { isAdminRequest } from '@/lib/adminAuth';

const ADMIN_ADDRESS = 'GADMINADDRESS000000000000000000000000000000000000000000';
const NON_ADMIN_ADDRESS = 'GUSERADDRESS0000000000000000000000000000000000000000000';

function makeRequest(cookieValue?: string): Request {
  const headers = new Headers();
  if (cookieValue !== undefined) {
    headers.set('cookie', `admin_session=${cookieValue}`);
  }
  return new Request('http://localhost/api/admin/test', { headers });
}

describe('isAdminRequest', () => {
  const originalAdminAddress = process.env.NEXT_PUBLIC_ADMIN_ADDRESS;

  afterEach(() => {
    if (originalAdminAddress === undefined) {
      delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
    } else {
      process.env.NEXT_PUBLIC_ADMIN_ADDRESS = originalAdminAddress;
    }
  });

  it('passes when the session cookie matches the admin address', () => {
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN_ADDRESS;
    expect(isAdminRequest(makeRequest(ADMIN_ADDRESS))).toBe(true);
  });

  it('fails when there is no session cookie', () => {
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN_ADDRESS;
    expect(isAdminRequest(makeRequest())).toBe(false);
  });

  it('fails when the session cookie is for a non-admin wallet', () => {
    process.env.NEXT_PUBLIC_ADMIN_ADDRESS = ADMIN_ADDRESS;
    expect(isAdminRequest(makeRequest(NON_ADMIN_ADDRESS))).toBe(false);
  });

  it('fails closed when NEXT_PUBLIC_ADMIN_ADDRESS is unset', () => {
    delete process.env.NEXT_PUBLIC_ADMIN_ADDRESS;
    expect(isAdminRequest(makeRequest(ADMIN_ADDRESS))).toBe(false);
    expect(isAdminRequest(makeRequest())).toBe(false);
  });
});
