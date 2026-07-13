# Listing Intake Hub — Deployment

The Listing Intake hub (`/admin/intake`) unifies pamphlet upload, luach.com
scraping, and pasted-text intake into one filterable review table with
cross-source dedup, new-vs-old tracking, sighting history, a call workflow, and
one-click publish. It replaces the separate **Pipeline** and **AI Intake** pages
and is meant to retire the old Hostinger n8n/Python pipeline.

Two manual steps are required before it works end-to-end (the app build itself
needs nothing extra).

---

## 1. Apply the database migration

File: `supabase/migrations/20260713120000_intake_hub_dedup_history.sql`

It is **additive and idempotent** (safe to re-run). It adds two columns to
`scraped_listings` and backfills existing rows so the ~1.3k legacy Luach rows
count as "already seen" instead of flooding the New list:

- `source_history jsonb` — append-only sighting trail `[{source, date, run_id, price, seen_at}]`
- `admin_reviewed_at timestamptz` — `NULL` = brand-new/unseen (drives the New badge + "New only" filter)

Apply it in the Supabase SQL editor (paste the file contents and run), or via
the direct DB connection the team already uses for this project. Until it is
applied, the Review tab will error because it orders/filters on
`admin_reviewed_at`.

> Note: `source_url` (used for luach.com per-listing links) already exists in
> production, so it is not re-added here.

## 2. Deploy the edge functions

Three functions power the intake feeds. Deploy all three:

```bash
supabase functions deploy parse-pamphlet
supabase functions deploy scrape-luach-com
supabase functions deploy parse-bulk-listings   # refactored onto the shared module
```

They all require the **`ANTHROPIC_API_KEY`** secret (already set for the
existing AI Intake feature — no change needed if that was working):

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# optional: override the model (defaults to claude-opus-4-7)
supabase secrets set ANTHROPIC_MODEL=claude-opus-4-7
```

No new storage bucket is needed — uploaded pamphlet PDFs/photos go to the
existing `listing-images` bucket under an `intake-sources/` prefix.

---

## How it works

| Feed | Function | Source tag |
|---|---|---|
| Pamphlet PDF / photos | `parse-pamphlet` (Claude vision) | `luach_hatsibbur`, `kol_berama`, `heimish_agent`, `other_pamphlet` |
| luach.com website | `scrape-luach-com` (fetch + Claude) | `luach_com` |
| Pasted text | `parse-bulk-listings` (Claude) | `admin_intake` |

All three route through `supabase/functions/_shared/intake.ts`: one Claude
prompt/schema, one deterministic MD5 dedup key (phone + cross streets +
bedrooms — identical to the historical Python pipeline so keys line up with the
existing Luach rows), and one collapse-on-conflict upsert.

**Dedup / new-vs-old:** the same real-world apartment appearing in more than one
feed, or re-published later, collapses onto ONE row. Each sighting bumps
`times_seen`, `date_last_seen`, and appends to `source_history`. A row with
`admin_reviewed_at IS NULL` shows a **NEW** badge; any call-workflow action (or
the "New only" filter being cleared by acknowledgement) marks it seen.

**Call workflow (optimized):** New → No answer / Declined / **Permission ready**
→ Published (or Discarded). Publish is gated on the "Permission ready"
(`approved`) status, so nothing goes live until you've called and gotten the
owner's OK. Publishing is one click and goes straight live with the same
monetization treatment as the posting form.

## heimishagent.com

heimishagent.com is a Firebase/Firestore single-page app with locked-down
security rules (anonymous reads and sign-ups are both denied), so it cannot be
scraped through an API. Use the **Upload Pamphlet** tab with the site's daily
booklet PDF (source = "Heimish Agent") instead — that is the reliable, accurate
path and is what the examples in `/Claude/heimish example` are.

## luach.com scraper — cloud vs local

The **Scrape Website** button runs `scrape-luach-com` in Supabase (nothing on
your machine). If luach.com ever blocks the cloud IP, the local script on the
`claude/luach-scraper-pipeline` branch (`npm run scrape:luach`) writes into the
same table as a fallback.
