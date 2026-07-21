# Internal Analytics System Audit — July 20, 2026

**Scope:** Full audit of Hadirot's first-party analytics: coverage, storage/retention efficiency, holes, and recommendations. Read-only — no code changed. Supersedes the stale October 2025 report (`ANALYTICS_SYSTEM_AUDIT_REPORT.md`), which predates the wizard funnel, login-gate funnel, dual inquiry metrics, and commercial analytics.

**Method:** Static review of the tracker (`src/lib/analytics.ts`), ingestion (`supabase/functions/track/index.ts`), all 37 analytics migrations, dashboard (`src/pages/InternalAnalytics.tsx` + 8 tab components, ~22 RPCs), impression hooks, weekly report edge function, and GA4 integration (`src/lib/ga.ts`). Live-DB verification was blocked by the session's permission gate — a paste-in SQL block is at the bottom.

---

## Verdict

The foundation is genuinely good — better than most small marketplaces: batched privacy-conscious ingestion, dual-layer admin exclusion, session modeling, funnels (posting wizard, login gate), inquiry velocity, a data-quality validation tab, and owner-facing weekly emails. The two big problems are **(1) your tracking is split across two systems that don't talk to each other** (internal + Google Analytics, with different events in each), and **(2) everything older than 90 days is permanently deleted with no working long-term archive**, so you cannot do year-over-year or seasonality analysis — a real cost in real estate.

---

## 1. What the system is

- **Client tracker** (`src/lib/analytics.ts`): 25 typed event kinds, queued and flushed every 3s in batches (sendBeacon on tab close). Sessions = 30-min idle timeout. Admin traffic suppressed client-side *and* re-filtered server-side.
- **Ingestion** (`track` edge function): validates, normalizes IDs to UUIDs, SHA-256-hashes IPs (never stores raw), rate-limits per IP hash (200 events/min), inserts to `analytics_events`, maintains `analytics_sessions` via `touch_session`/`close_session`.
- **Storage:** one raw `analytics_events` table + `analytics_sessions` + a `daily_analytics` rollup table (see hole #4) + `analytics_validation_log`.
- **Dashboard** (`/internal-analytics`): Traffic, Engagement, Listings, Inquiries, Validation tabs + per-listing drilldown, powered by ~22 `SECURITY DEFINER` RPCs gated by `require_admin()`.
- **Retention:** daily cron deletes impressions >30 days, everything else >90 days.
- **Parallel system:** GA4 (`G-Q27FCJ5TG9` via gtag in `index.html`) with its own, different event set.

## 2. What you're watching well

- **Demand-side engagement:** page views, listing views (session-deduped), viewport-based impressions (Browse, Sales, Home, Agency, Favorites, Similar-listings), map pin clicks, phone reveal *and* phone dial (split events), filter usage.
- **Supply-side funnels:** post started/submitted/success/abandoned/error with per-attempt IDs; wizard step-by-step funnel (`wizard_step_viewed/completed` per path); login-gate funnel (shown → dismissed → auth success → action completed).
- **Inquiries:** dual-metric system (analytics events + `listing_contact_submissions` counted separately), inquiry trend/velocity/timing/demand breakdowns, zero-inquiry listings, abuse signals.
- **Hygiene:** a Validation tab that self-checks data quality — rare and commendable.
- **Privacy:** IP hashed server-side, no raw PII in events, documented in migrations.

## 3. The holes (ranked)

### H1 — Two disconnected analytics systems (biggest issue)
GA4 receives events your internal system never sees: `listing_favorite` / `listing_unfavorite`, `share_listing_click` / `share_listing_success`, `listing_click`, `listing_contact_click`, `listing_image_zoom`, `listing_scroll`, `smart_search`, `listing_reported_as_rented`, `commercial_listing_reported`. **Favorites, shares, search, and scroll/photo engagement — Zillow's core intent signals — are invisible to your internal dashboard.** Meanwhile the internal tracker has a `trackSearchQuery` function with zero call sites (dead code) while search is tracked only in GA. GA4 also has no admin exclusion, so your own browsing pollutes it, and the two systems' numbers will never reconcile.

### H2 — No traffic-source attribution internally
The tracker captures no referrer and no UTM parameters (the legacy `referrer` column exists but nothing writes it). Your internal dashboard cannot answer "where did this visitor come from?" — WhatsApp digest vs. Google vs. direct. You have partial pieces (short-URL `click_count` by source, `digest_link_click`) but no unified source dimension. GA4 knows source/medium, but only inside GA and only for non-excluded traffic.

### H3 — The inquiry journey can't be stitched together
`src/services/listingContact.ts` mints its own session ID (`analytics_session_id`, a random string) instead of reusing the real analytics session (`ha_session_id`). The Jan 2026 "dual metrics" rebuild explicitly documents this mismatch and works around it by counting the two sources separately instead of joining. Consequence: you can never trace one visitor from impression → view → phone reveal → callback request. Callback submissions also emit no internal analytics event at all.

### H4 — 90-day amnesia, and the archive that would fix it is dead
The cleanup cron erases raw events (30d impressions / 90d rest). That's a sane cost control **only if** aggregates are preserved — and a `daily_analytics` rollup table + `rollup_analytics_events()` cron exist for exactly that — **but nothing in the app reads `daily_analytics`**, and the rollup was written in Sept 2025, before the column consolidation, so it may be silently broken. All ~22 dashboard RPCs query raw events only. Net effect: no year-over-year, no seasonality, no long-term growth curve. Unverified live (see SQL below): whether the two crons (`analytics-rollup`, `analytics-cleanup`) are actually scheduled and succeeding — this codebase has had dead-cron incidents before (SMS audit found two).

### H5 — Commercial is a second-class citizen
Residential impressions are session-deduped events; commercial impressions are a bare `impressions` counter incremented on `commercial_listings` rows. No time series, no session dedup parity, and the weekly owner performance emails contribute 0 impressions for commercial (acknowledged in a code comment). Commercial views/phone events do flow into the main system, and July 2026 fixed the RPCs to include commercial supply — but impressions remain split-brain.

### H6 — Table carries dead weight
`analytics_events` still has both column generations: legacy `ts`/`page`/`referrer`/`user_agent`/`ip`/`props` alongside current `occurred_at`/`ua`/`ip_hash`/`event_props`. Every RPC pays a `COALESCE(occurred_at, ts)` tax (patched with an expression index in Apr 2026), and a GIN index sits on the legacy `props` column that new rows never populate — pure write overhead and disk waste.

### Minor
- ~22 RPCs fire per dashboard open, each scanning raw events. Fine today (indexed, ≤90-day windows); will degrade as traffic grows — the rollup table is the intended fix and already exists.
- An RLS policy lets any authenticated user `SELECT` their own events — harmless, but serves no product feature; could be dropped.
- Anonymous pre-login browsing by an admin is not excluded (only user-linked events can be) — inherent limitation, worth knowing when you demo the site.
- Dead exports: `trackSearchQuery`, `trackPageView` wrapper (page views fire via `useAnalyticsInit` instead).

## 4. Efficiency answer

**Ingestion: efficient.** Batching, beacon flush, queue caps, rate limiting — well built.
**Storage: acceptable at current scale, with waste.** Single unpartitioned raw table is fine *because* retention truncates it; the waste is the legacy columns/GIN index (H6) and the orphaned rollup machinery (H4).
**Cycling: half-implemented.** Deletion works (assuming the cron is alive); preservation doesn't. Data is cycled *out* efficiently but not cycled *into* durable aggregates.

## 5. Recommended changes (priority order)

1. **Unify on the internal system.** Add internal events for the GA-only signals — `listing_favorite`, `listing_share`, `search_query` (wire the existing dead function), `contact_submitted`, `listing_click` — and surface favorites/shares in the Listings tab and drilldown. Keep GA4 as a free secondary lens or drop it, but stop letting it be the only home of intent signals.
2. **Fix the contact session join** (small, high value): make `listingContact.ts` use the analytics session ID, and emit a `contact_submitted` event. Future inquiries become fully joinable; dual metrics stay for history.
3. **Resurrect long-term memory:** verify the rollup cron, update `rollup_analytics_events()` for the current schema + newer events (wizard, login gate, inquiries), and teach the dashboard to read `daily_analytics` for ranges beyond 90 days. Then the 30/90-day raw retention becomes genuinely fine.
4. **Capture attribution:** store `document.referrer` + UTM params on `session_start`, add a source breakdown to the Traffic tab. Closes the "where do visitors come from" gap without GA.
5. **Schema cleanup migration:** backfill `occurred_at` from `ts` where null, drop legacy columns + the `props` GIN index, drop the COALESCE workaround.
6. **Commercial impression parity:** route commercial impressions through `listing_impression_batch` with a `listing_type` prop (or snapshot daily counter deltas) so commercial gets time series and weekly-email parity.

Items 2 and 5 are small; 1, 3, 4 are each a focused feature branch; 6 is medium. Happy to run any of these through the normal plan → implement → test workflow.

## 6. Live checks to run (paste into Supabase SQL Editor)

```sql
-- Are the analytics crons scheduled and succeeding?
SELECT jobname, schedule, active FROM cron.job
WHERE command ILIKE '%analytics%';

SELECT j.jobname, r.status, r.start_time, left(r.return_message, 120) AS msg
FROM cron.job_run_details r JOIN cron.job j USING (jobid)
WHERE j.command ILIKE '%analytics%'
ORDER BY r.start_time DESC LIMIT 10;

-- Is retention actually holding (oldest event should be ~90 days back)?
SELECT min(COALESCE(occurred_at, ts)) AS oldest_event,
       count(*) AS total_rows,
       pg_size_pretty(pg_total_relation_size('analytics_events')) AS table_size
FROM analytics_events;

-- Is the rollup alive (latest day should be yesterday)?
SELECT max(day) AS latest_rollup_day, count(*) AS rollup_rows FROM daily_analytics;
```

Expected: both crons active with recent `succeeded` runs; oldest event ≈ 90 days ago; rollup day = yesterday. If the rollup is stale or the crons are missing, hole #4 is confirmed-live rather than suspected.
