# Commercial Launch + SMS System Repair — Implementation Plan

> **For agentic workers:** Execute task-by-task with checkpoint commits (executing-plans flow). Steps use checkbox (`- [ ]`) syntax for tracking. Work in worktree `/Users/RachelMor/Desktop/Aharon/Hadirot/Hadirot/.claude/worktrees/admiring-brahmagupta-3f7aa1` (branch `claude/commercial-launch-fixes`). Migrations are applied to LIVE prod via the direct-pg runbook (SUPABASE_DB_URL in main repo `.env`, parse special-char password manually — NEVER `db push`), each only after explicit user go-ahead. Edge-function deploys are batched at the end of their phase.

**Goal:** Take commercial listings from ~65% to 100% production-ready AND restore the broken SMS reply system (renewal YES/NO, report-rented, callback RENTED) for both residential and commercial.

**Architecture:** Three repair layers, in dependency order: (A) SMS system restoration — one DB constraint fix + webhook/inbound repair + edge-fn hardening (this fixes *residential* prod today and is a prerequisite for commercial SMS flows); (B) commercial lifecycle automation in the DB (cron wiring, featured expiry, storage cleanup); (C) commercial client/edge parity fixes (deploy the 5 stranded functions, pagination, admin management, analytics, gating, and the minor-parity batch). The launch switch (PathPicker) flips **last**, after everything else is deployed and localhost-tested.

**Tech stack:** React+TS+Vite client, Supabase (Postgres RLS, pg_cron, Edge Functions/Deno), Twilio SMS, Stripe. No unit-test suite exists in this repo — the verification gates are `npm run build`, `npm run lint`, read-only SQL probes against prod, and scripted/manual E2E checks (each task states its own).

**Recommended model for implementation:** Opus 4.7 (multi-file, schema changes, edge functions, RLS).

---

## VERIFICATION FINDINGS (everything below was independently verified July 1–2, 2026)

**Against LIVE prod (`pxlxdlrjmrkxyygdhvku`, read-only pg over SUPABASE_DB_URL):**
- `listing_renewal_conversations_state_check` = `CHECK (state = ANY (ARRAY['pending','awaiting_availability','awaiting_hadirot_question','completed','timeout','expired_link','error']))` — the code writes 4 more states (`awaiting_report_response`, `callback_sent`, `awaiting_listing_selection`, `awaiting_disambiguation`, grep-verified across `supabase/functions/*/index.ts`). **SMS audit BUG #1 confirmed.**
- `sms_messages`: last inbound **2026-04-16**, 0 inbound in 60 days; outbound healthy through 2026-07-01 (398 contact, 126 boost-upsell, 112 renewal, 15 report-rented). **BUG #2 confirmed.** All-time conversations: renewal-type only (454 timeout / 115 completed / 14 pending / 11 stuck / 3 expired_link / 1 error); **zero** callback/report conversations ever; **zero** `action_taken='auto_deactivated'`.
- `supabase/config.toml` has NO `[functions.handle-renewal-sms-webhook]` entry (only send-deactivation-emails, stripe-webhook, pay-listing-link, geocode-cross-streets have `verify_jwt=false`) → a redeploy defaults to `verify_jwt=true`, which 401s Twilio's unauthenticated POSTs. Consistent with the Apr-16 death.
- `commercial_listings` has **no `location` column** → `handle-renewal-sms-webhook` `fetchListingForConv` default select (line ~369) and the batch-advance select (line ~1230) fail with 42703 for commercial conversations.
- Commercial lifecycle: `deactivate_old_listings()` / `delete_very_old_listings()` (cron jobs 1 & 2) call ONLY the residential functions; `auto_inactivate_old_commercial_listings()` / `auto_delete_very_old_commercial_listings()` exist with **zero callers**. `expire_featured_listings()` (cron job 18) updates only `listings`.
- The branch's 4 migrations (20260630000000 → 20260701010000) ARE applied to prod. All RLS verified sound.
- Edge deploy state: `approve-listing`, `stripe-webhook`, `send-listing-contact-sms`, `create-boost-checkout`, `get-boost-listing` deployed at **main's** versions (timestamps correlate with main's last commits) — none of the branch's commercial changes are live.
- `sms_admin_config` = `(id, admin_email, notify_on_errors, notify_on_unrecognized, notify_on_timeouts, …)`, 1 row — usable for failure alerts.
- Analytics RPC sources fetched (`analytics_supply_stats`, `analytics_zero_inquiry_listings`, `analytics_inquiry_listings_performance_dual`) — all residential-only; replacement SQL below is adapted from the real prod definitions.

**Code findings (file:line, current branch):** full inventory in `COMMERCIAL_AUDIT_2026-07-01.md` at repo root. Tasks below reference it as [AUDIT].

## CURRENT STATE ANALYSIS
Commercial browse/detail/favorites/contact/wizard/dashboard code is near parity and builds green, but: nothing expires commercial listings; five edge functions are stranded undeployed; SMS replies are dead platform-wide (constraint + webhook); map popups show stock photos; admin can't manage live commercial listings; analytics/digests exclude commercial; `/post-commercial` is publicly open while the wizard is gated.

## DUPLICATE / OVERLAPPING SYSTEMS CHECK
- Lifecycle: fix by **extending the existing cron-called SQL functions** — do NOT schedule the parallel `inactivate-old-listings`/`delete-old-listings` edge functions (that would create two competing schedulers).
- Impressions: commercial uses row columns (`views/impressions/direct_views`) as source of truth (per migration 20260630000000 design note) — extend that, don't bolt commercial onto the residential analytics-rollup pipeline.
- Boost: reuse `featured_purchases` + `is_commercial` discriminator already in prod; no new tables.
- Filters: extend `MoreFiltersModal`/`ListingFiltersHorizontal` constants; both desktop and mobile render through the same components (verified) — no separate mobile edit needed for filters.

## PROPOSED SOLUTION
Phases A→F below. A is independent and fixes live residential SMS today. B–E make commercial complete. F is the gated launch flip. Simplest-approach notes are inline per task.

## ASSUMPTIONS (product decisions embedded — flag to user if wrong)
1. **Mixed browse ordering (USER DECISION 2026-07-01):** residential and commercial are interleaved by the selected sort (newest by default), exactly like today's feel — NOT residential-first. Implementation: both kinds are already fully fetched for the map; the page content is derived by globally sorting the merged stream in memory and slicing per page (correct up to the Supabase row cap ~1000 actives, same cap that already governs today's map fetch — the existing truncation warning stays). Residential featured injection is preserved, and commercial featured listings JOIN the injection pool so a paid commercial boost genuinely reaches "top of search results".
2. **WhatsApp digest (USER DECISION 2026-07-01):** the admin WhatsApp digest system (DigestManager + digestService + WhatsAppFormatter) gains commercial support — commercial listing groups, commercial formatting (SF/space-type specs, `/commercial-listing/` links), and commercial-safe short URLs. The email `send-enhanced-digest` renderer keeps residential templates for now, but the WhatsApp path is fully commercial-capable. **Also folded in: a live regression fix** — `digest.ts:512` and `DigestManager.tsx:538` embed `short_urls!short_urls_listing_id_fkey`, an FK that migration 20260630010000 already dropped in prod, so digest group fetches are broken on prod main TODAY (found during this plan revision).
3. Sold commercial sale listings remain visible with a status badge (matches residential behavior).
4. Commercial impressions are tracked via a direct batch RPC into `commercial_listings.impressions` (Task E2), not via the analytics-events pipeline.
5. The SMS inbound outage may ALSO require Twilio-console fixes (webhook URL / A2P status) that cannot be done from the repo — operator checklist in Task A8.
6. `/post-commercial` gets gated behind the same launch flag as the wizard (redirect until launch).

## FILES TO MODIFY (master list)
- **Migrations (new):** `supabase/migrations/20260702000000_fix_sms_state_constraint.sql`, `20260702010000_commercial_lifecycle_wiring.sql`, `20260702020000_commercial_analytics_and_impressions.sql`
- **Edge fns:** `handle-renewal-sms-webhook`, `cleanup-expired-renewals`, `send-report-rented-sms`, `send-listing-contact-sms`, `send-renewal-reminders`, `approve-listing`, `send-daily-admin-digest`, `send-weekly-performance-reports` (+ already-changed-on-branch: `stripe-webhook`, `create-boost-checkout`, `get-boost-listing`)
- **Config:** `supabase/config.toml`
- **Client:** `src/components/listings/ListingsMapEnhanced.tsx`, `MobileMapCommercialPopup.tsx`, `MoreFiltersModal.tsx`, `ListingFiltersHorizontal.tsx`, `CommercialListingCard.tsx`, `src/pages/BrowseListings.tsx`, `BrowseSales.tsx`, `AdminPanel.tsx`, `Dashboard.tsx`, `Home.tsx`, `Favorites.tsx`, `PostCommercialListing.tsx`, `src/pages/postListingWizard/PathPicker.tsx`, `PostListingWizard.tsx`, `src/services/commercialListings.ts`, `src/services/stripe.ts`, `src/hooks/useCommercialImpressions.ts` (new), `src/config/launchFlags.ts` (new)

---

# PHASE A — SMS SYSTEM RESTORATION (fixes residential prod TODAY; prerequisite for commercial SMS)

### Task A1: Migration — fix the state CHECK constraint

**Files:** Create `supabase/migrations/20260702000000_fix_sms_state_constraint.sql`

- [ ] **Step 1: Write the migration**

```sql
/*
  # Fix listing_renewal_conversations state CHECK constraint (SMS audit BUG #1)

  The live constraint only allows the original 7 states. The code has written
  4 more since Jan 2026 (awaiting_report_response, callback_sent,
  awaiting_listing_selection, awaiting_disambiguation) — every report-rented
  and callback conversation insert has been silently rejected since inception.
  Verified against prod 2026-07-01: rolled-back test inserts violate the check.
*/
ALTER TABLE listing_renewal_conversations
  DROP CONSTRAINT IF EXISTS listing_renewal_conversations_state_check;

ALTER TABLE listing_renewal_conversations
  ADD CONSTRAINT listing_renewal_conversations_state_check
  CHECK (state = ANY (ARRAY[
    'pending', 'awaiting_availability', 'awaiting_hadirot_question',
    'completed', 'timeout', 'expired_link', 'error',
    -- states added by 20260119022052_add_sms_enhancements + later code:
    'awaiting_report_response', 'callback_sent',
    'awaiting_listing_selection', 'awaiting_disambiguation'
  ]::text[]));
```

- [ ] **Step 2: Apply to prod via the direct-pg runbook (user go-ahead first), then verify**

Verify query (read-only):
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conname='listing_renewal_conversations_state_check';
-- Expected: all 11 states present
BEGIN; INSERT INTO listing_renewal_conversations (phone_number, expires_at, state, conversation_type)
VALUES ('+10000000000', now(), 'callback_sent', 'callback'); ROLLBACK;
-- Expected: INSERT succeeds (then rolled back)
```

- [ ] **Step 3: Commit** — `db: allow all SMS conversation states in state CHECK (fixes report/callback DOA)`

### Task A2: Fix the `location` column bug in handle-renewal-sms-webhook (commercial replies die)

**Files:** Modify `supabase/functions/handle-renewal-sms-webhook/index.ts:367-379` and `:1228-1232`

- [ ] **Step 1: Make `fetchListingForConv` column-safe per table**

Replace the function body (line ~367) so the default select never references `location` for commercial:

```ts
async function fetchListingForConv(
  conv: RenewalConversation,
  selectFields?: string
): Promise<{ data: any; error: any }> {
  if (!conv.listing_id) return { data: null, error: null };
  const table = getListingTable(conv);
  // commercial_listings has NO `location` column — build per-table defaults.
  const fields = selectFields ?? (conv.is_commercial === true
    ? "id, listing_type, full_address, neighborhood, price, expires_at, commercial_space_type"
    : "id, listing_type, location, full_address, neighborhood, price, expires_at");
  return supabaseAdmin.from(table).select(fields).eq("id", conv.listing_id).maybeSingle();
}
```
(Note: callers that pass explicit `selectFields` like `"listing_type"` are already safe; the `extraFields` concatenation is replaced by the per-table defaults above — delete the old `extraFields` line.)

- [ ] **Step 2: Fix the batch-advance select at line ~1230**

```ts
const { data: nextListing } = await supabaseAdmin
  .from(getListingTable(nextConvTyped))
  .select(nextConvTyped.is_commercial === true
    ? "id, listing_type, full_address, neighborhood, price, commercial_space_type"
    : "id, listing_type, location, full_address, neighborhood, price")
  .eq("id", nextConvTyped.listing_id)
  .maybeSingle();
```
Check `formatListingIdentifier` tolerates a missing `location` key (it already handles commercial via `full_address` — verify while editing; if it dereferences `.location` unguarded, add `?? null`).

- [ ] **Step 3: `npm run build` in the worktree → green. Commit** — `fix(sms): commercial renewal replies no longer 42703 on nonexistent location column`

### Task A3: cleanup-expired-renewals — deactivate COMMERCIAL listings on report timeout

**Files:** Modify `supabase/functions/cleanup-expired-renewals/index.ts:55-75`

- [ ] **Step 1: Partition report-timeout ids by `is_commercial` and update both tables**

Replace the single `from("listings")` deactivation block:

```ts
const residentialIds = reportConversations
  .filter((c) => c.is_commercial !== true && c.listing_id)
  .map((c) => c.listing_id);
const commercialIds = reportConversations
  .filter((c) => c.is_commercial === true && c.listing_id)
  .map((c) => c.listing_id);

const deactivation = { is_active: false, deactivated_at: now, updated_at: now };

if (residentialIds.length > 0) {
  const { error } = await supabaseAdmin.from("listings").update(deactivation).in("id", residentialIds);
  if (error) console.error("Error auto-deactivating listings:", error);
  else autoDeactivatedCount += residentialIds.length;
}
if (commercialIds.length > 0) {
  const { error } = await supabaseAdmin.from("commercial_listings").update(deactivation).in("id", commercialIds);
  if (error) console.error("Error auto-deactivating commercial listings:", error);
  else autoDeactivatedCount += commercialIds.length;
}
```
(Ensure the conversation query above this block selects `is_commercial` — add it to the `.select(...)` if absent, and initialize `autoDeactivatedCount = 0` before the block.)

- [ ] **Step 2: Build green. Commit** — `fix(sms): report-timeout auto-deactivation covers commercial listings`

### Task A4: Harden senders — stop reporting success when the conversation insert fails

**Files:** Modify `supabase/functions/send-report-rented-sms/index.ts` (~line 240) and `supabase/functions/send-listing-contact-sms/index.ts` (~line 430)

- [ ] **Step 1: Add a shared alert helper** in each function (both already import from `_shared/`; `send-report-rented-sms` needs `import { sendViaZepto } from "../_shared/zepto.ts";` — mirror the import style used in `approve-listing/index.ts:3`):

```ts
async function alertAdminSmsFailure(supabase: any, context: string, detail: unknown) {
  try {
    const { data: cfg } = await supabase
      .from("sms_admin_config")
      .select("admin_email, notify_on_errors")
      .limit(1).maybeSingle();
    if (cfg?.admin_email && cfg?.notify_on_errors !== false) {
      await sendViaZepto({
        to: cfg.admin_email,
        subject: `Hadirot SMS alert: ${context}`,
        html: `<p>${context}</p><pre>${JSON.stringify(detail, null, 2)?.slice(0, 2000)}</pre>`,
      });
    }
  } catch (e) { console.error("Failed to send SMS admin alert:", e); }
}
```

- [ ] **Step 2: Use it at both insert sites and surface the flag in the response.** In `send-report-rented-sms` replace the silent block:

```ts
if (insertError) {
  console.error("Error creating conversation:", insertError);
  await alertAdminSmsFailure(supabase, "report-rented conversation insert failed (YES/NO replies will not work for this report)", { insertError, listingId: listing.id });
}
// … in the final response body add:
//   conversation_created: !insertError && !!newConv,
```
Same pattern in `send-listing-contact-sms` where `convError` is logged (line ~430): call `alertAdminSmsFailure(supabase, "callback conversation insert failed (RENTED reply will not match)", { convError, listingId: formData.listingId })` and add `conversation_created: !convError` to the success response.

- [ ] **Step 3: Build green. Commit** — `fix(sms): admin email alert + response flag when conversation insert fails (no more silent success)`

### Task A5: Un-block the 3-second boost-upsell delay

**Files:** Modify `supabase/functions/send-listing-contact-sms/index.ts:436-520`

- [ ] **Step 1: Move the entire upsell block into a background task.** Replace `await new Promise((resolve) => setTimeout(resolve, 3000));` + the following try/catch with:

```ts
// Fire the upsell after responding — keeps the 3s message-separation delay
// without holding the caller's HTTP response open.
const upsellTask = (async () => {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  try {
    /* …existing upsell body unchanged… */
  } catch (upsellErr) {
    console.error("Boost upsell error (non-fatal):", upsellErr);
  }
})();
// deno-lint-ignore no-explicit-any
(globalThis as any).EdgeRuntime?.waitUntil?.(upsellTask) ?? await upsellTask;
```

- [ ] **Step 2: Build green. Commit** — `perf(sms): boost upsell no longer blocks the contact response for 3s`

### Task A6: Complete the SMS space-type label maps

**Files:** Modify `formatSpaceType` in `send-listing-contact-sms/index.ts:23-39`, `send-renewal-reminders/index.ts:~40`, `handle-renewal-sms-webhook/index.ts:~73`

- [ ] **Step 1:** Add to each map: `community_facility: "Community Facility", basement_commercial: "Basement Commercial",` (keep existing entries). Build green.
- [ ] **Step 2: Commit** — `fix(sms): human labels for community_facility / basement_commercial in owner SMS`

### Task A7: config.toml — pin the webhook public

**Files:** Modify `supabase/config.toml`

- [ ] **Step 1:** Add:

```toml
[functions.handle-renewal-sms-webhook]
verify_jwt = false
```

- [ ] **Step 2: Commit** — `chore(sms): pin handle-renewal-sms-webhook verify_jwt=false (Twilio posts unauthenticated)`

### Task A8: Deploy SMS batch + restore inbound delivery (operator checklist)

- [ ] **Step 1: Deploy** (after A1 migration is applied): `supabase functions deploy handle-renewal-sms-webhook cleanup-expired-renewals send-report-rented-sms send-listing-contact-sms send-renewal-reminders --project-ref pxlxdlrjmrkxyygdhvku` (the CLI reads config.toml → webhook deploys with verify_jwt=false; confirm with `supabase functions list` that all versions bumped).
- [ ] **Step 2: Operator checks (outside repo — user or Claude-in-Chrome):**
  - Supabase dashboard → Edge Functions → handle-renewal-sms-webhook → logs around Apr 16 (look for 401s) and after redeploy.
  - Twilio console → the Hadirot number (or Messaging Service) → "A message comes in" webhook must be `https://pxlxdlrjmrkxyygdhvku.supabase.co/functions/v1/handle-renewal-sms-webhook` (HTTP POST). Fix if cleared/changed.
  - Twilio console → A2P 10DLC campaign status = active.
- [ ] **Step 3: Live E2E:** text the Twilio number from a personal phone (any text). Expected: a row appears in `sms_messages` with `direction='inbound'` within seconds (probe read-only), and a fallback/system response SMS arrives. Then run a real flow: use "Report Rented" on a test residential listing → owner phone gets SMS → reply NO → listing deactivates and conversation completes.
- [ ] **Step 4: Commit nothing (deploy only). Record results in the PR description.**

---

# PHASE B — COMMERCIAL LIFECYCLE AUTOMATION (DB)

### Task B1: Migration — wire commercial into cron lifecycle + featured expiry + fix storage cleanup

**Files:** Create `supabase/migrations/20260702010000_commercial_lifecycle_wiring.sql`

- [ ] **Step 1: Write the migration**

```sql
/*
  # Commercial lifecycle wiring (COMMERCIAL_AUDIT_2026-07-01 B-1, M-1, m-8)

  - cron jobs 1 & 2 call deactivate_old_listings()/delete_very_old_listings(),
    which were residential-only. Extend the WRAPPERS (no cron changes needed)
    to also run the commercial functions that already exist with zero callers.
  - expire_featured_listings() (cron job 18) never cleared commercial boosts.
  - auto_delete_very_old_commercial_listings cleaned a nonexistent bucket
    ('commercial-listing-images'); commercial images actually live in
    'listing-images' under 'commercial/{listingId}/…'.
*/

CREATE OR REPLACE FUNCTION public.deactivate_old_listings()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.auto_inactivate_old_listings();
  SELECT public.auto_inactivate_old_commercial_listings();
$$;

CREATE OR REPLACE FUNCTION public.delete_very_old_listings()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.delete_enabled','on', true);
  PERFORM public.auto_delete_very_old_listings();
  PERFORM public.auto_delete_very_old_commercial_listings();
  PERFORM set_config('app.delete_enabled','off', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_featured_listings()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE listings SET is_featured=false, featured_expires_at=null,
    featured_started_at=null, featured_plan=null, updated_at=now()
  WHERE is_featured=true AND featured_expires_at IS NOT NULL AND featured_expires_at <= now();

  UPDATE commercial_listings SET is_featured=false, featured_expires_at=null,
    featured_started_at=null, featured_plan=null, updated_at=now()
  WHERE is_featured=true AND featured_expires_at IS NOT NULL AND featured_expires_at <= now();

  UPDATE featured_purchases SET status='expired', updated_at=now()
  WHERE status='active' AND featured_end IS NOT NULL AND featured_end <= now();
END;
$$;
```
Then re-create `auto_delete_very_old_commercial_listings` with the corrected storage block — copy the existing prod body verbatim (fetch with `SELECT pg_get_functiondef('auto_delete_very_old_commercial_listings'::regproc)`) changing ONLY the two storage deletes to:

```sql
DELETE FROM storage.objects
WHERE bucket_id = 'listing-images'
  AND name LIKE 'commercial/' || listing_record.id::text || '/%';
```
(and delete the `commercial-listing-videos` block — commercial `video_url` is an external link, nothing in storage).

- [ ] **Step 2: Apply to prod (user go-ahead), verify read-only:** `SELECT prosrc FROM pg_proc WHERE proname IN ('deactivate_old_listings','delete_very_old_listings','expire_featured_listings')` — each must reference commercial. Run `SELECT deactivate_old_listings();` once manually (prod has 0 commercial rows — no-op but proves it executes without error).
- [ ] **Step 3: Commit** — `db: commercial lifecycle wired into cron wrappers + featured expiry + storage cleanup path`

---

# PHASE C — EDGE FUNCTION COMMERCIAL FIXES + DEPLOY

### Task C1: approve-listing — correct commercial email link

**Files:** Modify `supabase/functions/approve-listing/index.ts:305-306`

- [ ] **Step 1:**

```ts
const listingUrl = isCommercial
  ? `${siteUrl}/commercial-listing/${listingData.id}`
  : `${siteUrl}/listing/${listingData.id}`;
```
(`isCommercial` is already in scope from the request body.)

- [ ] **Step 2: Build green. Commit** — `fix(approve): commercial approval email links /commercial-listing route`

### Task C2: Deploy the commercial edge batch

- [ ] **Step 1 (after C1 + Phase A commits):** `supabase functions deploy approve-listing stripe-webhook create-boost-checkout get-boost-listing --project-ref pxlxdlrjmrkxyygdhvku` (send-listing-contact-sms already deployed in A8 with the branch's commercial support).
- [ ] **Step 2: Verify:** `supabase functions list` — versions bumped, timestamps today. Smoke: `curl -s -X POST https://pxlxdlrjmrkxyygdhvku.supabase.co/functions/v1/get-boost-listing -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" -H 'Content-Type: application/json' -d '{"listing_id":"<any residential id>"}'` → 200 with `"is_commercial": false` (proves new version live). Residential regression: run one residential boost through Stripe test flow OR verify webhook logs stay clean on the next real event.

---

# PHASE D — CLIENT MAJORS

### Task D1: Map popups — real photos for commercial

**Files:** Modify `src/components/listings/ListingsMapEnhanced.tsx:295`, `src/components/listings/MobileMapCommercialPopup.tsx:124`

- [ ] **Step 1:** In both files change `(listing as any).commercial_listing_images` → `listing.listing_images` (the service aliases `listing_images:commercial_listing_images(*)`; type `CommercialListing.listing_images` at `src/config/supabase.ts:437`). Keep the filter/sort chain identical.
- [ ] **Step 2: Build green. Commit** — `fix(map): commercial popups read listing_images alias — real photos instead of stock`

### Task D2: Recency-interleaved combined pagination (BrowseListings + BrowseSales), featured order preserved, commercial joins the boost slots

**Files:** Modify `src/pages/BrowseListings.tsx:260-360`, `src/pages/BrowseSales.tsx:230-333`

Design (Assumption 1 — user decision): one globally-sorted stream. Both kinds are ALREADY fully fetched (the unpaginated count/map queries). Merge them in memory, sort by the selected sort key, slice per page, then run the existing featured weave over the page slice with a mixed featured pool (residential + commercial featured). This removes: the duplicate-commercial-on-every-page bug, the fake commercial-only pagination, AND the pre-existing `merged.sort` scrambling of featured positions. Depth limit: correct up to the Supabase unpaginated row cap (~1000 actives; 278 today) — keep the existing truncation console.warn.

- [ ] **Step 1: Replace the fetch/merge/page-derivation block in `loadListings`** (`BrowseListings.tsx`, from the `residentialCount` declaration through `setDisplayItems`):

```ts
// Full fetches (also feed the map — unchanged cost vs today)
let residentialCount = 0;
let residentialData: Listing[] = [];
let allCommercial: CommercialListing[] = [];
let commercialCount = 0;

if (fetchResidential && fetchCommercial) {
  const [countResult, commercialResult] = await Promise.all([
    listingsService.getListings(serviceFilters, undefined, user?.id, 0, false),
    commercialListingsService.getCommercialListings(commercialServiceFilters, undefined, user?.id, 0, false),
  ]);
  residentialCount = countResult.totalCount;
  residentialData = countResult.data ?? [];
  allCommercial = commercialResult.data;
  commercialCount = commercialResult.totalCount;
} else if (fetchResidential) {
  const countResult = await listingsService.getListings(serviceFilters, undefined, user?.id, 0, false);
  residentialCount = countResult.totalCount;
  residentialData = countResult.data ?? [];
} else {
  const commercialResult = await commercialListingsService.getCommercialListings(commercialServiceFilters, undefined, user?.id, 0, false);
  allCommercial = commercialResult.data;
  commercialCount = commercialResult.totalCount;
}

if (fetchResidential && residentialCount > residentialData.length) {
  console.warn(`[BrowseListings] data truncated: ${residentialData.length}/${residentialCount} — deep pages will under-report.`);
}

const combinedTotalCount = residentialCount + commercialCount;
setTotalCount(combinedTotalCount);

const maxValidPage = Math.max(1, Math.ceil(combinedTotalCount / ITEMS_PER_PAGE));
if (currentPage > maxValidPage && combinedTotalCount > 0) {
  setTimeout(() => updatePage(maxValidPage), 250);
  return;
}

// ---- one globally sorted stream (kind-tagged) ----
type Tagged = { __kind: 'residential' | 'commercial' } & Record<string, any>;
const sortKey = filters.sort || 'newest';
const priceOf = (x: any) => x.listing_type === 'sale' ? (x.asking_price ?? 0) : (x.price ?? 0);
const cmp = (a: Tagged, b: Tagged): number => {
  switch (sortKey) {
    case 'oldest':      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    case 'price_asc':   return priceOf(a) - priceOf(b);
    case 'price_desc':  return priceOf(b) - priceOf(a);
    case 'bedrooms_asc':  return (a.bedrooms ?? Number.MAX_SAFE_INTEGER) - (b.bedrooms ?? Number.MAX_SAFE_INTEGER);
    case 'bedrooms_desc': return (b.bedrooms ?? -1) - (a.bedrooms ?? -1);
    default:            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); // newest
  }
};

const filteredResidential = applyClientSideFilters(residentialData, filters);
const standardStream: Tagged[] = [
  ...filteredResidential.map(l => ({ ...l, __kind: 'residential' as const })),
  ...allCommercial.map(l => ({ ...l, __kind: 'commercial' as const })),
].sort(cmp);

// ---- featured pool: residential + commercial boosts share injection slots ----
let featuredPool: Tagged[] = [];
if (fetchResidential) {
  try {
    let feat = await listingsService.getFeaturedListingsForSearch(serviceFilters, 'rental', user?.id);
    feat = applyClientSideFilters(feat, filters);
    featuredPool.push(...feat.map(l => ({ ...l, __kind: 'residential' as const })));
  } catch (error) { console.error('Error loading featured listings:', error); }
}
if (fetchCommercial) {
  try {
    const comFeat = await commercialListingsService.getCommercialFeaturedListingsForSearch(
      commercialServiceFilters, 'rental', user?.id);
    featuredPool.push(...comFeat.map(l => ({ ...l, __kind: 'commercial' as const })));
  } catch (error) { console.error('Error loading commercial featured listings:', error); }
}

const injectionPositions = computeInjectionPositions();
// selectFeaturedForPage/weaveFeaturedIntoListings only touch .id — safe on tagged mixed objects.
const featuredForThisPage = selectFeaturedForPage(
  featuredPool as unknown as Listing[], currentPage, injectionPositions.length, serviceFilters,
) as unknown as Tagged[];

const numStandardNeeded = ITEMS_PER_PAGE - featuredForThisPage.length;
const standardOffset = (currentPage - 1) * ITEMS_PER_PAGE; // matches existing residential paging quirk
const pageStandard = standardStream.slice(standardOffset, standardOffset + numStandardNeeded);

const woven = weaveFeaturedIntoListings(
  featuredForThisPage as unknown as Listing[],
  pageStandard as unknown as Listing[],
  injectionPositions,
  ITEMS_PER_PAGE,
) as unknown as (Tagged & { showFeaturedBadge: boolean; key: string })[];

const merged: BrowseItem[] = woven.map(item =>
  item.__kind === 'commercial'
    ? { kind: 'commercial', data: item as unknown as CommercialListing }
    : { kind: 'residential', data: item as unknown as Listing & { showFeaturedBadge: boolean; key: string } },
);
setDisplayItems(merged);
setAllCommercialForMap(allCommercial);
```
Notes for the implementer: delete the old `finalResidentialItems` / second paginated `getListings` call / `merged.sort` block entirely — the page slice now comes from `standardStream`. The residential map fetch block below it stays unchanged. `CommercialListingCard` must show the boost badge when woven: it already renders `showFeaturedBadge && listing.is_featured` — pass `showFeaturedBadge={true}` implicitly via existing default; nothing extra needed. Commercial cards rendered from woven items keep working because the spread preserves all fields (`__kind`, `key` are extra props TS won't mind after the casts).

- [ ] **Step 2: Mirror in `BrowseSales.tsx`** — same block shape with `getCommercialSaleListings` and `getCommercialFeaturedListingsForSearch(commercialServiceFilters, 'sale', user?.id)`; the sales page's residential featured loader keeps its `'sale'` argument.
- [ ] **Step 3: Build green. Localhost:** default sort shows a strict recency interleave of both kinds; page 2 shows no repeats; commercial-only mode paginates for real; a boosted commercial listing appears in an early injection slot with the Featured badge.
- [ ] **Step 4: Commit** — `fix(browse): recency-interleaved combined pagination; commercial boosts join featured slots; no per-page duplicates`

### Task D3: Admin management of live commercial listings + featured grant

**Files:** Modify `src/pages/AdminPanel.tsx` (listings tab, ~lines 219-450 + table render), `src/services/stripe.ts:169-210`

- [ ] **Step 1: stripe.ts — make `adminGrantFeature` polymorphic.** Add an `isCommercial = false` param; use it for both the user_id lookup and the listing update, and stamp the purchase row:

```ts
async adminGrantFeature(
  listingId: string, plan: string, durationDays: number, adminId: string,
  mode: 'free' | 'manual_payment', amountCents?: number, isCommercial = false,
) {
  const table = isCommercial ? 'commercial_listings' : 'listings';
  const now = new Date();
  const endDate = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const owner = (await supabase.from(table).select('user_id').eq('id', listingId).single()).data?.user_id;

  const { error: purchaseError } = await supabase.from('featured_purchases').insert({
    listing_id: listingId, user_id: owner, plan,
    amount_cents: mode === 'free' ? 0 : (amountCents || 0),
    status: mode === 'free' ? 'free' : 'active',
    is_admin_granted: true, granted_by_admin_id: adminId,
    purchased_at: now.toISOString(), featured_start: now.toISOString(),
    featured_end: endDate.toISOString(), duration_days: durationDays,
    is_commercial: isCommercial,
  });
  if (purchaseError) throw purchaseError;

  const { error: listingError } = await supabase.from(table).update({
    is_featured: true, featured_started_at: now.toISOString(),
    featured_expires_at: endDate.toISOString(), featured_plan: plan,
    updated_at: now.toISOString(),
  }).eq('id', listingId);
  if (listingError) throw listingError;
}
```
Mirror the same `isCommercial`/table branch in `adminRemoveFeature` (same file, just below — update `featured_purchases` status and clear the featured fields on the right table).

- [ ] **Step 2: AdminPanel listings tab — union commercial.** In `loadAdminData`, alongside the residential `allListings` fetch, load `commercialListingsService.getAdminCommercialListings()` and store `setAllCommercialListings(data)`. Render a `Commercial` chip/tab (or a "kind" column) in the existing listings table by mapping commercial rows into the row model the table already uses (`title ?? commercial_space_type`, `full_address ?? cross streets` as location, price/asking_price, is_active, is_featured, approved, owner name). Wire the existing row actions:
  - View → `/commercial-listing/{id}`; Edit → `/commercial/edit/{id}`
  - Toggle active → `commercialListingsService.updateCommercialListing(id, { is_active: !current })`
  - Delete → `commercialListingsService.deleteCommercialListing(id)` (confirm dialog, as residential)
  - Feature/Unfeature → the modal from Step 1 with `isCommercial: true`
  The admin ALL RLS policy on `commercial_listings` covers every operation (verified in prod). Keep the phone/name search working by including commercial rows in the same filter pipeline (`title`, `contact_name`, `contact_phone`, `neighborhood` fields).
- [ ] **Step 3: Build green. Localhost check:** search a seeded commercial listing by name, toggle it inactive/active, grant featured (badge appears), remove featured, delete it.
- [ ] **Step 4: Commit** — `feat(admin): manage + feature/unfeature live commercial listings from admin panel`

### Task D4: Migration — commercial-aware analytics RPCs + impressions RPC

**Files:** Create `supabase/migrations/20260702020000_commercial_analytics_and_impressions.sql`

- [ ] **Step 1: Write the migration.** Three `CREATE OR REPLACE` statements adapted from the prod definitions fetched 2026-07-01 (keep signatures, `require_admin()`, and time-window math byte-identical; only the listing joins change):

```sql
-- 1) Supply stats: count both tables.
CREATE OR REPLACE FUNCTION public.analytics_supply_stats(days_back integer DEFAULT 14, tz text DEFAULT 'America/New_York')
RETURNS TABLE(new_listings_by_day jsonb, active_count integer, inactive_count integer, total_new_listings integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE start_ts timestamptz; end_ts timestamptz;
BEGIN
  PERFORM require_admin();
  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  RETURN QUERY
  WITH all_listings AS (
    SELECT created_at, is_active FROM listings
    UNION ALL
    SELECT created_at, is_active FROM commercial_listings
  ), daily_new AS (
    SELECT (al.created_at AT TIME ZONE tz)::date AS day_date, COUNT(*)::integer AS count
    FROM all_listings al
    WHERE al.created_at >= start_ts AND al.created_at < end_ts
    GROUP BY 1 ORDER BY 1
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object('date', day_date, 'count', count) ORDER BY day_date) FROM daily_new), '[]'::jsonb),
    (SELECT COUNT(*) FROM all_listings WHERE is_active = true)::integer,
    (SELECT COUNT(*) FROM all_listings WHERE is_active = false)::integer,
    (SELECT COUNT(*) FROM all_listings WHERE created_at >= start_ts AND created_at < end_ts)::integer;
END; $function$;

-- 2) Inquiry listings performance: UNION a commercial branch keyed on
--    listing_contact_submissions.commercial_listing_id, then re-sort/limit.
--    (Copy the prod body's CTEs verbatim; wrap the residential SELECT and this
--    commercial SELECT in a combined query:)
--    commercial branch fields: cl.id, COALESCE(cl.title, cl.commercial_space_type),
--      cl.full_address AS location, cl.neighborhood, NULL::integer AS bedrooms,
--      cl.price::integer, phone/form/view counts from the same CTEs
--      (form_counts needs a second CTE grouped by lcs.commercial_listing_id),
--      cl.is_featured, COALESCE(p.full_name,'Unknown').
--    ORDER BY total inquiries DESC LIMIT limit_count over the UNION ALL.

-- 3) Zero-inquiry listings: same pattern — UNION ALL a commercial SELECT with
--    NULL bedrooms, full_address as location, exclusion list extended with
--    SELECT DISTINCT commercial_listing_id::text FROM listing_contact_submissions
--    WHERE commercial_listing_id IS NOT NULL AND created_at within window.

-- 4) Commercial batch impressions RPC (Task E2 consumer):
CREATE OR REPLACE FUNCTION public.increment_commercial_listing_impressions(p_listing_ids uuid[])
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE commercial_listings
  SET impressions = COALESCE(impressions, 0) + 1
  WHERE id = ANY(p_listing_ids) AND is_active = true AND approved = true;
$$;
GRANT EXECUTE ON FUNCTION public.increment_commercial_listing_impressions(uuid[]) TO anon, authenticated;
```
For (2) and (3): the implementer must first dump the exact prod bodies (`SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname IN ('analytics_inquiry_listings_performance_dual','analytics_zero_inquiry_listings')` — full text is also captured in this plan's audit session) and apply the UNION-ALL transformation described in the comments above, keeping every CTE and filter identical for the residential branch. Do not invent new filters.

- [ ] **Step 2: Apply to prod (user go-ahead). Verify:** call each RPC as an admin user (or via SQL `SET request.jwt.claims`) → runs without error; `has_function_privilege('anon','increment_commercial_listing_impressions(uuid[])','EXECUTE')` = true.
- [ ] **Step 3: Regenerate types** (`npm run db:types` or the project's regen command; if unavailable locally, hand-add the RPC signature to `src/types/database.ts` matching the existing `increment_commercial_listing_views` entry shape). Build green.
- [ ] **Step 4: Commit** — `db: commercial-aware admin analytics RPCs + batch impressions RPC; types regenerated`

### Task D5: Single launch flag gates BOTH posting surfaces

**Files:** Create `src/config/launchFlags.ts`; modify `src/pages/postListingWizard/PathPicker.tsx:29-42`, `src/pages/PostCommercialListing.tsx:115-122`, `src/pages/postListingWizard/PostListingWizard.tsx:112-113`

- [ ] **Step 1:**

```ts
// src/config/launchFlags.ts
// Single switch for commercial posting. Flip to true at launch (Task F3).
export const COMMERCIAL_POSTING_LIVE = false;
```

- [ ] **Step 2:** PathPicker: `active: COMMERCIAL_POSTING_LIVE` for both commercial cards; PostListingWizard type-change dropdown: `comingSoon: !COMMERCIAL_POSTING_LIVE`. PostCommercialListing: extend the auth redirect effect:

```ts
useEffect(() => {
  if (!COMMERCIAL_POSTING_LIVE) { navigate("/post-listing-new"); return; }
  if (!authLoading && !user) navigate("/auth");
}, [authLoading, user, navigate]);
```

- [ ] **Step 3: Build green. Commit** — `feat: single COMMERCIAL_POSTING_LIVE flag gates wizard cards AND legacy /post-commercial`

---

# PHASE E — PARITY MINORS

### Task E1: Cards/dashboard batch — sale badge, sold-renew guard, commercial boost entry

**Files:** Modify `src/components/listings/CommercialListingCard.tsx:487-496`, `src/services/commercialListings.ts:822-854`, `src/pages/Dashboard.tsx:1090-1153` (and the sales-tab twin at ~1369-1390)

- [ ] **Step 1: Card badge** — in the bottom badge row, mirror residential ([ListingCard.tsx:334-337]):

```tsx
{isSaleListing && listing.sale_status && listing.sale_status !== 'available' && (
  <SaleStatusBadge status={listing.sale_status} size="sm" />
)}
{isSaleListing && listing.sale_status !== 'sold' && ( /* existing For Sale pill */ )}
```
(import `SaleStatusBadge` from `./SaleStatusBadge`). Also add the missing typed field to the `CommercialListing` interface in `src/config/supabase.ts` (~line 436, next to `owner?`): `sale_status?: SaleStatus | null;` — the DB column and generated types have it, the manual interface does not (verified: only the residential interface declares it, line 138).

- [ ] **Step 2: Sold-renew guard** — top of `renewCommercialListing`:

```ts
if (listingType === 'sale' && saleStatus === 'sold') {
  throw new Error('Cannot renew a sold listing');
}
```
and in `Dashboard.handleRenewCommercialListing` pass `listing.sale_status`: `renewCommercialListing(listingId, listingType, listing?.sale_status)`.

- [ ] **Step 3: Commercial boost entry** — in Dashboard's primary-action chain, replace `canGetFeatured = !isCommercial && …` with kind-aware logic; for commercial route to the boost page:

```ts
const canGetFeatured = listing.is_active && listing.approved &&
  !(listing.is_featured && listing.featured_expires_at && new Date(listing.featured_expires_at) > new Date());
// …
} else if (canGetFeatured) {
  primary = isCommercial
    ? { label: 'Get Featured', onClick: () => navigate(`/boost/${listing.id}`), cls: 'bg-accent-500 hover:bg-accent-600 text-white' }
    : { label: 'Get Featured', onClick: () => { setFeatureModalListing(listing as Listing); setShowSuccessBanner(false); }, cls: 'bg-accent-500 hover:bg-accent-600 text-white' };
}
```
Apply identically in the sales-tab block (~line 1369).

- [ ] **Step 4: Build green. Commit** — `feat(commercial): sale-status badge on cards, sold-renew guard, dashboard boost entry`

### Task E2: Commercial impressions tracking

**Files:** Create `src/hooks/useCommercialImpressions.ts`; modify `src/pages/BrowseListings.tsx`, `src/pages/BrowseSales.tsx`, `src/pages/Favorites.tsx` (commercial card wrappers)

- [ ] **Step 1: Hook (IntersectionObserver + batch RPC + session dedup — mirrors `useListingImpressions` shape):**

```ts
import { useRef, useCallback, useEffect } from 'react';
import { supabase } from '../config/supabase';

const SEEN_KEY = 'commercial_impressions_seen';

export function useCommercialImpressions() {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const pendingRef = useRef<Set<string>>(new Set());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const seen = (): Set<string> => {
    try { return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]')); }
    catch { return new Set(); }
  };
  const markSeen = (ids: string[]) => {
    try {
      const s = seen(); ids.forEach(id => s.add(id));
      sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s]));
    } catch { /* storage full — fine */ }
  };

  const flush = useCallback(async () => {
    const ids = [...pendingRef.current]; pendingRef.current.clear();
    if (ids.length === 0) return;
    markSeen(ids);
    try { await supabase.rpc('increment_commercial_listing_impressions', { p_listing_ids: ids }); }
    catch (e) { console.error('commercial impression flush failed', e); }
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver((entries) => {
      const s = seen();
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.commercialListingId;
        if (entry.isIntersecting && id && !s.has(id)) pendingRef.current.add(id);
      }
      if (pendingRef.current.size > 0) {
        if (flushTimer.current) clearTimeout(flushTimer.current);
        flushTimer.current = setTimeout(flush, 1500);
      }
    }, { threshold: 0.5 });
    return () => { observerRef.current?.disconnect(); if (flushTimer.current) clearTimeout(flushTimer.current); void flush(); };
  }, [flush]);

  const observeCommercial = useCallback((el: Element | null, id: string) => {
    if (el && observerRef.current) {
      (el as HTMLElement).dataset.commercialListingId = id;
      observerRef.current.observe(el);
    }
  }, []);

  return { observeCommercial };
}
```

- [ ] **Step 2: Wire it** — in each page's commercial card wrapper div add `ref={(el) => observeCommercial(el, id)}` (BrowseListings: the three render sites — split grid ~line 764, mobile list ~1252, desktop grid ~1303; BrowseSales: its two commercial render sites; Favorites: the commercial map block).
- [ ] **Step 3: Build green. Localhost:** scroll a commercial card into view → `commercial_listings.impressions` increments once per session (probe read-only).
- [ ] **Step 4: Commit** — `feat(commercial): impression tracking via batch RPC (owner stats no longer stuck at 0)`

### Task E3: Home page — surface featured commercial

**Files:** Modify `src/pages/Home.tsx:75-105` and the Featured section render (~175-210)

- [ ] **Step 1:** Load commercial featured alongside residential:

```ts
const [featuredCommercial, setFeaturedCommercial] = useState<CommercialListing[]>([]);
// in the loader, parallel with getActiveFeaturedListings:
const [comRentals, comSales] = await Promise.all([
  commercialListingsService.getCommercialFeaturedListingsForSearch({}, 'rental', user?.id),
  commercialListingsService.getCommercialFeaturedListingsForSearch({}, 'sale', user?.id),
]);
setFeaturedCommercial([...comRentals, ...comSales]);
```
Render `featuredCommercial.map(l => <CommercialListingCard key={l.id} listing={l} isFavorited={!!l.is_favorited} />)` after the residential cards in the same grid; show the section when `featuredListings.length + featuredCommercial.length > 0`.

- [ ] **Step 2: Build green. Commit** — `feat(home): featured commercial listings appear on the home featured strip`

### Task E4: Digests — WhatsApp digest gains commercial (+ live embed regression fix), admin daily digest + weekly reports include commercial

**Files:** Modify `src/services/digest.ts:505-615, 649-690`, `src/pages/DigestManager.tsx:530-560 + group UI`, `src/utils/whatsappFormatter.ts`, `supabase/functions/send-daily-admin-digest/index.ts:188-244`, `supabase/functions/send-weekly-performance-reports/index.ts:95-160`

- [ ] **Step 0 (REGRESSION FIX — do first):** remove the dropped-FK embed. In `digest.ts:512` and `DigestManager.tsx:538` delete the line `short_url:short_urls!short_urls_listing_id_fkey(short_code)` from the selects (and the trailing comma above it). `ensureListingsHaveShortUrls` already falls back to `createShortUrlForListing` when `listing.short_url` is absent, and the `create_short_url(p_listing_id,…)` RPC dedups by listing+source — behavior is preserved, and digest group fetches stop erroring against prod (the FK was dropped by migration 20260630010000). Commit separately: `fix(digest): drop short_urls FK embed broken by polymorphic-refs migration`.

- [ ] **Step 0b (WhatsApp commercial support):**
  1. `digest.ts` — extend `ListingGroup` with `kind?: 'residential' | 'commercial'`. In `fetchListingsByGroup`, when `group.kind === 'commercial'` query `commercial_listings` instead: select `*, owner:profiles(full_name, agency)`, same `approved/is_active/time_filter/limit` handling; support `filters.listing_type` ('rental'|'sale') and `filters.commercial_space_types` via `.in('commercial_space_type', …)`; skip bedrooms/property-type filters (residential-only). Tag results `{ ...row, __kind: 'commercial' }`.
  2. `digest.ts` — in `createShortUrlForListing` (and any caller building `p_original_url`), build `/commercial-listing/{id}` when the listing is commercial (pass an `isCommercial` flag through `ensureListingsHaveShortUrls`).
  3. `whatsappFormatter.ts` — add `formatCommercialListingData(listing, shortCode?)` returning `FormattedListing`: price = `call_for_price ? 'Call for Price' : (sale ? abbreviateSalePrice(asking_price) : '$X,XXX/month')`; specs = `[`${available_sf.toLocaleString()} SF`, spaceTypeLabel, leaseAbbr]` (reuse a local map: storefront→Retail, restaurant→Restaurant, office→Office, warehouse→Warehouse, industrial→Industrial, mixed_use→Mixed Use, community_facility→Community, basement_commercial→Basement Commercial; lease abbr map as in CommercialListingCard); location = `full_address || cross_street_a & cross_street_b`, prefixed by neighborhood; url = short code `/l/{code}` else `/commercial-listing/{id}`; `listingType` passthrough; no bedroom sectioning (`sectionKey` undefined).
  4. `DigestManager.tsx` — group editor gains a Kind select (Residential | Commercial, default residential, stored in the group config JSON); the preview builder calls `WhatsAppFormatter.formatCommercialListingData` for `__kind==='commercial'` rows; commercial groups ignore the bedrooms `sectionByFilter`.
  Commit: `feat(digest): WhatsApp digest supports commercial listing groups`.

- [ ] **Step 1: Daily admin digest** — after the residential query (approved in last 24h), add the commercial equivalent and merge:

```ts
const { data: commercialListings } = await supabaseAdmin
  .from("commercial_listings")
  .select("id, title, commercial_space_type, full_address, neighborhood, price, asking_price, listing_type, created_at, updated_at, owner:profiles(full_name, role)")
  .eq("approved", true)
  .gte("updated_at", twentyFourHoursAgo);   // same window var the residential query uses
```
Map each into the digest item shape the template consumes (`title ?? '{SpaceType} — {full_address}'`, link `/commercial-listing/{id}`, price or asking_price), tag with a `[Commercial]` prefix, and include in the count/empty-check. Respect the existing dedup log the same way residential entries do (add commercial ids to the same sent-log table calls).

- [ ] **Step 2: Weekly performance reports** — extend the owner-listing query: fetch `commercial_listings` (`id, title, user_id, views, direct_views, impressions, is_active`) per owner alongside residential; inquiries for commercial come from `listing_contact_submissions.commercial_listing_id IN (…)`. Add a "Commercial listings" block to the email body using the row-column stats (commercial has no analytics-events metrics — say "views/impressions" from the columns).
- [ ] **Step 3: Build green. Deploy both:** `supabase functions deploy send-daily-admin-digest send-weekly-performance-reports --project-ref pxlxdlrjmrkxyygdhvku`.
- [ ] **Step 4: Commit** — `feat(digest): commercial listings in admin daily digest + owner weekly reports`

### Task E5: Wizard/legacy image-failure surfacing + storage delete fix

**Files:** Modify `src/pages/postListingWizard/PostListingWizard.tsx:571-583`, `src/pages/PostCommercialListing.tsx:447-467`, `src/services/commercialListings.ts:733-752`

- [ ] **Step 1: Surface upload failures.** In both submit flows, count failures and warn:

```ts
let failedUploads = 0;
for (let i = 0; i < imageFiles.length; i++) {
  /* …existing upload/add… */ // in catch: failedUploads++;
}
if (failedUploads > 0 && failedUploads === imageFiles.length) {
  alert('Your listing was submitted, but ALL photos failed to upload. Please open the listing from your dashboard and re-add photos.');
} else if (failedUploads > 0) {
  alert(`Your listing was submitted, but ${failedUploads} photo(s) failed to upload. You can re-add them from Edit Listing.`);
}
```

- [ ] **Step 2: Fix storage delete path.** In `deleteCommercialListingImage`, derive the object path from the public URL before removing:

```ts
// image_url is a full public URL: …/object/public/listing-images/commercial/{listingId}/{file}
const marker = '/listing-images/';
const idx = imageUrl.indexOf(marker);
const storagePath = idx >= 0 ? imageUrl.slice(idx + marker.length) : imageUrl;
const { error: storageError } = await supabase.storage.from('listing-images').remove([storagePath]);
```

- [ ] **Step 3: Build green. Commit** — `fix(commercial): surface photo-upload failures; storage delete uses object path not URL`

### Task E6: Filter completeness — all wizard values selectable

**Files:** Modify `src/components/listings/MoreFiltersModal.tsx:93-115`, `src/components/listings/ListingFiltersHorizontal.tsx` (same constants)

- [ ] **Step 1:** Add the missing options (values must match the wizard exactly — Step4CommercialSpaceDetails.tsx:29-45):

```ts
// append to COMMERCIAL_LEASE_TYPES:
{ value: "percentage", label: "Percentage" },
{ value: "absolute_net", label: "Absolute Net" },
{ value: "tenant_electric", label: "Tenant Electric" },
// append to COMMERCIAL_CONDITIONS:
{ value: "vanilla_box", label: "Vanilla Box" },
{ value: "cold_dark_shell", label: "Cold Dark Shell" },
```
(Apply to both files' constant blocks.)

- [ ] **Step 2: Build green. Commit** — `fix(filters): every wizard-writable lease type / condition is selectable`

---

# PHASE F — VERIFICATION + LAUNCH

### Task F1: Full gates
- [ ] `npm run build` green; `npm run lint` green (fix anything introduced).
- [ ] Read-only prod probes: constraint has 11 states; lifecycle wrappers reference commercial; analytics RPCs execute; impressions RPC granted.
- [ ] `git log` — every task committed and pushed to `origin/claude/commercial-launch-fixes`.

### Task F2: Localhost E2E (user + Claude, seeded test data)
- [ ] Post a commercial rental via wizard (flag temporarily true locally) → admin notify email → approve from pending queue → clock anchored (expires_at ≈ now+40d) → approval email links `/commercial-listing/…`.
- [ ] Browse: All/Residential/Commercial toggle; every commercial filter returns the seeded listing; pagination with >20 commercial listings; map pin → popup shows the REAL photo → View Listing; mobile viewport list + bottom sheet.
- [ ] Detail: all spec fields, video, favorite → Favorites tab → unfavorite; views increment; impressions increment on browse.
- [ ] Contact: callback form → owner SMS (+ short link resolves to `/commercial-listing/…`), submission row has `commercial_listing_id`, dashboard inquiry count/list shows it; reply RENTED → listing deactivates (requires A8 inbound restored).
- [ ] Boost: `/boost/{commercial-id}` renders → Stripe test checkout → webhook features the commercial row → featured pin/badge/home strip → admin remove-feature works.
- [ ] Admin: find/toggle/feature/delete commercial in listings tab; stats include commercial; analytics tabs show commercial rows.
- [ ] Residential regression sweep: browse/filters/featured order, residential boost, residential contact SMS, report-rented residential (full YES/NO round trip now that inbound works).

### Task F3: Launch flip (LAST, user go-ahead)
- [ ] Set `COMMERCIAL_POSTING_LIVE = true` in `src/config/launchFlags.ts`; build; commit `feat: enable commercial posting (launch)`; push.
- [ ] User opens the PR to `main` (their production gate) and deploys the frontend.
- [ ] Post-launch watch (first 48h): `sms_messages` inbound flowing; `listing_renewal_conversations` gaining callback rows with `conversation_created:true`; no Sentry spikes; first real commercial post approve→browse→contact loop.

---

## TESTING CHECKLIST (condensed)
Covered per-task above; the four highest-risk verifications are: (1) inbound SMS actually arriving after A8 (nothing else in the SMS phase matters if not), (2) a full commercial boost through Stripe test mode WITHOUT breaking a residential boost the same day, (3) pagination in all three toggle modes with >20 of each kind, (4) the residential regression sweep in F2.

## DEFERRED (explicitly out of scope — revisit post-launch)
- Email-rendered `send-enhanced-digest` commercial TEMPLATES (the WhatsApp path IS commercial-capable per Task E4; the email renderer's bedroom-centric HTML templates are a separate design effort).
- Refactoring the webhook's duplicated disambiguation handlers and the hardcoded "2 weeks" copy (SMS audit §4 "duplicate-logic hazard") — working code, maintenance-only risk.
- SEO meta tags on detail pages (residential lacks them too — separate SEO project).
- `get_user_lifetime_listing_count` counting commercial toward agent-free-posting — confirm intent with user; one-line change if wrong.
