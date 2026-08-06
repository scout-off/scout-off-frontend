# Fraud / abuse detection: pay-to-contact & referrals

Design notes for the heuristics in `lib/fraudDetection.ts`, surfaced to
admins via `GET /api/admin/fraud-flags` and `components/admin/FraudFlagsPanel.tsx`.

## Scope

Deliberately narrow, per the originating issue: two systems, a handful of
concrete heuristics, no general-purpose fraud engine. If a third system
needs this later, it should get its own heuristics module and its own
review of what "abuse" means there — the patterns below are specific to how
referrals and pay-to-contact/subscriptions can be gamed, not a reusable
"anomaly score."

## Where this runs

Both heuristic sets are pure functions over already-fetched data — no I/O,
easy to unit test. The thing that actually gives them cross-wallet
visibility is what calls them: `app/api/admin/fraud-flags/route.ts` pulls
**every** referral code (`lib/referralStore.getAllCodes`) and the **global**
activity feed (`fetchActivityEvents`, paginated up to a bounded cap), then
runs the heuristics over the whole dataset in one pass. That's the
difference from the rate-limiting already tracked elsewhere in the backlog:
rate limiting looks at one wallet's request rate in isolation; this looks
for patterns _across_ wallets (one redeemer touching many scouts, a scout's
redemptions clustering around one other wallet, etc.) that no single
request could ever reveal.

This is computed on demand — an admin loading the panel triggers a fresh
run — rather than by a scheduled background job, because no job
infrastructure exists in this repo yet. That's a reasonable place to start:
the heuristics themselves don't care who calls them, so wiring the same
`analyzeReferralAbuse`/`analyzePayToContactAbuse` functions into a cron job
or the `server/` backend later (once one exists) is a small follow-up, not
a rewrite.

## Heuristics

### Referral (self-dealing / wallet clustering)

| Heuristic                   | Signal                                                                 | False-positive guard                                                                       |
| --------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `self_redemption`           | Code redeemed by the same wallet that generated it                     | None needed — unambiguous by definition                                                    |
| `fast_redemption_pattern`   | ≥60% of a scout's redemptions land within 2 minutes of code generation | Requires ≥3 redemptions before judging a ratio                                             |
| `concentrated_redeemer`     | ≥50% of a scout's redemptions come from one other wallet               | Requires ≥5 redemptions                                                                    |
| `cross_scout_redeemer_ring` | One redeemer wallet has redeemed codes from ≥4 distinct scouts         | Threshold set above what an organic "signed up via a few friends' links" pattern would hit |

`cross_scout_redeemer_ring` is the one most directly aimed at "one actor
controls many different scout accounts" — it's keyed on the _redeemer_, not
the generator, so it catches a ring even when each individual scout's
redeemer mix looks unremarkable on its own (`concentrated_redeemer` wouldn't
catch that case, which is why both exist).

### Pay-to-contact (repeat abuse)

| Heuristic              | Signal                                            | False-positive guard                                                                            |
| ---------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `rapid_contact_burst`  | ≥8 pay-to-contact calls within a 10-minute window | Threshold set well above a human clicking through profiles by hand                              |
| `subscription_cycling` | ≥3 subscriptions averaging ≤1.5 contacts each     | Requires the repeated-cycle count; severity only reaches `high` at ≤1 avg contact and ≥5 cycles |

`subscription_cycling` is the direct answer to "pay-to-contact and
immediately churn subscriptions" from the issue. It's also the heuristic
with the highest genuine false-positive rate: a legitimately infrequent
scout looks identical to this data. That's why it defaults to `medium`
severity and only escalates with a stronger, repeated pattern — see
"False positives" below.

All thresholds are named constants at the top of `lib/fraudDetection.ts`,
not buried in conditionals, specifically so they can be retuned against
real production usage data (which doesn't exist yet — these are reasoned
starting points, not calibrated against real traffic) without re-reading
the heuristic logic.

## False positives

This is explicitly not a system that should ever auto-punish based on one
signal:

- **Busy scout / academy**: an academy generating dozens of legitimate
  referrals, or a scout doing a focused review session with several
  contacts in a row, is exactly the kind of power-user activity these
  heuristics must not routinely catch. That's why every heuristic requires
  a minimum volume before judging a _ratio_ (a single fast redemption or
  one burst of contacts proves nothing) and why the diversity-based
  heuristics (`cross_scout_redeemer_ring`, `concentrated_redeemer`) key on
  _concentration_, not raw volume — a high-volume, diverse pattern
  (many different redeemers, many different players contacted) is left
  alone regardless of scale.
- **`subscription_cycling` is the exception**: it cannot distinguish a
  gaming pattern from a genuinely low-usage scout using this data alone.
  It's kept at `medium` severity by default for that reason, and every flag
  carries its full evidence (subscription count, contacts per subscription,
  average gap) so an admin can tell the difference in seconds — a scout
  with 3 subscriptions 6 months apart is obviously not the same situation
  as 8 subscriptions with 2-week gaps.

## Action taken on a flag: alert-only

Every flag from this system is **alert-only** — surfaced in the admin
panel with full evidence, nothing is blocked, throttled, or reversed
automatically. Reasons:

1. **False-positive cost asymmetry.** Auto-blocking a real scout's
   pay-to-contact or referral redemption because of a heuristic match is a
   direct, immediate harm to a paying user; missing a genuine abuse case
   for a few extra hours until an admin reviews the queue is not. Given the
   false-positive risk discussed above (especially for `subscription_cycling`),
   that asymmetry rules out auto-throttling for v1.
2. **No production tuning data yet.** The thresholds above are reasoned
   defaults, not thresholds validated against real traffic. Shipping
   auto-enforcement on untuned thresholds is how you get a support queue
   full of legitimate users locked out.
3. **The existing self-redemption block (issue #676) already handles the
   one case where auto-blocking is safe** — because it has zero
   false-positive risk (`usedBy === scoutWallet` is unambiguous). Everywhere
   else here, that certainty doesn't exist, so the action stays
   admin-in-the-loop.

**What would change this:** if `cross_scout_redeemer_ring` or
`self_redemption`-adjacent patterns keep showing up with high confidence
after real tuning, a reasonable next step is auto-throttling _specifically
that heuristic_ (e.g., pausing further redemptions from a flagged redeemer
wallet pending review) rather than a blanket policy — and any such
throttle should be **admin-gated to unlock**, not time-expiring, so a false
positive doesn't quietly resolve itself without anyone having actually
looked at it. That's a deliberate future step, not part of this change.

## Extending this

To add a new heuristic: write a pure function taking the relevant
already-typed data (`ReferralCode[]` or `ActivityEvent[]`) and returning
`FraudFlag[]`, add it to `analyzeReferralAbuse`/`analyzePayToContactAbuse`,
and add a row to the tables above. To cover a third system, give it its own
`analyze*Abuse` function and its own false-positive discussion — don't
generalize the existing ones just to reuse them.
