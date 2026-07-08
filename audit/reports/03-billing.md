# Track 3 — Money paths: Stripe billing & entitlement correctness — Findings

## Summary

Overall the billing layer is more carefully built than a "never fully E2E-tested"
system usually is: every webhook handler has an explicit idempotency guard, most
checkout endpoints take amounts/price-ids from server-side constants, the
`monetization_payment_guard` trigger blocks client tampering with payment columns,
and there are partial-unique indexes preventing duplicate active subscriptions and
duplicate active featured purchases. That said, there are real defects. The single
worst is a **price-integrity hole in `create-checkout-session` (featured listings):
the Stripe `price_id` is taken directly from the client and is decoupled from the
`duration_days` the webhook grants — a user can pay the $25 7‑day price and receive
30 days of featured placement** (P0). Beyond that: webhook handler DB failures return
HTTP 200 and are silently lost (paid user, no entitlement, no retry, no alert — P1);
the agent-free-posting `legacy_free` path is actively reverted by the hardening
trigger for non-admins so the feature is broken while monetization is on, and `role`
is self-declared at signup (P1); duplicate/concurrent webhook delivery of an
individual-listing payment can double-apply paid days (P1); and disputes/refunds do
not revoke entitlement (P2). Counts: **P0: 1, P1: 3, P2: 4, P3: 2**. The webhook
signature verification itself is correct (raw body + `constructEventAsync`), and the
subscription-status → coverage mapping is internally consistent across the webhook,
the cron RPC, and the cap trigger.

## Findings

### [P0] Featured checkout trusts client `price_id`, decoupled from granted duration
- **Where:** `supabase/functions/create-checkout-session/index.ts` (lines ~44–72 input, ~150–176 session create); webhook `supabase/functions/stripe-webhook/index.ts` `handleFeaturedCheckout` (lines 121–210).
- **What:** The endpoint accepts `{ listing_id, plan, price_id }` from the client. It validates `plan ∈ {7day,14day,30day}` and that `price_id` is a string ≤100 chars, but never checks that `price_id` corresponds to `plan`. The Stripe line item charges `price_id` (client-chosen), while the metadata written to the session is `duration_days = String(VALID_PLANS[plan])` and `plan` — both derived from the client `plan`, not from the price. The webhook grants `featured_end = now + duration_days` purely from that metadata.
- **Why it matters / failure scenario:** A user calls the function with `plan: '30day'` (→ `duration_days=30`) but `price_id` set to the $25 7‑day price (`price_1SzMw9JvRPzH20A9CJA2SQ87`, a valid price in the merchant account). They are charged $25 and the webhook features their listing for 30 days. At 1,000 paying users this is a systematic revenue leak that anyone who opens dev tools can exploit; the recorded `amount_cents` (from `amountMap[plan]`) will even read $75 while only $25 was captured, hiding it in the ledger.
- **Evidence:**
  ```ts
  const { listing_id, plan, price_id } = await req.json();
  if (!VALID_PLANS[plan]) { ... }               // plan validated
  if (typeof price_id !== 'string' || price_id.length > 100) { ... } // price_id only length-checked
  ...
  line_items: [{ price: price_id, quantity: 1 }],          // client price charged
  metadata: { ..., duration_days: String(VALID_PLANS[plan]) }, // duration from plan, not price
  ```
  Contrast with `create-boost-checkout` / concierge / subscription / individual, which all resolve the price server-side from `_shared/stripe-prices.ts` and never accept a client price.
- **Fix prompt:** In `supabase/functions/create-checkout-session/index.ts`, stop accepting `price_id` from the client. Import the featured price table (add a `FEATURED_PRICES` map to `supabase/functions/_shared/stripe-prices.ts` keyed by `7day|14day|30day` → `{ priceId, amount, days }`, mirroring `BOOST_PRICES`) and derive both the line-item price and `duration_days` from the validated `plan` server-side. Also set `amount_cents` from the same table. Update `src/services/stripe.ts::createCheckoutSession` to stop sending `price_id`. Verify by attempting a checkout with a mismatched price and confirming it is rejected/ignored and the charged amount matches the plan.

### [P1] Webhook handler DB failures return HTTP 200 → paid customer, no entitlement, no retry, no alert
- **Where:** `supabase/functions/stripe-webhook/index.ts` — throughout, e.g. `handleListingSubscriptionCheckout` (lines 896–899), `handleFeaturedCheckout` fallback insert (161–172), `handleIndividualListingCheckout` (676–686), and the top-level dispatcher (1046–1071).
- **What:** Individual handlers catch/absorb their own errors with `console.error(...)` + `return;` and the top-level `Deno.serve` returns `{ received: true }` 200 as long as no exception propagates. Supabase `.insert()/.update()` calls do not throw on error — they return `{ error }`, which in several places is logged and ignored. So a transient DB error (or an RLS/constraint surprise) after a successful Stripe charge produces a 200, Stripe marks the event delivered and never retries, and the entitlement (subscription row, listing coverage, featured activation) is never granted. There is no dead-letter table, no `stripe_webhook_events` log, and no admin alert.
- **Why it matters / failure scenario:** `handleListingSubscriptionCheckout` inserts the `listing_subscriptions` row; `if (insertErr || !newSub) { console.error(...); return; }`. A user who just paid $50/mo gets no subscription row, none of their listings covered, and a `past_due`/deactivation sweep later — with zero signal to the owner. At 1,000 users, Stripe's normal duplicate/late delivery plus occasional DB contention guarantees this happens. The webhook is also the *only* path that grants subscription/individual entitlement (success pages are display-only — see non-findings), so a lost event is unrecoverable without manual Stripe reconciliation.
- **Evidence:**
  ```ts
  const { data: newSub, error: insertErr } = await supabaseAdmin
    .from('listing_subscriptions').insert({...}).select('id').single();
  if (insertErr || !newSub) { console.error('Failed to insert...', insertErr); return; } // 200 follows
  ```
  Top level always returns 200 unless a throw reaches the outer catch (which returns 500).
- **Fix prompt:** Make webhook handlers surface unrecoverable failures as a thrown error so `Deno.serve`'s outer catch returns 500 and Stripe retries — but only after adding an idempotent event-log so retries are safe (create a `stripe_webhook_events(event_id text primary key, type text, processed_at timestamptz, error text)` table; at the top of the handler `INSERT ... ON CONFLICT (event_id) DO NOTHING` and skip if already processed). Convert each handler's `if (err) { console.error; return; }` after a *money-critical* write into `throw`. Additionally log any handler error row to the events table for admin visibility. Verify with `stripe trigger checkout.session.completed` replayed twice and a simulated insert failure (temporarily point at a bad table) → confirm 500 + retry + single final row.

### [P1] Agent-free `legacy_free` is stripped by the tamper guard for non-admins; `role='agent'` is self-declared at signup
- **Where:** guard `supabase/migrations/20260609000000_monetization_hardening.sql` (`monetization_payment_guard`, INSERT branch lines ~95–120); feature intent `AGENT_FREE_POSTING.md`; poster path `src/pages/postListingWizard/PostListingWizard.tsx` (~835–840) sets `payment_kind: 'legacy_free'`; role source `src/components/auth/AuthForm.tsx` (`role: formData.role`, line ~161) and `src/services/agentFreePosting.ts` (`role === 'agent'`).
- **What:** Two coupled problems. (1) The June‑9 hardening guard predates the June‑22 agent-free feature and was never updated: for any non-admin INSERT it does `IF NEW.payment_kind IN ('admin_granted','legacy_free','individual_paid') THEN NEW.payment_kind := NULL;` then defaults to `individual_trial`/`pending_payment`. So when a free-posting agent posts (wizard sends `legacy_free`), the DB silently rewrites it to `individual_trial` — the agent goes on the 14‑day monetization clock and gets pay-$25 SMS / deactivation, exactly what the feature says must not happen. The one-time backfill migration works only because it runs as service-role (no `auth.uid()`), but *new* agent posts do not. (2) `role` is chosen by the user in the signup form and is **not** in the privileged-column guard (`20260416000000` protects `is_admin,is_banned,can_feature_listings,...` but not `role` or `free_posting_agent`). The free-agent test is `role==='agent' OR free_posting_agent OR lifetime>=3`, so a user can self-select "agent" at signup (or just post ≥3 times) to be treated as free — a deliberate paywall bypass once `charge_agents` is flipped on / while monetization is on.
- **Why it matters / failure scenario:** While `charge_agents=false` (default) the *intended* free agents are silently put back on the paywall clock (angry legitimate agents, revenue collected from people who were promised free). While/after monetization tightens, a landlord self-declaring `role='agent'` posts rentals free (revenue leak). Both directions are wrong because entitlement is driven by a client-settable field and a stale trigger.
- **Evidence:**
  ```sql
  -- monetization_payment_guard, non-admin INSERT:
  IF NEW.payment_kind IN ('admin_granted', 'legacy_free', 'individual_paid') THEN
    NEW.payment_kind := NULL;               -- legacy_free from an agent is discarded
  END IF;
  ... NEW.payment_kind := CASE WHEN v_eligible THEN 'individual_trial' ELSE 'pending_payment' END;
  ```
  ```ts
  // AuthForm.tsx signup payload
  role: formData.role,   // user-selected; 'agent' is an option
  ```
  `grep` confirms neither `role` nor `free_posting_agent` appears in `20260416000000_prevent_privileged_profile_self_updates.sql`.
- **Fix prompt:** Two parts. (a) Teach `monetization_payment_guard` about the agent-free path: when `admin_settings.charge_agents = false` and the poster qualifies as a free agent (reuse the same rule via a SECURITY DEFINER helper `is_user_free_agent(uid)`), permit/normalize `payment_kind='legacy_free'` for non-admins instead of stripping it; otherwise keep today's behavior. (b) Server-authoritatively derive "agent-free" eligibility rather than trusting `profiles.role`: either add `role` to the privileged-self-update guard so only admins can set `role='agent'`, or drop `role==='agent'` from `agentFreePostingService.isUserFreeAgent` and rely only on admin-set `free_posting_agent` + the lifetime-count rule. Verify: as a fresh non-admin `role=agent` user with monetization ON and `charge_agents` OFF, post a rental and confirm the row persists as `legacy_free`; then confirm a self-set `role=agent` cannot bypass the paywall once `charge_agents` is ON.

### [P1] Duplicate/concurrent webhook delivery can double-apply individual-listing paid days
- **Where:** `supabase/functions/stripe-webhook/index.ts` `handleIndividualListingCheckout` (idempotency read 629–637, unchecked insert 676–686, day-math + listing update 715–761).
- **What:** Idempotency is a read-then-act check (`select paid_listing_payments where session_id ... ; if exists return`). There is a unique index on `stripe_checkout_session_id`, but the subsequent `insert` result is not error-checked, and the day-math (`paid_until` stacking / bonus) runs regardless. Under two concurrent deliveries of the same event (Stripe does occasionally deliver twice, and retries after a slow first response), both reads see no row, both proceed; the second insert hits the unique violation (silently, error ignored) but the code continues and **re-applies** the day-math, stacking another `daysGranted` onto `paid_until` — 60 days for one 30‑day payment. The "stacking on existing paid balance" branch (729–732) reads the already-updated `paid_until`, compounding it.
- **Why it matters / failure scenario:** A single $25 payment yields 60 (or more) paid days; at scale this is a steady give-away and makes `paid_until` untrustworthy for the deactivation cron. The same shape exists for `handleFeaturedCheckout` (two deliveries both flip `is_featured` + extend `featured_end`), though there the values are recomputed to the same window so the damage is smaller.
- **Evidence:**
  ```ts
  const { data: existingPayment } = await supabaseAdmin.from('paid_listing_payments')
    .select('id').eq('stripe_checkout_session_id', session.id).maybeSingle();
  if (existingPayment) { ...; return; }          // read-then-act, not atomic
  ...
  await supabaseAdmin.from('paid_listing_payments').insert({...}); // error not checked
  ...
  newPaidUntil = new Date(listing.paid_until); newPaidUntil.setUTCDate(... + daysGranted); // re-stacks
  ```
- **Fix prompt:** Gate the whole handler on the atomic insert, not the pre-read: perform the `paid_listing_payments` insert first, check `error?.code === '23505'` and `return` early on conflict (that is the true idempotency signal), and only run the day-math/listing update when the insert actually created the row. Pair this with the P1 `stripe_webhook_events` event-id dedup so cross-handler replays are also blocked. Verify by replaying the same `checkout.session.completed` twice with `stripe events resend` and confirming `paid_until` advances only once.

### [P2] Chargeback/dispute events unhandled → entitlement stays active after money is clawed back
- **Where:** `supabase/functions/stripe-webhook/index.ts` dispatcher (1046–1069) handles only `checkout.session.completed`, `customer.subscription.updated|deleted`, `charge.refunded`.
- **What:** `charge.dispute.created` / `charge.dispute.closed` are not handled at all. On a card chargeback the customer keeps their featured placement / paid days / subscription coverage while the funds are reversed. `charge.refunded` is handled but only logs to `paid_listing_refunds` (by design — "no auto day-reversal") and only matches individual-listing payments; a refunded *featured* purchase or *subscription* invoice leaves `is_featured`/coverage untouched.
- **Why it matters / failure scenario:** A user pays, gets the entitlement, files a chargeback (or requests a refund), keeps the entitlement, and the site eats both the loss and Stripe's dispute fee. Low frequency today but unbounded at 1,000 users and invisible to the owner.
- **Evidence:** Only three `event.type` branches exist; `grep` for `dispute` in `supabase/functions` returns nothing. `handleChargeRefunded` matches `paid_listing_payments.stripe_payment_intent_id` only and inserts a log row without touching `listings`/`featured_purchases`.
- **Fix prompt:** Add a `charge.dispute.created` handler that looks up the associated payment (via `payment_intent`/`charge`) across `paid_listing_payments`, `featured_purchases`, and subscription invoices, and revokes the matching entitlement (clear `is_featured`, cap `paid_until` to now, or mark the subscription for cascade-deactivate) plus notify admins. Decide product-side whether `charge.refunded` should also revoke featured/paid entitlement; if yes, extend `handleChargeRefunded` to cover featured/subscription charges. Verify with `stripe trigger charge.dispute.created`.

### [P2] Boost & concierge price IDs are hardcoded with no env override; client copy duplicates them (test/live drift)
- **Where:** `supabase/functions/_shared/stripe-prices.ts` (`CONCIERGE_PRICES`, `BOOST_PRICES` — hardcoded literals, no `Deno.env.get` fallback, unlike `LISTING_SUBSCRIPTION_PRICES`); duplicated client-side in `src/services/stripe.ts` (`CONCIERGE_PLANS`, `FEATURED_PLANS`).
- **What:** Only the listing-subscription prices read from env (`STRIPE_AGENT_PRICE_ID`, etc.); boost, featured, and concierge prices are baked-in literals. `MONETIZATION_LAUNCH_PLAN.md` §0.1 warns the subscription literals are "confirmed TEST-MODE ids"; the boost/concierge/featured literals carry no such override, so flipping to live-mode Stripe requires a code change + redeploy, not a secret change. The same IDs are copy-pasted into the client bundle, so any rotation must touch two files or checkout breaks (client sends one price, server table has another).
- **Why it matters / failure scenario:** If `STRIPE_API_KEY` is `sk_live` but these price IDs are test-mode, live checkout creation fails loudly for boost/concierge/featured (outage of those paid flows). Conversely a forgotten client update after a server rotation makes featured checkout charge the wrong price (feeds the P0). Config drift is exactly the class the launch plan flags as pre-launch-verify.
- **Evidence:**
  ```ts
  export const BOOST_PRICES = { "7day": { priceId: "price_1SzMw9JvRPzH20A9CJA2SQ87", ... } }; // no env
  export const CONCIERGE_PRICES = { tier1_quick: "price_1T5TvZ...", ... };                    // no env
  // vs
  export const LISTING_SUBSCRIPTION_PRICES = { agent: Deno.env.get("STRIPE_AGENT_PRICE_ID") || "..." };
  ```
- **Fix prompt:** Give boost/featured/concierge prices the same `Deno.env.get(...) || <fallback>` treatment as `LISTING_SUBSCRIPTION_PRICES` in `_shared/stripe-prices.ts`, and add the new secrets to `MONETIZATION_LAUNCH_PLAN.md` §0.2. For the client duplication, prefer resolving the price server-side (see P0 fix) so `src/services/stripe.ts` no longer needs to hold price IDs at all. Verify each paid flow creates a session with live-mode keys after only setting env secrets (no code edit).

### [P2] Double-clicked subscription checkout can create a second Stripe subscription with no DB row (double charge)
- **Where:** `supabase/functions/create-listing-subscription-checkout/index.ts` (existing-sub guard 99–124, no in-flight/session lock); webhook `handleListingSubscriptionCheckout` idempotency is per `stripe_subscription_id` (806–814); DB `idx_listing_subscriptions_one_active_per_user` partial-unique index.
- **What:** The endpoint blocks a user who already has an active/`past_due`/`pending` row, but a user with *no* subscription who double-clicks (or retries a slow request) creates two Checkout Sessions. If both complete, the webhook fires twice with two different `stripe_subscription_id`s → two inserts. The second insert violates the one-active-per-user partial-unique index and fails; per the P1 finding that error is logged and swallowed. Result: the customer is billed for two live Stripe subscriptions but only one is recorded, and the orphaned one is never cancelled by the app.
- **Why it matters / failure scenario:** Double-charged customer, silent orphan subscription accruing monthly charges with no coverage record and no cancel path except manual Stripe work. Individual-listing checkout has the same no-lock property (two payments → two charges), though there both charges at least produce ledger rows.
- **Evidence:** No idempotency key / pending-session row is created at checkout time (unlike featured/boost, which insert a `pending` `featured_purchases` row guarded by a unique index). The unique index only catches the *second webhook*, after the second charge already happened.
- **Fix prompt:** Add a pre-checkout lock: either create a `pending` `listing_subscriptions` row (or a short-lived `subscription_checkout_attempts` row) keyed uniquely per user before creating the Stripe session and reuse/block on it, or set an idempotency key on `stripe.checkout.sessions.create`. In the webhook, when the one-active-per-user insert conflicts, cancel the just-created duplicate Stripe subscription (`stripe.subscriptions.cancel`) and alert. Verify by firing two subscription checkouts for one user and confirming only one live Stripe sub survives.

### [P2] `create-boost-checkout` performs no caller authentication
- **Where:** `supabase/functions/create-boost-checkout/index.ts` (whole handler — no `Authorization` read, no `auth.getUser`); charged/owner user is taken from `listing.user_id`.
- **What:** Unlike every other checkout function, boost does not verify a JWT or ownership. Any anonymous caller can create a boost Checkout Session for any `listing_id`; the session's metadata `user_id` is set to the listing owner. (The endpoint is presumably reachable because boost links are sent by SMS, but it is not the token-gated `pay-listing-link` pattern.)
- **Why it matters / failure scenario:** No direct money loss to the site (the caller pays), but it allows griefing/spam of Stripe session creation against arbitrary listings and creates `pending` `featured_purchases` rows on listings the caller doesn't own, which then block the real owner's boost (`existingPurchase` guard). Also a Stripe API-cost amplification vector.
- **Evidence:** The function reads `{ listing_id, plan, is_commercial } = await req.json()` with no auth header check anywhere; contrast `create-checkout-session`/`create-concierge-checkout` which call `supabaseAuth.auth.getUser()` first. (Security track owns the broader edge-function auth matrix; noted here for the money path.)
- **Fix prompt:** Require authentication and ownership (or admin) in `create-boost-checkout`, matching `create-checkout-session`: read the `Authorization` header, resolve the user, and verify `listing.user_id === user.id || isAdmin` before creating the session. If boost must stay reachable from an unauthenticated SMS tap, move it behind the signed-token pattern used by `pay-listing-link`. Verify an anonymous request is rejected 401.

### [P3] Payment/expiry reminders bucket "expires today" by UTC day, not America/New_York
- **Where:** `supabase/functions/send-paid-listing-reminders/index.ts` (`isoStartOfUtcDay`/`isoEndOfUtcDay`, trial/paid/deactivation windows 168–275); the Shabbat skip uses NY time (`todayInNY`).
- **What:** Expiry-window matching uses UTC midnight boundaries while the business day and the Shabbat guard use America/New_York. A listing whose `paid_until`/`trial_started_at+14d` falls, say, at 8pm ET (00:00 UTC next day) is bucketed into the following UTC day, so the "expires today"/"3 days away" SMS can fire a day early or late relative to the customer's local calendar. Actual entitlement enforcement is exact-timestamp (`paid_until < now()`), so no over/under-granting — only reminder timing drift.
- **Why it matters / failure scenario:** Cosmetic-to-mild: a customer gets "expires today" when it expires tomorrow (or vice versa). Not a money bug, but erodes trust on the exact flow meant to drive renewals.
- **Evidence:** `isoStartOfUtcDay(offset)` sets `d.setUTCHours(0,0,0,0)`; the same file's `todayInNY()` uses `timeZone:'America/New_York'`, so the two notions of "day" disagree by up to 5 hours.
- **Fix prompt:** Compute the target day window in America/New_York (derive the NY-local date, then convert its 00:00 and 23:59:59 to UTC instants) for the trial/paid/deactivation matches, consistent with the Shabbat guard. Verify with a listing whose `paid_until` is set to an evening-ET instant and confirm the reminder fires on the intended NY calendar day.

### [P3] Concierge subscription flips to `cancelled` immediately on `cancel_at_period_end`, before the paid period ends
- **Where:** `supabase/functions/stripe-webhook/index.ts` `handleSubscriptionUpdate` concierge branch `computeUpdate()` (462–484); `supabase/functions/update-concierge-subscription/index.ts` (~238 sets DB `status:'cancelled'` at cancel time).
- **What:** For `concierge_subscriptions`, `cancel_at_period_end === true` maps straight to `status='cancelled'` (with `cancelled_at=now`), even though the customer has paid through `current_period_end`. The parallel `listing_subscriptions` branch deliberately does the opposite (keeps `active` until `customer.subscription.deleted` at period end — see the in-code comment lines 509–538). So concierge coverage/status reads as cancelled while the user is still entitled.
- **Why it matters / failure scenario:** A tier2/tier3 concierge subscriber who cancels immediately sees "cancelled" and any status-gated concierge behavior may stop early, despite having paid for the remainder of the month. Inconsistent with the (correct) listing-subscription handling. Low blast radius given concierge volume.
- **Evidence:**
  ```ts
  if (subscription.cancel_at_period_end === true) { update.status = 'cancelled'; update.cancelled_at = now; }
  ```
  vs the listing_subscriptions branch which keeps `active`/`trial` in the same condition.
- **Fix prompt:** Align the concierge branch with the listing-subscription semantics: on `cancel_at_period_end=true` with a still-active Stripe status, keep `status='active'` (record the pending cancel via `cancelled_at`/a `cancel_scheduled` flag) and only move to `cancelled` on `customer.subscription.deleted`. Update any concierge status consumers accordingly. Verify by scheduling a cancel and confirming coverage persists until period end.

## Non-findings (checked and confirmed healthy)

- **Webhook signature verification is correct.** `stripe-webhook` reads the raw body via `req.text()` before parsing and verifies with `constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider)`; missing/invalid signatures return 400 and no handler runs. `verify_jwt=false` is correctly set in `config.toml` (the signature is the auth).
- **Most checkout endpoints resolve price/amount server-side.** boost (`BOOST_PRICES[plan]`), concierge (`CONCIERGE_PRICES[tier]`), listing-subscription (`LISTING_SUBSCRIPTION_PRICES[plan]`), and individual-listing (`INDIVIDUAL_LISTING_PACKAGES.find(...).{first_time,renewal}_cents`) never take an amount or price from the client. Only featured (`create-checkout-session`) is exposed — see P0.
- **Client tampering with payment columns is blocked at the DB.** `monetization_payment_guard` reverts non-admin writes to `payment_kind/trial_started_at/paid_until/paused_paid_days` on UPDATE and constrains them on INSERT; the privileged-profile guard blocks `is_admin` self-escalation. (The guard is *too* aggressive for `legacy_free` — see P1 #3.)
- **Featured-purchase double-submit is structurally prevented.** `idx_featured_purchases_one_active_per_listing` (partial unique on `status IN pending/paid/active`) plus the `23505`-catch in the checkout functions stop two concurrent featured/boost purchases for one listing.
- **One active subscription per user is enforced.** `idx_listing_subscriptions_one_active_per_user` (partial unique on active/admin_active/past_due) prevents duplicate active subscription rows (the gap is the orphaned Stripe sub in P2 #3, not a duplicate DB row).
- **Subscription status → coverage mapping is internally consistent.** The webhook (`COVERING=['active','admin_active','trial','past_due']`), `auto_inactivate_old_listings` (branch 4, past_due = covered, terminal `unpaid`→`expired`), the cap trigger, and `cascade-deactivate-subscription` all agree that `past_due` keeps coverage and `expired`/`cancelled` do not.
- **Missed-webhook reconciliation exists for the deactivation direction.** If the webhook's cascade-deactivate HTTP call fails, the hourly `auto_inactivate_old_listings` cron independently deactivates rentals whose subscription is no longer covering (branch 4) and exhausted paid balances (branches 2/6), so a listing cannot stay live-without-coverage indefinitely. (The *grant* direction has no such safety net — see P1 #2.)
- **Featured expiry closes the revenue-leak loop.** `expire_featured_listings()` (hourly cron, covers both `listings` and `commercial_listings` after the July‑2 wiring fix) clears `is_featured` and expires `featured_purchases` once `featured_expires_at`/`featured_end` passes, so a listing cannot stay featured forever after a boost ends.
- **Approval re-anchors the paid clock correctly and won't free-activate unpaid listings.** `approve-listing` sums the `paid_listing_payments` ledger at approval, stamps `trial_started_at`/`paid_until` from approval time, and (audit M2) keeps a `pending_payment` listing `is_active=false` when no payment exists — no free 30-day freshness window.
- **Success pages do not grant entitlement (no client-side double-grant).** `BoostSuccessPage`, `ConciergeSuccess`, `ListingPaymentSuccess`, and the Dashboard success-param handling only read/display; all entitlement writes go through the webhook. So there is no "success URL grants + webhook grants" double-grant race — the risk is the opposite (webhook-only, P1 #2).
- **Day math uses UTC-consistent arithmetic for enforcement.** `paid_until`/trial comparisons are instant-based (`new Date(paid_until) > now`), so there is no off-by-one in actual expiry enforcement; the only timezone issue is reminder bucketing (P3 #1).
- **Upgrade proration is delegated to Stripe correctly.** `upgrade-listing-subscription` uses `proration_behavior:'always_invoice'` on the agent→vip item swap and refuses to free-flip comped (no-Stripe) subscriptions, closing the free-upgrade loophole; the webhook reconciles plan/cap from the price IDs afterward.
- **`pay-listing-link` token replay is bounded.** The signed token only opens a fresh Stripe Checkout the visitor must actively complete (never a silent charge), is limited to approved listings, and any completed payment only extends the owner's own listing — the in-code L2/L3 audit notes hold up.
