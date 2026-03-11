/*
  # Add Pipeline Call Tracking to Scraped Listings

  1. New Columns on `scraped_listings`
    - `call_status` (text, NOT NULL, default 'pending_call') - tracks call outcome for each scraped listing
    - `call_notes` (text, nullable) - free-text notes from admin calls
    - `published_listing_id` (uuid, nullable, FK to listings) - links to the listing created when published

  2. New Index
    - `idx_scraped_listings_call_status` on call_status for filter performance

  3. Security (RLS Policies)
    - "Admins can read all scraped_listings" - SELECT for authenticated admins (no is_active filter)
    - "Admins can update scraped_listings" - UPDATE for authenticated admins (call_status, call_notes, published_listing_id)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scraped_listings' AND column_name = 'call_status'
  ) THEN
    ALTER TABLE scraped_listings ADD COLUMN call_status text NOT NULL DEFAULT 'pending_call';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scraped_listings' AND column_name = 'call_notes'
  ) THEN
    ALTER TABLE scraped_listings ADD COLUMN call_notes text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scraped_listings' AND column_name = 'published_listing_id'
  ) THEN
    ALTER TABLE scraped_listings ADD COLUMN published_listing_id uuid REFERENCES listings(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_scraped_listings_call_status ON scraped_listings(call_status);

CREATE POLICY "Admins can read all scraped_listings"
  ON scraped_listings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can update scraped_listings"
  ON scraped_listings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.is_admin = true
    )
  );
