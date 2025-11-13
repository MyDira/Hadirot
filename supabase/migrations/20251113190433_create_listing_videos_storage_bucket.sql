/*
  # Create listing-videos Storage Bucket

  ## Summary
  Creates the listing-videos storage bucket to enable video uploads for property listings.
  This bucket mirrors the configuration of the existing listing-images bucket.

  ## Changes

  1. Storage Bucket
    - Create `listing-videos` bucket for storing property listing video files
    - Set as public bucket to allow direct video playback
    - Uses ON CONFLICT to safely handle bucket if it already exists

  2. Row Level Security Policies
    - Allow authenticated users to upload videos to their listings
    - Allow public read access to all videos for viewing
    - Allow users to delete videos from their own listings
    - Allow admins to manage all videos

  3. Cleanup Integration
    - Videos follow the same lifecycle as listing images
    - When listings are deleted (after 60-day lifecycle), associated videos are orphaned
    - Cleanup handled by existing auto_delete_very_old_listings() function via CASCADE

  ## Security
  - All operations on storage.objects require proper RLS policies
  - Authenticated users can only modify videos for their own listings
  - Public can view all videos (required for video playback)
  - Admins have full access for moderation

  ## Notes
  - Video files stored with path format: {listingId}/{timestamp}.{ext}
  - Video URLs stored in listings.video_url column (added in previous migration)
  - Video thumbnails use the listing-images bucket (not this bucket)
  - Bucket configuration matches existing listing-images bucket behavior
*/

-- Create the listing-videos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-videos', 'listing-videos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy: Allow public to view videos
CREATE POLICY "Public can view listing videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'listing-videos');

-- RLS Policy: Allow authenticated users to upload videos
CREATE POLICY "Authenticated users can upload listing videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'listing-videos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM listings WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Allow users to update their own listing videos
CREATE POLICY "Users can update own listing videos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'listing-videos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM listings WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Allow users to delete their own listing videos
CREATE POLICY "Users can delete own listing videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'listing-videos'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM listings WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Allow admins to manage all videos
CREATE POLICY "Admins can manage all listing videos"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'listing-videos'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Add comment for documentation
COMMENT ON COLUMN storage.buckets.id IS 'Storage bucket identifier. listing-videos bucket stores property listing video files.';
