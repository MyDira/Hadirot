/*
  # Split phone_click into phone_reveal + phone_dial, add map_pin_click event

  1. Data Migration
    - Rename all existing `phone_click` events to `phone_reveal` in analytics_events

  2. Updated Functions (10 total)
    - `analytics_engagement_funnel` - Add phone_reveals, phone_dials, pin_clicks columns with rates
    - `analytics_inquiry_overview_dual` - Change phone_click to phone_reveal, add phone_dials/phone_dials_prev
    - `analytics_inquiry_conversion_funnel` - Change phone_click to phone_reveal, add phone_dials/phone_dial_conversion_rate
    - `analytics_inquiry_user_behavior` - Change phone_click to phone_reveal
    - `analytics_inquiry_timing_phones` - Change phone_click to phone_reveal
    - `analytics_listings_performance` - Change phone_click to phone_reveal, rename column to phone_reveal_count
    - `analytics_listing_drilldown` - Change phone_click to phone_reveal, rename column to phone_reveals
    - `analytics_inquiry_listings_performance_dual` - Change phone_click to phone_reveal
    - `analytics_inquiry_demand_breakdown_dual` - Change phone_click to phone_reveal
    - `analytics_inquiry_trend` - Change phone_click to phone_reveal, rename column to phone_reveal_count

  3. New Event Types
    - `phone_reveal` - Fires when user clicks eye icon to unmask phone number
    - `phone_dial` - Fires when user taps the revealed tel: link on mobile
    - `map_pin_click` - Fires when user clicks a map pin/marker

  4. Important Notes
    - No backward compatibility for phone_click needed; data is migrated first
    - listing_metrics_v1 and analytics_top_listings NOT modified
*/

-- ============================================================
-- Step 1: Rename all historical phone_click events to phone_reveal
-- ============================================================
UPDATE analytics_events SET event_name = 'phone_reveal' WHERE event_name = 'phone_click';

-- ============================================================
-- Step 2: Drop functions whose return types are changing
-- ============================================================
DROP FUNCTION IF EXISTS analytics_engagement_funnel(integer, text);
DROP FUNCTION IF EXISTS analytics_inquiry_overview_dual(integer, text);
DROP FUNCTION IF EXISTS analytics_inquiry_conversion_funnel(integer, text);
DROP FUNCTION IF EXISTS analytics_listings_performance(integer, text, integer);
DROP FUNCTION IF EXISTS analytics_listing_drilldown(uuid, integer, text);
DROP FUNCTION IF EXISTS analytics_inquiry_trend(integer, text);

-- ============================================================
-- Step 3: Recreate analytics_engagement_funnel with new columns
-- ============================================================
CREATE FUNCTION analytics_engagement_funnel(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  total_sessions bigint,
  total_impressions bigint,
  total_views bigint,
  total_inquiries bigint,
  phone_reveals bigint,
  phone_dials bigint,
  pin_clicks bigint,
  phone_dial_rate numeric,
  pin_click_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
  v_sessions bigint;
  v_impressions bigint;
  v_views bigint;
  v_inquiries bigint;
  v_phone_reveals bigint;
  v_phone_dials bigint;
  v_pin_clicks bigint;
BEGIN
  PERFORM require_admin();

  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);

  SELECT COUNT(DISTINCT session_id) INTO v_sessions
  FROM analytics_events
  WHERE COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts;

  v_impressions := _analytics_impressions_range(start_ts, end_ts);
  v_views := _analytics_events_count_range(start_ts, end_ts, 'listing_view');
  v_inquiries := _analytics_inquiries_count_range(start_ts, end_ts);

  SELECT COUNT(*) INTO v_phone_reveals
  FROM analytics_events
  WHERE event_name = 'phone_reveal'
  AND COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts;

  SELECT COUNT(*) INTO v_phone_dials
  FROM analytics_events
  WHERE event_name = 'phone_dial'
  AND COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts;

  SELECT COUNT(*) INTO v_pin_clicks
  FROM analytics_events
  WHERE event_name = 'map_pin_click'
  AND COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts;

  RETURN QUERY SELECT
    v_sessions,
    v_impressions,
    v_views,
    v_inquiries,
    v_phone_reveals,
    v_phone_dials,
    v_pin_clicks,
    CASE WHEN v_phone_reveals > 0 THEN ROUND((v_phone_dials::numeric / v_phone_reveals::numeric) * 100, 1) ELSE 0::numeric END,
    CASE WHEN v_views > 0 THEN ROUND((v_pin_clicks::numeric / v_views::numeric) * 100, 1) ELSE 0::numeric END;
END;
$function$;

-- ============================================================
-- Step 4: Recreate analytics_inquiry_overview_dual with phone_dials
-- ============================================================
CREATE FUNCTION analytics_inquiry_overview_dual(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  phone_reveals bigint,
  phone_reveals_prev bigint,
  contact_forms bigint,
  contact_forms_prev bigint,
  total_inquiries bigint,
  total_inquiries_prev bigint,
  unique_sessions_phone bigint,
  unique_phones_form bigint,
  phone_dials bigint,
  phone_dials_prev bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_end_ts timestamptz;
  current_start_ts timestamptz;
  prev_end_ts timestamptz;
  prev_start_ts timestamptz;
BEGIN
  PERFORM require_admin();

  current_end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  current_start_ts := current_end_ts - make_interval(days => days_back);
  prev_end_ts := current_start_ts;
  prev_start_ts := prev_end_ts - make_interval(days => days_back);

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM analytics_events ae
     WHERE ae.event_name = 'phone_reveal'
     AND COALESCE(ae.occurred_at, ae.ts) >= current_start_ts
     AND COALESCE(ae.occurred_at, ae.ts) < current_end_ts
     AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL)::bigint,

    (SELECT COUNT(*) FROM analytics_events ae
     WHERE ae.event_name = 'phone_reveal'
     AND COALESCE(ae.occurred_at, ae.ts) >= prev_start_ts
     AND COALESCE(ae.occurred_at, ae.ts) < prev_end_ts
     AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL)::bigint,

    (SELECT COUNT(*) FROM listing_contact_submissions lcs
     WHERE lcs.created_at >= current_start_ts AND lcs.created_at < current_end_ts)::bigint,

    (SELECT COUNT(*) FROM listing_contact_submissions lcs
     WHERE lcs.created_at >= prev_start_ts AND lcs.created_at < prev_end_ts)::bigint,

    (SELECT COUNT(*) FROM analytics_events ae
     WHERE ae.event_name = 'phone_reveal'
     AND COALESCE(ae.occurred_at, ae.ts) >= current_start_ts
     AND COALESCE(ae.occurred_at, ae.ts) < current_end_ts
     AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL)::bigint +
    (SELECT COUNT(*) FROM listing_contact_submissions lcs
     WHERE lcs.created_at >= current_start_ts AND lcs.created_at < current_end_ts)::bigint,

    (SELECT COUNT(*) FROM analytics_events ae
     WHERE ae.event_name = 'phone_reveal'
     AND COALESCE(ae.occurred_at, ae.ts) >= prev_start_ts
     AND COALESCE(ae.occurred_at, ae.ts) < prev_end_ts
     AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL)::bigint +
    (SELECT COUNT(*) FROM listing_contact_submissions lcs
     WHERE lcs.created_at >= prev_start_ts AND lcs.created_at < prev_end_ts)::bigint,

    (SELECT COUNT(DISTINCT ae.session_id) FROM analytics_events ae
     WHERE ae.event_name = 'phone_reveal'
     AND COALESCE(ae.occurred_at, ae.ts) >= current_start_ts
     AND COALESCE(ae.occurred_at, ae.ts) < current_end_ts
     AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL)::bigint,

    (SELECT COUNT(DISTINCT lcs.user_phone) FROM listing_contact_submissions lcs
     WHERE lcs.created_at >= current_start_ts AND lcs.created_at < current_end_ts)::bigint,

    (SELECT COUNT(*) FROM analytics_events ae
     WHERE ae.event_name = 'phone_dial'
     AND COALESCE(ae.occurred_at, ae.ts) >= current_start_ts
     AND COALESCE(ae.occurred_at, ae.ts) < current_end_ts)::bigint,

    (SELECT COUNT(*) FROM analytics_events ae
     WHERE ae.event_name = 'phone_dial'
     AND COALESCE(ae.occurred_at, ae.ts) >= prev_start_ts
     AND COALESCE(ae.occurred_at, ae.ts) < prev_end_ts)::bigint;
END;
$function$;

-- ============================================================
-- Step 5: Recreate analytics_inquiry_conversion_funnel with phone_dials
-- ============================================================
CREATE FUNCTION analytics_inquiry_conversion_funnel(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  total_sessions bigint,
  total_listing_views bigint,
  phone_reveals bigint,
  phone_reveal_session_rate numeric,
  phone_reveal_view_rate numeric,
  contact_forms bigint,
  contact_form_session_rate numeric,
  contact_form_view_rate numeric,
  combined_inquiry_rate numeric,
  phone_dials bigint,
  phone_dial_conversion_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
  sessions_count bigint;
  views_count bigint;
  phones_count bigint;
  forms_count bigint;
  dials_count bigint;
BEGIN
  PERFORM require_admin();

  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);

  SELECT COUNT(DISTINCT session_id) INTO sessions_count
  FROM analytics_events
  WHERE COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts;

  SELECT COUNT(*) INTO views_count
  FROM analytics_events
  WHERE event_name = 'listing_view'
  AND COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts;

  SELECT COUNT(*) INTO phones_count
  FROM analytics_events
  WHERE event_name = 'phone_reveal'
  AND COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts
  AND COALESCE(event_props->>'listing_id', props->>'listing_id') IS NOT NULL;

  SELECT COUNT(*) INTO forms_count
  FROM listing_contact_submissions
  WHERE created_at >= start_ts AND created_at < end_ts;

  SELECT COUNT(*) INTO dials_count
  FROM analytics_events
  WHERE event_name = 'phone_dial'
  AND COALESCE(occurred_at, ts) >= start_ts AND COALESCE(occurred_at, ts) < end_ts;

  RETURN QUERY
  SELECT
    sessions_count,
    views_count,
    phones_count,
    CASE WHEN sessions_count > 0 THEN ROUND((phones_count::numeric / sessions_count::numeric) * 100, 2) ELSE 0 END,
    CASE WHEN views_count > 0 THEN ROUND((phones_count::numeric / views_count::numeric) * 100, 2) ELSE 0 END,
    forms_count,
    CASE WHEN sessions_count > 0 THEN ROUND((forms_count::numeric / sessions_count::numeric) * 100, 2) ELSE 0 END,
    CASE WHEN views_count > 0 THEN ROUND((forms_count::numeric / views_count::numeric) * 100, 2) ELSE 0 END,
    CASE WHEN sessions_count > 0 THEN ROUND(((phones_count + forms_count)::numeric / sessions_count::numeric) * 100, 2) ELSE 0 END,
    dials_count,
    CASE WHEN phones_count > 0 THEN ROUND((dials_count::numeric / phones_count::numeric) * 100, 1) ELSE 0 END;
END;
$function$;

-- ============================================================
-- Step 6: Update analytics_inquiry_user_behavior
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_inquiry_user_behavior(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(phone_only_count bigint, form_only_count bigint, both_count bigint)
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
  WITH phone_listings AS (
    SELECT DISTINCT
      COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')::uuid AS listing_id
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_reveal'
    AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
    AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  form_listings AS (
    SELECT DISTINCT lcs.listing_id
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
  ),
  both_listings AS (
    SELECT pl.listing_id
    FROM phone_listings pl
    INNER JOIN form_listings fl ON fl.listing_id = pl.listing_id
  )
  SELECT
    (SELECT COUNT(*) FROM phone_listings WHERE listing_id NOT IN (SELECT listing_id FROM form_listings))::bigint,
    (SELECT COUNT(*) FROM form_listings WHERE listing_id NOT IN (SELECT listing_id FROM phone_listings))::bigint,
    (SELECT COUNT(*) FROM both_listings)::bigint;
END;
$function$;

-- ============================================================
-- Step 7: Update analytics_inquiry_timing_phones
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_inquiry_timing_phones(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(day_of_week integer, hour_of_day integer, count integer)
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
  SELECT
    EXTRACT(DOW FROM (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz))::integer,
    EXTRACT(HOUR FROM (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz))::integer,
    COUNT(*)::integer
  FROM analytics_events ae
  WHERE ae.event_name = 'phone_reveal'
  AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
  AND COALESCE(ae.occurred_at, ae.ts) < end_ts
  AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
  GROUP BY
    EXTRACT(DOW FROM (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz)),
    EXTRACT(HOUR FROM (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz))
  ORDER BY
    EXTRACT(DOW FROM (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz)),
    EXTRACT(HOUR FROM (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz));
END;
$function$;

-- ============================================================
-- Step 8: Recreate analytics_listings_performance with phone_reveal_count
-- ============================================================
CREATE FUNCTION analytics_listings_performance(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York',
  limit_count integer DEFAULT 20
)
RETURNS TABLE(
  listing_id uuid, title text, location text, neighborhood text,
  bedrooms integer, price integer, views bigint, impressions bigint,
  ctr numeric, inquiry_count bigint, phone_reveal_count bigint,
  hours_to_first_inquiry numeric, is_featured boolean, posted_by text
)
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
    SELECT COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') AS lid, COUNT(*) AS view_count
    FROM analytics_events ae
    WHERE ae.event_name = 'listing_view'
    AND COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
    GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')
  ),
  impression_counts AS (
    SELECT listing_id_text AS lid, COUNT(*) AS impression_count
    FROM analytics_events ae,
    LATERAL jsonb_array_elements_text(COALESCE(ae.event_props->'listing_ids', ae.props->'listing_ids', '[]'::jsonb)) AS listing_id_text
    WHERE ae.event_name = 'listing_impression_batch'
    AND COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    GROUP BY listing_id_text
  ),
  phone_counts AS (
    SELECT COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') AS lid, COUNT(*) AS phone_count
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_reveal'
    AND COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL
    GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')
  ),
  inquiry_counts AS (
    SELECT lcs.listing_id::text AS lid, COUNT(*) AS inq_count
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
    GROUP BY lcs.listing_id
  ),
  first_inquiries AS (
    SELECT lcs.listing_id, MIN(lcs.created_at) AS first_inquiry_at
    FROM listing_contact_submissions lcs
    GROUP BY lcs.listing_id
  )
  SELECT l.id, l.title, l.location, l.neighborhood, l.bedrooms, l.price,
    COALESCE(vc.view_count, 0)::bigint,
    COALESCE(ic.impression_count, 0)::bigint,
    CASE WHEN COALESCE(ic.impression_count, 0) > 0 THEN ROUND((COALESCE(vc.view_count, 0)::numeric / ic.impression_count::numeric) * 100, 1) ELSE 0 END,
    COALESCE(inq.inq_count, 0)::bigint,
    COALESCE(pc.phone_count, 0)::bigint,
    CASE WHEN fi.first_inquiry_at IS NOT NULL THEN ROUND(EXTRACT(EPOCH FROM (fi.first_inquiry_at - l.created_at)) / 3600, 1) ELSE NULL END,
    l.is_featured,
    COALESCE(p.full_name, 'Unknown')
  FROM listings l
  LEFT JOIN view_counts vc ON vc.lid = l.id::text
  LEFT JOIN impression_counts ic ON ic.lid = l.id::text
  LEFT JOIN phone_counts pc ON pc.lid = l.id::text
  LEFT JOIN inquiry_counts inq ON inq.lid = l.id::text
  LEFT JOIN first_inquiries fi ON fi.listing_id = l.id
  LEFT JOIN profiles p ON p.id = l.user_id
  WHERE l.is_active = true AND COALESCE(vc.view_count, 0) > 0
  ORDER BY COALESCE(vc.view_count, 0) DESC
  LIMIT limit_count;
END;
$function$;

-- ============================================================
-- Step 9: Recreate analytics_listing_drilldown with phone_reveals column
-- ============================================================
CREATE FUNCTION analytics_listing_drilldown(
  p_listing_id uuid,
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  listing_id uuid, title text, location text, neighborhood text,
  bedrooms integer, price integer, is_featured boolean, created_at timestamptz,
  views bigint, impressions bigint, ctr numeric, phone_reveals bigint,
  inquiry_count bigint, hours_to_first_inquiry numeric,
  views_by_day jsonb, inquiries jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
  start_date date;
  end_date date;
BEGIN
  PERFORM require_admin();

  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  start_date := (start_ts AT TIME ZONE tz)::date;
  end_date := (timezone(tz, now())::date);

  RETURN QUERY
  WITH daily_views AS (
    SELECT (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz)::date AS day_date, COUNT(*)::integer AS view_count
    FROM analytics_events ae
    WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    AND ae.event_name = 'listing_view'
    AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') = p_listing_id::text
    GROUP BY (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz)::date
  ),
  date_series AS (
    SELECT generate_series(start_date, end_date, '1 day'::interval)::date AS day_date
  ),
  views_filled AS (
    SELECT ds.day_date, COALESCE(dv.view_count, 0) AS view_count
    FROM date_series ds LEFT JOIN daily_views dv ON dv.day_date = ds.day_date
    ORDER BY ds.day_date
  ),
  total_views AS (
    SELECT COUNT(*)::bigint AS count FROM analytics_events ae
    WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    AND ae.event_name = 'listing_view'
    AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') = p_listing_id::text
  ),
  total_impressions AS (
    SELECT COUNT(*)::bigint AS count
    FROM analytics_events ae,
    LATERAL jsonb_array_elements_text(COALESCE(ae.event_props->'listing_ids', ae.props->'listing_ids', '[]'::jsonb)) AS lid
    WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    AND ae.event_name = 'listing_impression_batch' AND lid = p_listing_id::text
  ),
  total_phone_reveals AS (
    SELECT COUNT(*)::bigint AS count FROM analytics_events ae
    WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    AND ae.event_name = 'phone_reveal'
    AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') = p_listing_id::text
  ),
  inquiry_details AS (
    SELECT lcs.id AS inquiry_id, lcs.user_name, lcs.user_phone, lcs.created_at AS inquiry_created_at
    FROM listing_contact_submissions lcs WHERE lcs.listing_id = p_listing_id
    ORDER BY lcs.created_at DESC LIMIT 50
  ),
  first_inquiry AS (
    SELECT MIN(lcs.created_at) AS first_inq FROM listing_contact_submissions lcs WHERE lcs.listing_id = p_listing_id
  )
  SELECT l.id, l.title, l.location, l.neighborhood, l.bedrooms, l.price, l.is_featured, l.created_at,
    (SELECT count FROM total_views),
    (SELECT count FROM total_impressions),
    CASE WHEN (SELECT count FROM total_impressions) > 0 THEN ROUND(((SELECT count FROM total_views)::numeric / (SELECT count FROM total_impressions)::numeric) * 100, 2) ELSE 0 END,
    (SELECT count FROM total_phone_reveals),
    (SELECT COUNT(*)::bigint FROM inquiry_details),
    CASE WHEN (SELECT first_inq FROM first_inquiry) IS NOT NULL THEN ROUND(EXTRACT(EPOCH FROM ((SELECT first_inq FROM first_inquiry) - l.created_at)) / 3600, 1) ELSE NULL END,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('date', day_date, 'views', view_count) ORDER BY day_date) FROM views_filled), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', inquiry_id, 'user_name', user_name, 'user_phone', user_phone, 'created_at', inquiry_created_at) ORDER BY inquiry_created_at DESC) FROM inquiry_details), '[]'::jsonb)
  FROM listings l WHERE l.id = p_listing_id;
END;
$function$;

-- ============================================================
-- Step 10: Update analytics_inquiry_listings_performance_dual
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_inquiry_listings_performance_dual(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York',
  limit_count integer DEFAULT 20
)
RETURNS TABLE(
  listing_id uuid, title text, location text, neighborhood text,
  bedrooms integer, price integer, phone_reveals bigint, contact_forms bigint,
  total_inquiries bigint, conversion_rate numeric, is_featured boolean, posted_by text
)
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
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
    GROUP BY lcs.listing_id
  ),
  view_counts AS (
    SELECT COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')::uuid AS lid, COUNT(*) AS view_count
    FROM analytics_events ae
    WHERE ae.event_name = 'listing_view'
    AND COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    GROUP BY COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')::uuid
  )
  SELECT l.id, l.title, l.location, l.neighborhood, l.bedrooms, l.price,
    COALESCE(pc.phone_count, 0)::bigint,
    COALESCE(fc.form_count, 0)::bigint,
    (COALESCE(pc.phone_count, 0) + COALESCE(fc.form_count, 0))::bigint,
    CASE WHEN COALESCE(vc.view_count, 0) > 0 THEN ROUND(((COALESCE(pc.phone_count, 0) + COALESCE(fc.form_count, 0))::numeric / vc.view_count::numeric) * 100, 2) ELSE 0 END,
    l.is_featured,
    COALESCE(p.full_name, 'Unknown')
  FROM listings l
  LEFT JOIN phone_counts pc ON pc.lid = l.id
  LEFT JOIN form_counts fc ON fc.lid = l.id
  LEFT JOIN view_counts vc ON vc.lid = l.id
  LEFT JOIN profiles p ON p.id = l.user_id
  WHERE l.is_active = true AND (COALESCE(pc.phone_count, 0) + COALESCE(fc.form_count, 0)) > 0
  ORDER BY (COALESCE(pc.phone_count, 0) + COALESCE(fc.form_count, 0)) DESC
  LIMIT limit_count;
END;
$function$;

-- ============================================================
-- Step 11: Update analytics_inquiry_demand_breakdown_dual
-- ============================================================
CREATE OR REPLACE FUNCTION analytics_inquiry_demand_breakdown_dual(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  by_price_band_phones jsonb, by_price_band_forms jsonb,
  by_bedrooms_phones jsonb, by_bedrooms_forms jsonb,
  by_neighborhood_phones jsonb, by_neighborhood_forms jsonb
)
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
  WITH phone_listings AS (
    SELECT DISTINCT COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id')::uuid AS listing_id
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_reveal'
    AND COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  form_listings AS (
    SELECT DISTINCT lcs.listing_id FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
  ),
  phone_price_bands AS (
    SELECT CASE WHEN l.price IS NULL THEN 'Call for Price' WHEN l.price < 2000 THEN 'Under $2,000' WHEN l.price < 3000 THEN '$2,000-$3,000' WHEN l.price < 4000 THEN '$3,000-$4,000' ELSE '$4,000+' END AS label,
    CASE WHEN l.price IS NULL THEN 5 WHEN l.price < 2000 THEN 1 WHEN l.price < 3000 THEN 2 WHEN l.price < 4000 THEN 3 ELSE 4 END AS sort_order,
    COUNT(*)::integer AS count FROM phone_listings pl INNER JOIN listings l ON l.id = pl.listing_id GROUP BY label, sort_order
  ),
  form_price_bands AS (
    SELECT CASE WHEN l.price IS NULL THEN 'Call for Price' WHEN l.price < 2000 THEN 'Under $2,000' WHEN l.price < 3000 THEN '$2,000-$3,000' WHEN l.price < 4000 THEN '$3,000-$4,000' ELSE '$4,000+' END AS label,
    CASE WHEN l.price IS NULL THEN 5 WHEN l.price < 2000 THEN 1 WHEN l.price < 3000 THEN 2 WHEN l.price < 4000 THEN 3 ELSE 4 END AS sort_order,
    COUNT(*)::integer AS count FROM form_listings fl INNER JOIN listings l ON l.id = fl.listing_id GROUP BY label, sort_order
  ),
  phone_bedrooms AS (
    SELECT CASE WHEN l.bedrooms = 0 THEN 'Studio' WHEN l.bedrooms = 1 THEN '1 BR' WHEN l.bedrooms = 2 THEN '2 BR' WHEN l.bedrooms = 3 THEN '3 BR' ELSE '4+ BR' END AS label,
    l.bedrooms AS sort_order, COUNT(*)::integer AS count FROM phone_listings pl INNER JOIN listings l ON l.id = pl.listing_id GROUP BY label, l.bedrooms
  ),
  form_bedrooms AS (
    SELECT CASE WHEN l.bedrooms = 0 THEN 'Studio' WHEN l.bedrooms = 1 THEN '1 BR' WHEN l.bedrooms = 2 THEN '2 BR' WHEN l.bedrooms = 3 THEN '3 BR' ELSE '4+ BR' END AS label,
    l.bedrooms AS sort_order, COUNT(*)::integer AS count FROM form_listings fl INNER JOIN listings l ON l.id = fl.listing_id GROUP BY label, l.bedrooms
  ),
  phone_neighborhoods AS (
    SELECT COALESCE(l.neighborhood, 'Unknown') AS label, COUNT(*)::integer AS count
    FROM phone_listings pl INNER JOIN listings l ON l.id = pl.listing_id
    GROUP BY l.neighborhood ORDER BY COUNT(*) DESC LIMIT 5
  ),
  form_neighborhoods AS (
    SELECT COALESCE(l.neighborhood, 'Unknown') AS label, COUNT(*)::integer AS count
    FROM form_listings fl INNER JOIN listings l ON l.id = fl.listing_id
    GROUP BY l.neighborhood ORDER BY COUNT(*) DESC LIMIT 5
  )
  SELECT
    COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count) ORDER BY sort_order) FROM phone_price_bands), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count) ORDER BY sort_order) FROM form_price_bands), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count) ORDER BY sort_order) FROM phone_bedrooms), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count) ORDER BY sort_order) FROM form_bedrooms), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count)) FROM phone_neighborhoods), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count)) FROM form_neighborhoods), '[]'::jsonb);
END;
$function$;

-- ============================================================
-- Step 12: Recreate analytics_inquiry_trend with phone_reveal_count
-- ============================================================
CREATE FUNCTION analytics_inquiry_trend(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(date date, inquiry_count integer, phone_reveal_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
  start_date date;
  end_date date;
BEGIN
  PERFORM require_admin();

  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - make_interval(days => days_back);
  start_date := (start_ts AT TIME ZONE tz)::date;
  end_date := (timezone(tz, now())::date);

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(start_date, end_date, '1 day'::interval)::date AS day_date
  ),
  daily_inquiries AS (
    SELECT (lcs.created_at AT TIME ZONE tz)::date AS day_date, COUNT(*)::integer AS count
    FROM listing_contact_submissions lcs
    WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts
    GROUP BY (lcs.created_at AT TIME ZONE tz)::date
  ),
  daily_phone_reveals AS (
    SELECT (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz)::date AS day_date, COUNT(*)::integer AS count
    FROM analytics_events ae
    WHERE ae.event_name = 'phone_reveal'
    AND COALESCE(ae.occurred_at, ae.ts) >= start_ts AND COALESCE(ae.occurred_at, ae.ts) < end_ts
    GROUP BY (COALESCE(ae.occurred_at, ae.ts) AT TIME ZONE tz)::date
  )
  SELECT ds.day_date, COALESCE(di.count, 0), COALESCE(dpr.count, 0)
  FROM date_series ds
  LEFT JOIN daily_inquiries di ON di.day_date = ds.day_date
  LEFT JOIN daily_phone_reveals dpr ON dpr.day_date = ds.day_date
  ORDER BY ds.day_date;
END;
$function$;
