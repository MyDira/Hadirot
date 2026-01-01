/*
  # Update Listing Deletion to Anonymization

  1. Changes
    - Modifies auto_delete_very_old_listings() function to anonymize listings instead of deleting them
    - Removes user_id association (sets to NULL)
    - Clears video_url field
    - Deletes all listing images from database
    - Deletes all image files from listing-images storage bucket
    - Deletes all video files from listing-videos storage bucket
    - Preserves all other listing data for administrative purposes

  2. Behavior
    - After 30 days of deactivation, listings are automatically anonymized
    - Users no longer see these listings in their dashboard
    - Storage space is freed up (images and videos deleted)
    - All text data, metrics, and metadata remain intact for admin access

  3. Security
    - SECURITY DEFINER allows service role to execute
    - Function maintains existing signature for compatibility
    - Returns count for monitoring
*/

-- Update auto-deletion function to anonymize listings instead of deleting them
CREATE OR REPLACE FUNCTION auto_delete_very_old_listings()
RETURNS TABLE(
  deleted_count integer,
  listing_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_ids uuid[];
  affected_count integer;
  listing_record RECORD;
  image_record RECORD;
BEGIN
  -- Collect IDs of listings to be anonymized
  SELECT
    array_agg(id),
    COUNT(*)::integer
  INTO
    affected_ids,
    affected_count
  FROM listings
  WHERE
    is_active = false
    AND deactivated_at IS NOT NULL
    AND deactivated_at < NOW() - INTERVAL '30 days'
    AND user_id IS NOT NULL;

  -- Handle case where no listings match criteria
  IF affected_ids IS NULL OR affected_count = 0 THEN
    affected_ids := ARRAY[]::uuid[];
    affected_count := 0;
  ELSE
    -- Process each listing for anonymization
    FOR listing_record IN
      SELECT id, video_url
      FROM listings
      WHERE id = ANY(affected_ids)
    LOOP
      -- Delete image files from storage bucket
      FOR image_record IN
        SELECT image_url
        FROM listing_images
        WHERE listing_id = listing_record.id
      LOOP
        -- Extract the path from the full URL (format: {listingId}/{filename})
        BEGIN
          DELETE FROM storage.objects
          WHERE bucket_id = 'listing-images'
          AND name LIKE listing_record.id::text || '/%';
        EXCEPTION WHEN OTHERS THEN
          -- Continue on error
          NULL;
        END;
      END LOOP;

      -- Delete video file from storage bucket if exists
      IF listing_record.video_url IS NOT NULL THEN
        BEGIN
          DELETE FROM storage.objects
          WHERE bucket_id = 'listing-videos'
          AND name LIKE listing_record.id::text || '/%';
        EXCEPTION WHEN OTHERS THEN
          -- Continue on error
          NULL;
        END;
      END IF;

      -- Delete listing_images records
      DELETE FROM listing_images
      WHERE listing_id = listing_record.id;

      -- Anonymize the listing
      UPDATE listings
      SET
        user_id = NULL,
        video_url = NULL,
        updated_at = NOW()
      WHERE id = listing_record.id;
    END LOOP;
  END IF;

  -- Return results
  RETURN QUERY SELECT affected_count, affected_ids;
END;
$$;

-- Update function comment
COMMENT ON FUNCTION auto_delete_very_old_listings() IS 'Anonymizes listings that have been inactive for 30+ days. Removes user association, deletes images/videos, but preserves listing data for admin access. Called by delete-old-listings edge function.';