/*
  # Stabilize Analytics System

  1. Summary Tables
    - Create daily_analytics, daily_top_listings, daily_top_filters if missing
    - Add proper indexes and RLS policies
    
  2. Function Updates
    - Fix impressions counting by expanding listing_impression_batch arrays
    - Fix session duration using bounded gaps (30-minute cap)
    - Maintain existing schemas and return shapes
    
  3. Backfill and Scheduling
    - Backfill last 7 days of summary data
    - Ensure cron jobs are scheduled for rollup and cleanup
*/

-- Print project info for verification
DO $$
BEGIN
  RAISE NOTICE 'Project Database: %', current_database();
  RAISE NOTICE 'Current Schema: %', current_schema();
  RAISE NOTICE 'Migration Timestamp: %', now();
END $$;

-- Create summary tables if they don't exist
CREATE TABLE IF NOT EXISTS daily_analytics (
  date date PRIMARY KEY,
  dau integer DEFAULT 0,
  visitors integer DEFAULT 0,
  returners integer DEFAULT 0,
  avg_session_minutes numeric(10,2) DEFAULT 0,
  listing_views integer DEFAULT 0,
  post_starts integer DEFAULT 0,
  post_submits integer DEFAULT 0,
  post_success integer DEFAULT 0,
  post_abandoned integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_top_listings (
  date date NOT NULL,
  listing_id uuid NOT NULL,
  views integer DEFAULT 0,
  impressions integer DEFAULT 0,
  ctr numeric(5,2) DEFAULT 0,
  rank integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (date, listing_id)
);

CREATE TABLE IF NOT EXISTS daily_top_filters (
  date date NOT NULL,
  filter_key text NOT NULL,
  filter_value text NOT NULL,
  uses integer DEFAULT 0,
  rank integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (date, filter_key, filter_value)
);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS daily_analytics_date_idx ON daily_analytics(date DESC);
CREATE INDEX IF NOT EXISTS daily_top_listings_date_rank_idx ON daily_top_listings(date DESC, rank ASC);
CREATE INDEX IF NOT EXISTS daily_top_filters_date_rank_idx ON daily_top_filters(date DESC, rank ASC);

-- Enable RLS on summary tables
ALTER TABLE daily_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_top_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_top_filters ENABLE ROW LEVEL SECURITY;

-- Create public read policies if they don't exist
DO $$
BEGIN
  -- daily_analytics policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'daily_analytics' 
    AND policyname = 'Public can read daily analytics'
  ) THEN
    CREATE POLICY "Public can read daily analytics"
      ON daily_analytics FOR SELECT
      TO public
      USING (true);
  END IF;

  -- daily_top_listings policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'daily_top_listings' 
    AND policyname = 'Public can read daily top listings'
  ) THEN
    CREATE POLICY "Public can read daily top listings"
      ON daily_top_listings FOR SELECT
      TO public
      USING (true);
  END IF;

  -- daily_top_filters policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'daily_top_filters' 
    AND policyname = 'Public can read daily top filters'
  ) THEN
    CREATE POLICY "Public can read daily top filters"
      ON daily_top_filters FOR SELECT
      TO public
      USING (true);
  END IF;
END $$;

-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS analytics_summary(integer);
DROP FUNCTION IF EXISTS analytics_top_listings(integer, integer);
DROP FUNCTION IF EXISTS analytics_top_filters(integer, integer);
DROP FUNCTION IF EXISTS rollup_analytics_events();
DROP FUNCTION IF EXISTS cleanup_analytics_events();

-- Recreate rollup function with fixed impressions and session calculation
CREATE OR REPLACE FUNCTION rollup_analytics_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_date date;
  session_avg numeric;
BEGIN
  -- Target yesterday (UTC)
  target_date := (now() at time zone 'utc')::date - interval '1 day';
  
  -- Delete existing data for target date to allow re-runs
  DELETE FROM daily_analytics WHERE date = target_date;
  DELETE FROM daily_top_listings WHERE date = target_date;
  DELETE FROM daily_top_filters WHERE date = target_date;
  
  -- Calculate session average with bounded gaps
  WITH session_events AS (
    SELECT 
      session_id,
      ts,
      LAG(ts) OVER (PARTITION BY session_id ORDER BY ts) as prev_ts
    FROM analytics_events
    WHERE ts::date = target_date
  ),
  session_gaps AS (
    SELECT 
      session_id,
      CASE 
        WHEN prev_ts IS NULL THEN 0
        ELSE LEAST(
          EXTRACT(EPOCH FROM (ts - prev_ts)) / 60.0,
          30.0  -- Cap gaps at 30 minutes
        )
      END as gap_minutes
    FROM session_events
  ),
  session_durations AS (
    SELECT 
      session_id,
      SUM(gap_minutes) as total_minutes
    FROM session_gaps
    GROUP BY session_id
  )
  SELECT COALESCE(AVG(total_minutes), 0) INTO session_avg
  FROM session_durations;
  
  -- Insert daily analytics summary
  INSERT INTO daily_analytics (
    date, dau, visitors, returners, avg_session_minutes,
    listing_views, post_starts, post_submits, post_success, post_abandoned
  )
  SELECT
    target_date,
    COUNT(DISTINCT CASE WHEN event_name = 'page_view' AND user_id IS NOT NULL THEN user_id END) as dau,
    COUNT(DISTINCT session_id) as visitors,
    COUNT(DISTINCT CASE WHEN event_name = 'page_view' AND user_id IS NOT NULL THEN user_id END) as returners,
    session_avg,
    COUNT(CASE WHEN event_name = 'listing_view' THEN 1 END) as listing_views,
    COUNT(CASE WHEN event_name IN ('listing_post_start', 'post_start') THEN 1 END) as post_starts,
    COUNT(CASE WHEN event_name IN ('listing_post_submit', 'post_submit') THEN 1 END) as post_submits,
    COUNT(CASE WHEN event_name IN ('listing_post_submit_success', 'listing_post_success', 'post_submit_success') THEN 1 END) as post_success,
    COUNT(CASE WHEN event_name IN ('listing_post_abandoned', 'post_abandoned') THEN 1 END) as post_abandoned
  FROM analytics_events
  WHERE ts::date = target_date;
  
  -- Calculate top listings with proper impression counting
  WITH listing_views AS (
    SELECT 
      (props->>'listing_id')::uuid as listing_id,
      COUNT(*) as views
    FROM analytics_events
    WHERE event_name = 'listing_view'
      AND ts::date = target_date
      AND props ? 'listing_id'
    GROUP BY 1
  ),
  listing_impressions AS (
    SELECT 
      listing_id::uuid,
      COUNT(*) as impressions
    FROM analytics_events ae,
         LATERAL (
           SELECT jsonb_array_elements_text(
             COALESCE(ae.props->'listing_ids', ae.props->'ids', '[]'::jsonb)
           ) as listing_id
         ) expanded
    WHERE ae.event_name = 'listing_impression_batch'
      AND ae.ts::date = target_date
    GROUP BY 1
  ),
  combined_stats AS (
    SELECT 
      COALESCE(v.listing_id, i.listing_id) as listing_id,
      COALESCE(v.views, 0) as views,
      COALESCE(i.impressions, 0) as impressions,
      CASE 
        WHEN COALESCE(i.impressions, 0) > 0 
        THEN ROUND((COALESCE(v.views, 0)::numeric / i.impressions) * 100, 2)
        ELSE 0 
      END as ctr
    FROM listing_views v 
    FULL OUTER JOIN listing_impressions i USING (listing_id)
    WHERE COALESCE(v.views, 0) > 0 OR COALESCE(i.impressions, 0) > 0
  )
  INSERT INTO daily_top_listings (date, listing_id, views, impressions, ctr, rank)
  SELECT 
    target_date,
    listing_id,
    views,
    impressions,
    ctr,
    ROW_NUMBER() OVER (ORDER BY views DESC, impressions DESC) as rank
  FROM combined_stats
  ORDER BY views DESC, impressions DESC
  LIMIT 50;
  
  -- Calculate top filters
  WITH filter_usage AS (
    SELECT 
      key as filter_key,
      val as filter_value,
      COUNT(*) as uses
    FROM (
      SELECT 
        jsonb_object_keys(props->'filters') as key,
        (props->'filters'->>jsonb_object_keys(props->'filters')) as val
      FROM analytics_events
      WHERE event_name = 'filter_apply'
        AND ts::date = target_date
        AND props ? 'filters'
        AND jsonb_typeof(props->'filters') = 'object'
    ) expanded
    GROUP BY 1, 2
  )
  INSERT INTO daily_top_filters (date, filter_key, filter_value, uses, rank)
  SELECT 
    target_date,
    filter_key,
    filter_value,
    uses,
    ROW_NUMBER() OVER (ORDER BY uses DESC) as rank
  FROM filter_usage
  ORDER BY uses DESC
  LIMIT 50;
  
  RAISE NOTICE 'Rollup completed for date: %', target_date;
END $$;

-- Recreate analytics_summary function with fixed session calculation
CREATE OR REPLACE FUNCTION analytics_summary(days_back integer DEFAULT 7)
RETURNS TABLE(
  start_date text,
  end_date text,
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
  start_dt date;
  end_dt date;
  today_date date;
  today_session_avg numeric;
BEGIN
  -- Check admin permissions
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;
  
  today_date := (now() at time zone 'utc')::date;
  start_dt := today_date - (days_back - 1);
  end_dt := today_date;
  
  -- Calculate today's session average with bounded gaps
  WITH today_session_events AS (
    SELECT 
      session_id,
      ts,
      LAG(ts) OVER (PARTITION BY session_id ORDER BY ts) as prev_ts
    FROM analytics_events
    WHERE ts::date = today_date
  ),
  today_session_gaps AS (
    SELECT 
      session_id,
      CASE 
        WHEN prev_ts IS NULL THEN 0
        ELSE LEAST(
          EXTRACT(EPOCH FROM (ts - prev_ts)) / 60.0,
          30.0  -- Cap gaps at 30 minutes
        )
      END as gap_minutes
    FROM today_session_events
  ),
  today_session_durations AS (
    SELECT 
      session_id,
      SUM(gap_minutes) as total_minutes
    FROM today_session_gaps
    GROUP BY session_id
  )
  SELECT COALESCE(AVG(total_minutes), 0) INTO today_session_avg
  FROM today_session_durations;
  
  RETURN QUERY
  WITH historical_data AS (
    SELECT 
      SUM(dau) as hist_dau,
      SUM(visitors) as hist_visitors,
      SUM(returners) as hist_returners,
      AVG(avg_session_minutes) as hist_avg_session,
      SUM(listing_views) as hist_listing_views,
      SUM(post_starts) as hist_post_starts,
      SUM(post_submits) as hist_post_submits,
      SUM(post_success) as hist_post_success,
      SUM(post_abandoned) as hist_post_abandoned
    FROM daily_analytics
    WHERE date >= start_dt AND date < today_date
  ),
  today_data AS (
    SELECT
      COUNT(DISTINCT CASE WHEN event_name = 'page_view' AND user_id IS NOT NULL THEN user_id END) as today_dau,
      COUNT(DISTINCT session_id) as today_visitors,
      COUNT(DISTINCT CASE WHEN event_name = 'page_view' AND user_id IS NOT NULL THEN user_id END) as today_returners,
      today_session_avg as today_avg_session,
      COUNT(CASE WHEN event_name = 'listing_view' THEN 1 END) as today_listing_views,
      COUNT(CASE WHEN event_name IN ('listing_post_start', 'post_start') THEN 1 END) as today_post_starts,
      COUNT(CASE WHEN event_name IN ('listing_post_submit', 'post_submit') THEN 1 END) as today_post_submits,
      COUNT(CASE WHEN event_name IN ('listing_post_submit_success', 'listing_post_success', 'post_submit_success') THEN 1 END) as today_post_success,
      COUNT(CASE WHEN event_name IN ('listing_post_abandoned', 'post_abandoned') THEN 1 END) as today_post_abandoned
    FROM analytics_events
    WHERE ts::date = today_date
  ),
  sparkline_data AS (
    SELECT array_agg(daily_dau ORDER BY date) as dau_array
    FROM (
      SELECT 
        date,
        COALESCE(dau, 0) as daily_dau
      FROM generate_series(start_dt, end_dt, '1 day'::interval) gs(date)
      LEFT JOIN daily_analytics da USING (date)
      UNION ALL
      SELECT 
        today_date,
        today_dau
      FROM today_data
      ORDER BY date
    ) daily_series
  )
  SELECT
    start_dt::text,
    end_dt::text,
    (COALESCE(h.hist_dau, 0) + COALESCE(t.today_dau, 0))::integer,
    (COALESCE(h.hist_visitors, 0) + COALESCE(t.today_visitors, 0))::integer,
    (COALESCE(h.hist_returners, 0) + COALESCE(t.today_returners, 0))::integer,
    ROUND(
      CASE 
        WHEN (COALESCE(h.hist_avg_session, 0) + COALESCE(t.today_avg_session, 0)) > 0
        THEN (COALESCE(h.hist_avg_session, 0) + COALESCE(t.today_avg_session, 0)) / 2
        ELSE 0
      END, 2
    ),
    (COALESCE(h.hist_listing_views, 0) + COALESCE(t.today_listing_views, 0))::integer,
    (COALESCE(h.hist_post_starts, 0) + COALESCE(t.today_post_starts, 0))::integer,
    (COALESCE(h.hist_post_submits, 0) + COALESCE(t.today_post_submits, 0))::integer,
    (COALESCE(h.hist_post_success, 0) + COALESCE(t.today_post_success, 0))::integer,
    (COALESCE(h.hist_post_abandoned, 0) + COALESCE(t.today_post_abandoned, 0))::integer,
    COALESCE(s.dau_array, ARRAY[]::integer[])
  FROM historical_data h
  CROSS JOIN today_data t
  CROSS JOIN sparkline_data s;
END $$;

-- Recreate analytics_top_listings function with fixed impressions counting
CREATE OR REPLACE FUNCTION analytics_top_listings(days_back integer DEFAULT 7, limit_count integer DEFAULT 10)
RETURNS TABLE(
  listing_id text,
  views integer,
  impressions integer,
  ctr numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_dt date;
  today_date date;
BEGIN
  -- Check admin permissions
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;
  
  today_date := (now() at time zone 'utc')::date;
  start_dt := today_date - (days_back - 1);
  
  RETURN QUERY
  WITH historical_stats AS (
    SELECT 
      dtl.listing_id,
      SUM(dtl.views) as hist_views,
      SUM(dtl.impressions) as hist_impressions
    FROM daily_top_listings dtl
    WHERE dtl.date >= start_dt AND dtl.date < today_date
    GROUP BY dtl.listing_id
  ),
  today_views AS (
    SELECT 
      (props->>'listing_id')::uuid as listing_id,
      COUNT(*) as views
    FROM analytics_events
    WHERE event_name = 'listing_view'
      AND ts::date = today_date
      AND props ? 'listing_id'
    GROUP BY 1
  ),
  today_impressions AS (
    SELECT 
      listing_id::uuid,
      COUNT(*) as impressions
    FROM analytics_events ae,
         LATERAL (
           SELECT jsonb_array_elements_text(
             COALESCE(ae.props->'listing_ids', ae.props->'ids', '[]'::jsonb)
           ) as listing_id
         ) expanded
    WHERE ae.event_name = 'listing_impression_batch'
      AND ae.ts::date = today_date
    GROUP BY 1
  ),
  combined_stats AS (
    SELECT 
      COALESCE(h.listing_id, tv.listing_id, ti.listing_id) as listing_id,
      (COALESCE(h.hist_views, 0) + COALESCE(tv.views, 0)) as total_views,
      (COALESCE(h.hist_impressions, 0) + COALESCE(ti.impressions, 0)) as total_impressions
    FROM historical_stats h
    FULL OUTER JOIN today_views tv USING (listing_id)
    FULL OUTER JOIN today_impressions ti USING (listing_id)
    WHERE (COALESCE(h.hist_views, 0) + COALESCE(tv.views, 0)) > 0 
       OR (COALESCE(h.hist_impressions, 0) + COALESCE(ti.impressions, 0)) > 0
  )
  SELECT
    cs.listing_id::text,
    cs.total_views,
    cs.total_impressions,
    CASE 
      WHEN cs.total_impressions > 0 
      THEN ROUND((cs.total_views::numeric / cs.total_impressions) * 100, 2)
      ELSE 0 
    END as ctr
  FROM combined_stats cs
  ORDER BY cs.total_views DESC, cs.total_impressions DESC
  LIMIT limit_count;
END $$;

-- Recreate analytics_top_filters function
CREATE OR REPLACE FUNCTION analytics_top_filters(days_back integer DEFAULT 7, limit_count integer DEFAULT 10)
RETURNS TABLE(
  filter_key text,
  filter_value text,
  uses integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_dt date;
  today_date date;
BEGIN
  -- Check admin permissions
  IF NOT EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Access denied. Admin privileges required.';
  END IF;
  
  today_date := (now() at time zone 'utc')::date;
  start_dt := today_date - (days_back - 1);
  
  RETURN QUERY
  WITH historical_filters AS (
    SELECT 
      dtf.filter_key,
      dtf.filter_value,
      SUM(dtf.uses) as hist_uses
    FROM daily_top_filters dtf
    WHERE dtf.date >= start_dt AND dtf.date < today_date
    GROUP BY dtf.filter_key, dtf.filter_value
  ),
  today_filters AS (
    SELECT 
      key as filter_key,
      val as filter_value,
      COUNT(*) as uses
    FROM (
      SELECT 
        jsonb_object_keys(props->'filters') as key,
        (props->'filters'->>jsonb_object_keys(props->'filters')) as val
      FROM analytics_events
      WHERE event_name = 'filter_apply'
        AND ts::date = today_date
        AND props ? 'filters'
        AND jsonb_typeof(props->'filters') = 'object'
    ) expanded
    GROUP BY 1, 2
  ),
  combined_filters AS (
    SELECT 
      COALESCE(h.filter_key, t.filter_key) as filter_key,
      COALESCE(h.filter_value, t.filter_value) as filter_value,
      (COALESCE(h.hist_uses, 0) + COALESCE(t.uses, 0)) as total_uses
    FROM historical_filters h
    FULL OUTER JOIN today_filters t USING (filter_key, filter_value)
    WHERE (COALESCE(h.hist_uses, 0) + COALESCE(t.uses, 0)) > 0
  )
  SELECT
    cf.filter_key,
    cf.filter_value,
    cf.total_uses
  FROM combined_filters cf
  ORDER BY cf.total_uses DESC
  LIMIT limit_count;
END $$;

-- Recreate cleanup function with retention policies
CREATE OR REPLACE FUNCTION cleanup_analytics_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  impression_cutoff timestamptz;
  other_cutoff timestamptz;
  deleted_impressions integer;
  deleted_others integer;
BEGIN
  -- Calculate cutoff dates
  impression_cutoff := (now() at time zone 'utc') - interval '30 days';
  other_cutoff := (now() at time zone 'utc') - interval '90 days';
  
  -- Delete old impression events (30 days)
  DELETE FROM analytics_events
  WHERE event_name = 'listing_impression_batch'
    AND ts < impression_cutoff;
  
  GET DIAGNOSTICS deleted_impressions = ROW_COUNT;
  
  -- Delete other old events (90 days)
  DELETE FROM analytics_events
  WHERE event_name != 'listing_impression_batch'
    AND ts < other_cutoff;
  
  GET DIAGNOSTICS deleted_others = ROW_COUNT;
  
  RAISE NOTICE 'Cleanup completed: % impression events, % other events deleted', 
    deleted_impressions, deleted_others;
END $$;

-- Schedule cron jobs if they don't exist
DO $$
BEGIN
  -- Check if rollup job exists
  IF NOT EXISTS (
    SELECT 1 FROM cron.job 
    WHERE command LIKE '%rollup_analytics_events%'
  ) THEN
    PERFORM cron.schedule(
      'analytics-rollup',
      '10 6 * * *',  -- 06:10 UTC daily
      'SELECT public.rollup_analytics_events();'
    );
    RAISE NOTICE 'Scheduled analytics rollup job';
  END IF;
  
  -- Check if cleanup job exists
  IF NOT EXISTS (
    SELECT 1 FROM cron.job 
    WHERE command LIKE '%cleanup_analytics_events%'
  ) THEN
    PERFORM cron.schedule(
      'analytics-cleanup',
      '20 6 * * *',  -- 06:20 UTC daily
      'SELECT public.cleanup_analytics_events();'
    );
    RAISE NOTICE 'Scheduled analytics cleanup job';
  END IF;
END $$;

-- Backfill last 7 days of summary data
DO $$
DECLARE
  backfill_date date;
  today_date date;
BEGIN
  today_date := (now() at time zone 'utc')::date;
  
  -- Backfill from 7 days ago to yesterday
  FOR i IN 1..7 LOOP
    backfill_date := today_date - i;
    
    -- Delete existing data for this date
    DELETE FROM daily_analytics WHERE date = backfill_date;
    DELETE FROM daily_top_listings WHERE date = backfill_date;
    DELETE FROM daily_top_filters WHERE date = backfill_date;
    
    -- Calculate session average for this date with bounded gaps
    WITH session_events AS (
      SELECT 
        session_id,
        ts,
        LAG(ts) OVER (PARTITION BY session_id ORDER BY ts) as prev_ts
      FROM analytics_events
      WHERE ts::date = backfill_date
    ),
    session_gaps AS (
      SELECT 
        session_id,
        CASE 
          WHEN prev_ts IS NULL THEN 0
          ELSE LEAST(
            EXTRACT(EPOCH FROM (ts - prev_ts)) / 60.0,
            30.0  -- Cap gaps at 30 minutes
          )
        END as gap_minutes
      FROM session_events
    ),
    session_durations AS (
      SELECT 
        session_id,
        SUM(gap_minutes) as total_minutes
      FROM session_gaps
      GROUP BY session_id
    ),
    session_avg AS (
      SELECT COALESCE(AVG(total_minutes), 0) as avg_minutes
      FROM session_durations
    )
    -- Insert daily analytics
    INSERT INTO daily_analytics (
      date, dau, visitors, returners, avg_session_minutes,
      listing_views, post_starts, post_submits, post_success, post_abandoned
    )
    SELECT
      backfill_date,
      COUNT(DISTINCT CASE WHEN event_name = 'page_view' AND user_id IS NOT NULL THEN user_id END),
      COUNT(DISTINCT session_id),
      COUNT(DISTINCT CASE WHEN event_name = 'page_view' AND user_id IS NOT NULL THEN user_id END),
      sa.avg_minutes,
      COUNT(CASE WHEN event_name = 'listing_view' THEN 1 END),
      COUNT(CASE WHEN event_name IN ('listing_post_start', 'post_start') THEN 1 END),
      COUNT(CASE WHEN event_name IN ('listing_post_submit', 'post_submit') THEN 1 END),
      COUNT(CASE WHEN event_name IN ('listing_post_submit_success', 'listing_post_success', 'post_submit_success') THEN 1 END),
      COUNT(CASE WHEN event_name IN ('listing_post_abandoned', 'post_abandoned') THEN 1 END)
    FROM analytics_events, session_avg sa
    WHERE ts::date = backfill_date
    GROUP BY sa.avg_minutes;
    
    -- Calculate and insert top listings for this date
    WITH listing_views AS (
      SELECT 
        (props->>'listing_id')::uuid as listing_id,
        COUNT(*) as views
      FROM analytics_events
      WHERE event_name = 'listing_view'
        AND ts::date = backfill_date
        AND props ? 'listing_id'
      GROUP BY 1
    ),
    listing_impressions AS (
      SELECT 
        listing_id::uuid,
        COUNT(*) as impressions
      FROM analytics_events ae,
           LATERAL (
             SELECT jsonb_array_elements_text(
               COALESCE(ae.props->'listing_ids', ae.props->'ids', '[]'::jsonb)
             ) as listing_id
           ) expanded
      WHERE ae.event_name = 'listing_impression_batch'
        AND ae.ts::date = backfill_date
      GROUP BY 1
    ),
    combined_stats AS (
      SELECT 
        COALESCE(v.listing_id, i.listing_id) as listing_id,
        COALESCE(v.views, 0) as views,
        COALESCE(i.impressions, 0) as impressions,
        CASE 
          WHEN COALESCE(i.impressions, 0) > 0 
          THEN ROUND((COALESCE(v.views, 0)::numeric / i.impressions) * 100, 2)
          ELSE 0 
        END as ctr
      FROM listing_views v 
      FULL OUTER JOIN listing_impressions i USING (listing_id)
      WHERE COALESCE(v.views, 0) > 0 OR COALESCE(i.impressions, 0) > 0
    )
    INSERT INTO daily_top_listings (date, listing_id, views, impressions, ctr, rank)
    SELECT 
      backfill_date,
      listing_id,
      views,
      impressions,
      ctr,
      ROW_NUMBER() OVER (ORDER BY views DESC, impressions DESC)
    FROM combined_stats
    ORDER BY views DESC, impressions DESC
    LIMIT 50;
    
    -- Calculate and insert top filters for this date
    WITH filter_usage AS (
      SELECT 
        key as filter_key,
        val as filter_value,
        COUNT(*) as uses
      FROM (
        SELECT 
          jsonb_object_keys(props->'filters') as key,
          (props->'filters'->>jsonb_object_keys(props->'filters')) as val
        FROM analytics_events
        WHERE event_name = 'filter_apply'
          AND ts::date = backfill_date
          AND props ? 'filters'
          AND jsonb_typeof(props->'filters') = 'object'
      ) expanded
      GROUP BY 1, 2
    )
    INSERT INTO daily_top_filters (date, filter_key, filter_value, uses, rank)
    SELECT 
      backfill_date,
      filter_key,
      filter_value,
      uses,
      ROW_NUMBER() OVER (ORDER BY uses DESC)
    FROM filter_usage
    ORDER BY uses DESC
    LIMIT 50;
    
    RAISE NOTICE 'Backfilled analytics for date: %', backfill_date;
  END LOOP;
  
  RAISE NOTICE 'Backfill completed for last 7 days';
END $$;