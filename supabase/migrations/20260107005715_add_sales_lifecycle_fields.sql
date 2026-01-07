/*
  # Add Sales Listing Lifecycle Fields

  ## Overview
  This migration adds explicit expiration tracking and sale status management
  to support different lifecycle rules for rental vs sale listings.

  ## 1. New Enums
    - `sale_status` - Enum for sale listing status: available, pending, in_contract, sold

  ## 2. Modified Tables
    - `listings`
      - `expires_at` (timestamptz) - Explicit expiration date for the listing
      - `sale_status` (sale_status) - Current status for sale listings

  ## 3. Indexes
    - `idx_listings_expires_at` - For efficient expiration queries
    - `idx_listings_sale_status` - For filtering by sale status
    - `idx_listings_expires_at_active` - Composite index for active listings near expiration

  ## 4. Data Migration
    - Backfills expires_at for existing listings:
      - Active rentals: last_published_at + 30 days
      - Active sales: last_published_at + 14 days
      - Inactive listings: deactivated_at or last_published_at + 30 days
    - Sets sale_status = 'available' for existing sale listings

  ## 5. Security
    - No new RLS policies needed (uses existing listings policies)

  ## 6. Notes
    - Lifecycle durations are managed in application service layer
    - Rentals: 30 days active
    - Sales: 14 days (available/pending), 42 days (in_contract), 30 days (sold)
*/

-- Create sale_status enum
DO $$ BEGIN
  CREATE TYPE sale_status AS ENUM ('available', 'pending', 'in_contract', 'sold');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add expires_at column to listings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE listings ADD COLUMN expires_at timestamptz;
  END IF;
END $$;

-- Add sale_status column to listings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'sale_status'
  ) THEN
    ALTER TABLE listings ADD COLUMN sale_status sale_status DEFAULT 'available';
  END IF;
END $$;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_listings_expires_at ON listings(expires_at);
CREATE INDEX IF NOT EXISTS idx_listings_sale_status ON listings(sale_status);
CREATE INDEX IF NOT EXISTS idx_listings_expires_at_active ON listings(expires_at, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_listings_type_status ON listings(listing_type, sale_status) WHERE listing_type = 'sale';

-- Backfill expires_at for existing listings
-- Active rentals: last_published_at + 30 days
UPDATE listings
SET expires_at = COALESCE(last_published_at, created_at) + INTERVAL '30 days'
WHERE expires_at IS NULL
  AND is_active = true
  AND (listing_type = 'rental' OR listing_type IS NULL);

-- Active sales: last_published_at + 14 days
UPDATE listings
SET expires_at = COALESCE(last_published_at, created_at) + INTERVAL '14 days'
WHERE expires_at IS NULL
  AND is_active = true
  AND listing_type = 'sale';

-- Inactive listings: use deactivated_at if available, otherwise last_published_at + 30 days
UPDATE listings
SET expires_at = COALESCE(
  deactivated_at,
  COALESCE(last_published_at, created_at) + INTERVAL '30 days'
)
WHERE expires_at IS NULL
  AND is_active = false;

-- Set sale_status to 'available' for existing sale listings without a status
UPDATE listings
SET sale_status = 'available'
WHERE listing_type = 'sale'
  AND sale_status IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN listings.expires_at IS 'Explicit expiration date. When this date passes, the listing becomes inactive. Rentals: 30 days, Sales: varies by status.';
COMMENT ON COLUMN listings.sale_status IS 'Current status for sale listings: available (14d), pending (14d), in_contract (42d), sold (30d, no extension).';
