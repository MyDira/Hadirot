/*
  # Create Sales Listing System

  ## Overview
  This migration adds a complete sales listing system to the platform with granular permission controls.
  When disabled, the system is completely invisible and the site functions exactly as it does currently.

  ## 1. New Enums
    - `listing_type` - Enum for 'rental' or 'sale'

  ## 2. Modified Tables
    - `admin_settings` - Add sales feature toggle and limits
    - `profiles` - Add sales posting permission flag
    - `listings` - Add listing_type and sale-specific fields

  ## 3. New Tables
    - `sales_permission_requests` - Track user requests to post sale listings

  ## 4. Security
    - Enable RLS on new tables
    - Update policies to filter sale listings when feature disabled
    - Restrict sales posting to authorized users

  ## 5. Features
    - Global toggle to enable/disable entire sales system
    - Per-user permission controls for posting sales
    - Permission request workflow with email notifications
    - Sale-specific fields (asking price, property age, HOA, taxes, lot size)
    - Complete backwards compatibility - defaults to rental behavior
*/

-- Create listing_type enum
DO $$ BEGIN
  CREATE TYPE listing_type AS ENUM ('rental', 'sale');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add sales feature controls to admin_settings
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_settings' AND column_name = 'sales_feature_enabled'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN sales_feature_enabled boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_settings' AND column_name = 'sales_universal_access'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN sales_universal_access boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_settings' AND column_name = 'max_featured_sales'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN max_featured_sales integer DEFAULT 10;
  END IF;
END $$;

-- Update admin_settings with default values
UPDATE admin_settings 
SET 
  sales_feature_enabled = false,
  sales_universal_access = false,
  max_featured_sales = 10
WHERE sales_feature_enabled IS NULL;

-- Add sales permission to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'can_post_sales'
  ) THEN
    ALTER TABLE profiles ADD COLUMN can_post_sales boolean DEFAULT false;
  END IF;
END $$;

-- Add listing_type to listings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'listing_type'
  ) THEN
    ALTER TABLE listings ADD COLUMN listing_type listing_type DEFAULT 'rental' NOT NULL;
  END IF;
END $$;

-- Add sale-specific fields to listings table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'asking_price'
  ) THEN
    ALTER TABLE listings ADD COLUMN asking_price integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'property_age'
  ) THEN
    ALTER TABLE listings ADD COLUMN property_age integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'hoa_fees'
  ) THEN
    ALTER TABLE listings ADD COLUMN hoa_fees integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'property_taxes'
  ) THEN
    ALTER TABLE listings ADD COLUMN property_taxes integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'lot_size_sqft'
  ) THEN
    ALTER TABLE listings ADD COLUMN lot_size_sqft integer;
  END IF;
END $$;

-- Create sales_permission_requests table
CREATE TABLE IF NOT EXISTS sales_permission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  request_message text NOT NULL,
  status text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'denied')),
  requested_at timestamptz DEFAULT now() NOT NULL,
  responded_at timestamptz,
  responded_by_admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  admin_notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index on listing_type for efficient filtering
CREATE INDEX IF NOT EXISTS idx_listings_listing_type ON listings(listing_type);
CREATE INDEX IF NOT EXISTS idx_listings_type_active ON listings(listing_type, is_active);
CREATE INDEX IF NOT EXISTS idx_listings_type_featured ON listings(listing_type, is_featured, featured_expires_at);

-- Create indexes for sales_permission_requests
CREATE INDEX IF NOT EXISTS idx_sales_requests_user_id ON sales_permission_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_requests_status ON sales_permission_requests(status);
CREATE INDEX IF NOT EXISTS idx_sales_requests_requested_at ON sales_permission_requests(requested_at DESC);

-- Enable RLS on sales_permission_requests
ALTER TABLE sales_permission_requests ENABLE ROW LEVEL SECURITY;

-- Policies for sales_permission_requests

-- Users can view their own requests
CREATE POLICY "Users can view own sales permission requests"
  ON sales_permission_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can create their own requests
CREATE POLICY "Users can create sales permission requests"
  ON sales_permission_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all requests
CREATE POLICY "Admins can view all sales permission requests"
  ON sales_permission_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Admins can update requests (approve/deny)
CREATE POLICY "Admins can update sales permission requests"
  ON sales_permission_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_admin = true
    )
  );

-- Create function to get sales feature status
CREATE OR REPLACE FUNCTION get_sales_feature_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT sales_feature_enabled FROM admin_settings LIMIT 1),
    false
  );
$$;

-- Create function to check if user can post sales
CREATE OR REPLACE FUNCTION user_can_post_sales(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (
      SELECT 
        CASE 
          -- Check if sales feature is enabled
          WHEN NOT (SELECT sales_feature_enabled FROM admin_settings LIMIT 1) THEN false
          -- Check if universal access is enabled
          WHEN (SELECT sales_universal_access FROM admin_settings LIMIT 1) THEN true
          -- Check if user has explicit permission
          WHEN (SELECT can_post_sales FROM profiles WHERE id = user_id) THEN true
          -- Check if user is admin
          WHEN (SELECT is_admin FROM profiles WHERE id = user_id) THEN true
          ELSE false
        END
    ),
    false
  );
$$;

-- Update listings RLS policies to handle sale listings visibility
-- Drop existing "Anyone can read active listings" policy if it exists
DROP POLICY IF EXISTS "Anyone can read active listings" ON listings;

-- Create new policy that filters sale listings when feature is disabled
CREATE POLICY "Anyone can read active rental listings"
  ON listings
  FOR SELECT
  USING (
    is_active = true 
    AND approved = true
    AND (
      listing_type = 'rental'
      OR (listing_type = 'sale' AND get_sales_feature_enabled() = true)
    )
  );

-- Policy for authenticated users to read their own listings (including drafts and sales)
CREATE POLICY "Users can read own listings"
  ON listings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Update insert policy to check sales permission
DROP POLICY IF EXISTS "Users can create listings" ON listings;

CREATE POLICY "Users can create rental listings"
  ON listings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      listing_type = 'rental'
      OR (listing_type = 'sale' AND user_can_post_sales(auth.uid()) = true)
    )
  );

-- Trigger to update updated_at on sales_permission_requests
CREATE OR REPLACE FUNCTION update_sales_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sales_permission_requests_updated_at ON sales_permission_requests;

CREATE TRIGGER sales_permission_requests_updated_at
  BEFORE UPDATE ON sales_permission_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_sales_request_updated_at();

-- Grant necessary permissions
GRANT SELECT ON admin_settings TO authenticated;
GRANT SELECT ON profiles TO authenticated;
GRANT ALL ON sales_permission_requests TO authenticated;

-- Comments for documentation
COMMENT ON COLUMN admin_settings.sales_feature_enabled IS 'Master toggle for entire sales listing system. When false, all sales features are hidden.';
COMMENT ON COLUMN admin_settings.sales_universal_access IS 'When true, all users can post sale listings. When false, only users with can_post_sales permission can post.';
COMMENT ON COLUMN admin_settings.max_featured_sales IS 'Maximum number of sale listings that can be featured at once.';
COMMENT ON COLUMN profiles.can_post_sales IS 'Permission flag indicating if user can post sale listings. Only checked when sales_universal_access is false.';
COMMENT ON COLUMN listings.listing_type IS 'Type of listing: rental or sale. Defaults to rental for backwards compatibility.';
COMMENT ON COLUMN listings.asking_price IS 'Asking price for sale listings. Only used when listing_type is sale.';
COMMENT ON TABLE sales_permission_requests IS 'Tracks user requests for permission to post sale listings. Admins review and approve/deny requests.';
