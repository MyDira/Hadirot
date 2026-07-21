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

## How the pamphlet parse works — TEXT-FIRST (rebuilt July 20 2026)

> **Redeploy required:** the July 20 rebuild changes `parse-pamphlet` (new
> `npm:unpdf` dependency) and `_shared/intake.ts` (model + prompt caching, which
> also affects `parse-bulk-listings` and `scrape-luach-com`). Redeploy all three
> and boot-probe them after shipping this branch.

All three publications (Luach HaTsibbur, Kol Berama, Heimish Agent) embed a
clean **text layer** in their PDFs — verified July 20 on real files — so the
pipeline no longer sends rendered pages to Claude's vision. The flow is still
client-driven chunking:

1. **start** — the edge function extracts per-page text (`unpdf`/pdf.js — free,
   no AI), **triages pages with code**, and plans density-aware text chunks
   with a **1-page overlap** (so a listing split across a page boundary is
   never lost), then creates the `scrape_runs` row. Triage (tuned on real
   booklets July 20 2026; listing pages score 10-139, junk-with-phones pages
   0-7): keep a page when realty-vocabulary + price-pattern score ≥ 8, or a
   borderline score with phones and a section header; drop Heimish
   pure-commercial sections by banner (Offices / Store Fronts / Warehouses /
   Shuls — the residential-only schema makes the model skip them or, worse,
   coerce offices into residential fields); drop everything else (car
   services, jobs, gemachs, Hebrew boilerplate) before any tokens are spent.
   Chunks are capped at ~30 estimated listings (per-listing phones, or Heimish
   `#1234` tags) — dense Luach pages (19-32 listings/page) overflowed the 64k
   output budget in fixed 5-page chunks. Zero-text pages in a text-layer
   booklet are cover art / image ads and are dropped; a fully scanned booklet
   (<30% text pages) takes the original **vision fallback** path so scans are
   never silently skipped. Measured: Kol Berama 20p → 2 calls, Luach 28p → 12,
   Heimish 52p → 13 (residential only).
2. **chunk** — the browser fires chunk calls (2 at a time). Each call re-extracts
   the page range's text, has Claude (**Sonnet, adaptive thinking, streaming,
   prompt-cached rulebook**) parse it, geocodes, and upserts. Rows appear in
   the Review tab as each batch lands. A junk page that slips triage costs
   seconds (the model returns zero listings almost instantly).
3. **finalize** — totals + errors stamped on the run.

A failed chunk doesn't sink the run — it's recorded in the run's errors and the
rest continue. Keep the tab open during a parse. Cost: the text path plus
Sonnet plus caching is roughly 3-5× cheaper than the previous Opus-on-vision
path; set the `ANTHROPIC_MODEL` secret to `claude-opus-4-7` to force the old
model if ever needed.

### Bake-off findings that shaped the July 20 rebuild

Same prod system prompt, same extracted text, graded objectively against the
deterministic vague-street rule ("14th ave mid 40's" → 45th St & 14th Ave —
the field that drives geocoding AND the dedup key):

- **Sonnet = Opus on text:** 15/15 vague-street decodes on Heimish AND Kol
  Berama (Opus 15/15), perfect street/avenue slot order, 38/38 phones on the
  Kol Berama sales page. Sonnet on clean text matches Opus on vision.
- **Haiku is disqualified:** 0/15 on the vague-street rule on both
  publications — **including at `temperature: 0.0`** (it simply doesn't apply
  the mapping; determinism doesn't help). Never downgrade below Sonnet.
- **Prompt caching:** the ~2.5k-token rulebook is identical across every call,
  so `cache_control` on the system prompt makes every chunk after the first
  read it at ~10% price.
- **Ligature artifacts:** the Heimish text layer drops "tt"/"t" glyphs
  ("Ki chen" = Kitchen). Models read through it (the chunk prompt warns them);
  this is also why a pure-code parser was rejected.

### Audit findings that still apply (July 14 2026)

- **Streaming required:** at >16k `max_tokens` the SDK rejects non-streaming
  requests; a full chunk genuinely takes ~2-3 min. `parseContent` streams and
  zod-validates the final message (64k output budget).
- **Effort/model must stay high enough to decode cross streets** — the July 14
  A/B (Opus high 33/36 vs medium 2/36 on vision) and the July 20 bake-off
  (Haiku 0/15 on text) are the same lesson: cross streets drive geocoding
  *and* the dedup key, so this is the metric to re-test before ANY model change.
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
