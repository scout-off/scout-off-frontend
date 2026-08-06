# Academy/organization validator accounts: design

Design notes for how several validator wallets can act on behalf of one
academy/organization identity (issue #663), implemented in
`server/src/academyService.js` + `server/src/routes/academies.js`,
`lib/api.ts`'s academy functions, `components/admin/AcademyManager.tsx`,
and `components/player/ValidatorChip.tsx`.

## Problem

Validator authorization on-chain (`add_validator`/`remove_validator`/
`is_validator`/`approve_milestone`/`revoke_milestone` in `lib/contract.ts`)
is strictly one Stellar wallet = one validator identity. Real academies
have several staff (head coach, assistant coaches, academy director) who
all need to approve milestones on behalf of the same institution, and there
was no way to represent "this validator wallet represents Academy X"
anywhere in the frontend's data model.

## The split: on-chain stays untouched, academies are an off-chain overlay

**On-chain (unchanged):** `add_validator`/`remove_validator`/`is_validator`
remain single-address primitives, and `approve_milestone`/
`revoke_milestone` remain single-signing-wallet transactions. The contract
has no concept of an "academy" and this design doesn't ask it to. Every
academy member wallet must still be individually authorized via
`add_validator` for its milestone approvals to be valid — an academy record
grants no on-chain authorization by itself.

**Off-chain (new):** `server/` (the existing Node/Express + better-sqlite3
service that already backs referrals) gains two tables:

```
academies         (id, name, owner_wallet, created_at)
academy_members   (wallet PRIMARY KEY, academy_id, added_at, added_by)
```

A wallet maps to **at most one** academy at a time (`wallet` is the primary
key on `academy_members`) — this models real institutional staff, not
individuals holding simultaneous membership in several academies. The
roster is purely a _label_: "wallet G... is a registered signer for Academy
X." It has no bearing on whether that wallet can actually call
`approve_milestone` — that's decided entirely on-chain, independently.

Why keep these separate instead of, say, extending the contract to store an
academy tag per validator? Two reasons:

1. **Blast radius.** A contract migration is expensive to deploy and risky
   to get wrong; an off-chain label is a schema migration on a service that
   already exists and already owns comparable off-chain, wallet-keyed data
   (referral codes).
2. **Decoupled failure modes.** If the off-chain roster service is down,
   on-chain validator authorization (the security-critical half) is
   completely unaffected — milestones can still be approved/revoked exactly
   as before. The academy grouping degrades to "no academy label shown,"
   never to "validators can't do their job."

## Admin flow

Today's authorization model is a single super-admin
(`NEXT_PUBLIC_ADMIN_ADDRESS`, checked both client-side in
`app/[locale]/admin/page.tsx` and server-side via the `session` cookie in
`app/api/admin/**` routes) — there is no scoped/delegated admin role. Rather
than invent a second authorization system for "academy owners" managing
their own roster (a materially larger change with its own security surface),
academy creation and membership changes go through the **same** super-admin
gate as the existing "Add/Remove Validator" section, via
`app/api/admin/academies/**` proxy routes that check the session cookie
before forwarding to the `server/` service.

The admin UI (`AcademyManager`, rendered directly below the existing
Validators section on the admin page) is intentionally **not** wired to
also call `add_validator`/`remove_validator` when a wallet is added to or
removed from an academy. Adding a wallet to an academy and authorizing it
on-chain are two separate admin actions:

1. Add the wallet as a validator (existing "Add Validator" section — on-chain).
2. Add the wallet to an academy (new "Academies" section — off-chain label).

`AcademyManager` cross-checks each member's on-chain status via
`checkIsValidator` and shows a `not on-chain` badge next to any member
wallet that isn't (yet, or no longer) an authorized validator, so an admin
who only does step 2 gets a visible nudge rather than a silent gap. This
also means removing a wallet from an academy does **not** revoke its
on-chain validator status — those stay independent by design; an admin who
wants both must do both, deliberately.

## Milestone attribution display

`Milestone.validator` (types/index.ts) still records the single on-chain
signing wallet — that doesn't change. `ValidatorChip` (rendered per
milestone by `MilestoneList`/`MilestoneTimeline`) now additionally calls
`fetchAcademyForWallet(address)` (`GET /academies/wallet/:wallet`, public
and unauthenticated) and shows the academy's name instead of the bare
wallet when one is found — e.g. "FC Sahel · Active validator · 12
milestones approved" instead of "GABC…WXYZ · Active validator". The lookup
fails open: a down roster service or a wallet with no academy just falls
back to the address-only display that existed before this feature, exactly
like the existing `fetchValidatorMilestoneCount` indexer lookup already
does.

## Backward compatibility

Nothing about existing single-wallet validator flows changes:

- `ApproveForm`/`RevokeForm`/`ValidatorPlayerSearch` are untouched.
- `useValidator`'s `isValidator` check is untouched — it's still a flat
  on-chain roster membership check, unaware of academies.
- A solo validator with no academy record behaves identically to today:
  `fetchAcademyForWallet` returns `null`, and `ValidatorChip` falls back to
  address-only display.

## API surface

| Route                                                                                    | Auth        | Purpose                                                                                      |
| ---------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| `POST /academies` (via `/api/admin/academies`)                                           | super-admin | Create an academy; owner wallet becomes its first member                                     |
| `GET /academies` (via `/api/admin/academies`)                                            | super-admin | List all academies with their members, for the admin panel                                   |
| `POST /academies/:id/members` (via `/api/admin/academies/:id/members`)                   | super-admin | Register an additional signer wallet under an academy                                        |
| `DELETE /academies/:id/members/:wallet` (via `/api/admin/academies/:id/members/:wallet`) | super-admin | Remove a signer wallet's academy membership (off-chain only)                                 |
| `GET /academies/wallet/:wallet`                                                          | public      | Look up the academy (if any) a wallet is registered under, for milestone-attribution display |

## What this doesn't do

- No aggregate "academy reputation" (e.g. total milestones approved across
  all of an academy's wallets) — `fetchValidatorMilestoneCount` stays
  per-wallet. Building an academy-scoped rollup would need a new indexer
  query grouping by wallet-to-academy, layered on top of
  `packages/indexer`'s event store (see issue #662) — a natural follow-up,
  not required for the roster/attribution use case this issue asks for.
- No self-service academy-owner UI. An academy's `ownerWallet` is recorded
  but not yet authorization-checked against anything — today only the
  super-admin can manage rosters. Turning `ownerWallet` into an actual
  scoped-admin role is a larger, separate authorization change.
