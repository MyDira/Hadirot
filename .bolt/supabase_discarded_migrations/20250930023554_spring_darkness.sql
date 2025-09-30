/*
  # Analytics Schema Alignment and Pipeline Fix

  1. Schema Changes
    - Align analytics_events columns to match Edge Function payload
    - Create missing session management functions
    - Add proper RLS policies and indexes

  2. Functions
    - Create touch_session and close_session for session management
    - Create analytics_kpis, analytics_summary, analytics_top_listings, analytics_top_filters
    - All functions use timezone-aware date windows

  3. Security
    - Enable RLS on analytics tables
    - Add policies for service role writes and authenticated reads
*/

-- 1. Drop existing analytics_events table if it exists and recreate with correct schema
DROP TABLE IF EXISTS public.analytics_events CASCADE;

CREATE TABLE public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  anon_id uuid NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event_name text NOT NULL,
  event_props jsonb DEFAULT '{}' NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz DEFAULT now(),
  ua text,
  ip_hash text
);

-- 2. Create analytics_sessions table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.analytics_sessions (
  session_id uuid PRIMARY KEY,
  anon_id uuid NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  ended_at timestamptz,
  duration_seconds integer GENERATED ALWAYS AS (
    GREATEST(0, EXTRACT(epoch FROM (COALESCE(ended_at, last_seen_at) - started_at)))::integer
  ) STORED
);

-- 3. Enable RLS
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS policies
CREATE POLICY "Service role can manage analytics_events"
  ON public.analytics_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read analytics_events"
  ON public.analytics_events
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can manage analytics_sessions"
  ON public.analytics_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read analytics_sessions"
  ON public.analytics_sessions
  FOR SELECT
  TO authenticated
  USING (true);

-- 5. Create indexes
CREATE INDEX IF NOT EXISTS analytics_events_occurred_at_idx ON public.analytics_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_event_name_occurred_at_idx ON public.analytics_events (event_name, occurred_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_session_id_idx ON public.analytics_events (session_id);
CREATE INDEX IF NOT EXISTS analytics_events_anon_id_idx ON public.analytics_events (anon_id);
CREATE INDEX IF NOT EXISTS analytics_events_event_props_gin_idx ON public.analytics_events USING gin (event_props);

CREATE INDEX IF NOT EXISTS analytics_sessions_started_at_idx ON public.analytics_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS analytics_sessions_last_seen_at_idx ON public.analytics_sessions (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS analytics_sessions_anon_id_idx ON public.analytics_sessions (anon_id);

-- 6. Create session management functions
CREATE OR REPLACE FUNCTION public.touch_session(
  p_session uuid,
  p_anon uuid,
  p_user uuid DEFAULT NULL,
  p_ts timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.analytics_sessions (session_id, anon_id, user_id, started_at, last_seen_at)
  VALUES (p_session, p_anon, p_user, p_ts, p_ts)
  ON CONFLICT (session_id)
  DO UPDATE SET
    last_seen_at = GREATEST(analytics_sessions.last_seen_at, p_ts),
    user_id = COALESCE(p_user, analytics_sessions.user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_session(
  p_session uuid,
  p_ts timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.analytics_sessions
  SET ended_at = p_ts
  WHERE session_id = p_session
    AND (ended_at IS NULL OR ended_at < p_ts);
END;
$$;

-- 7. Create analytics functions with timezone support
CREATE OR REPLACE FUNCTION public.analytics_kpis(
  days_back integer DEFAULT 0,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  daily_active bigint,
  unique_visitors bigint,
  avg_session_minutes numeric,
  listing_views bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  start_local timestamptz;
  end_local timestamptz;
  start_utc timestamptz;
  end_utc timestamptz;
BEGIN
  -- Calculate timezone-aware date window
  start_local := (now() AT TIME ZONE tz)::date - (days_back || ' days')::interval;
  end_local := start_local + '1 day'::interval;
  start_utc := start_local AT TIME ZONE tz;
  end_utc := end_local AT TIME ZONE tz;

  RETURN QUERY
  SELECT
    COALESCE(COUNT(DISTINCT s.anon_id), 0)::bigint as daily_active,
    COALESCE(COUNT(DISTINCT s.anon_id) FILTER (WHERE s.user_id IS NULL), 0)::bigint as unique_visitors,
    COALESCE(AVG(s.duration_seconds) / 60.0, 0)::numeric as avg_session_minutes,
    COALESCE(COUNT(*) FILTER (WHERE e.event_name = 'listing_view'), 0)::bigint as listing_views
  FROM public.analytics_sessions s
  LEFT JOIN public.analytics_events e ON e.session_id = s.session_id
    AND e.occurred_at >= start_utc AND e.occurred_at < end_utc
  WHERE s.started_at >= start_utc AND s.started_at < end_utc;
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_summary(
  days_back integer DEFAULT 0,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  post_starts bigint,
  post_submits bigint,
  post_successes bigint,
  post_abandoned bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  start_local timestamptz;
  end_local timestamptz;
  start_utc timestamptz;
  end_utc timestamptz;
BEGIN
  -- Calculate timezone-aware date window
  start_local := (now() AT TIME ZONE tz)::date - (days_back || ' days')::interval;
  end_local := start_local + '1 day'::interval;
  start_utc := start_local AT TIME ZONE tz;
  end_utc := end_local AT TIME ZONE tz;

  RETURN QUERY
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE event_name = 'post_started'), 0)::bigint as post_starts,
    COALESCE(COUNT(*) FILTER (WHERE event_name = 'post_submitted'), 0)::bigint as post_submits,
    COALESCE(COUNT(*) FILTER (WHERE event_name = 'post_success'), 0)::bigint as post_successes,
    COALESCE(COUNT(*) FILTER (WHERE event_name = 'post_abandoned'), 0)::bigint as post_abandoned
  FROM public.analytics_events
  WHERE occurred_at >= start_utc AND occurred_at < end_utc;
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_top_listings(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  listing_id text,
  views bigint,
  impressions bigint,
  ctr numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  start_local timestamptz;
  end_local timestamptz;
  start_utc timestamptz;
  end_utc timestamptz;
BEGIN
  -- Calculate timezone-aware date window
  start_local := (now() AT TIME ZONE tz)::date - (days_back || ' days')::interval;
  end_local := start_local + '1 day'::interval;
  start_utc := start_local AT TIME ZONE tz;
  end_utc := end_local AT TIME ZONE tz;

  RETURN QUERY
  SELECT
    (event_props->>'listing_id')::text as listing_id,
    COALESCE(COUNT(*) FILTER (WHERE event_name = 'listing_view'), 0)::bigint as views,
    COALESCE(COUNT(*) FILTER (WHERE event_name = 'listing_impression_batch'), 0)::bigint as impressions,
    CASE 
      WHEN COUNT(*) FILTER (WHERE event_name = 'listing_impression_batch') > 0
      THEN ROUND((COUNT(*) FILTER (WHERE event_name = 'listing_view')::numeric / COUNT(*) FILTER (WHERE event_name = 'listing_impression_batch')::numeric) * 100, 2)
      ELSE 0
    END as ctr
  FROM public.analytics_events
  WHERE occurred_at >= start_utc 
    AND occurred_at < end_utc
    AND event_props->>'listing_id' IS NOT NULL
    AND event_name IN ('listing_view', 'listing_impression_batch')
  GROUP BY event_props->>'listing_id'
  HAVING COUNT(*) > 0
  ORDER BY views DESC, impressions DESC
  LIMIT limit_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.analytics_top_filters(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE(
  filter_key text,
  filter_value text,
  uses bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  start_local timestamptz;
  end_local timestamptz;
  start_utc timestamptz;
  end_utc timestamptz;
BEGIN
  -- Calculate timezone-aware date window
  start_local := (now() AT TIME ZONE tz)::date - (days_back || ' days')::interval;
  end_local := start_local + '1 day'::interval;
  start_utc := start_local AT TIME ZONE tz;
  end_utc := end_local AT TIME ZONE tz;

  RETURN QUERY
  WITH filter_events AS (
    SELECT event_props
    FROM public.analytics_events
    WHERE occurred_at >= start_utc 
      AND occurred_at < end_utc
      AND event_name = 'filter_apply'
      AND event_props IS NOT NULL
  ),
  expanded_filters AS (
    SELECT 
      key as filter_key,
      CASE 
        WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}'
        WHEN jsonb_typeof(value) = 'number' THEN value #>> '{}'
        WHEN jsonb_typeof(value) = 'boolean' THEN value #>> '{}'
        ELSE value::text
      END as filter_value
    FROM filter_events,
    LATERAL jsonb_each(
      CASE 
        WHEN event_props ? 'filters' THEN event_props->'filters'
        ELSE event_props
      END
    ) AS kv(key, value)
    WHERE key NOT IN ('page', 'result_count', 'items', 'source', 'test_id')
  )
  SELECT 
    ef.filter_key,
    ef.filter_value,
    COUNT(*)::bigint as uses
  FROM expanded_filters ef
  WHERE ef.filter_value IS NOT NULL 
    AND ef.filter_value != ''
    AND ef.filter_value != 'null'
  GROUP BY ef.filter_key, ef.filter_value
  ORDER BY uses DESC, ef.filter_key, ef.filter_value
  LIMIT limit_count;
END;
$$;