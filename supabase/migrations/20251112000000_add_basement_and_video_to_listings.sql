/*
  # Add Basement Property Type and Video Support to Listings

  ## Changes

  1. Property Type Enum Update
    - Add 'basement' as a new valid property type option
    - Existing values: 'apartment_building', 'apartment_house', 'full_house', 'duplex'
    - New value: 'basement' for basement apartments

  2. Video Support
    - Add `video_url` column to store the listing video URL
    - Add `video_thumbnail_url` column to store video thumbnail for card display
    - Both columns are nullable (not all listings will have videos)

  3. Data Integrity
    - Backward compatible - existing listings are unaffected
    - New columns default to NULL
    - No data migration needed

  4. Notes
    - Basement represents a below-ground-level apartment unit
    - Videos can be used as primary media when no photos are uploaded
    - Video thumbnails serve as fallback images on listing cards
*/

-- Add 'basement' to the property_type enum
ALTER TYPE property_type ADD VALUE IF NOT EXISTS 'basement';

-- Add video support columns to listings table
DO $$
BEGIN
  -- Add video_url column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'video_url'
  ) THEN
    ALTER TABLE listings ADD COLUMN video_url text;
  END IF;

  -- Add video_thumbnail_url column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'video_thumbnail_url'
  ) THEN
    ALTER TABLE listings ADD COLUMN video_thumbnail_url text;
  END IF;
END $$;

-- Add comments to document the new columns
COMMENT ON COLUMN listings.video_url IS 'URL to the listing video file stored in Supabase storage';
COMMENT ON COLUMN listings.video_thumbnail_url IS 'URL to the video thumbnail image used as fallback on listing cards';
COMMENT ON TYPE property_type IS 'Property type classification: apartment_building, apartment_house, full_house, duplex, basement';
