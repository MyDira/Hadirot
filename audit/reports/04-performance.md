# Track 4 — Scalability & Performance — Findings

## Summary

The single biggest structural risk is that **the entire browse experience (list + map) is built on "fetch everything matching the filter, paginate/sort in the browser"** rather than server-side pagination. `BrowseListings.tsx` and `BrowseSales.tsx` both call `listingsService.getListings(...)` / `getSaleListings(...)` with `applyPagination = false` and no `limit`, pulling every matching row (full `select('*')` plus every related `listing_images(*)` row and the owner join) on every filter change, then slicing pages out of that array in memory. The code already contains a `console.warn` acknowledging this hits Supabase's default 1000-row cap and silently under-reports beyond that. The Admin Panel is worse: `loadAdminData()` pulls the full `listings` table (with owner join) and the full `profiles` table into the browser **multiple times per load** (once for a `select('*'){count:'exact'}` stat, again for the actual table, again for a client-side "currently featured" recompute), and reloads all of it on every date-filter change. Several cron edge functions (`send-enhanced-digest`, `send-daily-admin-digest`) build short URLs with a sequential `await` per listing in a `for` loop — an N+1 pattern that will make digest jobs slower as listing volume grows and can run into edge-function wall-clock limits with no partial-progress resume. SMS reminder functions (`send-paid-listing-reminders`, `send-renewal-reminders`) send one Twilio SMS at a time in a sequential loop with no batching and no resume-on-failure, unlike `send-weekly-performance-reports`, which already batches Twilio sends correctly (a good pattern worth copying). The map component has no marker clustering, though it is at least viewport-bounded and debounced. Images are client-resized to max 2400px before upload (good) but no responsive/thumbnail sizing is used anywhere — the browse grid loads the same full-size image as the detail page. The JS bundle is reasonably code-split (Mapbox GL and Admin/Analytics pages are lazy-loaded, contrary to the pre-survey's worry), but the eagerly-loaded entry chunk is still 1.73 MB / 413 KB gzipped. Realtime channel usage is minimal and correctly cleaned up. Overall: **1 P0, 5 P1, 5 P2, 1 P3.** Worst finding: the browse pages' unpaginated "fetch-all-then-slice-in-memory" pattern, compounded by the Admin Panel's multi-fetch of entire tables — both silently truncate or balloon payload as listing/user counts grow past ~1,000 rows, which the pre-survey's stated scale ("likely <10k listings") could already be brushing up against for broad, unfiltered searches.

## Findings

### [P1] Browse pages fetch ALL matching listings unpaginated, then paginate client-side (silently truncates past 1,000 rows)
- **Where:** `src/pages/BrowseListings.tsx:267-284,394-400`, `src/pages/BrowseSales.tsx:240-257,360-`, `src/services/listings.ts` `getListings`/`getSaleListings` (`applyPagination` param, lines 149-271 and 1669-1801)
- **What:** Every call site in the browse pages invokes `listingsService.getListings(serviceFilters, undefined, user?.id, 0, false)` — `limit` is `undefined` and `applyPagination` is `false`. Inside the service, `if (applyPagination) { if (limit !== undefined) query = query.range(...) }` means no `.range()` is ever applied for these calls, so the query returns every row PostgREST is willing to return (Supabase's default `max_rows`, typically 1000) for the given filter, including the full listing row (`select('*')`), the owner join, and **every** `listing_images(*)` row per listing. Pagination, sorting-with-featured-injection, and even the "how many matched" count are then all done in JavaScript on the full result array (`standardStream.slice(...)`, `applyClientSideFilters`, etc.).
- **Why it matters / failure scenario:** At today's stated scale (pre-survey: "likely <10k listings") a broad or unfiltered rental search across all of NYC can already approach the 1,000-row PostgREST cap. The code is aware of this — it prints `` `[BrowseListings] Data truncated: showing ${residentialData.length} of ${residentialCount} listings...` `` — meaning under-reporting is an accepted, silent behavior today, not a hypothetical future one. At 20,000 listings, any filter combination matching more than ~1,000 rows will silently drop listings from page 2+ (users paging deep into results will see gaps or repeats), the map will only plot the first 1,000 matches instead of the true set, and every filter change (bedroom toggle, price range apply, neighborhood pick) re-downloads the *entire* matching set — including every listing's full image-row array — instead of the ~20 rows actually rendered on that page.
- **Evidence:**
  ```ts
  // src/services/listings.ts:255-260 (mirrored at 1771-1775 for getSaleListings)
  if (applyPagination) {
    if (limit !== undefined) {
      query = query.range(offset, offset + (limit || 20) - 1);
    }
  }
  ```
  ```ts
  // src/pages/BrowseListings.tsx:269
  listingsService.getListings(serviceFilters, undefined, user?.id, 0, false),
  ...
  // BrowseListings.tsx:286-291
  if (fetchResidential && residentialCount > residentialData.length) {
    console.warn(
      `[BrowseListings] Data truncated: showing ${residentialData.length} of ${residentialCount} listings. ` +
        `Supabase row limit hit — deep pages will under-report.`,
    );
  }
  ```
- **Fix prompt:** In `src/services/listings.ts`, change `getListings`/`getSaleListings` call sites in `src/pages/BrowseListings.tsx` and `src/pages/BrowseSales.tsx` to pass a real `limit`/`offset` (e.g. `ITEMS_PER_PAGE=20`, `offset=(currentPage-1)*20`) and `applyPagination=true`, letting Postgres do the `ORDER BY ... LIMIT ... OFFSET`. This requires moving the featured-injection logic (`selectFeaturedForPage`/`weaveFeaturedIntoListings`) to work against a server-paginated page instead of a full in-memory array — the featured pool query (`getFeaturedListingsForSearch`) already runs separately and can stay small. Keep the map's separate viewport-bounded fetch (`getListings({...serviceFilters, bounds: mapFetchBounds}, ...)`) as-is since it is already scoped by map bounds, but still consider capping it with a limit + "zoom in to see more" UX once bounds return many rows. Verify by seeding >1000 rows matching a broad filter locally and confirming page 2+ still returns correct, non-duplicated results and the total count matches page contents.

### [P1] AdminPanel loads entire `listings` and `profiles` tables into the browser, multiple times, on every load and every date-filter change
- **Where:** `src/pages/AdminPanel.tsx:334-483` (`loadAdminData`), triggered by `useEffect(..., [dateFilter])` at line ~486-490
- **What:** On every admin panel load (and every time the date filter changes), the code issues, in sequence/parallel: (1) `supabase.from('profiles').select('*', {count:'exact'})` — full table, just for a count; (2) `supabase.from('listings').select('*', {count:'exact'})` — full table, just for a count; (3) `supabase.from('listings').select('*', {count:'exact'}).eq('is_featured', true).eq('is_active', true)` — another full-column fetch just for a count; (4) `supabase.from('listings').select('is_featured, featured_expires_at')` over **all** listings, to recompute "currently featured" client-side; (5) `supabase.from('profiles').select('id, full_name, email, ...')` — the full profiles table again, this time for the actual users table; (6) `supabase.from('listings').select('*, owner:profiles!listings_user_id_fkey(...)')` — the full listings table again, with a join, for the actual listings table; (7) `supabase.from('commercial_listings').select('*, owner:profiles(...)')` — full commercial table; (8) a pending-listings query. None of these paginate; all filtering/sorting/date-range logic for the visible tables happens in JS on the fully-downloaded arrays (`filteredData = [...(allListings||[]), ...commercialAsListings]`, `.filter(...)`).
- **Why it matters / failure scenario:** At 20,000 listings and 5,000 users, opening the Admin Panel — or just changing the date filter — downloads essentially the full `listings` table (several times, with different projections) and the full `profiles` table into the admin's browser tab. This is slow (multi-MB JSON transfer + JS parse + client-side filter/sort of tens of thousands of objects), costly (Supabase egress is billed), and already silently lossy: the code's own truncation-detection (`if (usersCount !== null && allUsers && usersCount > allUsers.length)`) shows the team already anticipates hitting the row cap here, meaning admins will stop seeing "all" users/listings once either table crosses ~1,000 rows, with only a toast warning as the safety net.
- **Evidence:**
  ```ts
  // src/pages/AdminPanel.tsx:337-341
  const [usersRes, listingsRes, featuredRes, commercialCountRes, commercialFeaturedCount] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact' }),
    supabase.from('listings').select('*', { count: 'exact' }),
    supabase.from('listings').select('*', { count: 'exact' }).eq('is_featured', true).eq('is_active', true),
    supabase.from('commercial_listings').select('*', { count: 'exact', head: true }),
    commercialListingsService.getCommercialFeaturedListingsCount(),
  ]);
  const { data: allListingsRaw } = await supabase.from('listings').select('is_featured, featured_expires_at');
  ...
  const { data: allUsers, count: usersCount } = await supabase.from('profiles').select('id, full_name, email, role, phone, agency, is_admin, is_banned, created_at, can_manage_agency, can_post_sales, free_posting_agent', { count: 'exact' }).order('created_at', { ascending: false });
  const [{ data: allListings, count: listingsCount }, { data: allCommercialRows }] = await Promise.all([
    supabase.from('listings').select(`*, owner:profiles!listings_user_id_fkey(full_name, role, agency)`, { count: 'exact' }),
    supabase.from('commercial_listings').select(`*, owner:profiles(full_name, role, agency)`),
  ]);
  ```
- **Fix prompt:** In `src/pages/AdminPanel.tsx`, replace the count-only queries (`usersRes`, `listingsRes`, `featuredRes`) with `.select('*', { count: 'exact', head: true })` (the `head: true` flag already used correctly for `commercialCountRes` avoids downloading rows just to get a count — apply it to the other three). Replace the "currently featured" recompute (`allListingsRaw`) with a single DB-side count query (`.eq('is_featured', true).gt('featured_expires_at', new Date().toISOString())`, mirroring `getFeaturedListingsCount` already in `listings.ts`) instead of pulling all rows and filtering in JS. For the actual users/listings management tables, add real server-side pagination (`.range()`) plus server-side date filtering (`.gte('created_at', ...).lte('created_at', ...)`) instead of downloading the full table and filtering with `Array.prototype.filter`. Verify by seeding 2,000+ listings and profiles locally and confirming the Admin Panel loads quickly and shows accurate counts/pages without a truncation toast.

### [P1] Digest edge functions build short URLs with a sequential per-listing RPC call in a `for` loop
- **Where:** `supabase/functions/send-enhanced-digest/index.ts:515-535` (`renderCategorySection`, calling `createShortUrl` inside a `for (const listing of category.listings)` loop) and `supabase/functions/send-daily-admin-digest/index.ts:395-399` and `:458-461` (near-identical per-listing loops for residential and commercial)
- **What:** For every listing included in a digest email, the function `await`s a separate `supabaseAdmin.rpc("create_short_url", ...)` call, one at a time, inside a `for` loop — not batched, not parallelized with `Promise.all`.
- **Why it matters / failure scenario:** Templates like `all_active` or `recent_by_category` with high `category_limits` can include hundreds to thousands of listings as inventory grows. Each iteration is a full network round-trip to Postgres. At, say, 2,000 active listings included in an "all active" digest, this is 2,000 sequential RPC round-trips (even at a generous 50ms each, that's 100+ seconds) before the email is even assembled — this is likely to exceed Supabase Edge Function wall-clock limits, causing the digest job to time out mid-loop. Because there is no batching/checkpointing, a timeout here means the email never sends at all (not even partially), and because these are cron-triggered (see Track 7 for cron visibility), a silent timeout will look like "the digest job ran" in logs (if any) while no one actually received it — the classic "the owner will not know X happened until a user complains" scenario.
- **Evidence:**
  ```ts
  // supabase/functions/send-enhanced-digest/index.ts:526-532
  for (const listing of category.listings) {
    const listingUrl = await createShortUrl(
      listing.id,
      `${siteUrl}/listing/${listing.id}`
    );
    section += renderListingCard(listing, listingUrl) + "\n";
  }
  ```
  ```ts
  // supabase/functions/send-daily-admin-digest/index.ts:395-399 (residential) — same pattern repeated at :458-461 for commercial
  for (const listing of newListings) {
    ...
    const { data: shortCode } = await supabaseAdmin.rpc(
  ```
- **Fix prompt:** In both files, replace the sequential `for` loop calling `createShortUrl`/`create_short_url` per listing with a batched approach: either (a) call `Promise.all(listings.map(l => createShortUrl(...)))` in chunks of ~20 (mirroring the `BATCH_SIZE = 10` pattern already used correctly in `send-weekly-performance-reports/index.ts:267-320`), or (b) add a Postgres function that accepts an array of listing IDs and returns all short codes in one round trip, then call it once. Verify by dry-running a digest template with 500+ matching listings locally/staging and confirming total execution time stays well under the Edge Function timeout and scales sub-linearly with listing count.

### [P1] SMS reminder cron functions send one Twilio message at a time with no batching and no resume-on-timeout

> **🟡 STATUS (SMS audit, July 8 2026): PARTIALLY FIXED.** `send-renewal-reminders` was redesigned to a bulk-batch model — one SMS per owner listing all their expiring listings (commit `185ee4c`). **`send-paid-listing-reminders` is unchanged** (still a per-row loop) — remaining half of this finding is open.
- **Where:** `supabase/functions/send-paid-listing-reminders/index.ts:285-351` and `supabase/functions/send-renewal-reminders/index.ts:219-333` (`for` loops issuing sequential `await fetch(twilioUrl, ...)` calls, each preceded by a sequential dedup `SELECT` and followed by a sequential `INSERT` into `sms_messages`)
- **What:** Both functions iterate their list of due reminders one at a time; per reminder they do a `SELECT` (dedup check), an `await fetch()` to Twilio, and an `INSERT` — three sequential round trips per recipient, with no `Promise.allSettled`/batching. Contrast with `send-weekly-performance-reports/index.ts:267-320`, which correctly batches Twilio sends in groups of `BATCH_SIZE=10` via `Promise.allSettled`.
- **Why it matters / failure scenario:** As the number of paid/renewing listings grows into the hundreds, this sequential loop (3 round trips × ~100-400ms each ≈ 0.5-1.5s per reminder) can take many minutes to complete. Supabase Edge Functions have a wall-clock limit; if the function is killed mid-loop, everything after the current index is simply never processed **and there is no persisted cursor** — the next day's cron run recomputes "who's due today" from date-offset thresholds (`for (const offset of [3, 0])`), so a listing that was skipped due to a mid-run timeout is not guaranteed to be picked up again (it depends on whether it still matches a *different* day's offset window). This is exactly the "does it fail silently mid-batch, half the digests sent, no resume" scenario the audit is watching for.
- **Evidence:**
  ```ts
  // supabase/functions/send-paid-listing-reminders/index.ts:285-320 (abridged)
  for (const r of reminders) {
    ...
    const { data: existing } = await supabaseAdmin.from("sms_messages").select("id")... // dedup check, sequential
    ...
    const resp = await fetch(twilioUrl, { ... }); // sequential Twilio call
    ...
    await supabaseAdmin.from("sms_messages").insert({...}); // sequential insert
  }
  ```
- **Fix prompt:** In `supabase/functions/send-paid-listing-reminders/index.ts` and `supabase/functions/send-renewal-reminders/index.ts`, refactor the reminder-sending loops to process in fixed-size batches (e.g. 10) using `Promise.allSettled`, matching the existing pattern in `send-weekly-performance-reports/index.ts:264-320`. Keep the per-recipient dedup check but consider doing it as one batched `SELECT ... IN (...)` before the loop rather than one query per recipient. No resume/cursor mechanism is strictly required if batching keeps total wall-clock well under the function timeout, but log a summary of `reminders_found` vs `smsSent + smsErrors + skipped` so a mismatch is visible (both functions already log a summary object — extend it to alert if `smsSent + smsErrors + skipped < reminders_found`, which would indicate a mid-run abort). Verify by simulating 300+ due reminders in staging and confirming the function completes within the timeout and the summary counts reconcile.

### [P1] Weekly performance-report SMS job does a full, unfiltered scan of `analytics_events` for the trailing 7 days
- **Where:** `supabase/functions/send-weekly-performance-reports/index.ts:145-168`
- **What:** To compute per-listing impressions/views/phone-reveals for the week, the function runs three separate queries against `analytics_events` — `select('event_props').eq('event_name', X).gte('occurred_at', sevenDaysAgo)` for each of `listing_impression_batch`, `listing_view`, and `phone_reveal` — with **no listing/user scoping at the SQL level**. It fetches every matching event row for the whole site for the past week, then loops through all of them in JS (`for (const event of impressionsResult.data)`) to filter down to the ~N active listings via a JS `Set` lookup.
- **Why it matters / failure scenario:** `analytics_events` is written to on every pageview/impression via the `track` edge function (see the Analytics Ingestion finding below) with no aggregation — it is a raw, ever-growing event log. As traffic grows, a "past 7 days of impressions/views/phone-reveals, sitewide" query returns proportionally more rows every week, and this job pulls **all of them into function memory** before filtering. At high enough weekly event volume (tens/hundreds of thousands of rows), this risks Edge Function memory limits or slow execution, and because there is no per-listing filter in the SQL `WHERE` clause, an index on `event_name, occurred_at` helps but does not bound the result size as the site's traffic scales — only the SMS-sending half of this function is well-batched (see Non-findings); the data-gathering half is not.
- **Evidence:**
  ```ts
  // supabase/functions/send-weekly-performance-reports/index.ts:145-156
  const [impressionsResult, viewsResult, phoneRevealsResult, callbacksResult] = await Promise.all([
    supabaseAdmin.from('analytics_events').select('event_props').eq('event_name', 'listing_impression_batch').gte('occurred_at', sevenDaysAgo),
    supabaseAdmin.from('analytics_events').select('event_props').eq('event_name', 'listing_view').gte('occurred_at', sevenDaysAgo),
    supabaseAdmin.from('analytics_events').select('event_props').eq('event_name', 'phone_reveal').gte('occurred_at', sevenDaysAgo),
    ...
  ]);
  ```
- **Fix prompt:** Add a Postgres-side aggregation (a SQL function or materialized view keyed by `listing_id` + week) that pre-computes impression/view/phone-reveal counts per listing for the trailing week, so this Edge Function calls one aggregate query instead of pulling raw event rows. At minimum, verify `analytics_events` has a composite index on `(event_name, occurred_at)` (Track 1 owns index verification) so the raw scan is at least index-covered short-term. Verify by seeding 100k+ synthetic `analytics_events` rows across a week and confirming the function's data-gathering step stays fast and memory-bounded.

### [P0] `AdminPanel.tsx` listings/users management tables have no server-side pagination — same root cause as the P1 above, called out separately because it is a data-correctness issue, not just a speed issue
- **Where:** `src/pages/AdminPanel.tsx:372-420`
- **Why P0 not P1:** This is listed as P0 because the silent-truncation behavior is not a future risk — the code already contains the detection and warning path (`usersCount > allUsers.length`, `listingsCount > allListings.length`), meaning the team has already observed or anticipated this happening. An admin silently seeing "some users are hidden" with only a toast (which can be dismissed/missed) while performing bulk actions (bans, listing approvals, exports) is a production-outage-adjacent risk: admin decisions may be made on an incomplete data set with no reliable feedback loop, and there is no admin-facing "load more" or search-first-then-manage workflow that avoids this.
- **What / Evidence:** See the P1 "AdminPanel loads entire tables" finding above — same code, this entry exists to flag the *correctness* consequence (undercounting/hiding rows) as distinct from the *performance* consequence (slow, expensive loads), per the rubric's "data loss/leak... or production outage risk" P0 bar. If the owner's operational workflow depends on "the users list = all users," this is effectively silent data loss from the admin's point of view once row count crosses ~1,000.
- **Fix prompt:** Same fix as the P1 entry above (add server-side pagination/search to the admin tables). Additionally, until pagination ships, change the truncation toast from a dismissible `toast` to a persistent, impossible-to-miss banner at the top of the affected table, so admins cannot mistake a partial table for the complete one.

### [P2] Map has no marker clustering — every pin in the viewport becomes an individual DOM-based `mapboxgl.Marker`
- **Where:** `src/components/listings/ListingsMapEnhanced.tsx:962-1300` (marker create/update/remove logic), no `Supercluster`/GeoJSON-clustering usage found anywhere in the file
- **What:** Pins are rendered via individual `new mapboxgl.Marker()` instances with custom HTML elements, diffed by ID on each update (a reasonable pattern for a *moderate* pin count), but there is no clustering step to collapse dense areas into a single "12 listings" marker at low zoom.
- **Why it matters / failure scenario:** The map fetch is viewport-bounded (`getListings({..., bounds: mapFetchBounds}, ...)`) and debounced on `moveend` (300ms), which prevents the worst-case "fetch everything" scenario — this is a real mitigating factor. But within a single viewport, at 20,000 sitewide listings a popular, dense neighborhood zoomed out even slightly could return several hundred pins simultaneously; each is a real DOM node with its own mouse listeners, which is measurably slower to paint/reflow than a canvas-rendered or clustered representation, and will visually overlap/become unreadable well before any query limit is hit.
- **Evidence:** `src/components/listings/ListingsMapEnhanced.tsx:978-1071` creates one `mapboxgl.Marker` per pin with no density check; grep of the file for `cluster`/`Supercluster`/`GeoJSON` returns no matches.
- **Fix prompt:** Introduce marker clustering (Mapbox GL's built-in `cluster: true` GeoJSON source option, or the `supercluster` npm package) in `ListingsMapEnhanced.tsx`, replacing individual DOM markers with a clustered circle-layer at low zoom that expands to individual custom markers only once zoomed in past a density threshold. Verify by seeding a dense cluster of 300+ listings in one neighborhood locally and confirming the map stays responsive and legible when zoomed out.

### [P2] Browse card grids and detail pages serve the same full-resolution image — no responsive/thumbnail sizing
- **Where:** `src/utils/imageResize.ts` (client-side resize caps at `MAX_DIMENSION = 2400`, quality `0.85`), `src/components/listings/ListingCard.tsx:171-181` (`<img src={primaryImageUrl} ... loading="lazy" />` with no width/quality query parameter or `srcset`)
- **What:** Uploads are resized client-side to a max of 2400px on the longest side before upload (a good practice that caps worst-case size), but that single resolution is then used everywhere the image is displayed — the browse grid card (rendered at a small `aspect-[3/2]` box), the map popup, and the full listing detail page all load the identical file. No Supabase Storage image-transformation parameters (`?width=...&quality=...`) or responsive `srcset` are used anywhere in the card component.
- **Why it matters / failure scenario:** A typical resized real-estate photo at 2400px/quality 0.85 is commonly 300-700 KB. A browse page showing 24 cards (one image each, lazy-loaded as the user scrolls) therefore transfers on the order of **7-15 MB** of image data for a grid where each image renders at a few hundred pixels wide — roughly 10-20x more bytes than a properly-sized ~400px-wide thumbnail (~30-70 KB) would need. This is a real, present-day cost (Supabase Storage egress is billed per GB) and mobile-UX cost, and it scales linearly with page views, not listing count — it does not "break" at any particular N, but it is a compounding, avoidable expense as traffic grows.
- **Evidence:**
  ```ts
  // src/utils/imageResize.ts
  const MAX_DIMENSION = 2400;
  const OUTPUT_QUALITY = 0.85;
  ```
  ```tsx
  // src/components/listings/ListingCard.tsx:171-181 — no width/quality transform param
  <img src={primaryImageUrl} ... loading="lazy" ... />
  ```
- **Fix prompt:** If the Supabase project tier supports Storage image transformations, append `?width=480&quality=70` (or similar) to `primaryImageUrl` in `ListingCard.tsx` (and the equivalent commercial card component) for grid thumbnails, while leaving the full-resolution URL for the detail-page gallery. If transformations aren't available on the current plan, generate and store a second, smaller derivative at upload time (e.g. 480px) in `finalizeTempListingImages`/`uploadListingImage` in `src/services/listings.ts`, and point card components at that derivative. Verify by inspecting network payload size for a 24-card browse page load before/after the change.

### [P2] Bedroom-count and neighborhood-list helpers fetch every matching row and aggregate client-side instead of using a DB-side GROUP BY
- **Where:** `src/services/listings.ts` `getAvailableBedroomCounts` (lines 1609-1667), `getActiveNeighborhoods`/`getActiveSalesNeighborhoods`/`getActiveRentalNeighborhoods` (lines 1434-1561)
- **What:** These helpers run `select('bedrooms', {count:'exact'})` or `select('neighborhood')` over every active+approved listing matching the current filters (no `.range()`), then build a `Map`/`Set` in JavaScript to produce counts-per-bedroom or the distinct neighborhood list, instead of letting Postgres do a `GROUP BY`.
- **Why it matters / failure scenario:** These are single-column selects so the per-row payload is small, but the *row count* still scales with total active listings; at 20,000+ active listings, every browse page load triggers a full-table (or full-filtered-set) fetch just to populate the bedroom-count sidebar and the neighborhood filter dropdown, re-doing the same aggregation work client-side on every page view.
- **Evidence:**
  ```ts
  // src/services/listings.ts:1617-1621
  let query = supabase
    .from('listings')
    .select(ownerSelect, { count: 'exact' })
    .eq('is_active', true)
    .eq('approved', true);
  // ...no .range() applied; all matching rows are fetched, then reduced client-side (line 1658-1666)
  ```
- **Fix prompt:** Replace `getAvailableBedroomCounts` and the neighborhood-list helpers with a Postgres RPC (e.g. `SELECT bedrooms, count(*) FROM listings WHERE is_active AND approved ... GROUP BY bedrooms`) exposed via `supabase.rpc(...)`, mirroring the pattern already used elsewhere in this file (`get_user_permissions`, `get_owner_listing_inquiry_counts`). Verify by comparing output before/after on a seeded dataset and confirming the RPC returns identical counts with a single query instead of an N-row fetch.

### [P2] Eager entry bundle is 1.73 MB / ~413 KB gzipped despite good route-level code splitting elsewhere
- **Where:** `src/App.tsx:1-16` (eager, non-lazy imports of `Home`, `BrowseListings`, `BrowseSales`, `AuthForm`, `ListingDetail`, `CommercialListingDetail`, `AgencyPage`), build output `dist/assets/index-*.js`
- **What:** Running `npm run build` shows most routes are properly code-split via `React.lazy` (confirmed: `AdminPanel`, `InternalAnalytics`, `ContentManagement`, `DigestManager`, `PostListing`, `EditListing`, and others all produce separate chunks, 137 KB / 72 KB / etc. respectively — none of this ships to anonymous visitors up front). Mapbox GL is also correctly isolated: it lives in a separately-fetched chunk (`env-*.js`, 1.68 MB / 463 KB gzip) that is only pulled in when a lazy component that needs it (the map, address autocomplete, etc.) is actually loaded — confirmed by grepping the entry chunk for `mapboxgl` (zero matches) and finding it only in `env-*.js`, which is referenced as a dynamic-import dependency, not from the `<script>` tag in `index.html`. However, the small set of routes that remain eagerly imported at the top of `App.tsx` (Home, both Browse pages, ListingDetail, CommercialListingDetail, AgencyPage, AuthForm) plus shared vendor code (React, react-router, Supabase JS client, Sentry) still add up to a 1.73 MB / 413 KB-gzip entry chunk that every visitor downloads before first paint.
- **Why it matters / failure scenario:** This does not scale with listing/user count — it scales with feature growth in the always-eager pages (Browse pages are already "god files" at 1400+ lines each per the master plan). 413 KB gzip of JS-before-interactive is on the high side for a real-estate marketplace's first paint, particularly on mobile/slow connections, and will keep growing as more logic accretes into `BrowseListings.tsx`/`Home.tsx` unless those pages are also lazy-split or further decomposed.
- **Evidence:** Build output (`npm run build`): `dist/assets/index-Dh9RoYZi.js  1,734.33 kB │ gzip: 413.64 kB` as the only `<script type="module">` referenced in `dist/index.html`; `dist/assets/env-f__1OE3J.js 1,676.87 kB │ gzip: 463.73 kB` contains `mapboxgl`/`mapbox-gl` (136/16 occurrences respectively) and is referenced only from the dynamic-import dependency graph of `ListingsMapEnhanced`, `AdminPanel`, `PostListing`, etc. — not from the entry chunk directly (zero `mapboxgl` matches in `index-*.js`).
- **Fix prompt:** Consider lazy-loading `Home` is not worth it (it's the landing page, needs to be fast anyway), but evaluate whether `BrowseSales`, `CommercialListingDetail`, and `AgencyPage` can be converted to `React.lazy` in `src/App.tsx` alongside the already-lazy routes, since they are not needed for the very first paint of the homepage. Run `npx vite-bundle-visualizer` or inspect `dist/assets/index-*.js` with a source-map explorer to confirm what vendor code (Sentry, Supabase client, etc.) dominates the remaining entry chunk size, and evaluate whether Sentry can be initialized lazily/deferred. This is a hygiene/cost item, not an urgent fix — treat as a P2 cleanup task.

### [P3] `getSimilarListings` issues up to 2 sequential full-table-shaped queries per listing-detail page view
- **Where:** `src/services/listings.ts:671-774`
- **What:** To find "similar listings" for a detail page, the function first queries exact-bedroom matches; if fewer than `limit` results come back, it issues a **second** query for `bedrooms ± 1`, then combines, dedupes, and scores/sorts all of it in JavaScript.
- **Why it matters / failure scenario:** This is at most 2 sequential queries per listing-detail page view (not an unbounded loop), each properly filtered (`is_active`, `approved`, `bedrooms` range) and range-limited (`.range(offset, offset + limit - 1)`), so it is bounded and reasonable — flagged as low severity because the *scoring/sorting* step runs on whatever the second query returns without an explicit upper bound beyond the `.range()` already applied, so it's a minor inefficiency (2 round trips instead of 1) rather than a scaling risk.
- **Evidence:** `src/services/listings.ts:700-730` — the two sequential `await` query blocks for the "similar listings" feature.
- **Fix prompt:** Low priority. If ever revisited, combine both bedroom-range conditions into a single query using a wider `.gte`/`.lte` filter (or an `.in()` over `[bedrooms-1, bedrooms, bedrooms+1]` as the primary query, only falling back to the wider "any active listing" query if that returns zero rows) to cut the common case down to one round trip.

## Non-findings (things checked and confirmed healthy)

- **Analytics ingestion (`track` edge function):** batches client events (max 50 per request), rate-limits by hashed IP (200 events/min/IP with in-memory sliding window + opportunistic cleanup), and inserts in a single batched `.insert(filteredEvents)` call rather than one insert per event. This is reasonably defended against abuse and doesn't do per-event round trips. (The *downstream* unbounded growth/no-aggregation of `analytics_events` is still flagged above as a P1 via the weekly-report consumer — the ingestion path itself is fine.)
- **Realtime subscriptions:** only one `supabase.channel(...)` usage found in the entire `src/` tree (`src/components/shared/Layout.tsx:185-221`, agency-update listener), and it is correctly torn down via `supabase.removeChannel(channel)` in the `useEffect` cleanup function. No leaked listeners found.
- **Map viewport bounding + debounce:** `ListingsMapEnhanced.tsx` debounces `moveend` bounds-change callbacks by 300ms (`boundsChangeTimeoutRef`) before notifying the parent to refetch, and the parent (`BrowseListings.tsx`) scopes the map's listing fetch to the current viewport bounds (`mapFetchBounds`) rather than fetching sitewide data for the map — this correctly decouples map payload size from total listing count, independent of the pagination finding above.
- **Filter-apply flow is not debounce-dependent:** price min/max and square-footage inputs in `ListingFiltersHorizontal.tsx` use local component state (`tempPriceMin`/`tempPriceMax`/`tempSfMin`/`tempSfMax`) that is only committed to the shared filter state (which triggers a re-fetch) on explicit "Apply"/selection actions, not on every keystroke — so there is no discovered case of a browse re-fetch firing per keystroke.
- **`inactivate-old-listings` and `delete-old-listings` edge functions:** both are thin wrappers that delegate entirely to Postgres RPCs (`auto_inactivate_old_listings`, `auto_delete_very_old_listings`, and their commercial equivalents) — i.e. a single `SELECT`/`UPDATE`/`DELETE` statement executed inside Postgres, not a per-row loop in the edge function. These scale with the database's own query performance, not edge-function iteration count, and are not a batch-loop risk.
- **`send-weekly-performance-reports` SMS-sending loop:** unlike the other two reminder functions, this one correctly batches Twilio sends in groups of `BATCH_SIZE = 10` via `Promise.allSettled` (lines 264-320) rather than one at a time — flagged in the findings above only for its data-gathering half, not this part.
- **Client-side image resize before upload:** `src/utils/imageResize.ts` caps uploaded images at 2400px on the longest side and re-encodes to JPEG at quality 0.85 before upload, skipping files already under 500 KB — this bounds worst-case per-image storage size and prevents raw multi-MB phone photos from being uploaded unmodified.
- **Route-level code splitting:** the majority of the route tree (Admin Panel, Internal Analytics, Content Management, Digest Manager/Settings, Post/Edit flows, Account, Agency Settings, Help Center, and more) is wrapped in `React.lazy`, confirmed by both the `App.tsx` source and the build output producing separate chunks for each. Admin/analytics code is **not** part of the bundle anonymous visitors download.
- **Mapbox GL is not in the entry bundle:** confirmed via build output and grep — the ~1.7 MB `mapbox-gl` dependency lives in a separately fetched chunk only pulled in by components that dynamically import it (map, address autocomplete), matching the intent documented directly in `ListingsMapEnhancedLazy.tsx`'s comment.
