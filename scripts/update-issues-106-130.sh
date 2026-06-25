#!/bin/bash
set -e
R="scout-off/scout-off-frontend"
u() { gh issue edit "$1" --repo "$R" --body "$2"; }

u 106 "## Description
Add Husky and lint-staged to run ESLint and TypeScript type-checking as a pre-commit hook, preventing broken code from being committed.

## Tasks
- Install \`husky\` and \`lint-staged\`
- Configure \`lint-staged\` to run \`eslint --fix\` on staged \`.ts\`/\`.tsx\` files
- Configure \`lint-staged\` to run \`tsc --noEmit\` on commit
- Add \`prepare\` script to \`package.json\` to install Husky hooks

## Additional Requirements
- Hook must not run on \`--no-verify\` bypass (document this in CONTRIBUTING.md)
- \`lint-staged\` config should live in \`package.json\`

## Acceptance Criteria
- [ ] Pre-commit hook runs \`eslint --fix\` on staged \`.ts\`/\`.tsx\` files
- [ ] Pre-commit hook runs \`tsc --noEmit\`
- [ ] Committing a TypeScript error is blocked
- [ ] \`npm run prepare\` installs the hooks
- [ ] Existing CI workflow continues to pass"

u 107 "## Description
Add Prettier for consistent code formatting across the entire codebase, integrated with the Husky pre-commit hook.

## Tasks
- Install \`prettier\`
- Create \`.prettierrc\` with: single quotes, 2-space indent, trailing commas
- Add \`format\` and \`format:check\` scripts to \`package.json\`
- Add Prettier to the \`lint-staged\` config (run after ESLint)
- Format all existing source files

## Additional Requirements
- Add \`.prettierignore\` to exclude \`node_modules\`, \`.next\`, and generated files
- \`format:check\` should be run in CI

## Acceptance Criteria
- [ ] \`.prettierrc\` exists with correct settings
- [ ] \`npm run format\` formats all source files without errors
- [ ] \`npm run format:check\` exits 0 on a clean repo
- [ ] Pre-commit hook formats staged files automatically
- [ ] CI runs \`format:check\` and fails on unformatted code"

u 108 "## Description
Add Jest coverage thresholds to enforce minimum test coverage and fail CI when thresholds are not met.

## Tasks
- Add \`coverageThreshold\` to \`jest.config.js\`: 70% branches, 80% functions, 80% lines
- Add \`--coverage\` flag to the \`test\` script in \`package.json\`
- Verify the CI job fails when thresholds are not met

## Additional Requirements
- Coverage report should be output to \`coverage/\` directory
- Add \`coverage/\` to \`.gitignore\`

## Acceptance Criteria
- [ ] \`jest.config.js\` has \`coverageThreshold\` set to 70% branches, 80% functions, 80% lines
- [ ] \`npm run test -- --coverage\` generates a coverage report
- [ ] CI fails when coverage drops below thresholds
- [ ] \`coverage/\` directory is in \`.gitignore\`"

u 109 "## Description
Set up \`@testing-library/react\` and \`jest-dom\` so component tests can use DOM matchers and render utilities.

## Tasks
- Install \`@testing-library/react\`, \`@testing-library/user-event\`, \`@testing-library/jest-dom\`
- Create \`jest.setup.ts\` that imports \`@testing-library/jest-dom\`
- Configure \`jest.config.js\` to use \`setupFilesAfterFramework: ['./jest.setup.ts']\`
- Verify setup by running the existing empty test stubs

## Additional Requirements
- Install \`jest-environment-jsdom\` and set \`testEnvironment: 'jsdom'\` in \`jest.config.js\`
- Add \`@types/jest\` for TypeScript support

## Acceptance Criteria
- [ ] \`jest.setup.ts\` imports \`@testing-library/jest-dom\`
- [ ] \`jest.config.js\` references the setup file
- [ ] \`npm run test\` runs without configuration errors
- [ ] DOM matchers (e.g. \`toBeInTheDocument\`) are available in all test files"

u 110 "## Description
Expand the CI workflow to run tests with coverage after the lint job, uploading the report as an artifact.

## Tasks
- Add a \`test\` job to \`.github/workflows/ci.yml\` that runs after \`lint\`
- Run \`npm run test -- --coverage\` in the test job
- Upload the \`coverage/\` directory as a workflow artifact
- Fail the workflow if coverage thresholds are not met

## Additional Requirements
- The test job should use the same Node.js version as the lint job
- Cache \`node_modules\` between jobs using \`actions/cache\`

## Acceptance Criteria
- [ ] CI runs tests after lint on every push and PR
- [ ] Coverage report is uploaded as a workflow artifact
- [ ] Workflow fails if coverage thresholds are not met
- [ ] \`node_modules\` is cached between CI jobs"

u 111 "## Description
Add a Dependabot configuration to automatically open PRs for outdated npm dependencies on a weekly schedule.

## Tasks
- Create \`.github/dependabot.yml\`
- Configure weekly npm dependency updates
- Limit to 5 open PRs at a time
- Group patch-level updates into a single PR

## Additional Requirements
- Target the \`main\` branch
- Add a label \`dependencies\` to all Dependabot PRs
- Ignore major version bumps for \`next\` and \`@stellar/stellar-sdk\` (document why)

## Acceptance Criteria
- [ ] \`.github/dependabot.yml\` exists with correct configuration
- [ ] Weekly schedule is set
- [ ] Open PR limit is 5
- [ ] Patch updates are grouped
- [ ] \`dependencies\` label is applied to Dependabot PRs"

u 112 "## Description
Create CONTRIBUTING.md with project setup, branch naming conventions, PR checklist, and instructions for running smart contract tests.

## Tasks
- Document local setup steps (clone, \`npm install\`, \`.env.local\` setup)
- Define branch naming convention: \`feat/\`, \`fix/\`, \`test/\`, \`chore/\`
- Add a PR checklist: tests pass, env validation passes, no secrets committed, new features include tests
- Add instructions for running smart contract tests (\`cd ../scout-off-contracts && cargo test\`)

## Additional Requirements
- Include a section on how to run the env validation script
- Mention the Husky pre-commit hook and how to bypass it (\`--no-verify\`) only in emergencies

## Acceptance Criteria
- [ ] \`CONTRIBUTING.md\` exists at the repo root
- [ ] Local setup steps are accurate and complete
- [ ] Branch naming convention is documented
- [ ] PR checklist covers tests, env validation, and secrets
- [ ] Smart contract test instructions are included"

u 113 "## Description
Create DEPLOYMENT.md with complete step-by-step instructions for deploying the frontend and smart contracts to Testnet and Mainnet.

## Tasks
- Document building the Next.js app (\`npm run build\`)
- Document deploying to Vercel with all required environment variables
- Document deploying the Soroban contract to Testnet and Mainnet
- Document running the env validation script post-deploy

## Additional Requirements
- Include a table of all required environment variables with descriptions
- Add a rollback section describing how to revert a bad deployment
- Reference the README's Quick Start section for initial setup

## Acceptance Criteria
- [ ] \`DEPLOYMENT.md\` exists at the repo root
- [ ] Vercel deployment steps are complete and accurate
- [ ] Soroban Testnet and Mainnet deployment steps are included
- [ ] All environment variables are listed with descriptions
- [ ] Rollback instructions are present"

u 114 "## Description
Add a PWA manifest and register a service worker via \`next-pwa\` for offline shell caching, targeting low-bandwidth regions.

## Tasks
- Install \`next-pwa\`
- Create \`public/manifest.json\` with app name, icons, theme colour (\`#0f172a\`), and \`display: standalone\`
- Configure \`next-pwa\` in \`next.config.js\` to cache the app shell
- Register the service worker in \`app/layout.tsx\`

## Additional Requirements
- Disable the service worker in development mode
- Cache strategy: network-first for API/RPC calls, cache-first for static assets
- Add \`NEXT_PUBLIC_APP_URL\` to \`.env.example\` for the manifest \`start_url\`

## Acceptance Criteria
- [ ] \`public/manifest.json\` exists with correct fields
- [ ] Service worker is registered in production builds
- [ ] App shell loads offline after first visit
- [ ] Service worker is disabled in development
- [ ] Lighthouse PWA score is 100"

u 115 "## Description
Create SVG and PNG app icons for the ScoutOff brand and add them to \`public/icons/\`, referenced in the layout and PWA manifest.

## Tasks
- Create icons at sizes: 16×16, 32×32, 192×192, 512×512 (PNG) and a scalable SVG
- Add them to \`public/icons/\`
- Reference them in \`app/layout.tsx\` via \`<link rel=\"icon\">\` and \`<link rel=\"apple-touch-icon\">\`
- Reference them in \`public/manifest.json\`

## Additional Requirements
- Icons should use the ScoutOff brand colours (\`#0f172a\` background, white mark)
- Include a maskable icon variant (512×512 with safe zone padding) for Android

## Acceptance Criteria
- [ ] Icons exist at all four PNG sizes plus SVG
- [ ] Maskable 512×512 icon is included
- [ ] \`app/layout.tsx\` references the favicon and apple-touch-icon
- [ ] \`public/manifest.json\` references the 192×192 and 512×512 icons
- [ ] Browser tab shows the correct favicon"

u 116 "## Description
Add \`public/robots.txt\` and generate a \`sitemap.xml\` that includes public pages while excluding wallet-gated routes.

## Tasks
- Create \`public/robots.txt\` allowing all crawlers
- Install \`next-sitemap\` and configure \`next-sitemap.config.js\`
- Include: landing page, \`/player/[id]\` public profiles, \`/scout\` dashboard
- Exclude: \`/player\` (dashboard), \`/validator\`, \`/scout/subscribe\`, \`/admin\`

## Additional Requirements
- Add \`NEXT_PUBLIC_APP_URL\` to \`.env.example\` for the sitemap base URL
- Run \`next-sitemap\` as a \`postbuild\` script

## Acceptance Criteria
- [ ] \`public/robots.txt\` exists and allows all crawlers
- [ ] Sitemap is generated at \`/sitemap.xml\` after build
- [ ] Wallet-gated pages are excluded from the sitemap
- [ ] \`postbuild\` script generates the sitemap automatically"

u 117 "## Description
Add OpenGraph and Twitter card meta tags to \`app/layout.tsx\` for rich social sharing previews, with per-page overrides on player and scout pages.

## Tasks
- Add \`og:title\`, \`og:description\`, \`og:image\`, \`og:url\` to \`app/layout.tsx\` metadata
- Add \`twitter:card\`, \`twitter:title\`, \`twitter:description\`, \`twitter:image\`
- Override metadata in \`app/player/[id]/page.tsx\` with the player's name and profile image
- Override metadata in \`app/scout/page.tsx\` with scout-specific copy

## Additional Requirements
- Default OG image should be a branded 1200×630 PNG in \`public/\`
- Use Next.js 14 \`generateMetadata\` for dynamic per-page metadata

## Acceptance Criteria
- [ ] Default OG and Twitter tags are present in the root layout
- [ ] Player profile page has dynamic OG tags with player name and image
- [ ] Scout page has custom OG tags
- [ ] OG image is 1200×630 and served from \`public/\`
- [ ] Tags validated with the Twitter Card Validator or OG Debugger"

u 118 "## Description
Add IP-based rate limiting to the \`/api/ipfs/upload\` route to prevent abuse, returning 429 with a \`Retry-After\` header when exceeded.

## Tasks
- Implement an in-memory rate limiter (or use \`@upstash/ratelimit\` with Redis)
- Limit to 10 uploads per IP per minute
- Return \`429 Too Many Requests\` with \`Retry-After: 60\` header when exceeded
- Log rate-limit hits to the console with the offending IP

## Additional Requirements
- Use \`x-forwarded-for\` header to get the real IP behind a proxy
- Document the rate limit in the API route's JSDoc comment

## Acceptance Criteria
- [ ] 11th request within a minute returns 429
- [ ] \`Retry-After\` header is present on 429 responses
- [ ] Rate limit resets after 60 seconds
- [ ] Real IP is extracted from \`x-forwarded-for\`
- [ ] Rate-limit hits are logged"

u 119 "## Description
Validate file type and size in the \`/api/ipfs/upload\` route to reject non-media files and oversized uploads before they reach Pinata.

## Tasks
- Check the file's MIME type: allow \`video/*\` and \`image/*\` only
- Verify magic bytes (first 4–8 bytes) to prevent MIME spoofing
- Reject files larger than 100 MB with a \`400\` response
- Return a descriptive error message for each rejection reason

## Additional Requirements
- Magic byte checks must cover: JPEG, PNG, GIF, WebP, MP4, MOV, WebM
- Log rejected uploads (type, size, IP) for monitoring

## Acceptance Criteria
- [ ] Non-media files (e.g. \`.exe\`, \`.pdf\`) are rejected with 400
- [ ] Files with spoofed MIME types are rejected via magic byte check
- [ ] Files over 100 MB are rejected with 400
- [ ] Error response includes a human-readable reason
- [ ] Rejected uploads are logged"

u 120 "## Description
Add a Content Security Policy header in \`next.config.js\` to mitigate XSS and data injection attacks.

## Tasks
- Add CSP header in \`next.config.js\` \`headers()\` config
- Allow \`script-src 'self'\`
- Allow \`img-src 'self'\` and the configured IPFS gateway
- Allow \`connect-src 'self'\`, the Soroban RPC URL, and the Horizon URL
- Block inline scripts (\`'unsafe-inline'\` must not be present for scripts)

## Additional Requirements
- Use environment variables for dynamic gateway/RPC URLs in the CSP
- Add a \`report-uri\` directive pointing to a \`/api/csp-report\` endpoint (stub is sufficient)
- Test with the Chrome DevTools CSP evaluator

## Acceptance Criteria
- [ ] CSP header is present on all responses
- [ ] Inline scripts are blocked
- [ ] IPFS gateway images load correctly
- [ ] Soroban RPC and Horizon connections are allowed
- [ ] \`report-uri\` directive is present"

u 121 "## Description
Add client-side and server-side sanitisation for all free-text inputs to prevent XSS and injection attacks.

## Tasks
- Install \`dompurify\` and \`@types/dompurify\`
- Sanitise player bio, milestone description, and trial offer details on the client before submission
- Strip HTML tags server-side in the \`/api/ipfs/upload\` route and any backend API calls
- Add a \`sanitize(input: string): string\` utility to \`lib/sanitize.ts\`

## Additional Requirements
- \`DOMPurify.sanitize\` must be called with \`{ ALLOWED_TAGS: [] }\` to strip all HTML
- Server-side stripping should use a regex or \`sanitize-html\` package (no DOM dependency)
- Add unit tests for \`lib/sanitize.ts\`

## Acceptance Criteria
- [ ] \`lib/sanitize.ts\` exports a \`sanitize\` function
- [ ] HTML tags are stripped from all free-text fields before contract/API calls
- [ ] \`<script>\` injection in a bio field does not execute
- [ ] Server-side sanitisation does not depend on the DOM
- [ ] Unit tests for \`sanitize\` pass"

u 122 "## Description
Integrate Vercel Analytics to track page views and Web Vitals without sending any PII (wallet addresses).

## Tasks
- Install \`@vercel/analytics\`
- Add the \`<Analytics />\` component to \`app/layout.tsx\`
- Verify that wallet addresses are not included in any analytics events
- Add \`NEXT_PUBLIC_VERCEL_ANALYTICS_ID\` to \`.env.example\`

## Additional Requirements
- Confirm analytics are disabled in \`NODE_ENV=test\` to avoid polluting data
- Document the analytics setup in DEPLOYMENT.md

## Acceptance Criteria
- [ ] \`<Analytics />\` is rendered in the root layout
- [ ] Page views are tracked in the Vercel Analytics dashboard
- [ ] No wallet addresses appear in analytics event payloads
- [ ] Analytics are disabled in test environment
- [ ] \`NEXT_PUBLIC_VERCEL_ANALYTICS_ID\` is in \`.env.example\`"

u 123 "## Description
Add Sentry error tracking to capture unhandled errors and contract call failures, with wallet address scrubbing.

## Tasks
- Install \`@sentry/nextjs\` and run \`npx @sentry/wizard\` to generate config files
- Configure \`NEXT_PUBLIC_SENTRY_DSN\` in \`.env.example\`
- Capture contract call errors in all write functions in \`lib/contract.ts\`
- Add a \`beforeSend\` hook to scrub wallet addresses from Sentry payloads

## Additional Requirements
- Disable Sentry in \`NODE_ENV=test\` and \`NODE_ENV=development\`
- Set \`tracesSampleRate: 0.1\` for production to limit volume
- Document the Sentry setup in DEPLOYMENT.md

## Acceptance Criteria
- [ ] Unhandled errors are captured in Sentry
- [ ] Contract call failures are explicitly captured with context
- [ ] Wallet addresses are scrubbed from all Sentry payloads
- [ ] Sentry is disabled in test and development
- [ ] \`NEXT_PUBLIC_SENTRY_DSN\` is in \`.env.example\`"

u 124 "## Description
Add internationalisation support using \`next-intl\` with English and French locales, and a language switcher in the Navbar.

## Tasks
- Install \`next-intl\`
- Create \`messages/en.json\` and \`messages/fr.json\` covering all static UI strings
- Configure \`next-intl\` middleware and routing in \`next.config.js\`
- Add a language switcher dropdown to the Navbar

## Additional Requirements
- Translate: Navbar links, landing page hero, dashboard headings, button labels, error messages
- Default locale is \`en\`; persist the user's choice in a cookie
- Add \`NEXT_PUBLIC_DEFAULT_LOCALE\` to \`.env.example\`

## Acceptance Criteria
- [ ] \`messages/en.json\` and \`messages/fr.json\` exist with all keys
- [ ] Language switcher in Navbar switches the UI language
- [ ] Chosen language persists across page reloads
- [ ] All static strings in Navbar and landing page are translated
- [ ] Default locale falls back to \`en\`"

u 125 "## Description
Add a Swahili (\`sw\`) locale file to the \`next-intl\` setup, covering all keys defined in the English locale.

## Tasks
- Create \`messages/sw.json\` with Swahili translations for all keys in \`messages/en.json\`
- Add \`sw\` to the locale list in the \`next-intl\` config
- Add Swahili as an option in the Navbar language switcher

## Additional Requirements
- Swahili translations should be reviewed for accuracy (note any machine-translated strings with a TODO comment)
- Ensure right-to-left layout is not needed (Swahili is LTR)

## Acceptance Criteria
- [ ] \`messages/sw.json\` exists with all keys from \`messages/en.json\`
- [ ] \`sw\` appears in the language switcher
- [ ] Selecting Swahili renders the UI in Swahili
- [ ] No missing translation keys (next-intl warns on missing keys)"

u 126 "## Description
Add an Activity Feed panel to the scout dashboard showing recent on-chain events, auto-refreshing every 30 seconds.

## Tasks
- Create \`components/scout/ActivityFeed.tsx\`
- Fetch recent events (\`player_registered\`, \`milestone_approved\`, \`trial_offer_logged\`) from the backend API or Horizon event stream
- Display each event with an icon, description, and relative timestamp
- Auto-refresh every 30 seconds using \`setInterval\`

## Additional Requirements
- Show a loading skeleton while fetching
- Limit the feed to the 20 most recent events
- Clear the interval on component unmount to prevent memory leaks

## Acceptance Criteria
- [ ] Activity feed renders on the scout dashboard
- [ ] All three event types are displayed with correct icons
- [ ] Feed auto-refreshes every 30 seconds
- [ ] Loading skeleton shown during fetch
- [ ] Interval is cleared on unmount"

u 127 "## Description
Add a wallet address search input to the scout dashboard that calls \`get_player\` directly and shows the result inline.

## Tasks
- Add a search input above the filter form in \`app/scout/page.tsx\`
- On submit, call \`getPlayer(walletAddress)\` from \`lib/contract.ts\`
- Display the matching \`PlayerCard\` inline below the search box
- Show a \"Player not found\" message for unknown addresses

## Additional Requirements
- Validate that the input is a valid Stellar public key (56-char G... address) before calling the contract
- Clear the inline result when the search input is cleared
- Debounce the search by 300 ms

## Acceptance Criteria
- [ ] Search input is present on the scout dashboard
- [ ] Valid wallet address returns the correct \`PlayerCard\`
- [ ] Invalid Stellar address shows a validation error
- [ ] Unknown address shows \"Player not found\"
- [ ] Search input is debounced by 300 ms"

u 128 "## Description
Add a Share Profile button to the public player profile page that copies the URL to the clipboard and shows a \"Copied!\" toast.

## Tasks
- Add a Share Profile button to \`app/player/[id]/page.tsx\`
- On click, call \`navigator.clipboard.writeText(window.location.href)\`
- Show a \"Copied!\" success toast via \`useToast\`
- Ensure the URL is OpenGraph-friendly (no hash fragments)

## Additional Requirements
- Fall back to \`document.execCommand('copy')\` for browsers without Clipboard API
- Add \`og:url\` meta tag to the player profile page pointing to the canonical URL

## Acceptance Criteria
- [ ] Share Profile button is visible on the public player profile
- [ ] Clicking it copies the profile URL to the clipboard
- [ ] \"Copied!\" toast appears after a successful copy
- [ ] Fallback works in browsers without Clipboard API
- [ ] \`og:url\` meta tag is present on the player profile page"

u 129 "## Description
Add a tooltip to each milestone badge in \`MilestoneTimeline\` showing the full validator wallet address and block timestamp on hover/focus.

## Tasks
- Create \`components/ui/Tooltip.tsx\` as a primitive built on top of \`Badge\`
- Accept \`content\` (string) and \`children\` props
- Show the tooltip on hover and on keyboard focus
- Apply the tooltip to each milestone's validator badge in \`MilestoneTimeline\`

## Additional Requirements
- Tooltip must be accessible: use \`role=\"tooltip\"\` and \`aria-describedby\`
- Position the tooltip above the badge by default; flip below if near the viewport edge
- Auto-hide after 5 seconds of inactivity

## Acceptance Criteria
- [ ] \`Tooltip\` component exists in \`components/ui/\`
- [ ] Tooltip shows on hover and keyboard focus
- [ ] Tooltip content includes full validator address and formatted block timestamp
- [ ] \`role=\"tooltip\"\` and \`aria-describedby\` are set correctly
- [ ] Tooltip flips position near viewport edges"

u 130 "## Description
Implement the admin dashboard at \`app/admin/page.tsx\`, gated to the contract admin wallet, with UI for all admin contract functions.

## Tasks
- Create \`app/admin/page.tsx\` and gate access: redirect to \`/\` if the connected wallet is not the contract admin
- Add UI for \`add_validator(address)\` and \`remove_validator(address)\`
- Display accumulated platform fees and a \`withdraw_fees\` button
- Add a circuit breaker toggle for \`pause_contract\` / \`unpause_contract\`

## Additional Requirements
- Admin wallet address is read from \`NEXT_PUBLIC_ADMIN_ADDRESS\` env var
- All admin actions require a \`ConfirmDialog\` before signing
- Add \`NEXT_PUBLIC_ADMIN_ADDRESS\` to \`.env.example\`

## Acceptance Criteria
- [ ] Non-admin wallets are redirected to \`/\` with an \"Unauthorized\" toast
- [ ] Admin can add and remove validators
- [ ] Accumulated fees are displayed and withdrawable
- [ ] Circuit breaker toggle pauses and unpauses the contract
- [ ] All actions require confirmation via \`ConfirmDialog\`"

echo "Done 106-130"
