/*
  # Commercial lifecycle wiring (COMMERCIAL_AUDIT_2026-07-01 B-1, M-1, m-8)

  Verified against prod 2026-07-01:
  - cron job 1 runs deactivate_old_listings(), cron job 2 runs
    delete_very_old_listings() — both wrappers called ONLY the residential
    functions. auto_inactivate_old_commercial_listings() and
    auto_delete_very_old_commercial_listings() existed with ZERO callers,
    so commercial listings never expired and were never cleaned up.
  - expire_featured_listings() (cron job 18, hourly) cleared featured flags
    only on `listings` — a paid commercial boost stayed "Featured" forever.
  - auto_delete_very_old_commercial_listings cleaned bucket
    'commercial-listing-images' with prefix '{id}/%', but commercial images
    actually live in bucket 'listing-images' under 'commercial/{id}/…'
    (see commercialListingsService.uploadCommercialListingImage).

  All changes extend the EXISTING cron-called functions — no cron.job edits,
  no competing schedulers.
*/

-- ============================================================
-- B-1a: nightly inactivation covers commercial
-- ============================================================
CREATE OR REPLACE FUNCTION public.deactivate_old_listings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.auto_inactivate_old_listings();
  PERFORM public.auto_inactivate_old_commercial_listings();
END;
$$;

-- ============================================================
-- B-1b: nightly anonymize/cleanup covers commercial
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_very_old_listings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.delete_enabled','on', true);
  PERFORM public.auto_delete_very_old_listings();
  PERFORM public.auto_delete_very_old_commercial_listings();
  PERFORM set_config('app.delete_enabled','off', true);
END;
$$;

-- ============================================================
-- M-1: hourly featured expiry covers commercial boosts
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_featured_listings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE listings
  SET is_featured = false,
      featured_expires_at = null,
      featured_started_at = null,
      featured_plan = null,
      updated_at = now()
  WHERE is_featured = true
    AND featured_expires_at IS NOT NULL
    AND featured_expires_at <= now();

  UPDATE commercial_listings
  SET is_featured = false,
      featured_expires_at = null,
      featured_started_at = null,
      featured_plan = null,
      updated_at = now()
  WHERE is_featured = true
    AND featured_expires_at IS NOT NULL
    AND featured_expires_at <= now();

  UPDATE featured_purchases
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'active'
    AND featured_end IS NOT NULL
    AND featured_end <= now();
END;
$$;

-- ============================================================
-- m-8: commercial delete cleans the REAL storage location
-- (bucket 'listing-images', prefix 'commercial/{id}/'); commercial
-- video_url is an external link — no storage cleanup needed for it.
-- Body otherwise identical to the existing prod function.
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_delete_very_old_commercial_listings()
RETURNS TABLE(affected_count integer, affected_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  affected_ids   uuid[];
  affected_count integer;
  listing_record RECORD;
BEGIN
  SELECT array_agg(id), COUNT(*)::integer
  INTO affected_ids, affected_count
  FROM commercial_listings
  WHERE is_active = false
    AND deactivated_at IS NOT NULL
    AND deactivated_at < NOW() - INTERVAL '30 days'
    AND user_id IS NOT NULL;

  IF affected_ids IS NULL OR affected_count = 0 THEN
    affected_ids   := ARRAY[]::uuid[];
    affected_count := 0;
  ELSE
    FOR listing_record IN
      SELECT id FROM commercial_listings WHERE id = ANY(affected_ids)
    LOOP
      BEGIN
        DELETE FROM storage.objects
        WHERE bucket_id = 'listing-images'
          AND name LIKE 'commercial/' || listing_record.id::text || '/%';
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;

      DELETE FROM commercial_listing_images
      WHERE listing_id = listing_record.id;

      UPDATE commercial_listings
      SET user_id    = NULL,
          video_url  = NULL,
          updated_at = NOW()
      WHERE id = listing_record.id;
    END LOOP;
  END IF;

  RETURN QUERY SELECT affected_count, affected_ids;
END;
$function$;
