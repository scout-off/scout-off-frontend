# PR #1165: Session cookie wallet mismatch check

## Summary
Added a UI warning and re-authentication flow when the currently-connected wallet address differs from the identity the session cookie authenticated. This can happen when a user switches accounts in their wallet extension without explicitly disconnecting and re-authenticating first.

## Changes

### WalletContext.tsx
- Added `sessionCookieWallet` and `sessionMismatch` fields to `WalletContextValue` interface
- Added `useState<string | null>(null)` for `sessionCookieWallet`
- Added `useEffect` to fetch session cookie wallet on mount and when `isAuthenticated` changes
- Added `useMemo` to compute `sessionMismatch` (compares connected wallet with cookie wallet)
- Added session cookie wallet reconciliation effect that fetches the authenticated wallet from the server session

### SessionMismatchWarning.tsx (new component)
- Shows a warning banner when session mismatch is detected
- Includes a re-authenticate button to refresh the session
- Can be dismissed by the user
- Responsive design with flex layout for desktop and mobile

### useSessionMismatch.ts (new hook)
- Thin wrapper around `useWallet` to access `sessionMismatch` state
- Returns boolean indicating if there's a mismatch

### Navbar.tsx
- Added import for `SessionMismatchWarning` component
- Added `sessionMismatch` to the destructured `useWallet()` return value
- Renders the warning banner above the navigation bar when mismatch is detected

## How it works
1. On mount and when `isAuthenticated` changes, the app fetches the session cookie's authenticated wallet address from the server
2. Compares this with the currently-connected wallet address
3. If they differ, shows a red warning banner with:
   - Clear explanation of the mismatch
   - Re-authenticate button to refresh the session
   - Dismiss option for the user
4. When re-authenticate is clicked, it calls `reauthenticate()` which refreshes the session with the current wallet address

## Testing
- Manual testing: Connect wallet → switch accounts in wallet extension → verify warning appears
- Verify re-authentication updates the session cookie
- Verify dismissal works and warning doesn't reappear

## Related issues
- Issue #1165
