# Monetization — Live Migration & Launch Plan

> Branch: `claude/monetize-residential-rentals` · Live project ref: `pxlxdlrjmrkxyygdhvku`
> Written June 9, 2026 after the production-readiness audit (all audit fixes are on the branch).

The system was built **deploy-dark**: every migration and edge function can go to
production days before launch, and nothing changes for users until an admin
presses **Activate monetization** on `/admin/subscriptions`. That button flips
`admin_settings.monetization_enabled` and grandfathers existing listings in one
transaction. "Seamless" here means: deploy everything, verify while dark, then
flip one switch.

---

## Phase 0 — Prerequisites (do once, any time before launch)

### 0.1 Stripe live mode
1. The owner supplied these launch price ids (June 10 2026):
   - Agent (7-listing cap, $50/mo): `price_1Tc8PYJvRPzH20A9UURtXKeg`
   - VIP / unlimited ($100/mo): `price_1Tc8PxJvRPzH20A9OyuLWHHD`
   - Concierge add-on ($50/mo): `price_1Tc8QSJvRPzH20A9qA8Gp1PF`

   **VERIFY THE MODE before launch:** open the Stripe dashboard, switch the
   **Test mode toggle OFF**, go to Products, and confirm all three prices are
   visible there with these exact ids and the right amounts. A price id only
   works in the mode it was created in. If they only appear with Test mode ON,
   create three live-mode recurring monthly prices ($50 / $100 / $50) and use
   those ids in 0.2 instead.

   (Individual listing payments — $25/$15 and the multi-month packages — need **no**
   Stripe products; the checkout uses ad-hoc amounts.)
2. Verify the existing live webhook endpoint
   (`https://pxlxdlrjmrkxyygdhvku.supabase.co/functions/v1/stripe-webhook`)
   is subscribed to **all four** events:
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, **`charge.refunded`** (the last one is new —
   it powers the refund audit log; add it if missing).
3. The price-id literals baked into
   `supabase/functions/_shared/stripe-prices.ts` are **confirmed TEST-MODE ids**
   (local/dev fallback only). The three env secrets in 0.2 are therefore
   **mandatory** for launch — without them, subscription checkout creation will
   fail in production (loudly, not by mischarging).

### 0.2 Edge-function secrets (Supabase dashboard → Edge Functions → Secrets)
**There is ONE `STRIPE_API_KEY` per Supabase project and every Stripe edge
function shares it** — featured/boost, concierge, AND all the new monetization
functions read the same secret. The new functions automatically follow
whatever featured/concierge use today; there is no separate key to wire up.
Check the live project's secret: if it starts with `sk_live_` you're done; if
it starts with `sk_test_`, replace it with the live secret key before launch
(note that would also mean boost/concierge have been charging test cards).
`STRIPE_WEBHOOK_SECRET` must likewise be the signing secret of the LIVE-mode
webhook endpoint.

Already set from existing features (verify, don't re-create):
`STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, `ZEPTO_TOKEN`, `ZEPTO_FROM_ADDRESS`,
`ZEPTO_FROM_NAME`, `PUBLIC_SITE_URL=https://hadirot.com`.

New — **REQUIRED** — set these three (values from 0.1, after the live-mode
verification there):
```
STRIPE_AGENT_PRICE_ID=price_1Tc8PYJvRPzH20A9UURtXKeg
STRIPE_VIP_PRICE_ID=price_1Tc8PxJvRPzH20A9OyuLWHHD
STRIPE_ADDON_CONCIERGE_PRICE_ID=price_1Tc8QSJvRPzH20A9qA8Gp1PF
```

### 0.3 Verify the cron plumbing on live
Run in the live SQL editor:
```sql
SELECT current_setting('app.supabase_url', true), length(current_setting('app.supabase_service_role_key', true));
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
```
Both settings should be non-null (the existing daily-email crons already rely on
them). If the first query returns NULL, set them once (Dashboard → SQL editor):
```sql
ALTER DATABASE postgres SET app.supabase_url = 'https://pxlxdlrjmrkxyygdhvku.supabase.co';
ALTER DATABASE postgres SET app.supabase_service_role_key = '<service-role-key>';
```

### 0.4 Database backup
Dashboard → Database → Backups → confirm a fresh daily backup exists (or take a
manual one). The migrations are additive, but the activation step bulk-updates
`listings` — a restore point is cheap insurance.

---

## Phase 1 — Deploy (dark) — merge + apply

### 1.1 Merge the PR
Open the PR from `claude/monetize-residential-rentals` → `main` and merge. The
frontend host (Netlify/Vercel) auto-deploys `main`. Nothing user-visible changes:
every monetization surface checks `monetization_enabled` (still `false`) and the
wizard posts exactly as today.

### 1.2 Apply the 13 new migrations to live — IN THIS ORDER
Apply via the **Supabase dashboard SQL editor**, one file at a time, top to
bottom (paste each file's contents and run). Do **not** use `supabase db push`
unless you already use it routinely — the live project's migration-history table
may not match the repo and push could misbehave.

| # | File | What it does |
|---|------|--------------|
| 1 | `20260527150000_create_monetization_tables.sql` | `listing_subscriptions`, `paid_listing_payments`, `paid_listing_refunds` + RLS |
| 2 | `20260527150100_add_monetization_columns_to_listings.sql` | `payment_kind`, `trial_started_at`, `paid_until`, `paused_paid_days` + indexes |
| 3 | `20260527150200_extend_concierge_for_addon_tier.sql` | `addon_concierge` tier + parent FK |
| 4 | `20260527150300_create_monetization_helper_fns.sql` | `is_phone_trial_eligible`, `is_listing_locked` |
| 5 | `20260527150400_extend_listing_lifecycle_for_payments.sql` | trigger banking + cron payment branches (v1) |
| 6 | `20260527150500_grandfather_existing_rentals.sql` | **no-op** (deferred to the activation RPC) — run it anyway to keep history aligned |
| 7 | `20260527150600_schedule_paid_listing_reminders.sql` | daily 10 AM ET SMS cron |
| 8 | `20260527150700_add_subscription_free_trial.sql` | `trial` status + cron v2 |
| 9 | `20260527150800_monetization_feature_flag.sql` | `monetization_enabled` flag + `enable/disable_monetization()` + cron v3 |
| 10 | `20260604000000_reconcile_individual_listing_anchors.sql` | hourly race-heal cron |
| 11 | `20260604120000_create_subscription_trial_eligibility_fn.sql` | `is_subscription_trial_eligible` |
| 12 | `20260609000000_monetization_hardening.sql` | tamper guard, old-form default, cron FINAL, audit fixes |
| 13 | `20260610000000_stagger_grandfather_trials.sql` | grandfathering v2: singular phones → staggered trials; shared phones → legacy_free |

Three older migration files were also edited on the branch
(`20251020000001…`, `20251029000003…`, `20251107000000…`) — those edits only
guard a column that doesn't exist on local rebuilds. **Live already ran the
originals; do NOT re-run them.**

Sanity check after applying:
```sql
SELECT monetization_enabled FROM admin_settings;            -- false
SELECT COUNT(*) FROM listings WHERE payment_kind IS NOT NULL; -- 0
SELECT jobname FROM cron.job WHERE jobname IN
  ('send-paid-listing-reminders','reconcile-individual-listing-anchors');  -- 2 rows
SELECT tgname FROM pg_trigger
WHERE tgrelid='public.listings'::regclass
  AND tgname LIKE '%monetization%';                          -- 2 guard triggers
```

### 1.3 Deploy edge functions
From your machine in the repo root (after merging), deploy the **9** touched
functions:
```
supabase functions deploy stripe-webhook                       --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy approve-listing                      --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy cascade-deactivate-subscription      --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy create-individual-listing-checkout   --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy create-listing-subscription-checkout --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy extend-paid-listing                  --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy upgrade-listing-subscription         --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy send-paid-listing-reminders          --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy pay-listing-link --no-verify-jwt     --project-ref pxlxdlrjmrkxyygdhvku
```
`pay-listing-link` **must** be deployed with `--no-verify-jwt` — it's the public
SMS payment link; its security is the signed HMAC token, not a login.

### 1.4 Dark verification (production, flag still off)
- Post a test rental through the wizard → posts normally, no payment cards
  shown, `payment_kind` stays NULL.
- Open `/admin/subscriptions` as admin → page loads, shows the amber
  "Activate monetization" banner, empty subscription list.
- `SELECT * FROM cron.job;` → reminder + reconcile jobs exist; the reminder
  function exits early with `monetization_disabled` (check Edge Function logs
  after 10 AM ET, or invoke it manually from the dashboard).

You can stay in this state for days — it's fully inert.

---

## Phase 2 — Launch day (one button + 20 minutes of checks)

### 2.1 Flip the switch
As an admin, open **`/admin/subscriptions` → Activate monetization → confirm.**
That calls `enable_monetization()`, which atomically:
- sets `monetization_enabled = true`;
- **singular** active rentals (no other active rental shares the contact
  phone — includes listings with no phone) → `individual_trial`, split into
  **three even cohorts** with trial starts of now / +1 day / +2 days, so
  expirations spread across **days 14, 15 and 16** and the SMS payment-link
  waves stagger the same way;
- **high-volume** active rentals (2+ active rentals sharing a contact phone —
  almost certainly agents) → `legacy_free`: they keep behaving exactly as
  today — deactivation only by the freshness window set in the admin panel,
  no payment demanded, no trial SMS. Convert these accounts to Agent/VIP
  subscriptions manually from `/admin/subscriptions` at your own pace. (Their
  phones still block new free trials, so anything NEW they post goes through
  pay/subscribe.)
- tags **pending-approval** rentals `individual_trial` (their clock starts at
  approval);
- tags previously-deactivated rentals `legacy_free` (never payment-blocked if
  the owner republishes — freshness rules still apply).

The dialog reports the counts. Verify:
```sql
SELECT payment_kind, COUNT(*) FROM listings
WHERE listing_type='rental' GROUP BY payment_kind;
```

### 2.2 Post-activation smoke tests (live, real card, then refund)
1. **Wizard, fresh phone** → both cards show (free trial / $25 = 74 days). Post
   on free trial → listing pends approval; approve it as admin → trial clock
   stamps at approval.
2. **Wizard, same phone again** → only the $25 card shows.
3. **$25 path** → complete Stripe checkout with a real card → webhook flips the
   listing to `individual_paid`; check `paid_listing_payments` has the row.
   Refund yourself in Stripe → `paid_listing_refunds` gets a row, days remain.
4. **Subscription** → subscribe to Agent from the dashboard modal → row in
   `listing_subscriptions`, listings re-tagged `subscription`. Cancel at period
   end in the Stripe customer portal → row **stays active** (audit fix), and the
   listings survive until the period actually ends.
5. **Admin grants** → `/admin/subscriptions`: add a manual subscriber (pick a
   billing day), grant days to a listing, mark a listing complimentary.

### 2.3 What happens automatically after launch
| When | What |
|------|------|
| Days 11–13 after activation | Trial-ending SMS waves (3 days before expiry), one cohort per day — roughly a third of the **singular** listings each day. High-volume (`legacy_free`) listings get no payment SMS at all. Fridays/Saturdays are skipped (Shabbat); a reminder whose day lands then is skipped, not delayed. |
| Days 14–16 | Trial-ends-today SMS per cohort; each night the hourly cron deactivates that day's unconverted singular cohort. High-volume listings are untouched (freshness window only, as today). You can extend the runway for chosen listings beforehand by granting days from the admin Paid Listings tab. |
| Days 17–19 | "Your listing has been off for 3 days — reactivate" SMS per cohort, with a one-tap checkout link. |
| Hourly | `auto_inactivate_old_listings` enforces trials/balances/subscriptions; `reconcile_individual_listing_anchors` heals any approve-vs-webhook race. |
| Daily 10 AM ET | `send-paid-listing-reminders` (trial-ending, balance-ending, post-deactivation). |

### 2.4 Rollback (if anything looks wrong)
`/admin/subscriptions` → **Deactivate**, or in SQL: `SELECT disable_monetization();`
- All payment enforcement stops instantly (cron branches, wizard gate, SMS).
- Payment tags stay on listings, so re-activating later does **not** restart
  anyone's trial — the original `trial_started_at` stands. If you want a fresh
  14 days for everyone on re-launch, clear tags first:
  `UPDATE listings SET payment_kind=NULL, trial_started_at=NULL WHERE listing_type='rental';`
- Money already taken via Stripe is unaffected; refund case-by-case in Stripe.

---

## Switching your local copy off the Docker database
Nothing in the app needs to change — production already points at live. Your
local `.env` currently points at the Docker copy (`http://127.0.0.1:54321`); to
develop against live instead, restore the live `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` values in `.env`. Keep the Docker stack for testing
risky changes — that separation just saved you several launch bugs.

---

## Known accepted behaviors (deliberate, not bugs)
- **Admins post unlimited free-trial listings** through any form (wizard,
  `/post-old`, scraped-listings pipeline) — by design. Each admin listing still
  runs a 14-day trial clock; use "Mark complimentary" (admin_granted) for
  listings that should never expire for payment reasons.
- **Shabbat skip, not shift**: reminders falling on Fri/Sat are skipped
  (mirrors the existing renewal-reminder system).
- **Admin day-grants count as a "prior payment"** for pricing: a listing that
  received an admin grant renews at $15, not $25.
- **Paid days never refund automatically**; refunds are logged for audit and
  handled manually.
- **An approved must-pay listing with no payment stays invisible** (approved
  but inactive) until the owner pays — approving it does not publish it.

## Residual risks worth knowing
- Grandfathered-trial deactivations are staggered over days 14–16 (see 2.3),
  but each cohort still expires together — watch the first cohort on day 14
  and grant days to listings you want to keep before the wave hits.
- SMS links are valid 14 days and reusable until then (each tap only opens a
  fresh checkout the user must complete — no stored-card charge is possible).
- The pre-existing `Users can update own listings` RLS policy is broad; the new
  guard trigger protects the four payment columns, but other columns (including
  `approved`) remain owner-writable as they always were. Worth a separate
  tightening pass someday.
