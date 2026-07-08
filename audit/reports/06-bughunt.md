# Track 6 — Correctness bug hunt (deep read of hot paths) — Findings

## Summary

Overall the hot paths are more robust than the project's `.md` fix-history suggests: the
create-vs-edit divergence class that bit this codebase before (utilities checkboxes, cross
streets, images) has been genuinely closed on the **canonical** flows. The live post/edit
pair is the wizard (`/post` → `PostListingWizard`, `/edit/:id` → `EditListingWizard`); I
diffed their payloads field-by-field against the editable wizard steps and found no
data-loss divergence for rentals or sales — `utilities_included`, `apartment_conditions`,
cross streets, AC, parking, etc. all round-trip. The legacy classic forms (`/post-old`,
`/edit-old`) still carry one gap but are no longer linked from the UI.

The real bugs are in the **browse/pagination** layer. The worst is a silent
listing-skip: on both BrowseListings and BrowseSales, when featured listings are woven into
a page, the standard-listings page cursor advances by a full page (20) while only
`20 − featuredCount` standard items are consumed, so `featuredCount` real listings fall into
an unreachable gap at every page boundary — some active listings are never shown on any
page. A related count-drift bug inflates the "N properties available" total and creates
empty trailing pages whenever a client-only filter (lease term) is active. Lower-severity:
a read-modify-write race in the legacy `views` counter, dead approval-email code in
`updateListing`, and a residual UTC "today" bucket in an admin analytics tool.

Counts: **P1: 1 · P2: 3 · P3: 3** (plus 2 UNVERIFIED items flagged for the DB/billing tracks).

## Findings

### [P1] Browse pagination silently skips standard listings whenever featured listings are injected
- **Where:** `src/pages/BrowseListings.tsx:361-370` and identical logic in `src/pages/BrowseSales.tsx:328-337`; mechanism in `src/utils/featuredInjection.ts:18-47`.
- **What:** Per page the code computes `numStandardNeeded = ITEMS_PER_PAGE - featuredForThisPage.length` and then slices the standard stream with `standardOffset = (currentPage - 1) * ITEMS_PER_PAGE` → `standardStream.slice(standardOffset, standardOffset + numStandardNeeded)`. The offset increments by a full `ITEMS_PER_PAGE` (20) each page, but only `numStandardNeeded` (20 − featuredCount) standard items are pulled. The `featuredCount` items between `standardOffset + numStandardNeeded` and the next page's `standardOffset` are never included on any page.
- **Why it matters / failure scenario:** With featured listings present (the normal state on this site), `selectFeaturedForPage` returns up to 4 featured per page, so `numStandardNeeded` ≈ 16 while the offset steps by 20. Page 1 shows standard[0..15], page 2 shows standard[20..35]; standard[16..19] are shown on no page. As a renter paginates, ~4 non-featured listings per page boundary become undiscoverable. A landlord's active, approved, non-featured listing can be permanently invisible in browse depending on where it sorts. This worsens as inventory grows.
- **Evidence:** `featuredInjection.ts:37-44` `selectFeaturedForPage` returns `slotsPerPage` (= `injectionPositions.length` = 4 from `computeInjectionPositions`) deduped featured items, so `featuredForThisPage.length > 0` whenever any featured match. `BrowseListings.tsx:368-370`:
  ```js
  const numStandardNeeded = ITEMS_PER_PAGE - featuredForThisPage.length;
  const standardOffset = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageStandard = standardStream.slice(standardOffset, standardOffset + numStandardNeeded);
  ```
  `standardStream` is the full residential+commercial sorted array (`:329-332`), so the gap items are genuine, unshown listings.
- **Fix prompt:** In `src/pages/BrowseListings.tsx` and `src/pages/BrowseSales.tsx`, make the standard-stream cursor advance by the number of standard items actually consumed, not by `ITEMS_PER_PAGE`. Track a running count of standard items placed on prior pages (sum of `20 − featuredCountForPageN` for N < currentPage), or restructure so featured injection consumes from the same global cursor. Because `featuredForThisPage.length` can vary per page, compute the offset by summing per-page standard counts rather than multiplying. Verify by loading a filter set that yields >40 standard + ≥1 featured listing and confirming that concatenating the standard (non-badged) items across all pages reproduces the full sorted stream with no missing ids and no duplicates.

### [P2] "Properties available" count and page count are inflated when a client-only filter (lease term) is active
- **Where:** `src/pages/BrowseListings.tsx:286-296` (`combinedTotalCount`/`setTotalCount`) vs `:328` (`applyClientSideFilters`) and `:61-79`.
- **What:** `totalCount` is set from the DB `count` (`residentialCount + commercialCount`), but `lease_terms` is filtered **only client-side** in `applyClientSideFilters` and is not sent to `listingsService.getListings` (the service's `GetListingsFilters` has no `lease_terms` field). So the total and `totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)` count listings that are then filtered out of the displayed stream.
- **Why it matters / failure scenario:** A renter selects lease term "Summer Rental." The header shows e.g. "180 properties available" and the pager offers 9 pages, but only a handful of listings actually match; pages 2+ render empty (the standard slice is past the end of the filtered stream). Users see a wrong count and dead pages.
- **Evidence:** `useBrowseFilters.ts:210-213` parses `lease_terms` into filter state; `BrowseListings.tsx:241-246` builds `serviceFilters` without mapping `lease_terms`; `listings.ts:90-106` `GetListingsFilters` has no `lease_terms` and `getListings` never references it; `BrowseListings.tsx:328` applies it client-side after the count was already taken at `:293-294`.
- **Fix prompt:** Either (a) push lease-term filtering into `listingsService.getListings` (add a `lease_terms` predicate: `lease_length in (...)` with the null/long-term special-case matching the client logic) so the DB `count` reflects it, or (b) after `applyClientSideFilters`, recompute the displayed total from the filtered stream length and derive `totalPages` from that instead of the raw DB count. Verify by selecting a lease-term filter and confirming the header count equals the number of cards actually reachable across all pages, with no empty trailing page.

### [P2] `incrementListingView` is a read-modify-write with no atomicity → lost view counts
- **Where:** `src/services/listings.ts:1373-1391`, called from `src/pages/ListingDetail.tsx:282`.
- **What:** It `select`s the current `views`, computes `newViews = listing.views + 1` in JS, then `update`s. Two concurrent detail views both read the same `N` and both write `N+1`, losing one increment. The final `update` also has no error check (result ignored).
- **Why it matters / failure scenario:** Popular listings undercount views; the more concurrent traffic, the larger the undercount. Not money-critical but it feeds owner-facing "views" numbers, so the owner-visible stat is systematically low under load. `listing.views` is also assumed non-null (`listing.views + 1`); a null yields `NaN` written to the column.
- **Evidence:** `listings.ts:1385` `const newViews = listing.views + 1;` then unguarded `.update({ views: newViews })` at `:1387-1390`.
- **Fix prompt:** Replace the read-modify-write with an atomic DB increment: add a Postgres RPC (`create function increment_listing_view(p_id uuid) ... update listings set views = coalesce(views,0) + 1 where id = p_id`) and call `supabase.rpc('increment_listing_view', { p_id: listingId })`, or use a single `update ... set views = views + 1`. Guard against null with `coalesce`. Verify by firing N concurrent calls in a test and confirming `views` increases by exactly N.

### [P3] Dead approval-email path in `updateListing` (owner is never loaded, and real approval bypasses it)
- **Where:** `src/services/listings.ts:479-486` (the `currentListing` select) vs `:621-657` (the approval-email block).
- **What:** The block that sends `sendListingApprovalEmail` on an unapproved→approved flip reads `currentListing.profiles?.email` / `currentListing.owner?.email`, but the `currentListing` query only selects `approved, title, user_id, is_featured, call_for_price, listing_type, created_at` — no `owner`/`profiles` join. So `ownerEmail`/`ownerName` are always null and the code always logs "skipping approval email: missing owner email." Separately, admin approval actually runs through the `approve-listing` edge function (`AdminPanel.tsx:791-842`), not `updateListing`, so this branch is dead for the real approval flow.
- **Why it matters / failure scenario:** No functional harm today (the edge function owns approval emails), but the block is misleading dead code that looks like it sends a critical notification and never can. If someone ever routes approval through `updateListing` (e.g. the legacy `/edit-old` admin edit sets `approved: true`), they'll silently get no email and assume it works.
- **Evidence:** `listings.ts:482-486` select list contains no `owner`/`profiles`; `:628-631` `const ownerEmail = currentListing?.profiles?.email ?? owner?.email ?? null;` is therefore always null; `:640` short-circuits to the warn branch.
- **Fix prompt:** Remove the dead approval-email block from `listingsService.updateListing` (approval emails are owned by the `approve-listing` edge function), OR, if it is meant to be a live path, add the owner join to the `currentListing` select (`owner:public_profiles!listings_user_id_fkey(id,full_name,email)`) and read from it. Confirm `approve-listing/index.ts` already sends the approval email before deleting the block so no notification is lost.

### [P3] Legacy `/edit-old` rental edit drops `utilities_included` (and `tenant_notes`, `basement_notes`) from the update payload
- **Where:** `src/pages/EditListing.tsx:706-804` (rental `else` branch at `:797-804` omits these; they appear only in the sale branch at `:790-791`, `:786`).
- **What:** In the still-reachable legacy edit page (`/edit-old/:id` → `EditListing`), the rental update payload has no `utilities_included`. Because `updateListing` does a partial `.update()`, the existing value is preserved (not wiped), but a user editing a rental via this route cannot change utilities — the rental form doesn't even render the utilities UI (`handleUtilityToggle` is passed only to the sale-only `SalesListingFields`).
- **Why it matters / failure scenario:** Only matters for anyone who reaches `/edit-old/:id` directly (not linked from the Dashboard, which uses `/edit/:id` → the wizard, where utilities ARE saved — `EditListingWizard.tsx:365`). Low blast radius; flagged for completeness given the class history.
- **Evidence:** `App.tsx:112` `<Route path="/edit-old/:id" element={<EditListing />} />`; `EditListing.tsx:797-804` else branch has only `price, call_for_price, lease_length, square_footage`; no utilities row rendered for rentals (only via `SalesListingFields` at `:1765-1781`).
- **Fix prompt:** Either retire the `/edit-old` route in `App.tsx` (the wizard is canonical), or, if kept, add `utilities_included` (and render the utilities toggles for rentals) to `EditListing.tsx` matching `EditListingWizard.tsx:365`. Verify by editing a rental's utilities on the chosen route and confirming the DB row updates.

### [P3] Admin analytics ValidationTab uses UTC "today", not America/New_York
- **Where:** `src/components/analytics/ValidationTab.tsx:56` and `:124` — `new Date().toISOString().split('T')[0]`.
- **What:** "Today's" date default and the date-input `max` are computed from `toISOString()` (UTC). After ~7–8pm ET the UTC date is already tomorrow, so the tool defaults to and allows a date that is "the future" in NY terms — the same timezone class flagged in `ANALYTICS_TIMEZONE_FIX_REPORT.md`, residual here.
- **Why it matters / failure scenario:** Admin-only validation tool; in the evening it defaults the date picker to tomorrow (NY), which can misalign with the NY-bucketed analytics it validates. Cosmetic/analyst-facing, not user-facing.
- **Evidence:** `ValidationTab.tsx:56` `new Date().toISOString().split('T')[0]`.
- **Fix prompt:** Compute "today" in America/New_York (e.g. `new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())` yields `YYYY-MM-DD`) for both the default value and the input `max`. Verify at ~9pm ET that the default date equals the NY calendar date.

## UNVERIFIED — needs live check (defer to DB/billing tracks)

- **Free renew may bypass the monetization paywall.** `Dashboard.tsx:445-478` `handleRenewListing` → `listings.ts:1974-2024` `renewListing` sets `is_active=true, expires_at=now+rentalDays, deactivated_at=null` with **no payment/coverage check** on the client, and even re-resumes featured status from `featured_purchases`. `PostListing.tsx:56` comments that a DB trigger `monetization_payment_guard` backstops this. If that trigger is applied in prod and covers the reactivation path, `renewListing` throws for uncovered rentals and the user sees "Failed to renew"; if not, an expired paid/trial rental can be reactivated for 30 days free = revenue leak. Verify the trigger exists and blocks `is_active false→true` on rentals lacking coverage. (Billing track owns entitlement drift.)
- **`renewListingViaSMS` stacks days onto a not-yet-expired listing.** `listings.ts:2059-2093` sets `newExpiresAt = (expires_at ?? now) + 14 days`. If a listing is renewed via SMS while still active, the 14 days are added on top of remaining time rather than from now; if already expired it renews from now. Confirm this is intended (vs. `renewListing` which sets from now).

## Non-findings (checked and confirmed healthy)

- **Canonical create-vs-edit parity (rentals & sales).** Diffed `PostListingWizard.handleSubmit` (`:731-841`) against `EditListingWizard.handleSubmit` (`:333-420`) and the editable wizard steps. All fields a user can edit round-trip: `utilities_included`, `apartment_conditions`, `ac_type`, `parking`, `washer_dryer_hookup`, `dishwasher`, `square_footage`, cross streets, neighborhood, outdoor_space, interior_features, basement/heating/laundry types, and the full sale field set. No silent data loss on the live flows.
- **Cross-street persistence on edit.** Both `EditListing.tsx:344-360` and `EditListingWizard.tsx:224-240` re-seed `crossStreetAFeature/BFeature` from `cross_street_a/b` and write them back (`EditListingWizard.tsx:337-338`), so editing without touching them preserves them.
- **Image featured/order + deletion on edit.** `EditListingWizard.tsx:294-311` deletes removed media and updates `is_featured` for retained images; new images finalized at `:426-435`. Consistent with create.
- **Filter URL round-tripping.** `useBrowseFilters.filtersToSearchParams`/`parseFiltersFromURL` are symmetric for the fields they serialize; sharing a filtered URL reproduces state (bedrooms, price, neighborhoods, sort, bounds, poster_type, commercial filters).
- **Price/bedroom range predicates.** `getListings`/`getSaleListings` use inclusive `gte/lte` on `price`/`asking_price` consistently; `min_price:0` is treated as unset (`if (filters.min_price)`), which is harmless since a $0 floor is meaningless.
- **poster_type / agency filters are server-side** in `getListings` (`:217-224`) and reflected in the DB count, so they do **not** cause the count drift that `lease_terms` does.
- **Impression observers clean up on unmount.** `useListingImpressions.ts:68-76` and `useCommercialImpressions.ts:65-69` disconnect the IntersectionObserver and flush on unmount; no leak.
- **Double-submit / OAuth-replay in the wizard** is deliberately guarded: `handleAuthSuccess` removes the `wizard:pendingSubmit` marker so the `useEffect([user])` replay doesn't also fire (`PostListingWizard.tsx:951-964`), preventing a double-create on email/password signup.
- **`getSaleListings` PostgREST 416 handling** (`listings.ts:1779-1792`) correctly detects the error-as-data shape and returns an empty page with the real count instead of throwing.
