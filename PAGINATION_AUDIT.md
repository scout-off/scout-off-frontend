# Pagination Audit: useApprovedPlayers vs useValidatorPendingQueue

**Date:** 2026-08-28  
**Status:** Completed - Divergence identified, no backend changes required for this frontend-only audit

---

## Executive Summary

**Current State:** The two hooks use **different pagination patterns**.

| Hook | Pagination Pattern | Cursor Type | Backend Support |
|------|-------------------|-------------|-----------------|
| `useApprovedPlayers` | Client-side cursor-based pagination | `ledger` sequence | `GET /validators/:wallet/events?limit=&before=` returns `{events, nextCursor}` |
| `useValidatorPendingQueue` | **No pagination** (all-in-one fetch) | None | `GET /milestone-submissions/validator/:wallet?status=pending` returns flat array |

**Finding:** The pagination approaches have **diverged** because the pending queue was implemented before pagination was needed (likely due to the assumption of small submission counts).

**Recommendation:** Align to cursor-based pagination pattern if backend changes are acceptable. Otherwise, keep status quo for now and document the inconsistency.

---

## Detailed Findings

### 1. useApprovedPlayers (`hooks/useApprovedPlayers.ts`)

**Pagination Pattern:** Client-side cursor-based pagination

**Cursor Mechanism:**
- Uses indexer's `/validators/:wallet/events` endpoint
- Cursor is the `ledger` sequence number passed as `before` param
- Pages through up to `MAX_PAGES = 10` requests with `limit: 200` per request
- Total capacity: 10 × 200 = 2000 events before stopping

**Implementation:**
```typescript
async function fetchApprovedPlayers(validatorAddress: string): Promise<Player[]> {
  const allEvents: IndexedEvent[] = [];
  let cursor: number | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { events, nextCursor } = await fetchValidatorEvents(
      validatorAddress,
      { type: 'milestone_approved', limit: 200, before: cursor }
    );
    allEvents.push(...events);
    if (nextCursor === null) break;
    cursor = nextCursor;
  }

  // Deduplicate player IDs and fetch profiles...
}
```

**Backend API:** `GET /validators/:wallet/events`
- **Pagination:** Cursor-based via `ledger` sequence
- **Response format:** `{ events: IndexedEvent[], nextCursor: number | null }`
- **Parameters:** `?type=milestone_approved&limit=200&before={ledger_seq}`

### 2. useValidatorPendingQueue (`hooks/useValidatorPendingQueue.ts`)

**Pagination Pattern:** **No pagination** (all-in-one fetch)

**Implementation:**
```typescript
export function useValidatorPendingQueue(validatorAddress: string | null) {
  const { data, error, isValidating, mutate } = useSWR<MilestoneSubmission[]>(
    pendingQueueKey(validatorAddress),
    () => fetchPendingMilestoneSubmissions(validatorAddress!),
    { dedupingInterval: 10_000, revalidateOnFocus: false, errorRetryCount: 2 }
  );
  return { submissions: data ?? [], loading: isValidating && !data, error: error?.message ?? null, refetch };
}
```

**Backend API:** `GET /milestone-submissions/validator/:wallet?status=pending`
- **Pagination:** None
- **Response format:** `MilestoneSubmission[]` (flat array)
- **Backend implementation:**
  ```javascript
  // server/src/milestoneSubmissionService.js
  function listForValidator(validatorWallet, status = 'pending') {
    return listByValidatorAndStatus
      .all(validatorWallet, status)  // SELECT * FROM milestone_submissions...
      .map(toSubmission);
  }
  ```

---

## Analysis

### Why No Pagination for Pending Queue?

The pending queue likely has a small, bounded number of items per validator:
- Each submission requires manual review (approve/reject)
- Validators typically review submissions quickly
- No accumulation of "unreviewed backlog" over long periods

**However:** This is an assumption. There's no enforced limit, and a malicious actor could theoretically create many submissions.

### Divergence Impact

The inconsistency means:
1. **No shared pagination UI** can be built between `ApprovedPlayersRoster.tsx` and `PendingMilestoneQueue.tsx`
2. **Different mental models** for developers (one paginates, one doesn't)
3. **Future scalability risk** if pending queue grows unexpectedly

### Backend API Comparison

| Aspect | useApprovedPlayers Backend | useValidatorPendingQueue Backend |
|--------|---------------------------|----------------------------------|
| Pagination | Cursor-based (`before` = ledger) | None (all results) |
| Cursor type | `ledger` sequence number | N/A |
| Response format | `{ events, nextCursor }` | `[]` (flat array) |
| Page size | 200 | Unbounded |
| Max pages | 10 (frontend cap) | N/A |

---

## Recommendations

### Option A: Add Cursor Pagination to Pending Queue (Recommended)

**Pros:**
- Consistent pagination pattern across both hooks
- Future-proof for growth
- Easier to build shared pagination UI
- Follows the indexer pattern (cursor-based)

**Cons:**
- Requires backend API change
- Requires frontend changes to both `fetchPendingMilestoneSubmissions` and `useValidatorPendingQueue`

**Implementation:**
```typescript
// Backend: server/src/routes/milestoneSubmissions.js
router.get('/validator/:wallet', (req, res) => {
  const status = req.query.status ?? 'pending';
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const before = req.query.before ? Number(req.query.before) : undefined;

  // Use created_at as cursor
  const where = before 
    ? 'WHERE validator_wallet = ? AND status = ? AND created_at < ?'
    : 'WHERE validator_wallet = ? AND status = ?';
  
  const rows = db.prepare(
    `SELECT * FROM milestone_submissions ${where} ORDER BY created_at DESC LIMIT ?`
  ).all(validatorWallet, status, before, limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return res.json({
    submissions: page.map(toSubmission),
    nextCursor: hasMore ? page[page.length - 1].created_at : null
  });
});

// Frontend: lib/api.ts
export const fetchPendingMilestoneSubmissions = (
  validatorWallet: string,
  { limit = 50, before }: { limit?: number; before?: number } = {}
): Promise<{ submissions: MilestoneSubmission[]; nextCursor: number | null }> => {
  return api
    .get('/milestone-submissions/validator/' + encodeURIComponent(validatorWallet), {
      params: { status: 'pending', limit, before }
    })
    .then(r => r.data);
};

// Frontend: hooks/useValidatorPendingQueue.ts
// Similar pagination pattern to useApprovedPlayers
```

### Option B: Keep Status Quo (Not Recommended)

**Pros:**
- No changes needed now

**Cons:**
- Cannot share pagination UI components
- Different mental models for developers
- Future scalability issues if pending queue grows
- Inconsistent with indexer pagination pattern

---

## Conclusion

### Findings Summary

| Hook | Pagination | Cursor | Next Steps |
|------|-----------|--------|------------|
| `useApprovedPlayers` | ✅ Cursor-based | `ledger` | No changes needed |
| `useValidatorPendingQueue` | ❌ None (flat array) | N/A | Requires backend changes |

### Decision Path

1. **If backend changes are acceptable** (recommended):
   - File backend issue: Add cursor pagination to `/milestone-submissions/validator/:wallet`
   - File frontend issue: Update `fetchPendingMilestoneSubmissions` and `useValidatorPendingQueue` to paginate

2. **If backend changes are out of scope:**
   - Document the inconsistency in `PAGINATION_AUDIT.md` (this file)
   - Keep status quo but add comments in both hooks explaining the different pagination approaches
   - File a future tech debt ticket to align when backend changes are prioritized

### Files Referenced

- **Frontend hooks:**
  - `hooks/useApprovedPlayers.ts`
  - `hooks/useValidatorPendingQueue.ts`

- **Frontend API:**
  - `lib/api.ts` (`fetchPendingMilestoneSubmissions`)
  - `lib/indexerClient.ts` (`fetchValidatorEvents`)

- **Backend:**
  - `server/src/routes/milestoneSubmissions.js`
  - `server/src/milestoneSubmissionService.js`

- **Indexer:**
  - `packages/indexer/src/server.ts`
  - `packages/indexer/src/db/eventStore.ts`
