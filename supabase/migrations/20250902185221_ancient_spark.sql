/*
  # Fix ambiguous 'dau' column reference in analytics_summary function

  1. Problem
    - The analytics_summary function has ambiguous column references for 'dau'
    - Multiple CTEs or subqueries contain 'dau' columns without proper qualification

  2. Solution
    - Drop and recreate the analytics_summary function with properly qualified column references
    - Ensure all column references use appropriate table aliases or CTE names
*/

-- Drop the existing function to recreate it with fixes
DROP FUNCTION IF EXISTS public.analytics_summary(integer);

-- Recreate the analytics_summary function with properly qualified column references
CREATE OR REPLACE FUNCTION public.analytics_summary(days_back integer DEFAULT 7)
RETURNS TABLE(
  start_date date,
  end_date date,
  dau integer,
  visitors_7d integer,
  returns_7d integer,
  avg_session_minutes numeric,
  listing_views_7d integer,
  post_starts_7d integer,
  post_submits_7d integer,
  post_success_7d integer,
  post_abandoned_7d integer,
  dau_sparkline integer[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_date date := (now() at time zone 'utc')::date;
  start_date_val date := target_date - (days_back - 1);
  end_date_val date := target_date;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;

  RETURN QUERY
  WITH historical_data AS (
    SELECT 
      COALESCE(SUM(da.dau), 0)::integer as hist_dau,
      COALESCE(SUM(da.visitors), 0)::integer as hist_visitors,
      COALESCE(SUM(da.returners), 0)::integer as hist_returners,
      COALESCE(AVG(da.avg_session_minutes), 0)::numeric as hist_avg_session_minutes,
      COALESCE(SUM(da.listing_views), 0)::integer as hist_listing_views,
      COALESCE(SUM(da.post_starts), 0)::integer as hist_post_starts,
      COALESCE(SUM(da.post_submits), 0)::integer as hist_post_submits,
      COALESCE(SUM(da.post_success), 0)::integer as hist_post_success,
      COALESCE(SUM(da.post_abandoned), 0)::integer as hist_post_abandoned
    FROM daily_analytics da
    WHERE da.date >= start_date_val AND da.date < target_date
  ),
  today_sessions AS (
    SELECT 
      ae.session_id,
      MIN(ae.ts) as first_ts,
      MAX(ae.ts) as last_ts,
      ae.user_id
    FROM analytics_events ae
    WHERE ae.ts::date = target_date
    GROUP BY ae.session_id, ae.user_id
  ),
  today_session_durations AS (
    SELECT 
      ts.session_id,
      ts.user_id,
      COALESCE(
        (
          SELECT SUM(
            LEAST(
              EXTRACT(EPOCH FROM (lead_ts - ae.ts)),
              1800 -- 30 minutes cap
            )
          ) / 60.0
          FROM (
            SELECT 
              ae.ts,
              LEAD(ae.ts) OVER (ORDER BY ae.ts) as lead_ts
            FROM analytics_events ae
            WHERE ae.session_id = ts.session_id
              AND ae.ts::date = target_date
            ORDER BY ae.ts
          ) ae
          WHERE ae.lead_ts IS NOT NULL
        ),
        0
      ) as duration_minutes
    FROM today_sessions ts
  ),
  today_data AS (
    SELECT
      COUNT(DISTINCT CASE WHEN ae.user_id IS NOT NULL THEN ae.user_id END)::integer as today_dau,
      COUNT(DISTINCT ae.session_id)::integer as today_visitors,
      COUNT(DISTINCT CASE 
        WHEN ae.user_id IS NOT NULL 
        AND EXISTS (
          SELECT 1 FROM analytics_events ae2 
          WHERE ae2.user_id = ae.user_id 
          AND ae2.ts::date < target_date
        ) 
        THEN ae.user_id 
      END)::integer as today_returners,
      COALESCE(AVG(tsd.duration_minutes), 0)::numeric as today_avg_session_minutes,
      COUNT(CASE WHEN ae.event_name = 'listing_view' THEN 1 END)::integer as today_listing_views,
      COUNT(CASE WHEN ae.event_name = 'listing_post_start' THEN 1 END)::integer as today_post_starts,
      COUNT(CASE WHEN ae.event_name = 'listing_post_submit' THEN 1 END)::integer as today_post_submits,
      COUNT(CASE WHEN ae.event_name IN ('listing_post_submit_success', 'listing_post_success') THEN 1 END)::integer as today_post_success,
      COUNT(CASE WHEN ae.event_name = 'listing_post_abandoned' THEN 1 END)::integer as today_post_abandoned
    FROM analytics_events ae
    LEFT JOIN today_session_durations tsd ON ae.session_id = tsd.session_id
    WHERE ae.ts::date = target_date
  ),
  daily_dau_sparkline AS (
    SELECT 
      array_agg(COALESCE(da.dau, 0) ORDER BY da.date) as sparkline_data
    FROM generate_series(start_date_val, end_date_val, '1 day'::interval) gs(date)
    LEFT JOIN daily_analytics da ON da.date = gs.date::date
  )
  SELECT 
    start_date_val,
    end_date_val,
    (hd.hist_dau + td.today_dau)::integer,
    (hd.hist_visitors + td.today_visitors)::integer,
    (hd.hist_returners + td.today_returners)::integer,
    CASE 
      WHEN (hd.hist_visitors + td.today_visitors) > 0 
      THEN ((hd.hist_avg_session_minutes * hd.hist_visitors + td.today_avg_session_minutes * td.today_visitors) / (hd.hist_visitors + td.today_visitors))::numeric
      ELSE 0::numeric
    END,
    (hd.hist_listing_views + td.today_listing_views)::integer,
    (hd.hist_post_starts + td.today_post_starts)::integer,
    (hd.hist_post_submits + td.today_post_submits)::integer,
    (hd.hist_post_success + td.today_post_success)::integer,
    (hd.hist_post_abandoned + td.today_post_abandoned)::integer,
    dds.sparkline_data
  FROM historical_data hd
  CROSS JOIN today_data td
  CROSS JOIN daily_dau_sparkline dds;
END;
$$;