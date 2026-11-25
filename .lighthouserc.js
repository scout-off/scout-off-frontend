module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run start',
      // Public pages plus the wallet-gated dashboards. Dashboards are
      // signed in by scripts/lhci-auth.js (puppeteerScript), which needs
      // LHCI_TEST_AUTH=1, SESSION_SECRET and SESSIONS_DB_PATH shared with
      // the server — see CONTRIBUTING.md. Pages that read the contract
      // server-side (e.g. /validator/leaderboard) stay out: CI's
      // placeholder contract id makes them error.
      url: [
        'http://localhost:3000/en',
        'http://localhost:3000/en/sponsorship',
        'http://localhost:3000/en/privacy',
        'http://localhost:3000/en/player',
        'http://localhost:3000/en/scout',
        'http://localhost:3000/en/validator',
      ],
      puppeteerScript: './scripts/lhci-auth.js',
      // A single run is too noisy on shared GitHub-hosted runners — one busy
      // neighbor can spike total-blocking-time enough to fail the 0.8
      // performance gate on an otherwise-unrelated commit. Take the median
      // of 3 runs (Lighthouse CI's own default) instead.
      numberOfRuns: 3,
      // GitHub Actions' ubuntu-latest runner moved to Ubuntu 24.04, which
      // restricts unprivileged user namespaces via AppArmor by default —
      // Chrome's sandbox needs one, so it refuses to launch there
      // ("No usable sandbox!") unless explicitly disabled.
      settings: {
        // Keep the session cookie and wallet hint set by the puppeteerScript.
        disableStorageReset: true,
        chromeFlags:
          '--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: '.*',
          assertions: {
            'categories:performance': ['error', { minScore: 0.8 }],
            'categories:accessibility': ['error', { minScore: 0.95 }],
            'categories:best-practices': ['error', { minScore: 0.9 }],
            'errors-in-console': 'warn',
          },
        },
        {
          // SEO only matters for public, indexable pages.
          matchingUrlPattern: '/en(/sponsorship|/privacy)?$',
          assertions: {
            'categories:seo': ['error', { minScore: 0.9 }],
          },
        },
      ],
    },
    upload: {
      target: 'filesystem',
      outputDir: 'lighthouse-report',
    },
  },
};
