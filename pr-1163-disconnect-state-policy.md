# PR #1163: Disconnect state cleanup policy and remembered addresses fix

## Summary

This PR audits all per-wallet client-side state in the app to determine which pieces should reset on disconnect vs persist as device-level preferences, and fixes a leak where `scoutoff:remembered_addresses` was not cleared on logout.

## Changes

- **New File**: `docs/disconnect-state-policy.md`
  - Documents the policy for which state should reset on disconnect
  - Provides an audit table with decisions and reasoning for each piece of state
  - Serves as precedent for future state additions

- **Updated File**: `context/WalletContext.tsx`
  - Updated `disconnect()` to call `clearAllRememberedAddresses()`
  - Added comment referencing the policy document

- **Updated File**: `context/WalletContext.tsx`
  - Added comment to `clearAllRememberedAddresses()` explaining why it's cleared on disconnect

## Audit Table

| State | Storage | Per-Wallet? | Should Reset on Disconnect? | Reason |
|-------|---------|-------------|-----------------------------|--------|
| **Contact Details** | SWR cache (in-memory) | Yes | **YES** | PII - documented in contact-details-privacy.md |
| **watchlist:{scoutWallet}** | SWR cache | Yes | **YES** | User's private watchlist per wallet |
| **saved-searches:{scoutWallet}** | SWR cache | Yes | **YES** | User's saved searches per wallet |
| **scoutoff_recently_viewed** | localStorage | **No** | **NO** | Device-level preference (all scouts share the same device) |
| **scoutoff_currency_preference** | localStorage | **No** | **NO** | Device-level preference (display preference) |
| **scoutoff_theme_preference** | localStorage | **No** | **NO** | Device-level preference (UI theme) |
| **scout_tour_{tourId}_{wallet or anon}** | localStorage | Yes | **NO** | Per-tour state; tourId + wallet key means separate per wallet but shouldn't be wiped (tour completion status is meaningful) |
| **scoutoff_blocked_users** | localStorage | **Yes** | **YES** | Blocks made by this wallet, not device-level |
| **scoutoff:remembered_addresses** | localStorage | **No** | **YES** (FIXED) | Device-level but should be cleared per-wallet to prevent address leakage |
| **wallet_session** | localStorage | Yes | YES | Session itself - already handled |
| **scoutoff:session_expiry** | localStorage | Yes | YES | Session expiry - already handled |

## Technical Notes

### The Fix

The `disconnect()` function was not calling `clearAllRememberedAddresses()` on logout, which meant the account switcher list would persist across wallet sessions. This could leak information about previously-used wallets to the next scout on a shared computer.

### Device-Level vs Per-Wallet State

The policy distinguishes between:

1. **Per-wallet state** (should reset): Data that's inherently tied to a specific wallet identity
2. **Device-level state** (should persist): Preferences that are about the device itself, not the wallet

The `scoutoff:remembered_addresses` key is a special case - it's technically stored at the device level but contains wallet-specific data, so it should be cleared on logout.

## Related Issue

- Issue #1163: Audit disconnect() scope for per-wallet client-side state
closes #1163

## Acceptance Criteria Met

- [x] Audit table created for every piece of persisted client-side state
- [x] Decision made for each piece (reset-on-disconnect vs device-level) with one-line reason
- [x] `scoutoff:remembered_addresses` now cleared on disconnect
- [x] Decision table captured in `docs/disconnect-state-policy.md` for future reference
