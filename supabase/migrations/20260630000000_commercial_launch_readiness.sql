/*
  # Commercial Launch Readiness

  ## Summary
  Closes the database gaps that block the commercial listings feature from launch,
  identified by the June 2026 commercial production-readiness audit and verified
  against live prod. All changes are deploy-dark safe: commercial posting is still
  gated off in the UI (PathPicker active:false), so nothing user-facing changes
  until the switch is flipped. There are currently 0 commercial_listings rows and
  0 active-but-unapproved rows in either listings table (verified before writing).

  ## Changes
  1. B1 — add `sale_status` to `commercial_listings` (nullable enum, mirrors
     residential `listings.sale_status`). The wizard already writes 'available' for
     sale listings and NULL for leases, which currently 400s because the column is
     missing.
  2. B2 — create `increment_commercial_listing_views(listing_id uuid)` SECURITY
     DEFINER RPC mirroring `increment_listing_views`, bumping both `views` and
     `direct_views` (commercial has no analytics metrics view, so the row columns
     are the source of truth for commercial view counts).
  3. M8 — add `commercial_listing_id` to `listing_contact_submissions` (FK to
     commercial_listings), make `listing_id` nullable, enforce exactly-one via CHECK,
     index the new column, and extend the owner-view RLS policy to cover commercial
     listing owners.
  4. N5 — add composite covering index for commercial browse.
  5. M12 — require `approved = true` (not just `is_active`) in the public image
     SELECT policies for BOTH commercial_listing_images and listing_images, so images
     of active-but-unapproved listings are no longer publicly readable by URL.
*/

-- ============================================================
-- B1: sale_status on commercial_listings (nullable, mirrors residential)
-- ============================================================
ALTER TABLE commercial_listings
  ADD COLUMN IF NOT EXISTS sale_status sale_status;

COMMENT ON COLUMN commercial_listings.sale_status IS
  'Sale lifecycle status for commercial SALE listings (available/pending/in_contract/sold). NULL for lease listings. Mirrors listings.sale_status.';

-- ============================================================
-- B2: increment_commercial_listing_views RPC
-- Mirrors increment_listing_views; bumps views + direct_views.
-- ============================================================
CREATE OR REPLACE FUNCTION increment_commercial_listing_views(listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE commercial_listings
  SET views = COALESCE(views, 0) + 1,
      direct_views = COALESCE(direct_views, 0) + 1
  WHERE id = listing_id AND is_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_commercial_listing_views(uuid) TO anon, authenticated;

-- ============================================================
-- M8: listing_contact_submissions support for commercial contacts
-- ============================================================
ALTER TABLE listing_contact_submissions
  ADD COLUMN IF NOT EXISTS commercial_listing_id uuid REFERENCES commercial_listings(id) ON DELETE CASCADE;

ALTER TABLE listing_contact_submissions
  ALTER COLUMN listing_id DROP NOT NULL;

-- Exactly one of listing_id / commercial_listing_id must be set per row.
ALTER TABLE listing_contact_submissions
  DROP CONSTRAINT IF EXISTS listing_contact_submissions_exactly_one_listing;
ALTER TABLE listing_contact_submissions
  ADD CONSTRAINT listing_contact_submissions_exactly_one_listing
  CHECK (num_nonnulls(listing_id, commercial_listing_id) = 1);

CREATE INDEX IF NOT EXISTS listing_contact_submissions_commercial_listing_id_idx
  ON listing_contact_submissions (commercial_listing_id);

-- Extend owner-view RLS so commercial listing owners can read their own inquiries.
DROP POLICY IF EXISTS "Owners can view contact submissions for their listings" ON listing_contact_submissions;
CREATE POLICY "Owners can view contact submissions for their listings"
  ON listing_contact_submissions
  FOR SELECT
  TO authenticated
  USING (
    listing_id IN (SELECT id FROM listings WHERE user_id = (SELECT auth.uid()))
    OR commercial_listing_id IN (SELECT id FROM commercial_listings WHERE user_id = (SELECT auth.uid()))
  );

-- ============================================================
-- N5: composite browse covering index for commercial
-- ============================================================
CREATE INDEX IF NOT EXISTS commercial_listings_browse_idx
  ON commercial_listings (listing_type, is_active, approved, created_at DESC);

-- ============================================================
-- M12: public image visibility must require approved = true
-- (fixes both commercial and residential image tables)
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view commercial listing images" ON commercial_listing_images;
CREATE POLICY "Anyone can view commercial listing images"
  ON commercial_listing_images
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM commercial_listings
      WHERE commercial_listings.id = commercial_listing_images.listing_id
        AND commercial_listings.is_active = true
        AND commercial_listings.approved = true
    )
  );

DROP POLICY IF EXISTS "Anyone can read listing images" ON listing_images;
CREATE POLICY "Anyone can read listing images"
  ON listing_images
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM listings
      WHERE listings.id = listing_images.listing_id
        AND listings.is_active = true
        AND listings.approved = true
    )
  );
