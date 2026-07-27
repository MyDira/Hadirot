/*
  # Admin AI Intake — extend pipeline tables for admin bulk text intake

  The admin "AI Intake" feature reuses the Luach pipeline tables instead of
  creating parallel ones. Rows created by the intake flow carry
  source = 'admin_intake' so the frontend can split the two streams:
    - /admin/pipeline  shows Luach rows only   (source <> 'admin_intake')
    - /admin/ai-intake shows intake rows only  (source  = 'admin_intake')

  1. New columns on `scraped_listings`
     - `intake_batch_id` (uuid, FK scrape_runs)  - which parse run produced the row
     - `intake_block_index` (integer)            - which input block within the run
     - `listing_kind` (text rental|sale)         - intake parses sales too
     - `description` (text)                      - AI-generated listing description
     - `assigned_user_id` (uuid, FK profiles)    - pre-assigned account for publish
     - `admin_custom_agency_name` (text)         - display name when unassigned
     - `admin_listing_type_display` (text)       - 'agent' | 'owner' when unassigned
     - `image_paths` (jsonb)                     - [{filePath, publicUrl, is_featured}]
                                                   (Luach rows have no photos; intake does)
     - `intake_extra` (jsonb)                    - richer listing-form fields the Luach
                                                   schema never needed (property_type,
                                                   parking, heat, lease_length,
                                                   call_for_price, asking_price, ...)

  2. New column on `scrape_runs`
     - `created_by` (uuid, FK profiles) - admin who ran the intake batch

  3. Indexes
     - scraped_listings(intake_batch_id) for the review screen
     - partial index on source='admin_intake' rows by created_at

  4. Security
     - No new policies needed: the edge function writes with the service role,
       admins already have SELECT/UPDATE via the policies added in
       20260311181337_add_pipeline_call_tracking.sql.
     - Intake rows are inserted with is_active = false so the public
       "Anyone can read active scraped listings" policy never exposes
       pre-publish admin data.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scraped_listings' AND column_name = 'intake_batch_id'
  ) THEN
    ALTER TABLE scraped_listings ADD COLUMN intake_batch_id uuid REFERENCES scrape_runs(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scraped_listings' AND column_name = 'intake_block_index'
  ) THEN
    ALTER TABLE scraped_listings ADD COLUMN intake_block_index integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scraped_listings' AND column_name = 'listing_kind'
  ) THEN
    ALTER TABLE scraped_listings ADD COLUMN listing_kind text NOT NULL DEFAULT 'rental'
      CHECK (listing_kind IN ('rental', 'sale'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scraped_listings' AND column_name = 'description'
  ) THEN
    ALTER TABLE scraped_listings ADD COLUMN description text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scraped_listings' AND column_name = 'assigned_user_id'
  ) THEN
    ALTER TABLE scraped_listings ADD COLUMN assigned_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scraped_listings' AND column_name = 'admin_custom_agency_name'
  ) THEN
    ALTER TABLE scraped_listings ADD COLUMN admin_custom_agency_name text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scraped_listings' AND column_name = 'admin_listing_type_display'
  ) THEN
    ALTER TABLE scraped_listings ADD COLUMN admin_listing_type_display text
      CHECK (admin_listing_type_display IN ('agent', 'owner'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scraped_listings' AND column_name = 'image_paths'
  ) THEN
    ALTER TABLE scraped_listings ADD COLUMN image_paths jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scraped_listings' AND column_name = 'intake_extra'
  ) THEN
    ALTER TABLE scraped_listings ADD COLUMN intake_extra jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scrape_runs' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE scrape_runs ADD COLUMN created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scraped_listings_intake_batch
  ON scraped_listings(intake_batch_id)
  WHERE intake_batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scraped_listings_admin_intake
  ON scraped_listings(created_at DESC)
  WHERE source = 'admin_intake';

COMMENT ON COLUMN scraped_listings.intake_batch_id IS 'scrape_runs row that produced this listing (admin AI intake only)';
COMMENT ON COLUMN scraped_listings.listing_kind IS 'rental | sale — admin intake parses both; Luach rows are always rental';
COMMENT ON COLUMN scraped_listings.image_paths IS 'Array of {filePath, publicUrl, is_featured} in the listing-images bucket; copied to listing_images on publish';
COMMENT ON COLUMN scraped_listings.intake_extra IS 'Listing-form fields with no dedicated scraped_listings column: property_type, parking, heat, lease_length, call_for_price, asking_price, broker_fee, ...';
