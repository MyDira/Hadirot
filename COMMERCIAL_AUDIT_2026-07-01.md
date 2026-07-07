# Commercial Listings — Production-Readiness Audit (July 1, 2026)

**Auditor:** Claude (fresh, skeptical, evidence-based pass — no prior audit trusted)
**Code audited:** branch `claude/commercial-launch-fixes` (14 commits ahead of `main`, worktree `admiring-brahmagupta-3f7aa1`, HEAD `9267646`), compared against `origin/main` (`1a50b31`) and against the **live production database** (project `pxlxdlrjmrkxyygdhvku`).
**Method:** read-only. Every DB claim below was verified with SELECT-only queries via `pg` + `SUPABASE_DB_URL`; every code claim cites file:line. No code, data, or deploys were changed.

---

## Executive summary

The branch's four migrations **are already applied to live prod** and are correct. The client-side commercial experience (browse, detail, favorites, contact form, wizard, dashboard, admin pending queue) is genuinely close to residential parity and `npm run build` passes.

But the system is **not launchable today** for three structural reasons:

1. **None of the five commercial-critical edge functions on the branch are deployed.** Prod runs main's versions (proven by deploy timestamps matching main's commit dates). Live prod today: commercial contact SMS is rejected, the boost page 404s for commercial ids, approval doesn't start the lifecycle clock.
2. **Commercial listings never expire.** The commercial auto-inactivate/auto-delete SQL functions exist in prod but have **zero callers** — the pg_cron jobs call the residential-only functions, and nothing schedules the edge functions that would call the commercial ones. Same for featured expiry: `expire_featured_listings()` only touches `listings`.
3. **The renewal-SMS reply loop is broken for commercial** in both the deployed and branch code: it selects a `location` column that does not exist on `commercial_listings`, so every commercial YES/NO renewal reply errors out silently.

**VERDICT (one line): ~65% production-ready — the storefront works, the back-of-house automation doesn't; deploy the 5 edge functions, wire the commercial cron/lifecycle, and fix the renewal-webhook `location` bug before flipping the switch.**

---

## Verification method & honest limits

**What I did (proven, not inferred):**
- Read the full branch diff (`origin/main...origin/claude/commercial-launch-fixes`, 32 files) plus the complete current source of: `commercialListings.ts`, `BrowseListings.tsx`, `CommercialListingDetail.tsx`, `CommercialListingCard.tsx`, `CommercialContactForm.tsx`, `listingContact.ts`, `useBrowseFilters.ts`, `PostCommercialListing.tsx` (submit path), `PostListingWizard.tsx` (commercial submit), and targeted reads of `Dashboard.tsx`, `AdminPanel.tsx`, `Home.tsx`, `InternalAnalytics.tsx`, `ListingsMapEnhanced.tsx`, `MobileMapCommercialPopup.tsx`, and 12 edge functions.
- Ran ~40 read-only SQL probes against **live prod**: `information_schema.columns`, `pg_policies`, `pg_constraint`, `pg_proc` (function source), `pg_indexes`, `pg_class.relrowsecurity`, `cron.job`, storage policies, grants, and real row counts.
- Verified edge-function **deployment state** with `supabase functions list --project-ref pxlxdlrjmrkxyygdhvku` and correlated each `UPDATED_AT` with `git log origin/main` per function directory.
- Ran `npm run build` on the branch worktree — **green (exit 0)**.

**Honest limits — what I could NOT verify:**
- I cannot read the *source* of deployed edge functions; deployment state is inferred from version timestamps aligning (within 0–6 days) with main's last commit per function. This alignment held for all 12 functions checked, so confidence is high.
- Prod has **0 `commercial_listings` rows**, so no behavior could be observed against real commercial data (views moving, SMS flows firing, RLS in anger). All runtime behavior is derived from code + schema.
- No browser/E2E test was run (audit was requested read-only; no listing data exists to browse anyway).
- Stripe checkout was not exercised (would create real objects).
- I did not audit `EditCommercialListingWizard.tsx` line-by-line (spot-checked: loads via service, saves via `updateCommercialListing`, RLS enforces ownership).

**Note on `schema_migrations`:** prod's `supabase_migrations.schema_migrations` records nothing after `20260624000000`, yet all four branch migrations ARE live. This project applies SQL directly (per its runbook), so that table is not a reliable ledger — every migration claim below was verified by probing the actual objects.

---

## Prod DB ground truth (verified 2026-07-01)

| Check | Result |
|---|---|
| `commercial_listings.sale_status` (enum `sale_status`) | ✅ exists |
| `listing_contact_submissions.commercial_listing_id` + nullable `listing_id` + `exactly_one` CHECK | ✅ exists |
| `increment_commercial_listing_views(uuid)` SECURITY DEFINER, EXECUTE granted to anon+authenticated | ✅ exists |
| `featured_purchases.is_commercial` + FK dropped | ✅ |
| FKs dropped on `sms_messages`, `short_urls`, `listing_renewal_conversations` | ✅ (0 rows in `pg_constraint`) |
| `get_owner_listing_inquiry_counts` / `get_listing_inquiries` commercial-aware + granted | ✅ |
| `commercial_listings_browse_idx (listing_type, is_active, approved, created_at DESC)` | ✅ |
| Image SELECT policies require `approved = true` (both `listing_images` and `commercial_listing_images`) | ✅ |
| RLS enabled on all 8 relevant tables | ✅ |
| Rows: commercial_listings **0**, commercial_listing_images 0, commercial_favorites 0; residential live 278 | — |
| `admin_settings`: rental_active_days 40, sale_active_days 65, featured_duration_days 30 | — |

---

## Findings

### 🔴 B-1 — Commercial listings never auto-expire, and are never cleaned up
- **Source (proven in prod):** `cron.job` rows 1 & 2 run `select deactivate_old_listings()` / `select delete_very_old_listings()`; their `prosrc` calls only `auto_inactivate_old_listings()` / `auto_delete_very_old_listings()`, which touch **only `listings`**. `auto_inactivate_old_commercial_listings()` and `auto_delete_very_old_commercial_listings()` exist in prod but a `pg_proc` search for callers returns **0 rows**, and no `cron.job` invokes them. The edge functions that *would* call them ([inactivate-old-listings/index.ts:31](supabase/functions/inactivate-old-listings/index.ts:31), [delete-old-listings/index.ts:31](supabase/functions/delete-old-listings/index.ts:31)) are deployed but **nothing schedules or invokes them** (no cron http_post, no client caller in `src/`).
- **What breaks:** a commercial listing approved once stays publicly live forever. Renewal-reminder SMS (which keys off `expires_at` − 5 days) still fires — telling owners to renew a listing that would never have expired — and deactivation emails never fire (they key off `deactivated_at`, which is never set). Stale inventory accumulates unboundedly.
- **Residential parity:** residential expiry runs nightly via cron and works.
- **Fix (smallest):** update cron jobs 1 & 2 to also `SELECT auto_inactivate_old_commercial_listings();` / `SELECT auto_delete_very_old_commercial_listings();` (or repoint them at the two edge functions, which already handle both).

### 🔴 B-2 — All five commercial-critical edge functions changed on the branch are NOT deployed
- **Source (proven):** `supabase functions list` UPDATED_AT vs `git log origin/main` per function: `get-boost-listing` deployed **2026-02-24** (=main's last commit), `send-listing-contact-sms` **2026-04-23** (=main), `create-boost-checkout` **2026-04-26** (=main), `approve-listing` & `stripe-webhook` **2026-06-10** (=main's 06-04/06-09 commits). All branch commits are 06-30/07-01.
- **What breaks in prod today (main's deployed behavior):**
  - Commercial contact: the client ([listingContact.ts:57-67](src/services/listingContact.ts)) sends `commercialListingId`; main's deployed function requires `listingId` → **400 "Missing required fields"; the entire commercial contact/callback loop is dead**. Even if it got through, main's version inserts `listing_id = <commercial id>` into `listing_contact_submissions` (FK to `listings` still exists → insert violates FK) and builds short links to `/commercial/{id}`, which is **not a route** (routes are `/commercial-listing/:id`, [App.tsx:115](src/App.tsx:115)).
  - Boost: deployed `get-boost-listing` queries only `listings` → `/boost/{commercial-id}` shows "This listing could not be found"; deployed `create-boost-checkout`/`stripe-webhook` would feature the wrong table.
  - Approval: deployed `approve-listing` sets only `{approved, is_active}` for commercial — no `last_published_at`/`expires_at` anchor (the branch's B6 fix, [approve-listing/index.ts:114-151](supabase/functions/approve-listing/index.ts:114)).
- **Residential parity:** residential paths in the deployed versions work; the branch's changes are additive/branched, so deploying is low-risk for residential (verified: residential branches byte-identical in diff).
- **Fix:** deploy `approve-listing`, `stripe-webhook`, `send-listing-contact-sms`, `create-boost-checkout`, `get-boost-listing` together at launch. Until then, note that `/post-commercial` is live (see M-6) while its downstream plumbing is broken.

### 🔴 B-3 — Renewal-SMS replies fail for commercial: query selects a column that doesn't exist
- **Source:** [handle-renewal-sms-webhook/index.ts:367-379](supabase/functions/handle-renewal-sms-webhook/index.ts:367) — `fetchListingForConv` default select is `"id, listing_type, location, full_address, neighborhood, price, expires_at"` (+ `commercial_space_type` when commercial), executed against `commercial_listings` for commercial conversations. **Prod probe: `commercial_listings` has no `location` column** (count = 0). Same hard-coded `location` in the batch-advance select at line 1230. This code is identical on main and the branch — the branch did NOT fix it — and the deployed version (2026-04-17 = main) has it.
- **What breaks:** the owner gets the renewal reminder ("Is your listing still available? Reply YES or NO"), replies YES/NO — the handler hits a PostgREST `42703` error at [line 1194-1201](supabase/functions/handle-renewal-sms-webhook/index.ts:1194) and returns empty TwiML: **no renewal, no deactivation, no reply, silent dead end**. In mixed residential+commercial reminder batches (they are combined in `send-renewal-reminders`), the batch chain stalls when the next item is commercial.
- **Residential parity:** residential replies work (`listings.location` exists). The RENTED-reply and callback flows are unaffected (their call sites pass explicit safe column lists, lines 690/728/790/812/1413/1474).
- **Fix:** make the default select conditional (drop `location`, use `full_address` for commercial) in `fetchListingForConv` and the line-1230 select; redeploy.

### 🟠 M-1 — Paid commercial boosts never expire on the listing row
- **Source (proven in prod):** `expire_featured_listings()` prosrc updates **only `listings`** (and `featured_purchases`, which is fine since it's table-level). The hourly cron job 18 therefore never clears `commercial_listings.is_featured/featured_expires_at`. The card badge checks `is_featured` alone ([CommercialListingCard.tsx:483](src/components/listings/CommercialListingCard.tsx:483)), as does the detail badge ([CommercialListingDetail.tsx:967](src/pages/CommercialListingDetail.tsx:967)).
- **What breaks:** a $25/week boost shows the "Featured" badge **forever** in cards and on the detail page after expiry. (Featured-only queries, the admin count, and map-pin highlighting are expiry-aware and unaffected — [ListingsMapEnhanced.tsx:257](src/components/listings/ListingsMapEnhanced.tsx:257).)
- **Residential parity:** residential rows are cleared hourly.
- **Fix:** add the identical `UPDATE commercial_listings …` block to `expire_featured_listings()`.

### 🟠 M-2 — Commercial pagination is broken by design (duplicates across pages; fake page count)
- **Source:** [BrowseListings.tsx:264-360](src/pages/BrowseListings.tsx:264) — commercial is always fetched with `applyPagination=false` (ALL matching rows), `totalCount = residentialCount + allCommercial.length`, then **all** commercial items are merged into **every** page. Same pattern in [BrowseSales.tsx:235-318](src/pages/BrowseSales.tsx:235).
- **What breaks:** mixed mode: page 1 shows 20 residential + ALL commercial; page 2 shows the next 20 residential + the SAME commercial cards again. Commercial-only mode: pagination buttons render (`totalPages` from count) but every "page" shows all listings. Additionally, `merged.sort` at line 348 re-orders the woven featured-injection sequence, so paid residential featured placement is lost whenever the merged list renders.
- **Residential parity:** **this logic is identical on `origin/main`** (verified line-for-line) — inherited, not a branch regression — and the featured-injection scrambling affects residential mixed browse on prod today. Tolerable at launch volume (a handful of commercial listings), wrong at scale.
- **Fix:** paginate the merged stream server-side (or slice commercial per page and compute a real combined offset); apply `merged.sort` only to non-featured items.

### 🟠 M-3 — Map popups always show a stock photo for commercial listings
- **Source:** [ListingsMapEnhanced.tsx:295](src/components/listings/ListingsMapEnhanced.tsx:295) and [MobileMapCommercialPopup.tsx:124](src/components/listings/MobileMapCommercialPopup.tsx:124) read `(listing as any).commercial_listing_images` — but the service returns images under the alias `listing_images` ([commercialListings.ts:96](src/services/commercialListings.ts:96); type at [config/supabase.ts:437](src/config/supabase.ts:437)). The property is always `undefined`, so `computePrimaryListingImage(undefined, …)` returns a stock image with a "Stock photo" overlay.
- **What breaks:** every commercial map popup (desktop popup and mobile bottom sheet) shows a stock photo labeled "Stock photo" even when the listing has real photos. Cards and detail pages are unaffected.
- **Residential parity:** residential popups use the correct key.
- **Fix:** change both reads to `listing.listing_images`.

### 🟠 M-4 — Admin cannot manage a LIVE commercial listing from the admin panel
- **Source:** [AdminPanel.tsx](src/pages/AdminPanel.tsx) — commercial appears only in stats (lines 336-354) and the pending-approval queue (396-417, approve/reject at 805-833). The main listings-management table (search by name, activate/deactivate, feature, delete) queries only `listings`. `stripeService.adminGrantFeature` is hard-coded to `listings` ([stripe.ts:169-199](src/services/stripe.ts:169)).
- **What breaks:** once approved, a commercial listing cannot be found, toggled, featured, or deleted from `/admin`. The only lever is visiting `/commercial-listing/:id` directly, whose owner/admin banner offers Edit/Unpublish/Delete ([CommercialListingDetail.tsx:266-468](src/pages/CommercialListingDetail.tsx:266)) — but **no admin grant/remove featured for commercial exists anywhere**.
- **Residential parity:** residential has full admin management + featured grant.
- **Fix:** include commercial in the admin listings table (kind flag) and branch `adminGrantFeature` on `is_commercial`.

### 🟠 M-5 — Admin analytics dashboard excludes commercial entirely
- **Source:** [InternalAnalytics.tsx:114-135](src/pages/InternalAnalytics.tsx:114) calls `analytics_*` RPCs; prod probe: only 6 functions in `public` mention "commercial", and none are `analytics_*`. `analytics_inquiry_listings_performance_dual` joins `listings` (proven), `analytics_supply_stats` has no commercial branch. Aggregate inquiry counts (`analytics_inquiry_overview_dual`) count ALL `listing_contact_submissions` rows — commercial inquiries inflate the totals but can never appear in per-listing views.
- **What breaks:** commercial views/impressions/inquiries/top-listings are invisible in `/admin` analytics; total-inquiry numbers won't reconcile with the per-listing table once commercial inquiries exist.
- **Residential parity:** fully covered.
- **Fix (smallest):** extend the two "dual" inquiry RPCs and `analytics_supply_stats` to union `commercial_listings`.

### 🟠 M-6 — Launch gating is inconsistent: the legacy posting page is publicly reachable TODAY
- **Source:** wizard cards are gated (`active: false`, "Coming Soon" — [PathPicker.tsx:30-42](src/pages/postListingWizard/PathPicker.tsx:30)), but `/post-commercial` is a plain route ([App.tsx:110](src/App.tsx:110)) gated only by login ([PostCommercialListing.tsx:118-121](src/pages/PostCommercialListing.tsx:118)).
- **What breaks:** anyone with the URL can post a commercial listing on prod **now**; it lands in the admin pending queue (visible), and if approved, hits every B-2 broken deployed path (dead contact form, broken boost page). The migration's "deploy-dark safe: commercial posting is still gated off in the UI" claim is only true for the wizard.
- **Fix:** gate `/post-commercial` behind the same launch switch (or redirect to the wizard until launch).

### 🟡 m-1 — Approval email links commercial owners to the wrong route
[approve-listing/index.ts:306](supabase/functions/approve-listing/index.ts:306): `listingUrl = ${siteUrl}/listing/${id}` for both kinds → commercial owners' "View Live Listing" lands on the residential detail page → "Listing not found". Fix: branch on `isCommercial` → `/commercial-listing/`.

### 🟡 m-2 — Commercial is absent from every digest/report where residential appears
Proven by grep of deployed-current sources: `send-enhanced-digest` (subscriber digest) — zero commercial handling; `send-daily-admin-digest` queries `from("listings")` only ([index.ts:190-210](supabase/functions/send-daily-admin-digest/index.ts:190)); `send-weekly-performance-reports` queries `from('listings')` only ([index.ts:101](supabase/functions/send-weekly-performance-reports/index.ts:101)). Commercial owners get no weekly report; commercial listings never appear in digests. (Deactivation emails and renewal reminders DO include commercial — verified.)

### 🟡 m-3 — Featured commercial listings have no home-page surface
[Home.tsx:79-99](src/pages/Home.tsx:79) loads `listingsService.getActiveFeaturedListings` (residential) only. A commercial boost buys placement in browse/map only — weaker value than the residential product implies.

### 🟡 m-4 — No boost entry point on the owner dashboard for commercial
[Dashboard.tsx:1091](src/pages/Dashboard.tsx:1091): `canGetFeatured = !isCommercial && …` — the "Get Featured" primary action is residential-only. Commercial boost is reachable only via the SMS upsell link or a hand-typed `/boost/{id}` URL.

### 🟡 m-5 — Sold/in-contract commercial sales look "For Sale" on cards
`CommercialListingCard` never renders `SaleStatusBadge` (residential card does at [ListingCard.tsx:334-337](src/components/listings/ListingCard.tsx:334)); `getCommercialSaleListings` doesn't exclude or deprioritize `sale_status='sold'`. Detail page does show the badge ([CommercialListingDetail.tsx:973](src/pages/CommercialListingDetail.tsx:973)).

### 🟡 m-6 — Wizard image uploads fail silently; the temp→finalize pipeline is dead code
[PostListingWizard.tsx:572-583](src/pages/postListingWizard/PostListingWizard.tsx:572) uploads images AFTER creating the listing and swallows per-file failures (console + Sentry only) → a listing can enter the approval queue with zero photos despite the "at least 1 photo" UI. Also: `uploadTempCommercialListingImage`/`finalizeCommercialTempImages` and the deployed `move-temp-commercial-images` edge function have **no callers** — both posting paths upload directly. (Residential uses a temp→finalize flow.)

### 🟡 m-7 — Commercial impressions are never tracked; owner sees "Impressions: 0" forever
By design, commercial cards are excluded from `useListingImpressions` ([BrowseListings.tsx:122-124](src/pages/BrowseListings.tsx:122), comment in [Favorites.tsx](src/pages/Favorites.tsx)) and no other impression path exists — yet the owner banner and dashboard display an Impressions stat ([CommercialListingDetail.tsx:373-378](src/pages/CommercialListingDetail.tsx:373)). Views/direct_views DO work (RPC verified live + granted).

### 🟡 m-8 — Commercial image delete never removes the storage object; delete-cleanup targets a nonexistent bucket
`deleteCommercialListingImage` passes the full public **URL** to `storage.remove()` ([commercialListings.ts:733-752](src/services/commercialListings.ts:733)) — remove expects a path, so the object is orphaned (error only logged). Separately, `auto_delete_very_old_commercial_listings` deletes from bucket `commercial-listing-images` with prefix `{id}/%`, but commercial images actually live in bucket `listing-images` under `commercial/{listingId}/…` ([commercialListings.ts:692](src/services/commercialListings.ts:692)) — cleanup is a no-op (moot until B-1 is fixed, but fix together).

### 🟡 m-9 — Filter UI can't select several legitimate stored values
Wizard writes `percentage`, `absolute_net`, `tenant_electric` lease types and `vanilla_box`, `cold_dark_shell` conditions ([Step4CommercialSpaceDetails.tsx:29-45](src/pages/postListingWizard/steps/commercial/Step4CommercialSpaceDetails.tsx:29)); the filter modals offer only 5 lease types / 4 conditions ([MoreFiltersModal.tsx:93-115](src/components/listings/MoreFiltersModal.tsx:93)). Listings with the missing values still appear unfiltered but can never be targeted. (All values that ARE offered match the stored values exactly — verified case-sensitively; the old broken `retail`/`NNN`/`Built Out` values are fixed.)

### 🟡 m-10 — SMS space-type labels missing for real types
`formatSpaceType` in `send-listing-contact-sms`/`send-renewal-reminders`/`handle-renewal-sms-webhook` lacks `community_facility` and `basement_commercial` → owner SMS reads "…about your Community_facility at …".

### 🟡 m-11 — Dashboard "Republish"/renew doesn't respect commercial sale_status
`handleRenewCommercialListing` ([Dashboard.tsx:630-643](src/pages/Dashboard.tsx:630)) never passes `sale_status`, and `renewCommercialListing` has no sold-guard — a **sold** commercial sale can be republished with a full fresh window. Residential renewal blocks sold ([listings.ts:1908](src/services/listings.ts:1908)).

### ⚪ Polish
- Detail-page view RPC fires for owners/admins and pending listings (inflates `views` slightly).
- `getCommercialFavorites` filters `is_active` but not `approved` (only the owner's own pending listing could surface — RLS blocks everyone else). Card image sort mutates props array.
- Browse headers still say "Rentals" / "Browse Properties for Rent" while commercial is mixed in.
- Owner confirmation email copy ("**{userName} has posted a new listing**" sent TO the poster) reads like an admin notice ([PostListingWizard.tsx:609-620](src/pages/postListingWizard/PostListingWizard.tsx:609)).
- `get_user_lifetime_listing_count` (used by agent-free-posting) counts commercial listings — confirm that's intended before agents post commercial.
- SEO: neither detail page sets `document.title`/meta — **at parity** (both lack it).

---

## RESIDENTIAL-REGRESSION check (branch changes only)

**No residential regression found.** Specifically verified:

1. **Dropped FKs vs PostgREST embeds** — the classic silent breaker. Only one embed existed (`featured_purchases → listings(title,…)` in `stripeService.getUserPurchases`) and the branch's final commit (`9267646`) replaced it with manual id-batched lookups ([stripe.ts:135-166](src/services/stripe.ts:135)). Repo-wide grep found **no other** `listings(...)` embeds from `sms_messages`, `short_urls`, `listing_renewal_conversations`, or `featured_purchases` in src/ or functions/. `create_short_url(p_listing_id, …)` inserts without FK → unaffected.
2. **Tightened `listing_images` SELECT policy** (now requires `approved=true`): prod probe confirms owners keep access via `"Users can manage own listing images"` (ALL) and admins via the admin ALL policy — dashboards/edit/pending-queue unaffected. Only anonymous URL access to unapproved listings' image *rows* is cut (that was the point). Storage objects remain public-read (pre-existing).
3. **`listing_contact_submissions.listing_id` made nullable** — the residential edge-function insert always sets it; analytics count queries are null-safe; the new CHECK enforces exactly-one.
4. **Inquiry RPCs** — residential branches byte-identical (UNION adds commercial); verified in deployed prod prosrc.
5. **`stripe-webhook` / `create-boost-checkout` / `get-boost-listing`** — `is_commercial` defaults false for legacy sessions/callers; residential path unchanged.
6. **Mobile browse** — `MobileListingCarousel` was replaced by a vertical stacked list (commit `a9aa16f`, intentional B5 change). Verify UX acceptance, but it's deliberate, not accidental.
7. **Pre-existing (NOT caused by branch, present on main):** the `merged.sort` in `BrowseListings.loadListings` scrambles featured-injection order on mixed pages (see M-2), and the residential map-data over-fetch warnings. Flagged for completeness.

---

## What's solid — do not touch

- **All four branch migrations, applied and correct in prod** (columns, CHECK, RPCs, index, policies — every object probed).
- **RLS posture**: `commercial_listings` public SELECT requires `is_active AND approved`; images require approved parent; favorites are owner-scoped; contact submissions readable only by owner+admin (INSERT only via service role); `featured_purchases` owner/admin. RLS is *enabled* on all of them (`relrowsecurity=true`). No public path to unapproved data found.
- **Filter enum alignment**: every value the filter UI sends now exactly matches what the wizard writes (`storefront`, `community_facility`, `nnn`, `full_build_out`, `a/b/c`, …) — the June-audit blocker is genuinely fixed.
- **Contact plumbing (branch code)**: dual-column submission logging, polymorphic conversation rows (`is_commercial`), correct `/commercial-listing/` short links, RENTED/callback flows table-switch correctly (`getListingTable`), and `send-renewal-reminders`/`send-deactivation-emails`/`send-report-rented-sms` are commercial-aware **and already deployed at current versions**.
- **Boost chain (branch code)**: BoostListingPage → create-boost-checkout → stripe-webhook → `commercial_listings` featured fields → success page is internally consistent; the partial unique index enforces one active boost per listing across both kinds; commercial approval anchors the lifecycle clock (40/65 days from `admin_settings`).
- **Detail page**: comprehensive spec rendering with human labels for all ~60 fields, video support, zoom, similar-listings tiers, login-gated actions with OAuth replay, sticky contact card, view-count RPC with client fallback.
- **Dashboard & admin pending queue**: commercial fully interleaved (edit/unpublish/renew/delete/inquiries; approve/reject), inquiry RPCs live.
- **Indexes**: browse composite + lat/lng + neighborhood + space_type + phone_e164 partial — adequate for launch volume.
- **Build**: `npm run build` green on the branch.

---

## Minimum punch list to launch

1. **Deploy the 5 edge functions** (`approve-listing`, `stripe-webhook`, `send-listing-contact-sms`, `create-boost-checkout`, `get-boost-listing`). *(B-2)*
2. **Wire commercial lifecycle**: extend cron jobs 1 & 2 (or schedule the existing edge functions) to call the commercial inactivate/delete functions; add `commercial_listings` to `expire_featured_listings()`. *(B-1, M-1)*
3. **Fix + deploy `handle-renewal-sms-webhook`**: remove `location` from the commercial selects (lines 369, 1230). *(B-3)*
4. **Fix the map-popup image key** (`commercial_listing_images` → `listing_images`) in `ListingsMapEnhanced.tsx` and `MobileMapCommercialPopup.tsx`. *(M-3)*
5. **Fix the commercial approval-email link** to `/commercial-listing/`. *(m-1)*
6. **Decide the gate**: either gate `/post-commercial` until launch or accept that it's already open; flip PathPicker `active:true` only after 1–5 land. *(M-6)*
7. **Accept-or-fix for launch volume**: pagination duplicates (M-2), admin management of live commercial listings (M-4), analytics/digest exclusion (M-5, m-2). Fine for a soft launch with a handful of listings; not fine at scale.

**VERDICT: ~65% production-ready.** The user-facing surfaces are near parity and the DB is genuinely ready, but the automation layer (expiry, featured expiry, renewal replies) and the deployment gap mean flipping the switch today would strand every commercial listing in a broken lifecycle. Items 1–6 above are each small; with them done, readiness is ~90% for a low-volume launch.
