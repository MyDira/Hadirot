# Residential-Rental Monetization Audit — July 10 2026

**Trigger:** agents reporting they are prompted to pay and/or cannot keep their
listings live immediately after posting.

**Verdict: confirmed production bug, single root cause, ~162 agent listings
affected since June 25.** Every finding below was verified against the live
database (read-only queries via `SUPABASE_DB_URL`) on July 10 2026.

---

## Intended behavior (spec)

- Landlords: free 14-day trial → $25 first 30 days → $15 each subsequent 30 days.
  Paying at posting time adds 30 bonus free days.
- Anti-abuse: bedrooms / location / address / phone lock 10 days after creation.
- Agents & high-volume listers (≥3 lifetime listings) and admin-flagged users
  post **free** while `admin_settings.charge_agents = false` (it is false in prod).
- Admin override: admins post free; admins can flag any account free.

## Production state (verified July 10)

| Check | Value |
|---|---|
| `monetization_enabled` | **true** |
| `charge_agents` | **false** (agents should be free) |
| Agent-free migration (20260622) applied | yes — columns + RPC all present |
| `monetization_payment_guard` in prod | **still the June 9 version — strips `legacy_free`** |
| Agent-qualifying rentals mis-tagged (June 25 → July 9) | **162** (158 `individual_trial`, 4 `pending_payment`) |
| Of the active mis-tagged trials | 32 already past the 14-day deadline; 114 still counting down |
| Already auto-deactivated agent listings (30d) | 10 (7 trial-expired, 3 pending_payment) |

---

## Root cause (P0)

`public.monetization_payment_guard()` — the BEFORE INSERT tamper-guard added by
the **June 9** hardening migration
([20260609000000_monetization_hardening.sql:108](supabase/migrations/20260609000000_monetization_hardening.sql)) —
treats `legacy_free` as a privileged kind that non-admins may never claim:

```sql
-- Non-admins cannot claim privileged kinds.
IF NEW.payment_kind IN ('admin_granted', 'legacy_free', 'individual_paid') THEN
  NEW.payment_kind := NULL;
END IF;
```

Agent-free posting shipped **June 22** and works by having the wizard insert
`payment_kind = 'legacy_free'` for qualifying agents
([PostListingWizard.tsx:838](src/pages/postListingWizard/PostListingWizard.tsx)).
**The trigger was never updated.** So on every agent post since the feature
went live (~June 24):

1. Wizard correctly detects the agent → submits `legacy_free`. UI says "Free to post". ✔
2. DB trigger silently strips it to `NULL`, then runs the landlord phone check:
   - phone already on an active listing (the norm for agents) → **`pending_payment`**
   - phone fresh → **`individual_trial`** (14-day clock starts at approval)
3. Downstream, everything treats the listing as a paying landlord's:
   - **`pending_payment`** → dashboard shows *"Complete payment to post"*
     immediately ([payments.ts:247](src/services/payments.ts)), and the daily
     deactivation job kills the listing even after admin approval (branch 5 of
     `auto_inactivate_old_listings`). The only action offered is "Add days to
     relist" (pay). → *"prompted to pay / can't do anything as soon as they post."*
   - **`individual_trial`** → 14-day countdown pill, "Upgrade now" CTAs,
     `send-paid-listing-reminders` (daily 10 AM ET cron) sends *pay-$25*
     SMS/reminders as the deadline nears, then the listing is deactivated.
     The June 25–26 posting wave hit its 14-day deadline **July 9–10** — which
     is exactly when agent complaints started.

### Why the June 23 backfill didn't save them
[20260623000000_backfill_agent_listings_legacy_free.sql](supabase/migrations/20260623000000_backfill_agent_listings_legacy_free.sql)
re-tagged agent trials to `legacy_free` **once**, on migration day, and only
`individual_trial` rows (never `pending_payment`). Every post after June 24 was
re-mis-tagged by the trigger the moment it was inserted.

---

## Secondary bugs found

**B2 — Admin-posted listings assigned to agents get a trial clock (P1).**
The guard's admin branch defaults `payment_kind` to `individual_trial` based on
the *caller* being admin, ignoring the row's `user_id`. When an admin posts on
behalf of / assigns to a free agent (scraped-listings pipeline, /post-old), the
agent's listing lands on the paid-trial clock. The spec says admin posting is an
override that should be free. (The July 9 bulk of ~15 mis-tagged agent listings
looks like exactly this.)

**B3 — Wizard silently swallows agent-check failures (P2).**
[useMonetizationGate.ts:123](src/hooks/useMonetizationGate.ts) — if
`isUserFreeAgent` throws (network blip, RLS change), the agent silently falls
into the paywall with only a `console.warn`. Should surface an error state
rather than mis-charging.

**B4 — Field-lock off-by-one in dashboard-derived state (P3, cosmetic).**
[payments.ts:220](src/services/payments.ts) uses `ceil(days) >= 10`, which
reports "locked" from day 9 + 1 minute; the DB function and edit wizard both
lock at a full 10 days. Only affects the `isLocked` flag in derived state, not
actual enforcement.

**B5 — Deactivation cadence is daily, not hourly (P3, informational).**
Code comments say "hourly cron", but prod runs `deactivate_old_listings()`
(a wrapper that calls `auto_inactivate_old_listings()`) **daily at midnight
UTC**. Expired trials / unpaid listings linger up to 24 h. Not urgent, but the
comments and the "cron would deactivate within the hour" assumptions in
Dashboard.tsx are wrong.

### Verified working correctly ✔
- Pricing: $25 first 30 days / $15 renewals, multi-month packages, 30-day
  pay-at-posting bonus (webhook-enforced, initial-purchase-only).
- 14-day trial, clock anchored at admin approval (not posting).
- 10-day field lock: enforced server-side (`is_listing_locked` +
  `updateListing` strips locked fields), admin-exempt, banner in edit wizard.
- Admin overrides: unlimited free posts for admins, per-user "Free Posting"
  toggle, grant-days / mark-granted tools.
- Weekly renewal SMS correctly skips monetized kinds; monetization SMS
  (`send-paid-listing-reminders`) correctly targets trial/paid — it's the
  *data* that's wrong, not the sender.
- Trial-eligibility phone check, subscription cap trigger, wizard UI for every
  gate mode including `agent_free`.

---

## Recommended fix (one migration + one backfill, then verify)

1. **Patch `monetization_payment_guard`** (new migration):
   - Add SQL helper `is_free_posting_agent(p_user_id uuid)` mirroring the
     client rule: `charge_agents = false AND (role='agent' OR
     free_posting_agent OR get_user_lifetime_listing_count(id) >= 3)`.
   - Non-admin INSERT: if the helper returns true for `auth.uid()`, set
     `payment_kind := 'legacy_free'` (regardless of what the client sent —
     server-side derivation, not client trust). Otherwise keep current
     stripping behavior.
   - Admin INSERT: if `NEW.user_id` (the assigned owner) qualifies via the
     helper, default to `legacy_free` instead of `individual_trial`.
2. **Backfill** (same migration): re-tag mis-tagged agent rentals
   (`individual_trial` **and** `pending_payment`, created since 2026-06-24) to
   `legacy_free`, null the trial clocks, and reactivate the ones the cron
   deactivated for trial-expiry/pending-payment (their `expires_at` freshness
   window still applies as for any legacy listing).
3. Optional client hardening: surface B3's error state; fix B4's ceil.
4. Verify in prod: mis-tag count = 0, repost as a test agent → `legacy_free`.

No frontend changes are required to stop the bleeding — the wizard already does
the right thing; the DB undoes it.
