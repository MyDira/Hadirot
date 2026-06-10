# Live deploy runbook — copy-paste edition

Companion to `MONETIZATION_LAUNCH_PLAN.md`. Five steps, ~15 minutes.
Everything deploys **dark** — nothing changes for users until the admin
clicks "Activate monetization" later.

The SQL in step 2 was verified June 10 2026 by a full fresh-apply simulation
against a live-schema copy (transaction-wrapped, zero errors, rolled back).

---

## Step 1 — Pre-flight (Supabase dashboard, live project `pxlxdlrjmrkxyygdhvku`)

In **SQL Editor**, run:

```sql
SELECT current_setting('app.supabase_url', true) AS url_setting,
       length(current_setting('app.supabase_service_role_key', true)) AS key_len;
SELECT monetization_enabled FROM admin_settings;  -- should ERROR: column does not exist (that's correct — not applied yet)
```

- `url_setting` must be non-null (it is if the daily-email crons work today).
- Confirm Database → Backups shows a recent backup.

## Step 2 — Apply the migrations (one paste)

SQL Editor → New query → paste the ENTIRE contents of
`live_deploy/ALL_MONETIZATION_MIGRATIONS.sql` → Run.

Then verify:

```sql
SELECT 'flag' AS chk, (SELECT monetization_enabled FROM admin_settings)::text AS val
UNION ALL SELECT 'tagged_listings', COUNT(*)::text FROM listings WHERE payment_kind IS NOT NULL
UNION ALL SELECT 'tables', COUNT(*)::text FROM information_schema.tables
  WHERE table_name IN ('listing_subscriptions','paid_listing_payments','paid_listing_refunds')
UNION ALL SELECT 'cron_jobs', COUNT(*)::text FROM cron.job
  WHERE jobname IN ('send-paid-listing-reminders','reconcile-individual-listing-anchors')
UNION ALL SELECT 'guard_triggers', COUNT(*)::text FROM pg_trigger
  WHERE tgrelid='public.listings'::regclass AND tgname LIKE '%monetization%'
UNION ALL SELECT 'fns', COUNT(*)::text FROM pg_proc
  WHERE pronamespace='public'::regnamespace AND proname IN
  ('enable_monetization','disable_monetization','is_phone_trial_eligible','is_listing_locked',
   'is_subscription_trial_eligible','reconcile_individual_listing_anchors',
   'enforce_subscription_listing_cap','monetization_payment_guard');
```

Expected: `flag=false · tagged_listings=0 · tables=3 · cron_jobs=2 · guard_triggers=2 · fns=8`.

## Step 3 — Secrets

Dashboard → Project Settings → Edge Functions → Secrets (or `supabase secrets set` from a terminal):

```
STRIPE_AGENT_PRICE_ID=price_1Tc8PYJvRPzH20A9UURtXKeg
STRIPE_VIP_PRICE_ID=price_1Tc8PxJvRPzH20A9OyuLWHHD
STRIPE_ADDON_CONCIERGE_PRICE_ID=price_1Tc8QSJvRPzH20A9qA8Gp1PF
```

While there, confirm `STRIPE_API_KEY` starts with `sk_live_` (owner confirmed
Stripe is in regular mode; this is the double-check).

## Step 4 — Deploy the 10 edge functions

From a terminal at the repo root, on the monetization branch (or main after
the PR merges — same code):

```bash
supabase functions deploy stripe-webhook                       --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy approve-listing                      --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy cascade-deactivate-subscription      --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy create-individual-listing-checkout   --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy create-listing-subscription-checkout --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy extend-paid-listing                  --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy upgrade-listing-subscription         --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy send-paid-listing-reminders          --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy send-renewal-reminders               --project-ref pxlxdlrjmrkxyygdhvku
supabase functions deploy pay-listing-link --no-verify-jwt     --project-ref pxlxdlrjmrkxyygdhvku
```

`pay-listing-link` MUST have `--no-verify-jwt` (public SMS link; security is
the signed token).

## Step 5 — Stripe webhook + frontend

1. Stripe dashboard (live mode) → Developers → Webhooks → the
   `…/functions/v1/stripe-webhook` endpoint → confirm events include
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, **`charge.refunded`** (add if missing).
2. Merge the PR (`claude/monetize-residential-rentals` → `main`) so the
   frontend deploys. Until the flag is flipped, users see zero change.

## Dark verification (after steps 1–5, before launch)

- Post a test rental through the live wizard → posts normally, no payment UI.
- `/admin/subscriptions` loads with the "Activate monetization" banner.
- Next day: Edge Function logs for `send-paid-listing-reminders` show
  `skipped: monetization_disabled`.

## Launch (whenever ready)

`/admin/subscriptions` → **Activate monetization** → confirm. Singular-phone
actives start staggered 14-day trials; shared-phone (agent) listings stay
as-is (`legacy_free`); SMS waves begin day 11. Rollback = the Deactivate
button. Full detail: `MONETIZATION_LAUNCH_PLAN.md` §2.
