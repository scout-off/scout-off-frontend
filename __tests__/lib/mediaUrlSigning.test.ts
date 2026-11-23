const CID = 'QmAbc123';

function loadModule() {
  jest.resetModules();
  return require('@/lib/mediaUrlSigning') as typeof import('@/lib/mediaUrlSigning');
}

describe('mediaUrlSigning — signing disabled (no secret configured)', () => {
  const prevSecret = process.env.MEDIA_URL_SIGNING_SECRET;

  beforeEach(() => {
    delete process.env.MEDIA_URL_SIGNING_SECRET;
  });

  afterAll(() => {
    if (prevSecret !== undefined) {
      process.env.MEDIA_URL_SIGNING_SECRET = prevSecret;
    }
  });

  test('isMediaSigningEnabled reports false', () => {
    const { isMediaSigningEnabled } = loadModule();
    expect(isMediaSigningEnabled()).toBe(false);
  });

  test('signMediaUrl throws a clear error', () => {
    const { signMediaUrl } = loadModule();
    expect(() => signMediaUrl(CID)).toThrow(/MEDIA_URL_SIGNING_SECRET/);
  });

  test('verifyMediaUrlSignature returns false rather than throwing', () => {
    const { verifyMediaUrlSignature } = loadModule();
    expect(verifyMediaUrlSignature(CID, '9999999999', 'anything')).toBe(false);
  });
});

describe('mediaUrlSigning — signing enabled', () => {
  const prevSecret = process.env.MEDIA_URL_SIGNING_SECRET;

  beforeEach(() => {
    process.env.MEDIA_URL_SIGNING_SECRET = 'test-secret-value';
  });

  afterAll(() => {
    if (prevSecret === undefined) {
      delete process.env.MEDIA_URL_SIGNING_SECRET;
    } else {
      process.env.MEDIA_URL_SIGNING_SECRET = prevSecret;
    }
  });

  test('isMediaSigningEnabled reports true', () => {
    const { isMediaSigningEnabled } = loadModule();
    expect(isMediaSigningEnabled()).toBe(true);
  });

  test('signMediaUrl returns a proxy path with exp and sig query params', () => {
    const { signMediaUrl } = loadModule();
    const url = signMediaUrl(CID, 3600);
    expect(url).toMatch(/^\/api\/media\/QmAbc123\?exp=\d+&sig=[0-9a-f]+$/);
  });

  test('a freshly signed URL verifies successfully', () => {
    const mod = loadModule();
    const url = mod.signMediaUrl(CID, 3600);
    const params = new URL(url, 'http://localhost').searchParams;
    expect(
      mod.verifyMediaUrlSignature(CID, params.get('exp'), params.get('sig')),
    ).toBe(true);
  });

  test('rejects a signature for a different CID', () => {
    const mod = loadModule();
    const url = mod.signMediaUrl(CID, 3600);
    const params = new URL(url, 'http://localhost').searchParams;
    expect(
      mod.verifyMediaUrlSignature(
        'QmSomeOtherCid',
        params.get('exp'),
        params.get('sig'),
      ),
    ).toBe(false);
  });

  test('rejects an expired signature', () => {
    const mod = loadModule();
    const url = mod.signMediaUrl(CID, -10); // already expired
    const params = new URL(url, 'http://localhost').searchParams;
    expect(
      mod.verifyMediaUrlSignature(CID, params.get('exp'), params.get('sig')),
    ).toBe(false);
  });

  test('rejects a tampered signature', () => {
    const mod = loadModule();
    const url = mod.signMediaUrl(CID, 3600);
    const params = new URL(url, 'http://localhost').searchParams;
    const sig = params.get('sig')!;
    const lastChar = sig.slice(-1);
    const replacement = lastChar === '0' ? '1' : '0';
    const tamperedSig = `${sig.slice(0, -1)}${replacement}`;
    expect(
      mod.verifyMediaUrlSignature(CID, params.get('exp'), tamperedSig),
    ).toBe(false);
  });

  test('rejects when exp or sig is missing', () => {
    const { verifyMediaUrlSignature } = loadModule();
    expect(verifyMediaUrlSignature(CID, null, 'abc')).toBe(false);
    expect(verifyMediaUrlSignature(CID, '9999999999', null)).toBe(false);
  });
});
