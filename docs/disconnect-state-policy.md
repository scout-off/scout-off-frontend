# Disconnect state cleanup policy

## Scope

This document defines which client-side state should be cleared when a user
disconnects their wallet from the app. This matters for shared computers
(e.g., academy or club machines) where multiple scouts may use the same
device in sequence.

The policy extends the existing precedent from `docs/contact-details-privacy.md`
(which addresses PII like unlocked player contact details) to other per-wallet
state that could leak between identities.

## The policy

### State that SHOULD reset on disconnect

These are per-wallet preferences or data that should not leak to another
wallet that connects on the same device:

| State Key | Storage | Reason |
|-----------|---------|--------|
| `watchlist:{scoutWallet}` | SWR cache | Private watchlist per wallet |
| `saved-searches:{sccoutWallet}` | SWR cache | Private saved searches per wallet |
| `blocked-users` | localStorage | Blocks made by this wallet |
| `scoutoff_recently_viewed` | localStorage | **Not reset** - see note below |
| `scoutoff_currency_preference` | localStorage | **Not reset** - see note below |
| `scoutoff_theme_preference` | localStorage | **Not reset** - see note below |

**Notes:**
- `scoutoff_recently_viewed`, `scoutoff_currency_preference`, and
  `scoutoff_theme_preference` are **device-level preferences** that persist
  across wallets because they represent user preferences for the device itself,
  not per-wallet identity data.

### State that MUST reset on disconnect

| State Key | Storage | Already Handled? |
|-----------|---------|------------------|
| `wallet_session` | localStorage | ✅ Yes |
| `scoutoff:session_expiry` | localStorage | ✅ Yes |
| `scoutoff:remembered_addresses` | localStorage | ❌ No - needs fix |
| Contact details (SWR) | SWR cache | ✅ Yes (via purgeAllContactDetails) |

## Current implementation

The `disconnect()` function in `context/WalletContext.tsx` currently:

1. **Cleared on disconnect:**
   - `wallet_session` localStorage entry
   - `scoutoff:session_expiry` localStorage entry
   - SWR cache (blanket `mutate(() => true, undefined, { revalidate: false })`)
   - Contact details cache via `purgeAllContactDetails()`

2. **NOT cleared on disconnect (needs fix):**
   - `scoutoff:remembered_addresses` - should be cleared

## Fix required

Update `WalletContext.tsx`'s `disconnect()` to call
`clearAllRememberedAddresses()` alongside the existing `removeStoredSession()`.

## Precedent for future additions

When adding new state, ask:

1. **Is it PII or sensitive?** → Must reset on disconnect
2. **Is it wallet-specific identity data?** (watchlist, saved searches, blocks)
   → Must reset on disconnect
3. **Is it a device-level preference?** (theme, currency, recently viewed) →
   Should persist across wallets on the same device
