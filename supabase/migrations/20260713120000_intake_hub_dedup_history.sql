/*
  # Intake Hub — cross-source dedup, history trail, and new-vs-old tracking

  The admin "Listing Intake" hub unifies three feeds into the ONE existing
  scraped_listings pipeline:
    - pamphlet uploads   source = 'luach_hatsibbur' | 'kol_berama' | 'heimish_agent'
    - website scrapes    source = 'luach_com'
    - pasted text        source = 'admin_intake'   (unchanged)

  All feeds now share a real, deterministic dedup_key (md5 of normalized
  phone + cross streets + bedrooms) so the SAME real-world apartment appearing
  in more than one feed, or re-published on a later date, collapses onto ONE
  row instead of duplicating. Each sighting is appended to source_history so
  the admin can see where/when a listing showed up and how many times.

  1. New columns on `scraped_listings`
     - `source_history` (jsonb)      - append-only trail: [{source, date, run_id, price, seen_at}]
     - `admin_reviewed_at` (tstz)    - when an admin acknowledged the row; NULL = brand-new/unseen.
                                        Drives the "New" badge and the "New only" filter.

  2. Backfill (data accuracy — legacy rows must NOT flood the "new" list)
     - Every EXISTING row is stamped admin_reviewed_at = COALESCE(updated_at, created_at)
       so the ~1.3k historical Luach rows count as "already seen / old". Only
       genuinely new future ingests will light up as New.
     - Seed source_history with a single entry describing what we already know.

  3. Indexes
     - partial index on admin_reviewed_at IS NULL  (fast "New only" filter)
     - (source, date_last_seen DESC)               (table default ordering + source filter)

  4. Security
     - No new policies. Edge functions write with the service role; admins
       already have SELECT/UPDATE via 20260311181337_add_pipeline_call_tracking.sql.
       source_history / admin_reviewed_at are covered by row-level admin RLS.

  Additive + idempotent: safe to re-run.
*/

-- 1. Columns --------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scraped_listings' AND column_name = 'source_history'
  ) THEN
    ALTER TABLE scraped_listings ADD COLUMN source_history jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scraped_listings' AND column_name = 'admin_reviewed_at'
  ) THEN
    ALTER TABLE scraped_listings ADD COLUMN admin_reviewed_at timestamptz;
  END IF;
END $$;

-- 2. Backfill legacy rows once (only rows still lacking the new metadata) --
UPDATE scraped_listings
SET admin_reviewed_at = COALESCE(updated_at, created_at, now())
WHERE admin_reviewed_at IS NULL;

UPDATE scraped_listings
SET source_history = jsonb_build_array(
  jsonb_build_object(
    'source', source,
    'date', COALESCE(date_last_seen::text, date_first_seen::text),
    'run_id', intake_batch_id,
    'price', price,
    'seen_at', COALESCE(updated_at, created_at, now())
  )
)
WHERE source_history = '[]'::jsonb;

-- 3. Indexes --------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_scraped_listings_new
  ON scraped_listings(date_last_seen DESC)
  WHERE admin_reviewed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_scraped_listings_source_recent
  ON scraped_listings(source, date_last_seen DESC);

-- 4. Docs -----------------------------------------------------------------
COMMENT ON COLUMN scraped_listings.source_history IS
  'Append-only sighting trail: [{source, date, run_id, price, seen_at}]. One entry per time this real-world listing was seen in any feed.';
COMMENT ON COLUMN scraped_listings.admin_reviewed_at IS
  'When an admin acknowledged this row. NULL = brand-new / unseen (drives the New badge and "New only" filter).';
