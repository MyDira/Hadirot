/*
  # Complete Analytics Pipeline Fix

  1. Analytics Functions
    - `analytics_kpis` - Daily metrics with timezone support
    - `analytics_top_listings` - Top performing listings
    - `analytics_top_filters` - Most used filter combinations
    - `analytics_summary` - Posting funnel metrics
    - Session management functions

  2. RLS Policies
    - Allow public read access to analytics tables
    - Restrict writes to service role only

  3. Indexes
    - Optimized for timezone-aware queries
    - Support for event filtering and aggregation
*/

-- Drop existing functions to avoid conflicts
DROP FUNCTION IF EXISTS public.analytics_kpis(integer, text);
DROP FUNCTION IF EXISTS public.analytics_kpis(integer);
DROP FUNCTION IF EXISTS public.analytics_top_listings(integer, integer, text);
DROP FUNCTION IF EXISTS public.analytics_top_listings(integer, integer);
DROP FUNCTION IF EXISTS public.analytics_top_filters(integer, integer, text);
DROP FUNCTION IF EXISTS public.analytics_top_filters(integer, integer);
DROP FUNCTION IF EXISTS public.analytics_summary(integer, text);
DROP FUNCTION IF EXISTS public.analytics_summary(integer);

-- Session management functions
CREATE OR REPLACE FUNCTION public.touch_session(
  p_session uuid,
  p_anon uuid,
  p_user uuid DEFAULT NULL,
  p_ts timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.analytics_sessions (session_id, anon_id, user_id, started_at, last_seen_at)
  VALUES (p_session, p_anon, p_user, p_ts, p_ts)
  ON CONFLICT (session_id) 
  DO UPDATE SET 
    last_seen_at = p_ts,
    user_id = COALESCE(EXCLUDED.user_id, analytics_sessions.user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_session(
  p_session uuid,
  p_ts timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.analytics_sessions 
  SET ended_at = p_ts
  WHERE session_id = p_session AND ended_at IS NULL;
END;
$$;

-- Main KPIs function with timezone support
CREATE OR REPLACE FUNCTION public.analytics_kpis(
  days_back integer DEFAULT 0,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  daily_active integer,
  unique_visitors integer,
  avg_session_minutes numeric,
  listing_views integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  start_date timestamptz;
  end_date timestamptz;
BEGIN
  -- Calculate timezone-aware date range
  start_date := (date_trunc('day', now() AT TIME ZONE tz) - (days_back || ' days')::interval) AT TIME ZONE tz;
  end_date := start_date + interval '1 day';

  RETURN QUERY
  WITH session_stats AS (
    SELECT 
      COUNT(DISTINCT session_id) as active_sessions,
      COUNT(DISTINCT anon_id) as unique_anons,
      AVG(EXTRACT(epoch FROM (COALESCE(ended_at, last_seen_at) - started_at)) / 60.0) as avg_minutes
    FROM public.analytics_sessions
    WHERE started_at >= start_date AND started_at < end_date
  ),
  listing_view_stats AS (
    SELECT COUNT(*) as view_count
    FROM public.analytics_events
    WHERE event_name = 'listing_view'
      AND occurred_at >= start_date 
      AND occurred_at < end_date
  )
  SELECT 
    COALESCE(s.active_sessions, 0)::integer,
    COALESCE(s.unique_anons, 0)::integer,
    COALESCE(s.avg_minutes, 0)::numeric,
    COALESCE(l.view_count, 0)::integer
  FROM session_stats s
  CROSS JOIN listing_view_stats l;
END;
$$;

-- Top listings function
CREATE OR REPLACE FUNCTION public.analytics_top_listings(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  listing_id text,
  views integer,
  impressions integer,
  ctr numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  start_date timestamptz;
  end_date timestamptz;
BEGIN
  start_date := (date_trunc('day', now() AT TIME ZONE tz) - (days_back || ' days')::interval) AT TIME ZONE tz;
  end_date := start_date + interval '1 day';

  RETURN QUERY
  WITH listing_metrics AS (
    SELECT 
      (event_props->>'listing_id')::text as lid,
      COUNT(*) FILTER (WHERE event_name = 'listing_view') as view_count,
      COUNT(*) FILTER (WHERE event_name = 'listing_impression_batch') as impression_count
    FROM public.analytics_events
    WHERE occurred_at >= start_date 
      AND occurred_at < end_date
      AND event_props->>'listing_id' IS NOT NULL
      AND event_name IN ('listing_view', 'listing_impression_batch')
    GROUP BY (event_props->>'listing_id')
    HAVING COUNT(*) > 0
  )
  SELECT 
    m.lid,
    m.view_count::integer,
    m.impression_count::integer,
    CASE 
      WHEN m.impression_count > 0 THEN ROUND((m.view_count::numeric / m.impression_count::numeric) * 100, 2)
      ELSE 0::numeric
    END
  FROM listing_metrics m
  ORDER BY m.view_count DESC, m.impression_count DESC
  LIMIT limit_count;
END;
$$;

-- Top filters function
CREATE OR REPLACE FUNCTION public.analytics_top_filters(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  filter_key text,
  filter_value text,
  uses integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  start_date timestamptz;
  end_date timestamptz;
BEGIN
  start_date := (date_trunc('day', now() AT TIME ZONE tz) - (days_back || ' days')::interval) AT TIME ZONE tz;
  end_date := start_date + interval '1 day';

  RETURN QUERY
  WITH filter_usage AS (
    SELECT 
      key as filter_key,
      value::text as filter_value,
      COUNT(*) as usage_count
    FROM public.analytics_events,
    LATERAL jsonb_each_text(
      CASE 
        WHEN event_props ? 'filters' THEN event_props->'filters'
        ELSE event_props
      END
    ) AS kv(key, value)
    WHERE event_name = 'filter_apply'
      AND occurred_at >= start_date 
      AND occurred_at < end_date
      AND key NOT IN ('page', 'result_count', 'items')
      AND value IS NOT NULL
      AND value != ''
    GROUP BY key, value::text
    HAVING COUNT(*) > 0
  )
  SELECT 
    f.filter_key,
    f.filter_value,
    f.usage_count::integer
  FROM filter_usage f
  ORDER BY f.usage_count DESC, f.filter_key, f.filter_value
  LIMIT limit_count;
END;
$$;

-- Posting funnel summary function
CREATE OR REPLACE FUNCTION public.analytics_summary(
  days_back integer DEFAULT 0,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  post_starts integer,
  post_submits integer,
  post_successes integer,
  post_abandoned integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  start_date timestamptz;
  end_date timestamptz;
BEGIN
  start_date := (date_trunc('day', now() AT TIME ZONE tz) - (days_back || ' days')::interval) AT TIME ZONE tz;
  end_date := start_date + interval '1 day';

  RETURN QUERY
  SELECT 
    COUNT(*) FILTER (WHERE event_name = 'post_started')::integer,
    COUNT(*) FILTER (WHERE event_name = 'post_submitted')::integer,
    COUNT(*) FILTER (WHERE event_name = 'post_success')::integer,
    COUNT(*) FILTER (WHERE event_name = 'post_abandoned')::integer
  FROM public.analytics_events
  WHERE occurred_at >= start_date 
    AND occurred_at < end_date
    AND event_name IN ('post_started', 'post_submitted', 'post_success', 'post_abandoned');
END;
$$;

-- Ensure proper indexes exist
CREATE INDEX IF NOT EXISTS analytics_events_occurred_at_idx 
ON public.analytics_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_event_name_occurred_at_idx 
ON public.analytics_events (event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_session_id_idx 
ON public.analytics_events (session_id);

CREATE INDEX IF NOT EXISTS analytics_events_anon_id_idx 
ON public.analytics_events (anon_id);

CREATE INDEX IF NOT EXISTS analytics_sessions_started_at_idx 
ON public.analytics_sessions (started_at DESC);

CREATE INDEX IF NOT EXISTS analytics_sessions_last_seen_at_idx 
ON public.analytics_sessions (last_seen_at DESC);

-- Ensure RLS policies are correct
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "Public read access" ON public.analytics_events;
DROP POLICY IF EXISTS "Public read access" ON public.analytics_sessions;
DROP POLICY IF EXISTS "Service role write access" ON public.analytics_events;
DROP POLICY IF EXISTS "Service role write access" ON public.analytics_sessions;

-- Allow public read access (for dashboard)
CREATE POLICY "Public read access" ON public.analytics_events
  FOR SELECT TO public USING (true);

CREATE POLICY "Public read access" ON public.analytics_sessions
  FOR SELECT TO public USING (true);

-- Backfill any null occurred_at values
UPDATE public.analytics_events 
SET occurred_at = COALESCE(occurred_at, created_at, now())
WHERE occurred_at IS NULL;