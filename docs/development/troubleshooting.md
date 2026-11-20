# Troubleshooting

Common errors hit during local setup and how to fix them. Start with [setup.md](setup.md) if you have not set up the stack yet.

## Common Errors

A reference for the errors new contributors hit most often — the
pages in this section also map to the ISSUES.md backlog. Run `npm test`,
`npm run lint`, and `npm run type-check` after any of the resolutions
below; the broader regression tests are the cheapest way to confirm
nothing else broke while fixing the local symptom.

### Error 1: Missing environment variable (`validate-env` failure)

```
Missing from .env.example: SOME_VAR_NAME
```

This means a `process.env.SOME_VAR_NAME` is referenced in source code (`.ts` / `.tsx` files) but is not declared in `.env.example`.

**Solution:**

- If it's a new variable you need: add it to `.env.example` and `.env.local` with a value.
- If it's a stale reference: search for the variable in the codebase and remove it, or add it to `.env.example`.

Do not skip this check — CI runs it on every PR.

### Error 2: Unfunded testnet account

**Symptom:** Any contract call fails with an error containing:

```
transaction submit failed
op_underfunded
Resource temporarily unavailable
```

Or wallet operations show `"account not found"` / `"insufficient balance"`.

**Solution:**

1. Verify your account exists on testnet: visit `https://horizon-testnet.stellar.org/accounts/<YOUR_PUBLIC_KEY>`.
2. If you get a 404, the account hasn't been created yet — fund it via Friendbot:
   ```
   https://friendbot.stellar.org/?addr=<YOUR_PUBLIC_KEY>
   ```
3. Wait ~5 seconds for the ledger to close, then retry.
4. **Note:** Friendbot has rate limits (1 request per ~30 seconds per account). If you hit the limit, wait and retry.

### Error 3: Wrong network (testnet vs. mainnet mismatch)

**Symptom:** App loads but contract calls return `"contract not found"` or the wallet shows an incorrect balance. The app may display "contract not initialized" even though you deployed it.

This happens when one component of the stack is on the wrong network.

**Checklist:**

1. `.env.local` → `NEXT_PUBLIC_NETWORK=testnet` (not `mainnet`)
2. `.env.local` → `NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org`
3. `.env.local` → `NEXT_PUBLIC_SOROBAN_RPC=https://soroban-testnet.stellar.org`
4. Freighter extension → switch network to **Testnet** in the extension dropdown
5. Contract deployed with `--network testnet` (check with `stellar contract invoke --id <CONTRACT_ID> --network testnet -- health`)

**Fix:** Align all three layers (env config, wallet extension, and contract deployment) to testnet. Restart the dev server after changing env vars:

```bash
# Ctrl+C to stop, then:
npm run dev
```

---

### Error 4: Husky pre-commit hook fails (`lint-staged` cannot parse a file)

**Symptom:** Running `git commit` prints something like:

```
husky > pre-commit (node v24.x.x)
npx: prettier: not found
× prettier --check failed:
[ERROR] Could not find parser for ".gitignore"
[ERROR] Could not find parser for "public/sw.js.map"
```

**Root cause:** `lint-staged` globs `*.{ts,tsx,js,mjs,json,md,...}` and
passes every staged file to `prettier --check`. Files Prettier doesn't
have a parser for (e.g. `.gitignore`, `.env`, sourcemaps, generated
`public/sw*.js`) need to be excluded via `.prettierignore` or they'd
break every commit even when nothing is wrong with the code.

**Solution:**

1. Open `.prettierignore` and confirm these entries are present:

   ```
   .gitignore
   .env
   .env.local
   .env.*.local
   public/sw.js
   public/sw.js.map
   public/workbox-*.js
   public/workbox-*.js.map
   ```

2. If a new generated file shows up that Prettier can't parse, append
   it to `.prettierignore` rather than disabling the lint-staged step.

3. For `.env`-shaped secrets specifically, never check `.env.local` —
   it's already in `.gitignore`. Only `.env.example` (the committed
   template) should pass through Prettier.

### Error 5: Service worker cache returned a stale page after a hot fix

**Symptom:** A critical fix was merged and deployed, but the browser
still shows the old, broken UI after a normal refresh. The network
panel shows `ServiceWorker` (not `Memory cache`) as the initiator for
`/_next/static/chunks/*` requests.

**Root cause:** Next.js's `next-pwa` plugin keeps serving the
previous build from the service worker's `precache` until the user
explicitly accepts the new version. This is by design — silent
`skipWaiting()` would interrupt in-flight requests on every deploy.

**Solution:**

1. The `ServiceWorkerUpdateBanner` component surfaces a polite prompt
   once `window.workbox`'s `waiting` event fires. Reload via that
   banner's button, **not** a regular refresh.
2. If the banner doesn't appear (e.g. you're on a tab that's been
   idle across the deploy), do a one-time workaround:
   DevTools → Application → Service Workers → **Unregister**, then
   hard-reload (`Ctrl+Shift+R` or `Cmd+Shift+R`).
3. For local development you can opt out of the service worker
   entirely by editing `next.config.js`'s `pwa` block — comment out
   or disable the plugin, restart `npm run dev`, and the public
   bundle will be served from the regular Next.js dev cache. Don't
   ship that config change: it's local-only.

### Error 6: `validate-pr-bodies` CI step fails on a docs-only PR

**Symptom:** The `lint` job fails on a docs-only PR with output like:

```
Validate docs/pr-bodies/ body-file contract
All 0 body file(s) in docs/pr-bodies/ pass the contract.
... but a required header / section is missing, e.g.:
docs/pr-bodies/fix-foo.md: missing <!-- Title: ... -->
```

**Root cause:** Every PR that touches `docs/pr-bodies/*.md` must keep the
file headers (`<!-- Branch: ... -->` + `<!-- Title: ... -->`) and the
required `## Summary` / `## Validation` sections intact — the CI guard
(`scripts/validate-pr-bodies.js`, run from the `lint` job in
`.github/workflows/ci.yml`) verifies this on every PR.

**Solution:**

1. Re-add the missing header / section. The template lives in
   `.github/PULL_REQUEST_TEMPLATE.md` under "PR Body Source" and is
   enforced by `scripts/validate-pr-bodies.js`.
2. Run the script locally before pushing:
   ```
   node scripts/validate-pr-bodies.js
   ```
   Exit code 0 means green; non-zero lists the offending files.
3. If you intentionally need a body file that breaks the convention
   (extremely rare — only for archival of a closed PR), call that out
   in the PR description and bypass via `[skip-docs-validation]` in
   the PR title so the maintainer can drop the guard once.
