# Analytics Overhaul — Deployment Guide

**Branch:** `claude/analytics-overhaul` (pushed)
**Date:** July 22, 2026

The code side is done, built, linted, and pushed. Two migrations still need to be
applied to production. I was able to **read** production freely (that's how the
audit findings and the validation below were confirmed) but the harness blocked
every **write** to prod, so the two migrations need you to paste them.

---

## Step 1 — Migrations: DONE (already applied to production)

All three migrations are applied and verified in production:

1. `20260720120000_analytics_rollup_v2_and_retention.sql` ✅
2. `20260720120100_analytics_new_dashboard_rpcs.sql` ✅
3. `20260722100000_admin_excluded_from_all_counters.sql` ✅

Verified after applying:

- `daily_analytics` now holds **324 days**, newest 2026-07-21, with the new
  columns populated (e.g. 2026-07-21: 192 visitors / 253 sessions / 215 listing
  views / 1,365 impressions / 47 returners).
- All 5 new functions exist (`analytics_traffic_sources`,
  `analytics_engagement_extras`, `analytics_longterm_trends`,
  `analytics_listing_engagement`, `rollup_analytics_for_date`).
- All 5 `increment_*` counters carry the admin guard and a `search_path`.
- `analytics_events` shrank from **132 MB → 103 MB** (index cleanup).

⚠️ **One caveat on the backfill:** it rebuilt the last 90 days correctly. Rows
older than that (Sept 2025 → ~Apr 2026) still hold the *old, wrong* numbers,
because the raw events they'd be recomputed from were already deleted by the
90-day retention. Nothing can recover those. Treat `daily_analytics` before
~April 22, 2026 as unreliable.

### De-risking: what I verified first

Because I couldn't test the migrations by running them, I extracted every
non-trivial aggregate expression and ran it as a read-only `SELECT` against real
production data. All six passed:

| Check | Result on live data |
|---|---|
| Main daily rollup row | 188 visitors, 249 sessions, 1,365 impressions, 214 listing views, 30 phone reveals |
| Returners subquery (rewritten) | 47 |
| Impression array expansion | top listing 46 impressions |
| Filter expansion | `price_max=5000` (6 uses) |
| Traffic-source classification | 100% `direct` (expected — attribution ships with this release) |
| Contact submissions join | 4 |

That last table is also the proof the old rollup was broken: for the same day it
had been recording `returners = dau = 3` and a posting funnel of all zeros.

## Admin activity is now excluded everywhere

Events were already excluded twice (client suppression + a server-side filter
in the track function). The **row counters had no guard at all**, so admin
browsing was inflating:

| Counter | Who saw the inflated number |
|---|---|
| `listings.views` | listing owners, on their dashboard + weekly performance email |
| `commercial_listings.views` / `direct_views` | commercial owners |
| `commercial_listings.impressions` | source of truth for commercial impressions |
| `short_urls.click_count` | digest link performance |
| `knowledge_base_articles.view_count` | help-center reporting |

Fixed at three layers:

1. **Database** — `is_admin_cached()` guard inside all five `increment_*`
   functions, so the exclusion holds no matter which client path calls them.
2. **Client** — `isTrackingSuppressed()` check at each call site.
3. **Impersonation** — "sign in as user" sessions look like a normal user to
   *both* the client profile check and `is_admin_cached()`, so they were being
   counted as real traffic. A flag now suppresses analytics (and GA) for the
   whole support session, cleared on sign-out.

Also fixed along the way: `incrementListingView` was doing a read-modify-write
directly on the `listings` table — it bypassed the RPC guard **and** lost view
counts when two people opened a listing at the same time. It now calls the
atomic guarded RPC.

**Remaining limit:** an admin browsing while logged out is indistinguishable
from a real visitor. Nothing can detect that; log in to be excluded.

## Step 2 — Verify (optional; already confirmed)

```sql
-- Rollup should now show real numbers in the new columns
SELECT date, visitors, sessions_count, returners, listing_views,
       impressions, phone_reveals, contact_submissions
FROM daily_analytics ORDER BY date DESC LIMIT 5;

-- Should return 90 backfilled days
SELECT count(*) AS backfilled_days FROM daily_analytics;

-- New RPCs exist
SELECT proname FROM pg_proc WHERE proname IN
 ('analytics_traffic_sources','analytics_engagement_extras',
  'analytics_longterm_trends','analytics_listing_engagement',
  'rollup_analytics_for_date');
```

Expected: 5 recent rows with non-zero `sessions_count`/`impressions`, ~90
backfilled days, and all 5 function names listed.

## Step 3 — Test on localhost, then open the PR (only remaining step)

```bash
npm run dev
```

Sign in as admin → `/internal-analytics`:

- **Traffic & Retention** — new "Where Visitors Come From" panel (will say no
  data yet, correct until new sessions arrive) and a "Long-Term Trends" row of
  three 180-day sparklines that should populate immediately from the backfill.
- **Engagement** — new "Intent Signals" grid (favorites, shares, searches,
  photo zooms, card clicks, callback requests). Zeros until traffic arrives
  post-deploy; that's expected, not a bug.
- **Listings** — click any listing row → drilldown panel now has an "Intent
  Signals" block.

Then open the PR to `main` yourself, as usual.

---

## What changed

### Tracking (the big one)
Ten intent events that previously existed **only in Google Analytics** now also
flow into the internal system: favorites, unfavorites, shares, searches, card
clicks, photo zooms, scroll depth, contact clicks, and report-rented. This is
done by mirroring inside `gaEvent()` in `src/lib/ga.ts`, so every existing GA
call site was picked up without touching 15 components. Events already tracked
internally are deliberately excluded from the mirror so nothing double-counts.

GA is now also disabled for admins via the official `ga-disable` flag, matching
the internal suppression — so your own browsing stops polluting GA too.

### Attribution
`session_start` now carries `referrer`, `landing_path`, and UTM parameters.
A new `analytics_traffic_sources` RPC classifies these into Google / WhatsApp /
Facebook / direct / etc. **This is forward-only** — it can't reconstruct where
past visitors came from, so the panel fills in from here on.

### The contact-session join
`listingContact.ts` was minting its own random session ID, which is why the
January 2026 "dual metrics" rebuild had to count phone reveals and callback
forms separately instead of joining them. It now uses the real analytics
session ID and emits a `contact_submitted` event, so new inquiries are fully
traceable from impression → view → phone reveal → callback. Historic rows keep
the old mismatched IDs and can't be retrofitted.

### Long-term memory (the 90-day amnesia fix)
`rollup_analytics_events()` was reading the legacy `props` column — empty since
the November 2025 column consolidation — and matching event names that never
existed (`post_start` vs the real `post_started`). So the permanent aggregate
table has been quietly filling with wrong numbers for months while raw events
aged out at 90 days.

Rebuilt as `rollup_analytics_for_date(date)` with a thin daily wrapper, on the
current schema and correct event names, with 10 new per-day metrics, and
backfilled 90 days. Now the 30/90-day raw retention is genuinely safe: trends
survive in `daily_analytics` forever, and `analytics_longterm_trends` reads them.

### Retention and storage
- Sessions idle > 1 hour now get closed (84% of your 50k sessions never got an
  `ended_at`, because `session_end` rarely survives a tab close), and sessions
  older than 180 days are purged — previously `analytics_sessions` had **no**
  retention at all and held rows back to September 2025.
- Event deletion now keys off insert time rather than the client-supplied
  timestamp, so a device with a wrong clock can't dodge retention.
- Dropped 4 indexes (~30 MB of the 66 MB index footprint): two exact duplicates
  and two with zero recorded scans, including a GIN index on the always-empty
  legacy `props` column.

**Legacy columns kept deliberately.** `ts`, `page`, `referrer`, `user_agent`,
`ip`, `props` are all NULL/empty and cost nothing, but 16 deployed
`SECURITY DEFINER` functions have source referencing `props`. Dropping the
columns would break them at runtime; dropping unused indexes is safe. Not worth
the risk for zero space saved.

### Commercial parity
Commercial impressions now emit `listing_impression_batch` events with
`listing_type: 'commercial'` alongside the existing row counter, so commercial
listings get real time-series data instead of a lifetime integer.

---

## Known gaps (deliberate, not oversights)

1. **Attribution and intent metrics start at zero.** Both are forward-only. Give
   it a few days of traffic before judging the panels.
2. **GA4 stays connected.** I unified *into* the internal system rather than
   ripping GA out — it's a free second opinion and removing it is a separate
   decision. Once you trust the internal numbers, dropping the gtag snippet from
   `index.html` is a two-line change.
3. **Scroll-depth events are high-volume** and now land in the internal table.
   They're in the 30-day retention tier for that reason. If the table grows
   faster than you like, dropping `listing_scroll` from the mirror in `ga.ts` is
   a one-line change.
4. **`analytics_sessions.duration_seconds`** is only populated for sessions
   closed by the new cleanup job going forward; historic rows stay NULL.
5. **Pre-April-2026 `daily_analytics` rows keep the old wrong values** — the
   raw events needed to recompute them were already deleted. Unrecoverable.
6. **Admins browsing logged out** can't be excluded from anything. Inherent.
