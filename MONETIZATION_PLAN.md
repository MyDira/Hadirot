# Hadirot Residential-Rental Monetization Plan

> Scope: residential rentals only. Sales and commercial listings are untouched in this phase.

## TL;DR

Three payment paths gate a residential-rental listing being active:

1. **Individual listing** — 14-day free trial (per phone, with 30-day cooldown). First paid month is **$25**, subsequent months **$15**. Multi-month upfront packages discount slightly. Paying $25 _at posting time_ unlocks 30 bonus days (so $25 at post = 74 total active days: 14 trial + 30 paid + 30 bonus).
2. **Agent subscription** — **$50/mo**, up to 7 active listings.
3. **VIP subscription** — **$100/mo**, unlimited active listings.

Optional add-on for either subscription: **Concierge** ($50/mo, gated on having an active parent subscription) — the existing concierge tier2_forward behavior extended as an add-on tier.

Admin can manually mark any user as subscribed (no Stripe), set a day-of-month renewal date, and see who lapses next. Admin posting follows phone-level trial rules but is exempt from account-level caps.

The 30-day freshness deactivation system continues to apply to everyone. Subscribers and paid listings must still "renew" (free click, draws on balance) every 30 days to confirm the listing is still relevant.

SMS reminders fire 3 days before expiry, on expiry day, and 3 days after deactivation, mirroring the existing `Hadirot Alert:` tone.

Bedrooms, neighborhood, location/cross-streets, full_address, lat/long, and contact_phone all lock 10 days after a residential-rental listing is created. Admins can edit anytime.

---

## VERIFICATION FINDINGS

Files read in full to build this plan:
- `supabase/functions/send-renewal-reminders/index.ts` (430 lines) — confirmed existing SMS tone & batching.
- `supabase/functions/handle-renewal-sms-webhook/index.ts` (1539 lines) — confirmed reply parsing patterns and existing `sms_messages` audit log.
- `supabase/functions/stripe-webhook/index.ts` (497 lines) — confirmed handled events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
- `supabase/functions/create-concierge-checkout/index.ts` (184 lines), `create-boost-checkout/index.ts`, `create-portal-session/index.ts` — confirmed Stripe checkout patterns.
- Migrations: `20251017150100_create_auto_inactivate_and_delete_functions.sql`, `20260107010255_update_auto_inactivate_to_use_expires_at.sql`, `20260317183850_split_listing_active_days_into_rental_and_sale.sql`, `20260225191114_create_concierge_system.sql`, `20260305003122_add_current_period_end_to_concierge_subscriptions.sql`, `20260113202436_create_sms_renewal_system.sql`, `20260211040318_create_featured_purchases_and_payment_system.sql`, `20251105042037_remove_payment_system.sql`.

Confirmed:
- `listings` table covers residential rental + residential sale (commercial is separate). Discriminator: `listing_type` enum (`rental`, `sale`, `commercial`). All new logic restricts to `listing_type='rental'`.
- `contact_phone_e164` exists and is normalized to E.164 — usable for phone dedup.
- `set_listing_deactivated_timestamp` trigger preserves caller-set `expires_at` if it's in the future, so we can safely set our own.
- `auto_inactivate_old_listings()` RPC drives daily deactivation via cron; reads `admin_settings.rental_active_days` (default 30).
- The existing 5-day "is the listing still available?" reminder uses `Hadirot Alert: Your listing at {location} for ${price} expires in 5 days. Is the listing still available? Reply YES or NO.` — we mirror this tone exactly.

---

## CURRENT STATE ANALYSIS

- Residential rentals are free to post today. The auto-inactivate cron deactivates them after 30 days from `last_published_at`.
- A working Stripe + Twilio + cron pipeline already exists for boosted listings and the existing concierge service. None of it gates listing creation today.
- The post-listing wizard at `/post-listing-new` is live for residential rentals (Phase 1 complete per the project memory).

---

## DUPLICATE / OVERLAPPING SYSTEMS CHECK

| Existing system | Decision |
|---|---|
| `featured_purchases` table (boost) | **Pattern-reuse only**. Separate new table for individual-listing payments because semantics differ (paid days pause when listing inactive, unlike featured windows which are absolute). |
| `concierge_subscriptions` table | **Extend** — add `addon_concierge` tier value + `listing_subscription_id` FK column. Standalone concierge tiers (tier1/2/3) untouched. |
| Subscription concept (Agent/VIP) | **New table** `listing_subscriptions`. Conceptually different product (right-to-post vs. concierge-service). |
| `stripe-webhook` edge fn | **Extend** — add `type='individual_listing'` and `type='listing_subscription'` metadata branches. Reuse dispatch shape. |
| `create-boost-checkout` Stripe pattern | **Pattern-reuse** — clone into new edge functions per checkout type. |
| `listing_renewal_conversations` (SMS state) | **Reuse for free renewals**. Add new edge fn `send-paid-listing-reminders` for paid-only SMS that simply contains a checkout URL and needs no reply parsing. |
| `auto_inactivate_old_listings()` RPC | **Extend in place** — add three new conditions (trial expired, paid_until passed, subscription gone). Existing freshness logic kept. |
| `set_listing_deactivated_timestamp` trigger | **Extend in place** — add pause/resume of `paid_until` ↔ `paused_paid_days` when toggling `is_active`. |
| `/admin/concierge` page | **Sibling** — new `/admin/subscriptions` page next to it. |

---

## PROPOSED SOLUTION

### 1. Permission-to-be-active gate

A residential-rental listing is permitted to be active if any of these is true:
- Owner has an active `listing_subscriptions` row (Agent or VIP) and is under its cap. → `payment_kind='subscription'`.
- Listing has `payment_kind='individual_trial'` and `NOW() < trial_started_at + 14 days`.
- Listing has `payment_kind='individual_paid'` and `NOW() < paid_until`.
- Listing has `payment_kind='admin_granted'`. (Admin manually marked the listing as covered.)
- Listing has `payment_kind='legacy_free'`. (Pre-existing inactive listings at launch — never auto-deactivated for payment reasons; freshness still applies.)

Posting users who don't fall under any of these get deactivated by the cron.

### 2. Individual listing payments

**Per-listing columns added to `listings`:**
- `payment_kind` (enum: `individual_trial`, `individual_paid`, `subscription`, `admin_granted`, `legacy_free`). Default NULL until set.
- `trial_started_at` (timestamptz, nullable).
- `paid_until` (timestamptz, nullable) — absolute date when paid balance ends, IF listing stays continuously active.
- `paused_paid_days` (int, default 0) — banked days when listing is currently inactive.

**Pricing (computed server-side):**
- Listing has 0 prior `paid_listing_payments` rows → next paid month is **$25**.
- Listing has ≥1 prior → next paid month is **$15**.

Multi-month upfront packages (exposed in dashboard picker):

| Days | First-time | Renewal |
|---|---|---|
| 30 | $25 | $15 |
| 60 | $40 | $30 |
| 90 | $55 | $45 |
| 120 | $70 | $60 |
| 180 | $100 | $90 |
| 270 | $145 | $135 |
| 360 | $190 | $180 |

**The 30-bonus-days sweetener** applies _only_ at the moment of posting. The wizard's Stripe Checkout passes `metadata.is_initial_purchase=true`. The webhook honors the bonus only when:
- `is_initial_purchase === true` AND
- The listing currently has `payment_kind='individual_trial'` AND
- There are no prior `paid_listing_payments` rows for this listing.

If a user posts a free listing, comes back the next day, and tries to pay — no bonus. Pay-now-at-posting is the only path to 74 days.

**The 30-day forward freshness cap** continues to apply: `expires_at` is always `LEAST(NOW() + 30 days, paid_until)`. At day 30 the user must click "Renew for 30 more days" (no charge, draws on balance). If they don't, listing deactivates and balance pauses via the trigger.

**Pause/resume math** (trigger-level):
- On `is_active` true → false, if `paid_until > NOW()`: `paused_paid_days = CEIL(EXTRACT(epoch FROM (paid_until - NOW())) / 86400)::int`, then `paid_until = NULL`.
- On `is_active` false → true, if `paused_paid_days > 0`: `paid_until = NOW() + (paused_paid_days || ' days')::interval`, then `paused_paid_days = 0`. Also clamp `expires_at = LEAST(expires_at, paid_until)`.

**Reactivation eligibility**: a deactivated listing can be reactivated by the owner anytime within 30 days of deactivation (before `auto_delete_very_old_listings` purges it). If the listing has no banked balance, reactivation goes through the standard payment flow ($15/30 days renewal pricing, since prior payment exists).

### 3. Trial eligibility (per phone, 30-day cooldown)

At post-listing time, before creating the listing record:

```sql
-- Returns true if NO other listings share this phone in the active or recently-deactivated window
CREATE FUNCTION is_phone_trial_eligible(p_phone_e164 text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM listings
    WHERE contact_phone_e164 = p_phone_e164
      AND listing_type = 'rental'
      AND (is_active = true OR deactivated_at > NOW() - INTERVAL '30 days')
  );
$$;
```

- Eligible → wizard shows the side-by-side cards (free trial vs $25 = 74 days).
- Ineligible → wizard shows only the $25-to-post path.
- Phone is normalized to E.164 (existing `contact_phone_e164` field).

### 4. Subscriptions (Agent + VIP)

**New table `listing_subscriptions`:**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK auth.users | |
| `plan` | enum (`agent`, `vip`) | |
| `status` | enum (`active`, `past_due`, `cancelled`, `expired`, `admin_active`) | |
| `listing_cap` | int nullable | 7 for agent; NULL for VIP (unlimited). |
| `stripe_subscription_id` | text nullable | NULL for admin-granted. |
| `stripe_customer_id` | text nullable | |
| `current_period_end` | timestamptz nullable | From Stripe. For admin-granted, computed from `billing_day_of_month`. |
| `billing_day_of_month` | int (1–28) | Day each month subscription renews. For Stripe subs, mirrors Stripe's start day. For admin-granted, set explicitly. |
| `is_admin_granted` | boolean default false | |
| `granted_by_admin_id` | uuid nullable | |
| `admin_active_from` | timestamptz nullable | Date the admin grant started. |
| `created_at`, `updated_at`, `cancelled_at` | timestamps | |

**Listing-cap enforcement** (server-side, on post-listing-with-subscription):

```sql
SELECT COUNT(*) FROM listings
WHERE user_id = me
  AND listing_type = 'rental'
  AND is_active = true
  AND payment_kind = 'subscription';
```

If `count >= subscription.listing_cap`, block with upsell. (NULL cap = unlimited; never blocks.)

**Cascade deactivation**: when a `listing_subscriptions.status` transitions away from `active`/`admin_active`:
1. Stripe webhook (or admin action) flips the row's status.
2. Edge function `cascade-deactivate-subscription` runs: `UPDATE listings SET is_active = false WHERE user_id = X AND payment_kind = 'subscription' AND listing_type = 'rental'`. (Trigger sets `deactivated_at`.)
3. These listings get `payment_kind` left as `subscription` — if the user re-subscribes within 30 days, they can reactivate.

**Subscriber freshness**: subscribers still face the 30-day click-to-renew cap. The SMS reminders for subscribers use the "free renewal" pattern (no charge, YES to extend).

**Day-of-month billing**: Stripe handles this natively. Subscription created on Feb 28 → renews on the 28th of subsequent months (March, April... rolling back to 28th in shorter months). We mirror Stripe's chosen day in `billing_day_of_month` for display. For admin-granted subs, admin picks the day directly.

### 5. Concierge add-on

Extend `concierge_subscriptions`:
- Add `'addon_concierge'` to the tier enum.
- Add column `listing_subscription_id uuid REFERENCES listing_subscriptions(id) ON DELETE CASCADE`.
- Add constraint: when `tier = 'addon_concierge'`, `listing_subscription_id` is REQUIRED.
- When the parent `listing_subscriptions` row's status becomes non-active, the addon's status follows (trigger or webhook).

**Stripe-side**: the Agent/VIP subscription includes a second line item for the addon when chosen. Single Stripe subscription, two prices billed together.

**Standalone tier2_forward subscriptions** (the existing email-handle product) are **untouched**. They continue to exist independently. The new `addon_concierge` is a different shape — it requires a parent listing subscription.

### 6. Bedroom + location lock at 10 days

Computed in service layer + RLS:
- `listings.created_at + INTERVAL '10 days'` is the lock cutoff.
- A function `is_listing_locked(listing_id)` returns true if `NOW() >= created_at + 10 days` AND actor is not admin.
- Edit RPCs/services check this and reject updates to: `bedrooms`, `neighborhood`, `location`, `full_address`, `latitude`, `longitude`, `contact_phone`, `contact_phone_e164` for non-admin owners.
- UI greys these fields with a tooltip: *"Locked after 10 days to prevent listings from being rotated as different units. Contact support if you need a correction."*

Applies to **all** residential-rental listings, regardless of payment status (per your Q2 answer).

### 7. Admin behaviors

| Scenario | Admin behavior |
|---|---|
| Posting a listing as themselves | Phone-trial check applies (per-phone, not per-account). 14-day trial granted if phone is fresh. |
| Multiple active listings on admin account | No "$25-from-outset" surcharge. Admin can have unlimited listings, each on its own trial/paid track. |
| Listing-count cap (Agent's 7) | Doesn't apply to admin. Admin can post unlimited as themselves. |
| Editing any listing (any user's) | Bypasses the 10-day lock. Admin can edit any field anytime. |
| Granting a subscription | Admin search-picks an account → picks Agent/VIP → picks day-of-month → row created with `is_admin_granted=true`. No Stripe involved. |
| Granting individual paid days to a listing | Admin grants N days. Creates a `paid_listing_payments` row with `source='admin_grant'`, advances `paid_until`. |
| Marking a listing `admin_granted` | Sets `payment_kind='admin_granted'`. Listing is permanently exempt from payment checks until admin changes it. Still subject to freshness deactivation (30-day click-to-renew). |
| Concierge tier-1 manual creation | Existing flow; untouched. |

### 8. Admin Subscriptions page UX

Route: `/admin/subscriptions`.

**Main table** — `listing_subscriptions` rows, sortable by next-renewal-date (so admin can see who's about to lapse next).

Columns: user (email + display name), plan, status, billing source (Stripe vs admin), next renewal date, listings used (count). Row actions: cancel, edit billing day, mark expired.

**Add subscriber flow** — single modal:
1. Search box for accounts (typeahead on email/display name).
2. Plan picker (radio: Agent $50/mo, VIP $100/mo).
3. Day-of-month picker (1–28).
4. "Add" button → row inserted with `is_admin_granted=true`, `status='admin_active'`, `admin_active_from=NOW()`, `billing_day_of_month=N`, `current_period_end = next occurrence of day N from now`.

After that, the row is automatic. It stays `admin_active` indefinitely until the admin manually flips it to `cancelled` or `expired`. On the day-of-month, the row's `current_period_end` rolls forward by a month automatically (cron tick).

**Paid Listings tab** — list listings with `payment_kind='individual_paid'`, sorted by days remaining ascending. Columns: listing summary, owner, paid_until, days remaining, last payment. Row actions: grant N more days, mark admin_granted.

### 9. Post-listing wizard payment surface

Step 6 (final/submit) branches on the user's state:

**Branch A — User has active subscription under cap.**
> Single primary button "Post listing." Subtle text below: *"Posting under your Agent plan (5 of 7 listings used)."*

**Branch B — User is trial-eligible (phone is fresh).**

Two clearly visible cards, side-by-side on desktop, stacked on mobile:

> **Card 1 (default highlighted, secondary visual weight):**
> *Free 14-day trial*
> *Post now. We'll text you 3 days before your free trial ends.*
> [Post listing button — neutral style]

> **Card 2 (primary visual weight):**
> *Pay $25 now — get 74 active days*
> *Math: 14-day trial + 30 paid days + 30 bonus days. The 30 bonus days are only available right now, at posting.*
> [Pay $25 and post — primary style]

**Branch C — User not trial-eligible (other listings with same phone in last 30d, or first-time posting on an account that already has another active listing).**

> Single card:
> *Post for 30 days — $25*
> *You're not eligible for the free trial right now because another active or recent listing shares this contact phone. Want unlimited listings instead?*
> [Pay $25 and post] [Or — see subscription options →]

The "see subscription options" link routes to the subscription checkout (Agent/VIP page), not the dashboard modal.

### 10. Dashboard monetization modal

Shows on dashboard load when any of:
- ≥2 active residential rentals AND no active subscription (subscription upsell opportunity).
- Any listing with `expires_at` within the next 7 days.
- Any inactive listing within its 30-day reactivation window.

**Three options shown** (per your direction; only the dashboard surfaces all three, never the wizard):

1. **Pay for a specific listing** — list the user's listings, each with a "buy days" picker (30/60/90/.../360).
2. **Subscribe** — Agent ($50) or VIP ($100), with optional Concierge add-on (+$50).
3. **Pick custom days** — same as #1 expanded with the full day picker.

Primary auto-recommendation is the cheapest option that solves the user's situation (e.g., if they have 1 expiring listing, recommend pay-for-this-listing; if 3+ listings, recommend Agent subscription).

### 11. Per-listing dashboard status pill

Each listing tile in the dashboard shows a `PaidListingStatusCard`:

| State | Pill | Action |
|---|---|---|
| In trial, ≥3 days left | green "Free trial · 11 days left" | "Upgrade now (get 30 bonus days)" |
| In trial, <3 days left | amber "Trial ends in 2 days" | "Pay $25" |
| Paid, ≥3 days to next freshness | green "Active · renews {date}" | none |
| Paid, ≤3 days to freshness | amber "Renew by {date}" | "Renew (free, draws balance)" or "Pay $15" if balance gone |
| Subscription-covered | blue "Covered by Agent" | none |
| Admin-granted | gray "Admin granted" | none |
| Deactivated, within 30d | red "Expired · reactivate by {date}" | "Reactivate ($15)" or "Reactivate (uses banked days)" |

### 12. Deactivation notice (existing UX)

When a listing transitions to inactive (any reason), the dashboard shows a one-time banner: *"This listing is inactive. You have 30 days to reactivate it before it's permanently deleted. Any remaining paid days are saved until you reactivate."* With a "Reactivate" button.

### 13. SMS reminders for paid listings

**New cron** `send-paid-listing-reminders`, runs daily 14:00 UTC (same time as existing), Shabbat-aware (skip Fri/Sat).

For each residential-rental listing where:
- listing is active AND `expires_at` is exactly 3 days from now, OR
- listing is active AND `expires_at` is today, OR
- listing was deactivated exactly 3 days ago.

…send an SMS based on payment state.

**Template tone mirrors the existing `Hadirot Alert:` prefix and YES/NO syntax for free-renewal scenarios. URL-only for paid scenarios.**

Listing identifier format (mirrors existing `formatListingIdentifier`): `{neighborhood or location} for ${price}`.

| Scenario | Template |
|---|---|
| 3 days before, paid balance ≥ 1 day | `Hadirot Alert: Your listing at {identifier} renews in 3 days. Reply YES to keep it active for another 30 days, or NO to deactivate.` |
| 3 days before, must pay (no balance) | `Hadirot Alert: Your listing at {identifier} expires in 3 days. Renew for ${price}/30 days: {checkout_url}` |
| Day of, paid balance ≥ 1 day | `Hadirot Alert: Your listing at {identifier} expires today. Reply YES to keep it active for another 30 days, or NO to deactivate.` |
| Day of, must pay | `Hadirot Alert: Your listing at {identifier} expires today. Renew for ${price}: {checkout_url}` |
| 3 days after deactivation | `Hadirot Alert: Your listing at {identifier} has been off for 3 days. Reactivate for ${price}: {checkout_url}` |
| Trial ending in 3 days (new) | `Hadirot Alert: Your free trial for the listing at {identifier} ends in 3 days. Pay $25 to keep it active for 30 more days: {checkout_url}` |
| Trial ending today | `Hadirot Alert: Your free trial for the listing at {identifier} ends today. Pay $25 to keep it live: {checkout_url}` |

`${price}` is `$15` if listing has prior payments, `$25` otherwise.

**Reply handling**: YES/NO replies on free-renewal reminders go through the existing webhook (same flow as the 5-day reminder — listing extends by 30 days drawing on balance, or deactivates). Paid reminders include the URL directly, so no reply parsing is needed for them. If a user replies to a paid reminder, the existing fallback ("This number isn't linked..." / "Got your message...") handles it gracefully.

**Cron interaction with existing 5-day reminder**:
- 5-day reminder asks "is it still available?" (already-built freshness check).
- 3-day reminder asks "renew?" (new, this plan).
- They don't conflict — different questions. If the 5-day reminder deactivates the listing, the 3-day reminder never fires (no longer active).

### 14. Grandfathering migration

At deploy time, single migration:

```sql
-- Existing active residential rentals get a 14-day trial starting now.
UPDATE listings
SET
  payment_kind = 'individual_trial',
  trial_started_at = NOW()
WHERE listing_type = 'rental'
  AND is_active = true
  AND payment_kind IS NULL;

-- Pre-existing INACTIVE residential rentals get tagged legacy_free
-- so they don't get auto-deactivated for payment reasons if reactivated.
UPDATE listings
SET payment_kind = 'legacy_free'
WHERE listing_type = 'rental'
  AND is_active = false
  AND payment_kind IS NULL;
```

After 14 days, any listing in `individual_trial` that hasn't converted (no paid_until, no subscription) deactivates via the cron extension.

### 15. Refund policy

**Paid days never refund**. If a user with banked days deletes their listing or unsubscribes, those days are lost (per your "they cannot roll over those days to another listing" rule).

If a Stripe refund happens (manual via dashboard), the webhook receives `charge.refunded`. The new behavior: log the refund to a new `paid_listing_refunds` table for audit, but do NOT auto-reverse paid days. Admins handle disputes manually.

---

## ASSUMPTIONS

1. **Sale + commercial listings untouched.** Lock + monetization applies to rentals only.
2. **Phone + location + bedrooms all lock together at 10 days** (added phone-lock for symmetry — prevents users from rotating phones to game the cooldown).
3. **Multi-day packages are a fixed set** (30/60/90/120/180/270/360), not a continuous slider.
4. **30-bonus-days sweetener is at-posting only** (per your tweak), gated by `is_initial_purchase=true` metadata.
5. **Admin posts as themselves use the same individual-listing flow**, phone-gated but cap-exempt.
6. **The 7-listing Agent cap counts** `is_active=true` listings (approved AND pending-approval). Drafts don't count.
7. **Stripe cancel-at-period-end**: row stays `active` until period end, then `customer.subscription.deleted` fires → cascade.
8. **Concierge addon billing**: bundled into the parent Stripe subscription (one subscription, two prices).
9. **All new edge fns + DB triggers run under service_role.**
10. **SMS Shabbat-aware** (skip Fri/Sat) — mirrors existing.
11. **No new Stripe Customer Portal flow** — subscribers use the existing `create-portal-session`.
12. **Paid balance is non-refundable** by automation (see §15).
13. **Phone normalization**: use `contact_phone_e164` field (already populated by existing code).
14. **Trial cooldown query** treats a listing with `contact_phone_e164 IS NULL` as not matching any phone (legacy data only). New listings always have it populated.

---

## FILES TO MODIFY

### Migrations (new)
- `supabase/migrations/{date}_create_listing_subscriptions.sql`
- `supabase/migrations/{date}_create_paid_listing_payments.sql`
- `supabase/migrations/{date}_create_paid_listing_refunds.sql`
- `supabase/migrations/{date}_add_monetization_columns_to_listings.sql` — adds `payment_kind`, `trial_started_at`, `paid_until`, `paused_paid_days`.
- `supabase/migrations/{date}_extend_concierge_for_addon.sql` — `addon_concierge` tier + FK.
- `supabase/migrations/{date}_extend_inactivate_rpc_for_payment.sql` — RPC + trigger extensions.
- `supabase/migrations/{date}_create_phone_trial_eligibility_fn.sql`
- `supabase/migrations/{date}_create_listing_lock_fn.sql`
- `supabase/migrations/{date}_grandfather_existing_rentals.sql` — the bulk UPDATE.

### Edge functions (new)
- `supabase/functions/create-individual-listing-checkout/index.ts`
- `supabase/functions/create-listing-subscription-checkout/index.ts`
- `supabase/functions/extend-paid-listing/index.ts`
- `supabase/functions/send-paid-listing-reminders/index.ts`
- `supabase/functions/cascade-deactivate-subscription/index.ts`

### Edge functions (modified)
- `supabase/functions/stripe-webhook/index.ts` — add new metadata branches + cascade calls.

### Types
- `src/types/database.ts` — regenerate via `npm run db:types`.
- `src/types/monetization.ts` (new) — plan tier helpers.

### Services
- `src/services/listings.ts` — `getPaymentStatus`, edit guards.
- `src/services/subscriptions.ts` (new)
- `src/services/payments.ts` (new)

### Wizard UI (Branch B/C cards)
- `src/pages/postListingWizard/steps/residential/Step6.tsx` (or whichever submit step)
- `src/pages/postListingWizard/components/PaymentChoice.tsx` (new)

### Dashboard UI
- `src/pages/Dashboard.tsx` — load monetization state.
- `src/components/dashboard/MonetizationModal.tsx` (new)
- `src/components/dashboard/PaidListingStatusCard.tsx` (new)
- `src/components/dashboard/DeactivationNotice.tsx` (new — or extend existing if any)

### Edit-listing UI
- `src/pages/EditListing.tsx` (or equivalent) — disable locked fields, show tooltip.

### Admin UI
- `src/App.tsx` — add `/admin/subscriptions` route.
- `src/pages/admin/Subscriptions.tsx` (new)
- `src/components/admin/SubscriptionsList.tsx` (new)
- `src/components/admin/AddSubscriberModal.tsx` (new)
- `src/components/admin/PaidListingsTab.tsx` (new)

### Config
- `supabase/config.toml` or Supabase dashboard — schedule `send-paid-listing-reminders` daily.
- `.env.example` — `STRIPE_AGENT_PRICE_ID`, `STRIPE_VIP_PRICE_ID`, `STRIPE_ADDON_CONCIERGE_PRICE_ID`.

---

## IMPLEMENTATION PHASES

Each phase ends with a `npm run build`, a `npm run lint`, a checkpoint commit, and a push to origin.

- **Phase A**: All migrations. Regen types. → commit `db: monetization schema + grandfather migration`
- **Phase B**: Edge functions + service layer. → commit `feat: monetization server layer (checkout, webhook, sms, cascade)`
- **Phase C**: Wizard payment cards. → commit `feat: post-listing wizard shows trial / pay / subscription state`
- **Phase D**: Dashboard modal + status pills + deactivation notice. → commit `feat: dashboard monetization modal + per-listing status`
- **Phase E**: Edit-listing field lock. → commit `feat: lock listing location + phone after 10 days`
- **Phase F**: Admin subscriptions panel. → commit `feat: admin subscriptions panel + paid listings tab`
- **Phase G**: Cron schedule + env scaffolding. → commit `chore: wire monetization cron + env scaffolding`
- **Phase H**: Verification + manual Playwright pass. (no commit)

---

## TESTING CHECKLIST

**Wizard**
- [ ] Eligible first-time poster sees both cards. Free trial path posts free, $25 path → Stripe Checkout → 74 days credited.
- [ ] Ineligible poster (duplicate phone) sees only $25 card.
- [ ] Subscriber under cap sees "Post under Agent" message, no payment.
- [ ] Subscriber at cap sees upsell to VIP.

**Renewal**
- [ ] Day 27: SMS #1 fires (or shifts past Shabbat). YES extends 30d, NO deactivates.
- [ ] Day 30: SMS #2 fires.
- [ ] Renewal click consumes balance correctly.
- [ ] Day 33 post-deactivation: SMS #3 fires.
- [ ] Reactivation restores `paid_until` from `paused_paid_days`.

**Subscriptions**
- [ ] Subscribe via Stripe → listings covered.
- [ ] Cancel via portal → at period end, cascade deactivates.
- [ ] Admin grants subscription → row created, status `admin_active`, day-of-month picker honored.
- [ ] Admin cancels subscription → cascade deactivates.

**Concierge addon**
- [ ] Agent + addon: single Stripe subscription, two line items.
- [ ] Standalone tier1/2/3 still work unchanged.
- [ ] Parent cancellation cascades to addon.

**Lock**
- [ ] Day 9: bedrooms/location/phone editable.
- [ ] Day 10+: fields disabled with tooltip.
- [ ] Admin: always editable.

**Admin posting**
- [ ] Admin posts 2 listings with different phones → both get 14-day trial.
- [ ] Admin posts 2 listings with same phone → second one needs $25.
- [ ] Admin posts 10 listings (different phones) → all 10 active, no cap.

**Grandfathering**
- [ ] Active rentals at launch: `payment_kind='individual_trial'`, `trial_started_at=NOW()`.
- [ ] Inactive rentals at launch: `payment_kind='legacy_free'`.
- [ ] Day 14 post-launch: trial listings without payment/sub auto-deactivate.

**Edge cases**
- [ ] Phone with different formatting still dedup-matches.
- [ ] User with Agent sub + an old individual paid listing — listing tagged subscription, individual balance preserved on file but not consumed.
- [ ] `charge.refunded` webhook fires → row logged to `paid_listing_refunds`, no automatic day reversal.
