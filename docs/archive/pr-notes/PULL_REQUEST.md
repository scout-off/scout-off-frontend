# [AcademyManager Search/Filter & Pagination Audit] Feature/academy-manager-search-filter

## Summary

This PR adds search and filter functionality to the AcademyManager member roster view and documents a pagination pattern audit for two closely-related hooks.

## Changes

### 1. AcademyManager Member Roster Search/Filter (#1152)

**File:** `components/admin/AcademyManager.tsx`

Added search and filter controls to the member roster view:

- **Search input**: Filters members by wallet address substring (case-insensitive)
- **Toggle filter**: "Not on-chain only" button to quickly show only members missing on-chain validator status
- **Empty state**: Shows message when no members match the current search/filter criteria
- **Visual polish**: Toggle shows amber color when active, matching the "not on-chain" badge design

**How it works:**
- Filtering operates client-side on the roster data already fetched - no additional API calls
- Users can search by wallet address substring and/or filter to show only "not on-chain" members
- This allows super-admins to efficiently identify and act on the "not on-chain" gap described in docs/academy-validator-model.md

### 2. Pagination Pattern Audit (#1153)

**File:** `PAGINATION_AUDIT.md`

Documented the pagination approaches for two closely-related hooks:

| Hook | Pagination Pattern | Cursor Type |
|------|-------------------|-------------|
| `useApprovedPlayers` | ✅ Cursor-based (ledger sequence) | `ledger` |
| `useValidatorPendingQueue` | ❌ None (flat array fetch) | N/A |

**Findings:**
- `useApprovedPlayers` uses cursor-based pagination via the indexer's `/validators/:wallet/events` endpoint
- `useValidatorPendingQueue` fetches all results in one request (no pagination)
- The approaches have diverged because the pending queue was implemented without pagination

**Recommendation:** Add cursor pagination to pending queue endpoint if backend changes are acceptable. Otherwise, keep status quo but document the inconsistency.

## Testing

- Verified AcademyManager component compiles without TypeScript errors
- Existing tests for `useApprovedPlayers` continue to pass (no API changes to the hook itself)
- Manual testing confirms search/filter functionality works as expected

## Related Issues

- #1152: AcademyManager search/filter for member roster
- #1153: Pagination pattern audit for validator hooks

## Notes

- This does not depend on or need to wait for the scoped academy-owner-role feature
- No backend API changes were required for the AcademyManager search/filter feature
- Pagination audit found divergence but alignment would require backend changes (tracked separately)
