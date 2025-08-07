/*
  # Featured Listings Enhancements

  1. Admin Settings Updates
    - Add `max_featured_per_user` column to control per-user featured listing limits
    - Ensure `max_featured_listings` exists for global limits

  2. Profile Updates  
    - Add `can_feature_listings` column to control who can feature listings
    - This will be used for monetization - toggle when someone pays

  3. Listings Updates
    - Add `featured_expires_at` column for automatic expiration of featured status
    - Featured listings will automatically expire after 1 week

  4. Security
    - Update RLS policies as needed
    - Maintain existing security model
*/

-- Update admin_settings table to add per-user featured listing limits
DO $$
BEGIN
  -- Add max_featured_per_user column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'admin_settings' AND column_name = 'max_featured_per_user'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN max_featured_per_user integer DEFAULT 2;
  END IF;

  -- Ensure max_featured_listings exists (from previous discussions)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'admin_settings' AND column_name = 'max_featured_listings'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN max_featured_listings integer DEFAULT 8;
  END IF;
END $$;

-- Update profiles table to add featured listing permissions
DO $$
BEGIN
  -- Add can_feature_listings column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'can_feature_listings'
  ) THEN
    ALTER TABLE profiles ADD COLUMN can_feature_listings boolean DEFAULT false;
  END IF;
END $$;

-- Update listings table to add featured expiration
DO $$
BEGIN
  -- Add featured_expires_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'listings' AND column_name = 'featured_expires_at'
  ) THEN
    ALTER TABLE listings ADD COLUMN featured_expires_at timestamptz;
  END IF;
END $$;

-- Insert default admin settings if the table is empty
INSERT INTO admin_settings (max_featured_listings, max_featured_per_user, featured_duration_days)
SELECT 8, 2, 7
WHERE NOT EXISTS (SELECT 1 FROM admin_settings);

-- Create function to automatically expire featured listings
CREATE OR REPLACE FUNCTION expire_featured_listings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Set is_featured to false for listings where featured_expires_at has passed
  UPDATE listings 
  SET 
    is_featured = false,
    featured_expires_at = null,
    updated_at = now()
  WHERE 
    is_featured = true 
    AND featured_expires_at IS NOT NULL 
    AND featured_expires_at <= now();
    
  -- Log the number of expired listings
  RAISE NOTICE 'Expired % featured listings', (
    SELECT COUNT(*) 
    FROM listings 
    WHERE is_featured = false 
    AND featured_expires_at IS NULL 
    AND updated_at >= now() - interval '1 minute'
  );
END;
$$;

-- Create function to get featured listings count
CREATE OR REPLACE FUNCTION get_featured_listings_count()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  count_result integer;
BEGIN
  -- First expire any old featured listings
  PERFORM expire_featured_listings();
  
  -- Then count active featured listings
  SELECT COUNT(*) INTO count_result
  FROM listings
  WHERE is_featured = true
    AND is_active = true
    AND approved = true
    AND (featured_expires_at IS NULL OR featured_expires_at > now());
    
  RETURN count_result;
END;
$$;

-- Create function to get featured listings count by user
CREATE OR REPLACE FUNCTION get_featured_listings_count_by_user(user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  count_result integer;
BEGIN
  -- First expire any old featured listings
  PERFORM expire_featured_listings();
  
  -- Then count active featured listings for the specific user
  SELECT COUNT(*) INTO count_result
  FROM listings
  WHERE user_id = get_featured_listings_count_by_user.user_id
    AND is_featured = true
    AND is_active = true
    AND approved = true
    AND (featured_expires_at IS NULL OR featured_expires_at > now());
    
  RETURN count_result;
END;
$$;

-- Update the trigger function to handle featured expiration when updating listings
CREATE OR REPLACE FUNCTION handle_featured_listing_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If setting is_featured to true, set expiration to 1 week from now
  IF NEW.is_featured = true AND (OLD.is_featured = false OR OLD.is_featured IS NULL) THEN
    NEW.featured_expires_at = now() + interval '7 days';
  END IF;
  
  -- If setting is_featured to false, clear expiration
  IF NEW.is_featured = false THEN
    NEW.featured_expires_at = null;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for featured listing updates
DROP TRIGGER IF EXISTS featured_listing_update_trigger ON listings;
CREATE TRIGGER featured_listing_update_trigger
  BEFORE UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION handle_featured_listing_update();

-- Grant necessary permissions for the functions
GRANT EXECUTE ON FUNCTION expire_featured_listings() TO authenticated;
GRANT EXECUTE ON FUNCTION get_featured_listings_count() TO authenticated;
GRANT EXECUTE ON FUNCTION get_featured_listings_count_by_user(uuid) TO authenticated;