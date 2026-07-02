/*
  # Commercial-aware admin analytics + batch impressions RPC
  (COMMERCIAL_AUDIT_2026-07-01 M-5, m-7)

  The analytics_* RPCs behind /admin analytics joined only `listings`, so
  commercial supply/performance/zero-inquiry data was invisible (while the
  aggregate inquiry counts silently included commercial rows). Each function
  below keeps its prod signature, require_admin() gate, and time-window math
  byte-identical; only the listing sources gain a commercial branch.

  Also adds increment_commercial_listing_impressions(uuid[]) — commercial
  impressions are stored on the row (commercial_listings.impressions is the
  source of truth per the 20260630000000 design note), tracked client-side
  by useCommercialImpressions.
*/

-- ============================================================
-- 1) Supply stats: count both tables
-- ============================================================
CREATE OR REPLACE FUNCTION public.analytics_supply_stats(days_back integer DEFAULT 14, tz text DEFAULT 'America/New_York')
RETURNS TABLE(new_listings_by_day jsonb, active_count integer, inactive_count integer, total_new_listings integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
start_ts timestamptz;
end_ts timestamptz;
BEGIN
PERFORM require_admin();

end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
start_ts := end_ts - make_interval(days => days_back);

RETURN QUERY
WITH all_listings AS (
  SELECT created_at, is_active FROM listings
  UNION ALL
  SELECT created_at, is_active FROM commercial_listings
),
daily_new AS (
SELECT
(al.created_at AT TIME ZONE tz)::date AS day_date,
COUNT(*)::integer AS count
FROM all_listings al
WHERE al.created_at >= start_ts AND al.created_at < end_ts
GROUP BY (al.created_at AT TIME ZONE tz)::date
ORDER BY day_date
)
SELECT
COALESCE(
(SELECT jsonb_agg(jsonb_build_object('date', day_date, 'count', count) ORDER BY day_date)
FROM daily_new),
'[]'::jsonb
),
(SELECT COUNT(*) FROM all_listings WHERE is_active = true)::integer,
(SELECT COUNT(*) FROM all_listings WHERE is_active = false)::integer,
(SELECT COUNT(*) FROM all_listings WHERE created_at >= start_ts AND created_at < end_ts)::integer;
END;
$function$;

-- ============================================================
-- 2) Inquiry listings performance: residential UNION commercial
-- ============================================================
CREATE OR REPLACE FUNCTION public.analytics_inquiry_listings_performance_dual(days_back integer DEFAULT 14, tz text DEFAULT 'America/New_York', limit_count integer DEFAULT 20)
RETURNS TABLE(listing_id uuid, title text, location text, neighborhood text, bedrooms integer, price integer, phone_reveals bigint, contact_forms bigint, total_inquiries bigint, conversion_rate numeric, is_featured boolean, posted_by text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
start_ts timestamptz;
end_ts timestamptz;
BEGIN
PERFORM require_admin();

end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
start_ts := end_ts - make_interval(days => days_back);

RETURN QUERY
WITH phone_counts AS (
SELECT COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')::uuid AS lid, COUNT(*) AS phone_count
FROM analytics_events ae
WHERE ae.event_name = 'phone_reveal'
AND COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts
AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')::uuid
),
form_counts AS (
SELECT lcs.listing_id AS lid, COUNT(*) AS form_count
FROM listing_contact_submissions lcs
WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts AND lcs.listing_id IS NOT NULL
GROUP BY lcs.listing_id
),
form_counts_commercial AS (
SELECT lcs.commercial_listing_id AS lid, COUNT(*) AS form_count
FROM listing_contact_submissions lcs
WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts AND lcs.commercial_listing_id IS NOT NULL
GROUP BY lcs.commercial_listing_id
),
view_counts AS (
SELECT COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')::uuid AS lid, COUNT(*) AS view_count
FROM analytics_events ae
WHERE ae.event_name = 'listing_view'
AND COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts
AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')::uuid
),
combined AS (
SELECT l.id AS lid, l.title, l.location, l.neighborhood, l.bedrooms, l.price,
COALESCE(pc.phone_count, 0)::bigint AS phone_reveals,
COALESCE(fc.form_count, 0)::bigint AS contact_forms,
(COALESCE(pc.phone_count, 0) + COALESCE(fc.form_count, 0))::bigint AS total_inquiries,
CASE WHEN COALESCE(vc.view_count, 0) > 0 THEN ROUND(((COALESCE(pc.phone_count, 0) + COALESCE(fc.form_count, 0))::numeric / vc.view_count::numeric) * 100, 2) ELSE 0 END AS conversion_rate,
l.is_featured,
COALESCE(p.full_name, 'Unknown') AS posted_by
FROM listings l
LEFT JOIN phone_counts pc ON pc.lid = l.id
LEFT JOIN form_counts fc ON fc.lid = l.id
LEFT JOIN view_counts vc ON vc.lid = l.id
LEFT JOIN profiles p ON p.id = l.user_id
WHERE l.is_active = true AND (COALESCE(pc.phone_count, 0) + COALESCE(fc.form_count, 0)) > 0
UNION ALL
SELECT cl.id AS lid,
COALESCE(cl.title, initcap(replace(cl.commercial_space_type, '_', ' ')) || ' — ' || COALESCE(cl.full_address, cl.neighborhood, '')) AS title,
COALESCE(cl.full_address, cl.neighborhood, '') AS location,
cl.neighborhood,
NULL::integer AS bedrooms,
COALESCE(CASE WHEN cl.listing_type = 'sale' THEN cl.asking_price ELSE cl.price END, 0)::integer AS price,
COALESCE(pc.phone_count, 0)::bigint AS phone_reveals,
COALESCE(fcc.form_count, 0)::bigint AS contact_forms,
(COALESCE(pc.phone_count, 0) + COALESCE(fcc.form_count, 0))::bigint AS total_inquiries,
CASE WHEN COALESCE(vc.view_count, 0) > 0 THEN ROUND(((COALESCE(pc.phone_count, 0) + COALESCE(fcc.form_count, 0))::numeric / vc.view_count::numeric) * 100, 2) ELSE 0 END AS conversion_rate,
cl.is_featured,
COALESCE(p.full_name, 'Unknown') AS posted_by
FROM commercial_listings cl
LEFT JOIN phone_counts pc ON pc.lid = cl.id
LEFT JOIN form_counts_commercial fcc ON fcc.lid = cl.id
LEFT JOIN view_counts vc ON vc.lid = cl.id
LEFT JOIN profiles p ON p.id = cl.user_id
WHERE cl.is_active = true AND (COALESCE(pc.phone_count, 0) + COALESCE(fcc.form_count, 0)) > 0
)
SELECT c.lid, c.title, c.location, c.neighborhood, c.bedrooms, c.price,
c.phone_reveals, c.contact_forms, c.total_inquiries, c.conversion_rate,
c.is_featured, c.posted_by
FROM combined c
ORDER BY c.total_inquiries DESC
LIMIT limit_count;
END;
$function$;

-- ============================================================
-- 3) Zero-inquiry listings: residential UNION commercial
-- ============================================================
CREATE OR REPLACE FUNCTION public.analytics_zero_inquiry_listings(days_back integer DEFAULT 14, tz text DEFAULT 'America/New_York', min_views integer DEFAULT 5)
RETURNS TABLE(listing_id text, title text, location text, neighborhood text, bedrooms integer, price integer, views bigint, days_since_posted integer, is_featured boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
start_ts timestamptz;
end_ts timestamptz;
BEGIN
PERFORM require_admin();

end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
start_ts := end_ts - make_interval(days => days_back);

RETURN QUERY
WITH view_counts AS (
SELECT
COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') AS lid,
COUNT(*) AS view_count
FROM analytics_events ae
WHERE ae.event_name = 'listing_view'
AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
AND COALESCE(ae.occurred_at, ae.ts) < end_ts
AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')
),
listings_with_inquiries AS (
SELECT DISTINCT lcs.listing_id::text AS lid
FROM listing_contact_submissions lcs
WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts AND lcs.listing_id IS NOT NULL
UNION
SELECT DISTINCT lcs.commercial_listing_id::text AS lid
FROM listing_contact_submissions lcs
WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts AND lcs.commercial_listing_id IS NOT NULL
),
phone_clicks AS (
SELECT DISTINCT COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') AS lid
FROM analytics_events ae
WHERE ae.event_name = 'phone_click'
AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
AND COALESCE(ae.occurred_at, ae.ts) < end_ts
AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
),
combined AS (
SELECT
l.id::text AS lid,
l.title,
l.location,
l.neighborhood,
l.bedrooms,
l.price,
COALESCE(vc.view_count, 0)::bigint AS views,
EXTRACT(DAY FROM (now() - l.created_at))::integer AS days_since_posted,
l.is_featured
FROM listings l
LEFT JOIN view_counts vc ON vc.lid = l.id::text
WHERE l.is_active = true
AND COALESCE(vc.view_count, 0) >= min_views
UNION ALL
SELECT
cl.id::text AS lid,
COALESCE(cl.title, initcap(replace(cl.commercial_space_type, '_', ' ')) || ' — ' || COALESCE(cl.full_address, cl.neighborhood, '')) AS title,
COALESCE(cl.full_address, cl.neighborhood, '') AS location,
cl.neighborhood,
NULL::integer AS bedrooms,
COALESCE(CASE WHEN cl.listing_type = 'sale' THEN cl.asking_price ELSE cl.price END, 0)::integer AS price,
COALESCE(vc.view_count, 0)::bigint AS views,
EXTRACT(DAY FROM (now() - cl.created_at))::integer AS days_since_posted,
cl.is_featured
FROM commercial_listings cl
LEFT JOIN view_counts vc ON vc.lid = cl.id::text
WHERE cl.is_active = true
AND COALESCE(vc.view_count, 0) >= min_views
)
SELECT c.lid, c.title, c.location, c.neighborhood, c.bedrooms, c.price, c.views, c.days_since_posted, c.is_featured
FROM combined c
WHERE c.lid NOT IN (SELECT lwi.lid FROM listings_with_inquiries lwi WHERE lwi.lid IS NOT NULL)
AND c.lid NOT IN (SELECT ph.lid FROM phone_clicks ph WHERE ph.lid IS NOT NULL)
ORDER BY c.views DESC
LIMIT 20;
END;
$function$;

-- ============================================================
-- 4) Commercial batch impressions RPC (client: useCommercialImpressions)
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_commercial_listing_impressions(p_listing_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE commercial_listings
  SET impressions = COALESCE(impressions, 0) + 1
  WHERE id = ANY(p_listing_ids) AND is_active = true AND approved = true;
$$;

GRANT EXECUTE ON FUNCTION public.increment_commercial_listing_impressions(uuid[]) TO anon, authenticated;
