# AI Intake — Deployment Runbook

Admin bulk listing intake: paste raw listing text (1–N listings per block, with
photos and account assignment), Claude parses it into structured listings,
admin reviews/edits at `/admin/ai-intake`, and publishes straight to live
(no approval queue, 14-day trial stamped at publish for rentals).

Ships with the admin dashboard redesign branch (`claude/admin-dashboard-redesign`).
**Do not deploy to live before that branch is ready to ship.**

## 1. Database — paste in Supabase Dashboard → SQL Editor

Run the contents of:

```
supabase/migrations/20260611120000_add_admin_intake_to_pipeline.sql
```

Idempotent (guarded `DO` blocks) — safe to re-run. Adds columns to
`scraped_listings` (`intake_batch_id`, `intake_block_index`, `listing_kind`,
`description`, `assigned_user_id`, `admin_custom_agency_name`,
`admin_listing_type_display`, `image_paths`, `intake_extra`) and
`scrape_runs.created_by`, plus two indexes. No RLS changes; intake rows are
written with `is_active = false` so the public scraped-listings read policy
never exposes them.

## 2. Edge function — deploy `parse-bulk-listings`

```bash
supabase functions deploy parse-bulk-listings --project-ref <PROJECT_REF>
```

Secrets (Dashboard → Edge Functions → Secrets, or CLI):

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   # required
supabase secrets set ANTHROPIC_MODEL=claude-opus-4-7  # optional, this is the default
```

Notes:
- The function requires an admin JWT (`app_metadata.is_admin = true`); it
  rejects everyone else. `verify_jwt = true` in `supabase/config.toml`.
- Geocoding reuses the already-deployed `geocode-cross-streets` function and
  its existing `GOOGLE_MAPS_API_KEY` secret — nothing new needed.
- Assignment emails go through the existing `send-email` function (Resend) —
  nothing new needed.
- Max 20 blocks per parse run; blocks are parsed in parallel.

## 3. Verify after deploy

1. Log in as an admin → `/admin/ai-intake` (sidebar: Manage → AI Intake).
2. Input tab: paste 2–3 messy listing blurbs in one block, attach a photo,
   assign a user → **Parse Listings**.
3. Review tab opens automatically: check parsed fields, confidence dots,
   `No geo` / `Trial used` flags, photo thumbnails.
4. Edit one listing (bathrooms is required — real blurbs often omit it),
   **Save & Publish**, and confirm:
   - listing is live immediately (approved + active, no Pending entry);
   - rental rows have `payment_kind = 'individual_trial'` and
     `trial_started_at` set; sales have neither;
   - photos appear on the listing (copied to the listing's own storage folder);
   - assigned user got one summary email and sees the listing in their dashboard.
5. `/admin/pipeline` still shows only Luach rows (intake rows are filtered out
   of both the table and the "Last Pipeline Run" card).

## Tested (June 11, 2026, full local stack + real Claude calls)

- Multi-listing splitting, phone inheritance across stacked agent listings,
  Boro Park shorthand ("53/14", "15-40", "low 40s" → 41st), rental vs sale
  detection, title/description generation — all verified end-to-end.
- Publish verified in DB: trial stamping, expiry from admin active days,
  assigned ownership, custom poster name display, image copy + `listing_images`
  rows, per-row validation errors surfacing in the review UI.
