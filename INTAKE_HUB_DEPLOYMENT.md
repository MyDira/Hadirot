# Listing Intake Hub — Deployment & Audit Status

The Listing Intake hub (`/admin/intake`) unifies pamphlet upload, luach.com
scraping, and pasted-text intake into one filterable review table with
cross-source dedup, new-vs-old tracking, sighting history, a call workflow, and
one-click publish. It replaces the separate **Pipeline** and **AI Intake** pages
and retires the old Hostinger n8n/Python pipeline.

## ✅ Deployment status (done July 14 2026)

Both server-side steps are **already applied to production**:

- **Migration `20260713120000_intake_hub_dedup_history.sql` — APPLIED.**
  `source_history` + `admin_reviewed_at` exist on `scraped_listings`; all 1,294
  legacy rows backfilled as "seen" (0 flagged new); both partial indexes created.
- **Edge functions — DEPLOYED & boot-verified:** `parse-pamphlet` (v1),
  `scrape-luach-com` (v1), `parse-bulk-listings` (v3, refactored onto the shared
  module). All three return proper auth rejections when probed, proving the
  bundles (incl. `npm:pdf-lib`) load. `ANTHROPIC_API_KEY` was already set.

Nothing else to configure — the feature is live once the frontend branch is.

## How the pamphlet parse works (audited against a real booklet)

Booklets are big (the July 13 Heimish Agent booklet is **52 pages**), so one
Claude call per booklet doesn't fit any limit. The flow is client-driven
chunking:

1. **start** — the edge function inspects each PDF (pdf-lib), plans ~5-page
   chunks with a **1-page overlap** (so a listing split across a page boundary
   is never lost), and creates the `scrape_runs` row.
2. **chunk** — the browser fires chunk calls (2 at a time). Each call extracts
   the page range, has Claude (Opus, high effort, streaming) parse it, geocodes,
   and upserts. Rows appear in the Review tab as each batch lands.
3. **finalize** — totals + errors stamped on the run.

A failed chunk doesn't sink the run — it's recorded in the run's errors and the
rest continue. Keep the tab open during a parse; a 52-page booklet ≈ 13 batches
≈ 15-20 min. Cost note: parsing uses Claude Opus for accuracy (a full Heimish
booklet is on the order of a few dollars of API usage; set the
`ANTHROPIC_MODEL` secret to `claude-sonnet-4-6` to trade accuracy for cost).

### Audit findings that shaped this (July 14 2026)

- **Streaming required:** at >16k `max_tokens` the SDK rejects non-streaming
  requests; a full chunk genuinely takes ~2-3 min. `parseContent` streams and
  zod-validates the final message (64k output budget).
- **Effort must stay high:** an A/B on the same 6-page chunk — high effort
  resolved both cross streets on 33/36 listings; medium collapsed to 2/36.
  Cross streets drive geocoding *and* the dedup key, so no downgrade.
- **Quality at high effort:** 36/36 listings with phones, avg confidence 0.88,
  correct decoding of shorthand like "hige 50s" → 58th Street.
- **Dedup parity:** the TS dedup key is byte-identical to the legacy Python
  (194/200 random prod rows match; the 6 misses are legacy field drift — the
  original Python mismatches them too).
- **Overlap safety:** the upsert skips sighting bumps when the same run already
  recorded the listing, so the 1-page overlap can't inflate `times_seen`.

## Dedup / new-vs-old model

All three feeds route through `supabase/functions/_shared/intake.ts`: one Claude
prompt/schema, one deterministic MD5 dedup key (phone + cross streets +
bedrooms), one collapse-on-conflict upsert. The same real-world apartment
appearing in multiple feeds or re-published later lands on ONE row — bumping
`times_seen`, `date_last_seen`, and appending to `source_history`. Rows with
`admin_reviewed_at IS NULL` show the **NEW** badge; any call-workflow action
marks them seen. A re-sighted *discarded* listing resurfaces as new.

**Call workflow:** New → No answer / Declined / **Permission ready** → Published
(or Discarded). Publish is gated on "Permission ready", so nothing goes live
before the owner's OK. Publishing is one click, straight to live, with the same
monetization treatment as the posting form.

## heimishagent.com

heimishagent.com is a Firebase/Firestore SPA with locked-down rules (anonymous
reads and sign-ups both denied) — it cannot be scraped via API. Use the
**Upload Pamphlet** tab with the site's daily booklet PDF (source = "Heimish
Agent") instead.

## luach.com scraper — cloud vs local

The **Scrape Website** button runs `scrape-luach-com` in Supabase. If luach.com
ever blocks the cloud IP, the local script on the `claude/luach-scraper-pipeline`
branch (`npm run scrape:luach`) writes into the same table as a fallback. Keep
single scrapes ≤ ~40 listings per run (the default); for deep backfills run
several page-limited scrapes.
