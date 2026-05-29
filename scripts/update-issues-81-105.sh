#!/bin/bash
set -e
R="scout-off/scout-off-frontend"
u() { gh issue edit "$1" --repo "$R" --body "$2"; }

u 81 "## Description
Add unit tests for \`lib/stellar.ts\` to verify the Soroban RPC client is configured correctly.

## Tasks
- Create \`__tests__/lib/stellar.test.ts\`
- Mock environment variables

## Acceptance Criteria
- [ ] \`getSorobanRpcClient()\` returns a client using \`NEXT_PUBLIC_SOROBAN_RPC\`
- [ ] Network constants match \`NEXT_PUBLIC_NETWORK\` (testnet vs mainnet)
- [ ] Throws a clear error when required env vars are missing
- [ ] All tests pass"

u 82 "## Description
Add unit tests for the read functions in \`lib/contract.ts\`.

## Tasks
- Create \`__tests__/lib/contract.test.ts\`
- Mock the Soroban RPC client

## Acceptance Criteria
- [ ] \`getPlayer()\` deserialises the contract response into a \`Player\` object
- [ ] \`filterPlayers()\` passes region, position, and minLevel args correctly
- [ ] \`getValidators()\` returns an array of \`ValidatorInfo\` objects
- [ ] \`getSubscription()\` returns \`null\` for a scout with no subscription
- [ ] All tests pass"

u 83 "## Description
Add unit tests for the write functions in \`lib/contract.ts\`.

## Tasks
- Extend \`__tests__/lib/contract.test.ts\`
- Mock Freighter signing via \`@stellar/freighter-api\`

## Acceptance Criteria
- [ ] \`registerPlayer()\` builds a transaction with the correct contract arguments
- [ ] \`approveMilestone()\` includes the validator address in the transaction
- [ ] Write functions throw a \`ContractError\` when the contract returns \`ContractPaused\`
- [ ] Freighter signing is called exactly once per write operation
- [ ] All tests pass"

u 84 "## Description
Add unit tests for \`lib/ipfs.ts\`.

## Tasks
- Create \`__tests__/lib/ipfs.test.ts\`
- Mock \`fetch\`

## Acceptance Criteria
- [ ] \`ipfsUrl(cid)\` returns \`\${NEXT_PUBLIC_IPFS_GATEWAY}/ipfs/\${cid}\`
- [ ] \`uploadToIPFS(file)\` posts to \`/api/ipfs/upload\` and returns the CID
- [ ] Falls back to secondary gateway when primary returns 500
- [ ] Throws an error when all gateways are exhausted
- [ ] All tests pass"

u 85 "## Description
Add unit tests for \`lib/api.ts\`.

## Tasks
- Create \`__tests__/lib/api.test.ts\`
- Mock \`axios\`

## Acceptance Criteria
- [ ] Axios base URL is set from \`NEXT_PUBLIC_API_URL\`
- [ ] \`getMessages()\` calls \`GET /messages/:scoutID/:playerID\`
- [ ] \`sendMessage()\` calls \`POST /messages\` with the correct body
- [ ] 401 response clears the session
- [ ] 500 response surfaces an error
- [ ] All tests pass"

u 86 "## Description
Add unit tests for \`scripts/validate-env.js\`.

## Tasks
- Create \`__tests__/lib/validate-env.test.js\`
- Use \`child_process.spawnSync\` to run the script with controlled env vars

## Acceptance Criteria
- [ ] Exits with code 0 when all variables in \`.env.example\` are present in \`process.env\`
- [ ] Exits with code 1 when any variable is missing
- [ ] Prints the name of each missing variable to stdout
- [ ] All tests pass"

u 87 "## Description
Audit and fix keyboard navigation in the \`Navbar\` component to meet WCAG 2.1 AA.

## Tasks
- Run \`axe-core\` audit on \`Navbar.tsx\` (add \`@axe-core/react\` in dev mode)
- Ensure all nav links are reachable via Tab in DOM order
- Add \`aria-current=\"page\"\` to the active route link
- Add \`aria-expanded\` and \`aria-controls\` to the mobile menu toggle

## Additional Requirements
- Fix any colour contrast issues flagged by axe
- Verify with keyboard-only navigation (no mouse)

## Acceptance Criteria
- [ ] All nav links reachable via Tab
- [ ] Active link has \`aria-current=\"page\"\`
- [ ] Mobile menu toggle has \`aria-expanded\` and \`aria-controls\`
- [ ] Zero axe-core violations at AA level
- [ ] Verified with keyboard-only navigation"

u 88 "## Description
Add proper ARIA labels to \`WalletButton\` so screen readers can announce its state.

## Tasks
- Add \`aria-label=\"Connect wallet\"\` when disconnected
- Add \`aria-label=\"Disconnect wallet — [address]\"\` when connected
- Add \`aria-pressed\` to reflect the connected/disconnected toggle state

## Additional Requirements
- Verify with VoiceOver or NVDA that the label is announced correctly on focus

## Acceptance Criteria
- [ ] \`aria-label\` is set correctly in both states
- [ ] \`aria-pressed\` reflects the current connection state
- [ ] Screen reader announces the correct label on focus"

u 89 "## Description
Audit \`ProgressBar\` colour contrast to ensure WCAG 2.1 AA compliance.

## Tasks
- Check contrast ratio of each level's fill colour against its background
- Check contrast of any text rendered inside or adjacent to the bar
- Update Tailwind colour classes where contrast is insufficient

## Additional Requirements
- Use a contrast checker tool (e.g. WebAIM Contrast Checker)
- Document the chosen colours and their contrast ratios in a code comment

## Acceptance Criteria
- [ ] All fill colours meet 3:1 contrast ratio against background (UI component requirement)
- [ ] Any adjacent text meets 4.5:1 contrast ratio
- [ ] Contrast ratios documented in a code comment"

u 90 "## Description
Add a skip-to-content link to \`app/layout.tsx\` for keyboard users to bypass the Navbar.

## Tasks
- Add a visually-hidden \`<a href=\"#main-content\">Skip to main content</a>\` as the first focusable element in the layout
- Make it visible on focus using Tailwind \`focus:not-sr-only\`
- Wrap all page content in \`<main id=\"main-content\">\`

## Additional Requirements
- The link must be the very first focusable element in the DOM
- Verify it works correctly in Chrome and Firefox

## Acceptance Criteria
- [ ] Skip link is the first Tab stop on every page
- [ ] Skip link becomes visible when focused
- [ ] Activating the link moves focus to \`#main-content\`
- [ ] Works in Chrome and Firefox"

u 91 "## Description
Make \`PlayerCard\` fully accessible for keyboard and screen reader users.

## Tasks
- Wrap the card in a focusable element (\`<article tabIndex={0}>\` or \`<a>\`)
- Add \`role=\"article\"\` and a descriptive \`aria-label\` (e.g. \"[Name], [Position], Level [N]\")
- Ensure the level Badge has a descriptive \`aria-label\`
- Ensure the card is activatable with Enter and Space keys

## Acceptance Criteria
- [ ] Card is reachable via Tab
- [ ] \`aria-label\` describes the player correctly
- [ ] Level Badge has a descriptive \`aria-label\`
- [ ] Enter and Space activate the card navigation
- [ ] Zero axe-core violations on the card"

u 92 "## Description
Implement lazy loading for IPFS media in \`IPFSMediaGallery\` to improve performance on slow connections.

## Tasks
- Use Next.js \`<Image>\` with \`loading=\"lazy\"\` and appropriate \`sizes\` for photos
- For videos, set \`loading=\"lazy\"\` on the \`<video>\` element and use a poster image
- Only load the video source when the user clicks play

## Additional Requirements
- Use \`IntersectionObserver\` to defer video source injection until the element is near the viewport
- Measure LCP improvement with Lighthouse before and after

## Acceptance Criteria
- [ ] Photos use Next.js \`<Image>\` with \`loading=\"lazy\"\`
- [ ] Videos show a poster image and do not load the source until clicked
- [ ] \`IntersectionObserver\` defers video source injection
- [ ] Lighthouse performance score does not regress"

u 93 "## Description
Wrap \`PlayerCard\` in \`React.memo\` to prevent unnecessary re-renders in the scout dashboard.

## Tasks
- Wrap \`PlayerCard\` export with \`React.memo\`
- Add a custom comparison function that checks \`player.id\` and \`player.progressLevel\`
- Verify with React DevTools Profiler that re-renders are eliminated

## Additional Requirements
- The comparison function must not cause stale data (only skip re-render when relevant props are unchanged)

## Acceptance Criteria
- [ ] \`PlayerCard\` does not re-render when unrelated parent state changes
- [ ] \`PlayerCard\` does re-render when \`player.id\` or \`player.progressLevel\` changes
- [ ] React DevTools Profiler confirms the optimisation"

u 94 "## Description
Add a 300 ms debounce to filter inputs in the scout dashboard to prevent excessive contract calls.

## Tasks
- Add a \`useDebounce\` utility hook in \`hooks/useDebounce.ts\`
- Apply it to the region, position, and minLevel filter values in \`PlayerFilterForm\`
- Only call \`useScout\`'s filter function after the debounce delay

## Additional Requirements
- \`useDebounce\` should be generic: \`useDebounce<T>(value: T, delay: number): T\`
- Add unit tests for \`useDebounce\` in \`__tests__/hooks/useDebounce.test.ts\`

## Acceptance Criteria
- [ ] Filter contract call is not made until 300 ms after the last input change
- [ ] Rapid successive changes result in only one contract call
- [ ] \`useDebounce\` hook is unit tested
- [ ] All existing tests continue to pass"

u 95 "## Description
Evaluate and implement SWR or React Query for caching contract read results across the app.

## Tasks
- Choose between \`swr\` and \`@tanstack/react-query\` (document the decision in a comment)
- Refactor \`usePlayer\`, \`useScout\`, and \`useMilestoneHistory\` to use the chosen library
- Configure a global cache with a 60-second stale time

## Additional Requirements
- Background revalidation should not cause UI flicker
- Cache keys must be deterministic and include all relevant parameters
- Document the cache key scheme in a code comment

## Acceptance Criteria
- [ ] \`usePlayer\` uses the caching library and does not make duplicate RPC calls
- [ ] \`useScout\` uses the caching library
- [ ] \`useMilestoneHistory\` uses the caching library
- [ ] Background revalidation works without UI flicker
- [ ] All existing hook tests are updated and pass"

u 96 "## Description
Implement the full SEP-10 wallet authentication flow in \`WalletContext.tsx\`.

## Tasks
- After Freighter signs the SEP-10 challenge, POST the signed JWT to \`/api/auth/sep10\`
- The API route stores the session token in an \`httpOnly\` cookie
- Expose \`isAuthenticated: boolean\` from \`WalletContext\`

## Additional Requirements
- Create \`app/api/auth/sep10/route.ts\` to handle the server-side token exchange
- Session cookie must have \`Secure\`, \`HttpOnly\`, and \`SameSite=Strict\` attributes
- Clear the cookie on \`disconnect()\`

## Acceptance Criteria
- [ ] SEP-10 challenge is fetched and signed via Freighter
- [ ] Signed JWT is exchanged for a session cookie
- [ ] \`isAuthenticated\` is \`true\` after successful auth
- [ ] Cookie has correct security attributes
- [ ] Cookie is cleared on disconnect"

u 97 "## Description
Add Albedo wallet support to \`WalletContext.tsx\` as a second wallet option.

## Tasks
- Install \`@albedo-link/intent\`
- Show a wallet selection modal (Freighter / Albedo) when the user clicks Connect Wallet
- Abstract the signing interface into a \`WalletAdapter\` type so hooks are wallet-agnostic

## Additional Requirements
- \`WalletAdapter\` interface: \`{ getPublicKey(): Promise<string>; signTransaction(xdr: string): Promise<string> }\`
- Persist the chosen wallet provider in \`localStorage\`
- Show the provider name/icon next to the wallet address in \`WalletButton\`

## Acceptance Criteria
- [ ] Wallet selection modal shows Freighter and Albedo options
- [ ] Albedo can sign transactions successfully
- [ ] Chosen provider persists across page reloads
- [ ] Provider icon shown in \`WalletButton\`
- [ ] All existing Freighter functionality continues to work"

u 98 "## Description
Add Lobstr wallet support to \`WalletContext.tsx\` following the same abstraction as Albedo.

## Tasks
- Integrate Lobstr wallet using its web extension API
- Add Lobstr as a third option in the wallet selection modal
- Implement the \`WalletAdapter\` interface for Lobstr

## Additional Requirements
- Show a \"Lobstr not installed\" message with an install link if the extension is absent
- Follow the same provider persistence pattern as Albedo

## Acceptance Criteria
- [ ] Lobstr appears in the wallet selection modal
- [ ] Lobstr can sign transactions successfully
- [ ] \"Not installed\" message shown when extension is absent
- [ ] Provider icon shown in \`WalletButton\`
- [ ] All existing wallet functionality continues to work"

u 99 "## Description
Create a \`useRequireWallet\` hook to protect wallet-gated pages.

## Tasks
- Create \`hooks/useRequireWallet.ts\`
- If no wallet is connected, redirect to \`/\` and show a toast: \"Please connect your wallet\"
- Apply the hook in \`app/player/page.tsx\`, \`app/scout/page.tsx\`, and \`app/validator/page.tsx\`

## Additional Requirements
- The redirect must happen before the page renders (use \`useEffect\` + \`router.replace\`)
- Return \`{ walletAddress: string }\` for convenience so pages don't need to call \`useWallet\` separately

## Acceptance Criteria
- [ ] Unauthenticated users are redirected to \`/\` with a toast
- [ ] Authenticated users see the page normally
- [ ] Hook is applied to all three dashboard pages
- [ ] \`walletAddress\` is returned for use in the page"

u 100 "## Description
Replace the free-text region field with a curated African regions/countries select.

## Tasks
- Create \`lib/regions.ts\` exporting \`AFRICAN_REGIONS: { label: string; value: string }[]\`
- Include at minimum: West Africa, East Africa, North Africa, Southern Africa, Central Africa, Nigeria, Ghana, Kenya, South Africa, Ethiopia, Senegal, Côte d'Ivoire, Tanzania, Uganda, Cameroon
- Use this list in \`PlayerFilterForm\` and \`PlayerProfileForm\`

## Additional Requirements
- Values should be lowercase slugs (e.g. \`west-africa\`, \`nigeria\`)
- List should be alphabetically sorted by label

## Acceptance Criteria
- [ ] \`AFRICAN_REGIONS\` is exported from \`lib/regions.ts\`
- [ ] List contains at least 15 entries
- [ ] List is alphabetically sorted
- [ ] Both \`PlayerFilterForm\` and \`PlayerProfileForm\` use the list
- [ ] Free-text region input is removed"

u 101 "## Description
Replace the free-text position field with a standard football positions select.

## Tasks
- Create \`lib/positions.ts\` exporting \`FOOTBALL_POSITIONS: { label: string; value: string }[]\`
- Include: GK, CB, LB, RB, CDM, CM, CAM, LW, RW, ST (with full names as labels)
- Use this list in \`PlayerProfileForm\` and \`PlayerFilterForm\`

## Additional Requirements
- Values should be uppercase abbreviations (e.g. \`GK\`, \`ST\`)
- Labels should be full names (e.g. \"Goalkeeper\", \"Striker\")

## Acceptance Criteria
- [ ] \`FOOTBALL_POSITIONS\` is exported from \`lib/positions.ts\`
- [ ] All 10 positions are present with correct labels and values
- [ ] Both \`PlayerProfileForm\` and \`PlayerFilterForm\` use the list
- [ ] Free-text position input is removed"

u 102 "## Description
Add dark mode support across the entire app using Tailwind's \`dark:\` variant.

## Tasks
- Enable \`darkMode: 'class'\` in \`tailwind.config.ts\`
- Add a dark mode toggle button to the Navbar
- Persist preference in \`localStorage\` and apply the \`dark\` class to \`<html>\`
- Audit all components and add \`dark:\` variants where needed

## Additional Requirements
- Default to the user's OS preference (\`prefers-color-scheme\`) on first visit
- Transition colours smoothly with \`transition-colors duration-200\`

## Acceptance Criteria
- [ ] Dark mode toggle in Navbar switches the theme
- [ ] Preference persists across page reloads
- [ ] OS preference is respected on first visit
- [ ] All components (cards, modals, forms, nav) have correct dark-mode colours
- [ ] Colour transitions are smooth"

u 103 "## Description
Display a maintenance banner in the Navbar when the contract is paused.

## Tasks
- Consume \`useContractHealth\` in \`Navbar.tsx\`
- When \`paused === true\`, render a sticky yellow banner below the nav: \"ScoutOff is currently under maintenance. Transactions are disabled.\"
- Disable all write-action buttons app-wide when \`paused === true\`

## Additional Requirements
- Export a \`useIsPaused()\` convenience hook that returns \`boolean\` for use in individual components
- Banner must be dismissible by the user (dismissed state stored in \`sessionStorage\`)

## Acceptance Criteria
- [ ] Banner appears when \`paused === true\`
- [ ] Banner is absent when \`paused === false\`
- [ ] Write-action buttons are disabled while paused
- [ ] Banner can be dismissed and stays dismissed for the session"

u 104 "## Description
Display the connected wallet's XLM balance in the Navbar after connection.

## Tasks
- After wallet connection, fetch the XLM balance via Horizon: \`GET \${NEXT_PUBLIC_HORIZON_URL}/accounts/\${address}\`
- Display the balance next to the wallet address in the Navbar (e.g. \"42.5 XLM\")
- Refresh the balance after each transaction

## Additional Requirements
- Show a Spinner while the balance is loading
- Format balance to 2 decimal places
- Handle account-not-found (new unfunded accounts) gracefully

## Acceptance Criteria
- [ ] XLM balance is displayed after wallet connection
- [ ] Balance updates after a transaction
- [ ] Spinner shown during loading
- [ ] Unfunded accounts show \"0.00 XLM\" without an error"

u 105 "## Description
Create a \`TransactionStatus\` component to give users feedback during Soroban transaction submission.

## Tasks
- Create \`components/ui/TransactionStatus.tsx\`
- States: \`pending\` (spinner + \"Submitting transaction...\"), \`success\` (green checkmark + tx hash link), \`error\` (red X + error message)
- Accept \`status\`, \`txHash\`, \`error\` props
- Link the tx hash to \`https://stellar.expert/explorer/testnet/tx/\${txHash}\`

## Additional Requirements
- Use the correct Stellar Expert URL for mainnet vs testnet based on \`NEXT_PUBLIC_NETWORK\`
- Auto-hide the success state after 8 seconds
- Integrate into all write-action flows (register, approve, subscribe, pay-to-contact)

## Acceptance Criteria
- [ ] Pending state shows spinner and message
- [ ] Success state shows checkmark and linked tx hash
- [ ] Error state shows error message
- [ ] Tx hash links to the correct Stellar Expert URL
- [ ] Success state auto-hides after 8 seconds"

echo "Done 81-105"
