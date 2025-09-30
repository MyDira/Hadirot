/*
  # Fix Analytics Schema Alignment

  1. Schema Changes
    - Align analytics_events columns to match Edge Function payload
    - Create missing session management functions
    - Fix analytics aggregation functions

  2. Session Management
    - Add touch_session and close_session functions
    - Ensure analytics_sessions has correct structure

  3. Analytics Functions
    - Update to use correct column names and timezone windows
    - Fix impression tracking for top listings
*/

-- First, ensure analytics_events has the correct schema
DO $$
BEGIN
  -- Add missing columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analytics_events' AND column_name = 'occurred_at'
  ) THEN
    ALTER TABLE analytics_events ADD COLUMN occurred_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analytics_events' AND column_name = 'event_props'
  ) THEN
    ALTER TABLE analytics_events ADD COLUMN event_props jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analytics_events' AND column_name = 'ua'
  ) THEN
    ALTER TABLE analytics_events ADD COLUMN ua text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analytics_events' AND column_name = 'ip_hash'
  ) THEN
    ALTER TABLE analytics_events ADD COLUMN ip_hash text;
  END IF;
END $$;

-- Migrate data from old columns to new columns if needed
UPDATE analytics_events 
SET 
  occurred_at = COALESCE(occurred_at, ts),
  event_props = COALESCE(event_props, props, '{}'::jsonb),
  ua = COALESCE(ua, user_agent),
  ip_hash = COALESCE(ip_hash, ip)
WHERE occurred_at IS NULL OR event_props IS NULL;

-- Create session management functions
CREATE OR REPLACE FUNCTION touch_session(
  p_session uuid,
  p_anon uuid,
  p_user uuid DEFAULT NULL,
  p_ts timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO analytics_sessions (
    session_id, anon_id, user_id, started_at, last_seen_at
  )
  VALUES (p_session, p_anon, p_user, p_ts, p_ts)
  ON CONFLICT (session_id)
  DO UPDATE SET
    last_seen_at = GREATEST(analytics_sessions.last_seen_at, p_ts),
    user_id = COALESCE(EXCLUDED.user_id, analytics_sessions.user_id);
END;
$$;

CREATE OR REPLACE FUNCTION close_session(
  p_session uuid,
  p_ts timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE analytics_sessions
  SET 
    ended_at = p_ts,
    last_seen_at = GREATEST(last_seen_at, p_ts)
  WHERE session_id = p_session;
END;
$$;

-- Create timezone-aware analytics functions
CREATE OR REPLACE FUNCTION analytics_kpis(
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
AS $$
DECLARE
  start_local timestamptz;
  end_local timestamptz;
  start_utc timestamptz;
  end_utc timestamptz;
BEGIN
  -- Calculate local timezone window
  start_local := (current_date - days_back * interval '1 day') AT TIME ZONE tz;
  end_local := start_local + interval '1 day';
  
  -- Convert to UTC for database queries
  start_utc := start_local AT TIME ZONE 'UTC';
  end_utc := end_local AT TIME ZONE 'UTC';

  RETURN QUERY
  SELECT
    COALESCE(COUNT(DISTINCT s.session_id), 0) as daily_active,
    COALESCE(COUNT(DISTINCT s.anon_id), 0) as unique_visitors,
    COALESCE(AVG(s.duration_seconds) / 60.0, 0)::numeric(10,2) as avg_session_minutes,
    COALESCE(COUNT(*) FILTER (WHERE e.event_name = 'listing_view'), 0) as listing_views
  FROM analytics_sessions s
  LEFT JOIN analytics_events e ON e.session_id = s.session_id 
    AND e.occurred_at >= start_utc 
    AND e.occurred_at < end_utc
  WHERE s.started_at >= start_utc AND s.started_at < end_utc;
END;
$$;

CREATE OR REPLACE FUNCTION analytics_summary(
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
AS $$
DECLARE
  start_local timestamptz;
  end_local timestamptz;
  start_utc timestamptz;
  end_utc timestamptz;
BEGIN
  start_local := (current_date - days_back * interval '1 day') AT TIME ZONE tz;
  end_local := start_local + interval '1 day';
  start_utc := start_local AT TIME ZONE 'UTC';
  end_utc := end_local AT TIME ZONE 'UTC';

  RETURN QUERY
  SELECT
    COALESCE(COUNT(*) FILTER (WHERE event_name = 'post_started'), 0) as post_starts,
    COALESCE(COUNT(*) FILTER (WHERE event_name = 'post_submitted'), 0) as post_submits,
    COALESCE(COUNT(*) FILTER (WHERE event_name = 'post_success'), 0) as post_successes,
    COALESCE(COUNT(*) FILTER (WHERE event_name = 'post_abandoned'), 0) as post_abandoned
  FROM analytics_events
  WHERE occurred_at >= start_utc AND occurred_at < end_utc;
END;
$$;

CREATE OR REPLACE FUNCTION analytics_top_listings(
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
AS $$
DECLARE
  start_local timestamptz;
  end_local timestamptz;
  start_utc timestamptz;
  end_utc timestamptz;
BEGIN
  start_local := (current_date - days_back * interval '1 day') AT TIME ZONE tz;
  end_local := start_local + interval '1 day';
  start_utc := start_local AT TIME ZONE 'UTC';
  end_utc := end_local AT TIME ZONE 'UTC';

  RETURN QUERY
  SELECT
    COALESCE(event_props->>'listing_id', 'unknown') as listing_id,
    COALESCE(COUNT(*) FILTER (WHERE event_name = 'listing_view'), 0) as views,
    COALESCE(COUNT(*) FILTER (WHERE event_name = 'listing_impression_batch'), 0) as impressions,
    CASE 
      WHEN COUNT(*) FILTER (WHERE event_name = 'listing_impression_batch') > 0
      THEN (COUNT(*) FILTER (WHERE event_name = 'listing_view')::numeric / COUNT(*) FILTER (WHERE event_name = 'listing_impression_batch') * 100)
      ELSE 0
    END as ctr
  FROM analytics_events
  WHERE occurred_at >= start_utc 
    AND occurred_at < end_utc
    AND event_props->>'listing_id' IS NOT NULL
    AND event_props->>'listing_id' != ''
  GROUP BY event_props->>'listing_id'
  HAVING COUNT(*) > 0
  ORDER BY views DESC, impressions DESC
  LIMIT limit_count;
END;
$$;

CREATE OR REPLACE FUNCTION analytics_top_filters(
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
AS $$
DECLARE
  start_local timestamptz;
  end_local timestamptz;
  start_utc timestamptz;
  end_utc timestamptz;
BEGIN
  start_local := (current_date - days_back * interval '1 day') AT TIME ZONE tz;
  end_local := start_local + interval '1 day';
  start_utc := start_local AT TIME ZONE 'UTC';
  end_utc := end_local AT TIME ZONE 'UTC';

  RETURN QUERY
  WITH filter_events AS (
    SELECT event_props
    FROM analytics_events
    WHERE occurred_at >= start_utc 
      AND occurred_at < end_utc
      AND event_name = 'filter_apply'
      AND event_props IS NOT NULL
  ),
  expanded_filters AS (
    SELECT 
      key as filter_key,
      COALESCE(value::text, 'null') as filter_value
    FROM filter_events,
    LATERAL jsonb_each(
      CASE 
        WHEN event_props ? 'filters' THEN event_props->'filters'
        ELSE event_props
      END
    ) as kv(key, value)
    WHERE key NOT IN ('source', 'page', 'result_count', 'items')
  )
  SELECT 
    ef.filter_key,
    ef.filter_value,
    COUNT(*)::bigint as uses
  FROM expanded_filters ef
  GROUP BY ef.filter_key, ef.filter_value
  ORDER BY uses DESC, ef.filter_key, ef.filter_value
  LIMIT limit_count;
END;
$$;

-- Ensure proper RLS policies
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_sessions ENABLE ROW LEVEL SECURITY;

-- Allow public reads, no public writes (Edge Function uses service role)
DROP POLICY IF EXISTS "Public can read analytics events" ON analytics_events;
CREATE POLICY "Public can read analytics events" ON analytics_events
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Public can read analytics sessions" ON analytics_sessions;
CREATE POLICY "Public can read analytics sessions" ON analytics_sessions
  FOR SELECT TO public USING (true);

-- Create essential indexes
CREATE INDEX IF NOT EXISTS analytics_events_occurred_at_idx 
  ON analytics_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_event_name_occurred_at_idx 
  ON analytics_events (event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_session_id_idx 
  ON analytics_events (session_id);

CREATE INDEX IF NOT EXISTS analytics_events_anon_id_idx 
  ON analytics_events (anon_id);

CREATE INDEX IF NOT EXISTS analytics_events_listing_id_idx 
  ON analytics_events ((event_props->>'listing_id'));

CREATE INDEX IF NOT EXISTS analytics_sessions_started_at_idx 
  ON analytics_sessions (started_at DESC);

CREATE INDEX IF NOT EXISTS analytics_sessions_anon_id_idx 
  ON analytics_sessions (anon_id);