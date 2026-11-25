const { assertTestAuthAllowed } = require('../../scripts/lhci-auth.js');

const base = {
  LHCI_TEST_AUTH: '1',
  SESSION_SECRET: 'secret',
  SESSIONS_DB_PATH: '/tmp/lhci.db',
};

describe('scripts/lhci-auth guard', () => {
  it('allows explicitly enabled, non-production runs', () => {
    expect(() => assertTestAuthAllowed(base)).not.toThrow();
  });

  it('is disabled unless LHCI_TEST_AUTH=1', () => {
    expect(() =>
      assertTestAuthAllowed({ ...base, LHCI_TEST_AUTH: undefined }),
    ).toThrow(/disabled/);
  });

  it.each([{ NODE_ENV: 'production' }, { VERCEL_ENV: 'production' }])(
    'refuses to run in production (%o)',
    (env) => {
      expect(() => assertTestAuthAllowed({ ...base, ...env })).toThrow(
        /production/,
      );
    },
  );
});
