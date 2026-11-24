module.exports = {
  ci: {
    collect: {
      startServerCommand: 'npm run start',
      // Public pages only. Lighthouse visits anonymously, so the
      // wallet-gated dashboards (/player, /scout, /validator, ...) never
      // render for it: it would only time their client-side redirect to
      // /?reason=wallet-required, not the dashboards themselves. Pages
      // that read the contract server-side (e.g. /validator/leaderboard)
      // are out too: CI's placeholder contract id makes them error.
      url: [
        'http://localhost:3000/en',
        'http://localhost:3000/en/sponsorship',
        'http://localhost:3000/en/privacy',
      ],
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
        chromeFlags:
          '--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: 0.8 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: 'lighthouse-report',
    },
  },
};
