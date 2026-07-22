/*
  # Exclude admin activity from every analytics counter

  analytics_events already excludes admins twice (client suppression in
  src/lib/analytics.ts + a server-side filter in the track Edge Function),
  but the *row counters* had no such guard. Any admin browsing the site
  was silently inflating:

    - listings.views                        (shown to listing OWNERS on
                                             their dashboard + weekly
                                             performance emails)
    - commercial_listings.views/direct_views
    - commercial_listings.impressions       (source of truth for commercial)
    - short_urls.click_count                (digest link performance)
    - knowledge_base_articles.view_count

  These are SECURITY DEFINER functions callable by anon/authenticated, so
  the guard belongs in the function body: it then holds for every caller
  regardless of which client path (or future code) invokes it.

  is_admin_cached() is STABLE, reads the JWT claim with a profiles
  fallback, and returns false when there is no auth context — so
  anonymous visitors (the overwhelming majority of traffic) are
  unaffected and still counted normally.

  Signatures are unchanged, so no client code has to change.
*/

-- ── Residential listing views ────────────────────────────────────
-- (also gains the SET search_path this function was missing)
CREATE OR REPLACE FUNCTION public.increment_listing_views(listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF public.is_admin_cached() THEN
    RETURN; -- admin browsing must not inflate owner-facing view counts
  END IF;

  UPDATE listings
  SET views = COALESCE(views, 0) + 1
  WHERE id = listing_id AND is_active = true;
END;
$$;

-- ── Commercial listing views ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_commercial_listing_views(listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF public.is_admin_cached() THEN
    RETURN;
  END IF;

  UPDATE commercial_listings
  SET views = COALESCE(views, 0) + 1,
      direct_views = COALESCE(direct_views, 0) + 1
  WHERE id = listing_id AND is_active = true;
END;
$$;

-- ── Commercial impressions (batch) ───────────────────────────────
-- Kept as LANGUAGE sql; the guard becomes part of the WHERE clause.
CREATE OR REPLACE FUNCTION public.increment_commercial_listing_impressions(p_listing_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  UPDATE commercial_listings
  SET impressions = COALESCE(impressions, 0) + 1
  WHERE id = ANY(p_listing_ids)
    AND is_active = true
    AND approved = true
    AND NOT public.is_admin_cached();
$$;

-- ── Short-URL clicks (digest link performance) ───────────────────
CREATE OR REPLACE FUNCTION public.increment_short_url_clicks(p_short_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp, pg_catalog
AS $$
BEGIN
  IF public.is_admin_cached() THEN
    RETURN;
  END IF;

  UPDATE short_urls
  SET click_count = click_count + 1,
      last_clicked_at = now()
  WHERE short_code = p_short_code;
END;
$$;

-- ── Help-center article views ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_article_views(article_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  IF public.is_admin_cached() THEN
    RETURN;
  END IF;

  UPDATE knowledge_base_articles
  SET view_count = view_count + 1
  WHERE id = article_id;
END;
$$;

COMMENT ON FUNCTION public.increment_listing_views(uuid) IS
  'Increments listings.views. No-ops for admins so staff browsing does not inflate owner-facing stats.';
COMMENT ON FUNCTION public.increment_commercial_listing_impressions(uuid[]) IS
  'Batch-increments commercial impressions. No-ops for admins.';
