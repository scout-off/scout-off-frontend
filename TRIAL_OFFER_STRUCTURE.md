# Trial Offer Details Structure — Complete Reference

## Overview

Trial offers advance players to Level 3 (Elite Tier) when scouts call the `log_trial_offer` contract function. This document specifies:

1. The data structure for trial offer details
2. How to serialize and encode the data for the contract
3. Patterns for submitting to the contract

---

## 1. Trial Offer Data Structure

### TypeScript Interface

```typescript
export interface TrialOffer {
  /**
   * Stellar public key of the scout submitting the trial offer.
   * Sourced from wallet connection; validated at contract level.
   */
  scout: string;

  /**
   * Unique identifier of the player receiving the trial offer.
   * Must correspond to an existing registered player.
   */
  playerID: string;

  /**
   * Free-form description of the trial offer details.
   * May include club name, position offered, coaching/training focus, etc.
   * Must be sanitized (HTML/script tags removed) before submission.
   * Type: string
   */
  details: string;

  /**
   * Geographic location where the trial will take place.
   * Examples: "Lagos, Nigeria", "Cape Town, South Africa", "Nairobi, Kenya"
   * Type: string
   */
  location: string;

  /**
   * ISO 8601 date string indicating when the trial starts.
   * Format: "YYYY-MM-DD" or full ISO 8601 timestamp
   * Examples: "2025-03-15", "2025-03-15T14:30:00Z"
   * Type: string
   */
  startDate: string;

  /**
   * Unix timestamp (seconds, NOT milliseconds) representing when the trial offer was recorded.
   * Set by the contract on-chain; not submitted from the client.
   * Type: number
   */
  timestamp: number;
}
```

---

## 2. Contract Function Signature

```solidity
// Pseudo-code from README.md
log_trial_offer(scout, player_id, details)
  → Record a trial offer on-chain and advance player to Level 3
```

### Parameters

| Parameter   | Type    | Description                                                  |
| ----------- | ------- | ------------------------------------------------------------ |
| `scout`     | address | Scout's Stellar public key (source + auth signer)            |
| `player_id` | string  | The unique identifier of the player                          |
| `details`   | string  | Serialized trial offer details (see **Serialization** below) |

### Return Value

- **Success**: Player is advanced to Level 3; event `trial_offer_logged` is emitted
- **Error**: Contract error code returned (see error codes in README.md)

### Authorization

- Caller must be authenticated via Stellar wallet (scout's Stellar account)
- No subscription check (unlike `pay_to_contact` which requires active subscription)
- Scout must have proper authorization on-chain

---

## 3. Data Serialization for Contract Call

### Encoding Approach

Use `nativeToScVal()` from `@stellar/stellar-sdk`:

```typescript
import { nativeToScVal } from '@stellar/stellar-sdk';
```

### Example: Building the Transaction

```typescript
import { nativeToScVal } from '@stellar/stellar-sdk';
import { buildTx } from '@/lib/contract';

export async function buildLogTrialOffer(
  scout: string, // Stellar address
  playerId: string, // Player ID
  details: string, // Serialized trial offer details
) {
  return buildTx(
    'log_trial_offer',
    [
      nativeToScVal(scout, { type: 'address' }), // Convert address
      nativeToScVal(playerId, { type: 'string' }), // Convert to string
      nativeToScVal(details, { type: 'string' }), // Convert to string
    ],
    scout, // Source account wallet
  );
}
```

### `details` Parameter Format

The `details` parameter is a **single string** that can be structured as:

#### Option 1: JSON Object (Recommended)

Serialize the offer fields as a JSON string:

```typescript
const trialOfferDetails = {
  location: 'Lagos, Nigeria',
  startDate: '2025-03-15',
  description:
    'Trial for striker position at XYZ Academy. Focus on positioning and finishing.',
};

const detailsString = JSON.stringify(trialOfferDetails);
// Result: '{"location":"Lagos, Nigeria","startDate":"2025-03-15","description":"..."}'
```

Then pass to contract:

```typescript
nativeToScVal(detailsString, { type: 'string' });
```

#### Option 2: Plain Text (Pipe-Delimited)

For simpler cases, use a structured text format:

```typescript
const detailsString =
  'location: Lagos, Nigeria | startDate: 2025-03-15 | Striker position, focus on finishing';
```

#### Option 3: Plain Narrative

Free-form description if structure is not critical:

```typescript
const detailsString =
  'Trial offer for striker position at XYZ Academy in Lagos. Starting 2025-03-15. Focus on positioning and finishing.';
```

**Recommendation**: Use **Option 1 (JSON)** for consistency with other structured data in the platform and to support future parsing.

---

## 4. Existing Patterns for Submitting Structured Data

### Pattern 1: PlayerVitals (Player Registration)

**Type Definition**:

```typescript
export interface PlayerVitals {
  name: string;
  age: number;
  position: string;
  region: string;
  nationality: string;
}
```

**Contract Call** (in `lib/contract.ts`):

```typescript
export async function buildRegisterPlayer(
  wallet: string,
  vitals: PlayerVitals,
  ipfsHash: string,
) {
  return buildTx(
    'register_player',
    [
      nativeToScVal(wallet, { type: 'address' }),
      nativeToScVal(vitals), // ← Complex type, no explicit type hint needed
      nativeToScVal(ipfsHash, { type: 'string' }),
    ],
    wallet,
  );
}
```

**Key Insight**: `nativeToScVal()` automatically handles struct serialization when passed a plain JS object.

### Pattern 2: ContactDetails (Pay-to-Contact)

**Type Definition**:

```typescript
export interface ContactDetails {
  email?: string;
  phone?: string;
  telegram?: string;
}
```

**Contract Call**:

```typescript
export async function payToContact(
  scout: string,
  playerID: string,
): Promise<ContactDetails> {
  const xdrTx = await buildTx(
    'pay_to_contact',
    [
      nativeToScVal(scout, { type: 'address' }),
      nativeToScVal(playerID, { type: 'string' }),
    ],
    scout,
  );
  // ... sign and submit ...
  // Returns ContactDetails object
}
```

### Pattern 3: Subscription (Scout Subscription)

```typescript
export async function subscribe(
  scout: string,
  tier: SubscriptionTier, // 'basic' | 'pro' | 'elite'
): Promise<void> {
  const xdrTx = await buildTx(
    'subscribe',
    [
      nativeToScVal(scout, { type: 'address' }),
      nativeToScVal(tier, { type: 'string' }), // ← Enum-like string
    ],
    scout,
  );
  // ... sign and submit ...
}
```

---

## 5. Full Implementation Example

### Hook Pattern: `useTrialOffer`

Following the pattern of `usePayToContact`:

```typescript
// hooks/useTrialOffer.ts
'use client';

import { useState, useCallback } from 'react';
import { useWallet } from '@/hooks/useWallet';
import { buildLogTrialOffer } from '@/lib/contract';
import { sanitize } from '@/lib/sanitize';

export function useTrialOffer() {
  const { publicKey } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (
      playerId: string,
      location: string,
      startDate: string,
      description: string,
    ) => {
      if (!publicKey) throw new Error('Wallet not connected');

      setLoading(true);
      setError(null);

      try {
        // Sanitize inputs
        const sanitizedDescription = sanitize(description);
        const sanitizedLocation = sanitize(location);

        // Build trial offer details as JSON
        const details = JSON.stringify({
          location: sanitizedLocation,
          startDate,
          description: sanitizedDescription,
        });

        // Build transaction
        const xdrTx = await buildLogTrialOffer(publicKey, playerId, details);

        // Sign and submit via Freighter
        const { signTransaction } = await import('@stellar/freighter-api');
        const { NETWORK } = await import('@/lib/stellar');
        const { Transaction } = await import('@stellar/stellar-sdk');
        const { rpc } = await import('@/lib/stellar');

        const signedTxXdr = await signTransaction(xdrTx, {
          networkPassphrase: NETWORK,
        });

        const result = await rpc.sendTransaction(
          new Transaction(signedTxXdr, NETWORK),
        );

        if (result.status === 'ERROR') {
          throw new Error(`ContractError: ${JSON.stringify(result)}`);
        }

        // Confirm transaction
        const getResult = await rpc.getTransaction(result.hash);
        if ('status' in getResult && getResult.status === 'FAILED') {
          throw new Error(`ContractError: log_trial_offer transaction failed`);
        }

        return result;
      } catch (e: any) {
        const friendlyError = mapErrorMessage(e.message);
        setError(friendlyError);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [publicKey],
  );

  function mapErrorMessage(errorText: string): string {
    if (errorText.includes('Unauthorized') || errorText.includes('code 10')) {
      return 'You are not authorized to log trial offers.';
    }
    if (errorText.includes('ContractPaused') || errorText.includes('code 9')) {
      return 'The contract is currently paused. Please try again later.';
    }
    return errorText || 'An error occurred while logging the trial offer.';
  }

  return { submit, loading, error };
}
```

### Form Component Usage

```typescript
// components/scout/TrialOfferForm.tsx
import { useTrialOffer } from '@/hooks/useTrialOffer';
import { useState } from 'react';

export function TrialOfferForm({ playerId }: { playerId: string }) {
  const { submit, loading, error } = useTrialOffer();
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [description, setDescription] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await submit(playerId, location, startDate, description);
      // Show success toast
    } catch (err) {
      // Error already set in hook
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Trial location"
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        required
      />
      <input
        type="date"
        value={startDate}
        onChange={(e) => setStartDate(e.target.value)}
        required
      />
      <textarea
        placeholder="Trial offer details"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
      />
      {error && <div className="error">{error}</div>}
      <button type="submit" disabled={loading}>
        {loading ? 'Submitting...' : 'Log Trial Offer'}
      </button>
    </form>
  );
}
```

---

## 6. Client-Side Sanitization

Before submitting trial offer details to the contract, **always sanitize inputs**:

```typescript
import { sanitize } from '@/lib/sanitize';

const userDescription = "<script>alert('xss')</script>Trial offer";
const sanitized = sanitize(userDescription);
// Result: "Trial offer" (script tags removed)
```

The `sanitize()` function:

- **Client-side**: Uses DOMPurify to strip all HTML/script tags
- **Server-side fallback**: Simple regex to remove tags
- **Result**: Plain text safe for storage on-chain

---

## 7. Contract Error Codes

From README.md, these error codes may be returned:

| Code | Error          | Cause                                     |
| ---- | -------------- | ----------------------------------------- |
| 9    | ContractPaused | Contract is paused                        |
| 10   | Unauthorized   | Scout wallet not authorized or mismatched |

Additional context from `usePayToContact` pattern:

- Always check wallet connection before calling
- Map error codes to user-friendly messages
- Retry logic may not be needed for trial offers (no subscription gate)

---

## 8. Event Emission

When `log_trial_offer` succeeds, the contract emits:

```
trial_offer_logged(scout: address, player_id: string, details: string)
```

**Use case**: Listen for this event to trigger UI updates (e.g., refresh player progress level to Level 3).

---

## 9. Summary Table

| Aspect                | Details                                                        |
| --------------------- | -------------------------------------------------------------- |
| **Contract Function** | `log_trial_offer(scout, player_id, details)`                   |
| **Parameters**        | `scout` (address), `player_id` (string), `details` (string)    |
| **Details Format**    | JSON object serialized as string (recommended)                 |
| **Details Content**   | `{ location: string, startDate: string, description: string }` |
| **Encoding**          | `nativeToScVal(details, { type: 'string' })`                   |
| **Serialization**     | `JSON.stringify({ ... })`                                      |
| **Sanitization**      | Yes — use `sanitize()` for all text fields                     |
| **Authorization**     | Scout's wallet must be connected and authorized                |
| **Return**            | On success: player advances to Level 3, event emitted          |
| **Error Handling**    | Map error codes (9, 10) to user-friendly messages              |
| **Existing Pattern**  | Follow `usePayToContact` hook structure                        |
