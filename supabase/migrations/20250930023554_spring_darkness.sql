/*
  Analytics pipeline reconciliation
  - Align analytics_events schema with Edge Function payload without dropping data
  - Ensure analytics_sessions exists for touch_session/close_session RPCs
  - Refresh analytics reporting functions and supporting policies/indexes
*/

-- Ensure UUID generation support
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create analytics_events if it was never created
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid,
  anon_id uuid,
  user_id uuid,
  event_name text,
  event_props jsonb DEFAULT '{}'::jsonb,
  occurred_at timestamptz,
  created_at timestamptz DEFAULT now(),
  ua text,
  ip_hash text
);

-- Harmonise legacy column names without dropping data or dependent objects
DO $$
DECLARE
  dep_count integer;
BEGIN
  -- Prefer renaming ts -> occurred_at when the modern column is absent
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'ts'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'occurred_at'
    ) THEN
      EXECUTE 'ALTER TABLE public.analytics_events RENAME COLUMN ts TO occurred_at';
    ELSE
      EXECUTE 'UPDATE public.analytics_events SET occurred_at = COALESCE(occurred_at, ts)';
      SELECT COUNT(*) INTO dep_count
      FROM pg_depend d
      JOIN pg_attribute a ON a.attrelid = 'public.analytics_events'::regclass AND a.attname = 'ts'
        AND d.refobjid = a.attrelid AND d.refobjsubid = a.attnum
      WHERE d.deptype IN ('n', 'a', 'i');
      IF dep_count = 0 THEN
        EXECUTE 'ALTER TABLE public.analytics_events DROP COLUMN ts';
      ELSE
        RAISE NOTICE 'Keeping legacy column ts due to dependent objects';
      END IF;
    END IF;
  END IF;

  -- props -> event_props
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'props'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'event_props'
    ) THEN
      EXECUTE 'ALTER TABLE public.analytics_events RENAME COLUMN props TO event_props';
    ELSE
      BEGIN
        EXECUTE 'UPDATE public.analytics_events SET event_props = COALESCE(event_props, props::jsonb)';
      EXCEPTION WHEN others THEN
        EXECUTE 'UPDATE public.analytics_events SET event_props = COALESCE(event_props, to_jsonb(props))';
      END;
      SELECT COUNT(*) INTO dep_count
      FROM pg_depend d
      JOIN pg_attribute a ON a.attrelid = 'public.analytics_events'::regclass AND a.attname = 'props'
        AND d.refobjid = a.attrelid AND d.refobjsubid = a.attnum
      WHERE d.deptype IN ('n', 'a', 'i');
      IF dep_count = 0 THEN
        EXECUTE 'ALTER TABLE public.analytics_events DROP COLUMN props';
      ELSE
        RAISE NOTICE 'Keeping legacy column props due to dependent objects';
      END IF;
    END IF;
  END IF;

  -- user_agent -> ua
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'user_agent'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'ua'
    ) THEN
      EXECUTE 'ALTER TABLE public.analytics_events RENAME COLUMN user_agent TO ua';
    ELSE
      EXECUTE 'UPDATE public.analytics_events SET ua = COALESCE(ua, user_agent)';
      SELECT COUNT(*) INTO dep_count
      FROM pg_depend d
      JOIN pg_attribute a ON a.attrelid = 'public.analytics_events'::regclass AND a.attname = 'user_agent'
        AND d.refobjid = a.attrelid AND d.refobjsubid = a.attnum
      WHERE d.deptype IN ('n', 'a', 'i');
      IF dep_count = 0 THEN
        EXECUTE 'ALTER TABLE public.analytics_events DROP COLUMN user_agent';
      ELSE
        RAISE NOTICE 'Keeping legacy column user_agent due to dependent objects';
      END IF;
    END IF;
  END IF;

  -- ip -> ip_hash
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'ip'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'ip_hash'
    ) THEN
      EXECUTE 'ALTER TABLE public.analytics_events RENAME COLUMN ip TO ip_hash';
    ELSE
      EXECUTE 'UPDATE public.analytics_events SET ip_hash = COALESCE(ip_hash, ip)';
      SELECT COUNT(*) INTO dep_count
      FROM pg_depend d
      JOIN pg_attribute a ON a.attrelid = 'public.analytics_events'::regclass AND a.attname = 'ip'
        AND d.refobjid = a.attrelid AND d.refobjsubid = a.attnum
      WHERE d.deptype IN ('n', 'a', 'i');
      IF dep_count = 0 THEN
        EXECUTE 'ALTER TABLE public.analytics_events DROP COLUMN ip';
      ELSE
        RAISE NOTICE 'Keeping legacy column ip due to dependent objects';
      END IF;
    END IF;
  END IF;
END;
$$;

-- Ensure all expected columns exist with appropriate defaults
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS id uuid;
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS session_id uuid;
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS anon_id uuid;
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS event_name text;
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS event_props jsonb;
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz;
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS ua text;
ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS ip_hash text;

-- Normalize event_props column type to jsonb when feasible
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'event_props' AND data_type <> 'jsonb'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.analytics_events ALTER COLUMN event_props TYPE jsonb USING event_props::jsonb';
    EXCEPTION WHEN others THEN
      BEGIN
        EXECUTE 'ALTER TABLE public.analytics_events ALTER COLUMN event_props TYPE jsonb USING CASE WHEN event_props IS NULL THEN ''{}''::jsonb ELSE to_jsonb(event_props) END';
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Skipping event_props::jsonb conversion due to incompatible existing values';
      END;
    END;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'event_props'
  ) THEN
    BEGIN
      EXECUTE 'UPDATE public.analytics_events SET event_props = ''{}''::jsonb WHERE event_props IS NULL';
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
    EXECUTE 'ALTER TABLE public.analytics_events ALTER COLUMN event_props SET DEFAULT ''{}''::jsonb';
  END IF;
END;
$$;

-- Attempt to coerce identifier columns to uuid when possible
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'session_id' AND data_type <> 'uuid'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.analytics_events ALTER COLUMN session_id TYPE uuid USING NULLIF(trim(session_id::text), '''')::uuid';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Leaving session_id as-is; unable to cast existing data to uuid';
    END;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'anon_id' AND data_type <> 'uuid'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.analytics_events ALTER COLUMN anon_id TYPE uuid USING NULLIF(trim(anon_id::text), '''')::uuid';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Leaving anon_id as-is; unable to cast existing data to uuid';
    END;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'user_id' AND data_type <> 'uuid'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.analytics_events ALTER COLUMN user_id TYPE uuid USING NULLIF(trim(user_id::text), '''')::uuid';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Leaving user_id as-is; unable to cast existing data to uuid';
    END;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'occurred_at' AND data_type <> 'timestamp with time zone'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.analytics_events ALTER COLUMN occurred_at TYPE timestamptz USING CASE WHEN occurred_at IS NULL THEN NULL ELSE occurred_at::timestamptz END';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Leaving occurred_at as-is; unable to cast existing data to timestamptz';
    END;
  END IF;
END;
$$;

ALTER TABLE public.analytics_events ALTER COLUMN id SET DEFAULT gen_random_uuid();
UPDATE public.analytics_events SET id = gen_random_uuid() WHERE id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.analytics_events'::regclass AND contype = 'p'
  ) THEN
    EXECUTE 'ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_pkey PRIMARY KEY (id)';
  END IF;
END;
$$;

-- Tighten columns only when existing data allows
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.analytics_events WHERE event_name IS NULL) THEN
    EXECUTE 'ALTER TABLE public.analytics_events ALTER COLUMN event_name SET NOT NULL';
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.analytics_events WHERE occurred_at IS NULL) THEN
    EXECUTE 'ALTER TABLE public.analytics_events ALTER COLUMN occurred_at SET NOT NULL';
  END IF;
EXCEPTION WHEN undefined_table THEN
  NULL;
END;
$$;

-- Maintain created_at timestamps
UPDATE public.analytics_events SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE public.analytics_events ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.analytics_events ALTER COLUMN created_at SET DEFAULT now();

-- Ensure foreign key relationships when possible
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'analytics_events_user_id_fkey'
    ) THEN
      BEGIN
        EXECUTE 'ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL';
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Skipping analytics_events -> profiles FK: %', SQLERRM;
      END;
    END IF;
  END IF;
END;
$$;

-- Legacy compatibility: keep ts in sync with occurred_at when the column must remain
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analytics_events' AND column_name = 'ts'
  ) THEN
    EXECUTE $$CREATE OR REPLACE FUNCTION public.analytics_events_sync_ts()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.occurred_at IS NULL THEN
        NEW.occurred_at := COALESCE(NEW.ts, now());
      END IF;
      NEW.ts := COALESCE(NEW.ts, NEW.occurred_at);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public$$;

    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'analytics_events_sync_ts_trg' AND tgrelid = 'public.analytics_events'::regclass
    ) THEN
      EXECUTE 'DROP TRIGGER IF EXISTS analytics_events_sync_ts_trg ON public.analytics_events';
    END IF;

    EXECUTE 'CREATE TRIGGER analytics_events_sync_ts_trg BEFORE INSERT OR UPDATE ON public.analytics_events FOR EACH ROW EXECUTE FUNCTION public.analytics_events_sync_ts()';

    BEGIN
      EXECUTE 'UPDATE public.analytics_events SET ts = occurred_at WHERE occurred_at IS NOT NULL AND (ts IS DISTINCT FROM occurred_at OR ts IS NULL)';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Unable to fully backfill ts column: %', SQLERRM;
    END;
  END IF;
END;
$$;

-- Ensure analytics_sessions exists with the expected structure
CREATE TABLE IF NOT EXISTS public.analytics_sessions (
  session_id uuid PRIMARY KEY,
  anon_id uuid NOT NULL,
  user_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_seconds integer GENERATED ALWAYS AS (
    GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(ended_at, last_seen_at) - started_at)))::integer
  ) STORED
);

-- Align analytics_sessions column types if they drifted
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analytics_sessions' AND column_name = 'session_id' AND data_type <> 'uuid'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.analytics_sessions ALTER COLUMN session_id TYPE uuid USING NULLIF(trim(session_id::text), '''')::uuid';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Leaving analytics_sessions.session_id as-is; unable to cast';
    END;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analytics_sessions' AND column_name = 'anon_id' AND data_type <> 'uuid'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.analytics_sessions ALTER COLUMN anon_id TYPE uuid USING NULLIF(trim(anon_id::text), '''')::uuid';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Leaving analytics_sessions.anon_id as-is; unable to cast';
    END;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'analytics_sessions' AND column_name = 'user_id' AND data_type <> 'uuid'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE public.analytics_sessions ALTER COLUMN user_id TYPE uuid USING NULLIF(trim(user_id::text), '''')::uuid';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Leaving analytics_sessions.user_id as-is; unable to cast';
    END;
  END IF;
END;
$$;

-- Backfill timestamps if missing
UPDATE public.analytics_sessions
SET started_at = COALESCE(started_at, now()),
    last_seen_at = COALESCE(last_seen_at, COALESCE(ended_at, started_at))
WHERE started_at IS NULL OR last_seen_at IS NULL;

-- Add FK to profiles when possible
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'analytics_sessions_user_id_fkey'
    ) THEN
      BEGIN
        EXECUTE 'ALTER TABLE public.analytics_sessions ADD CONSTRAINT analytics_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL';
      EXCEPTION WHEN others THEN
        RAISE NOTICE 'Skipping analytics_sessions -> profiles FK: %', SQLERRM;
      END;
    END IF;
  END IF;
END;
$$;

-- Enable RLS and provide authenticated read policies
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_sessions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analytics_events' AND policyname = 'analytics_events_authenticated_select'
  ) THEN
    EXECUTE 'CREATE POLICY analytics_events_authenticated_select ON public.analytics_events FOR SELECT TO authenticated USING (true)';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'analytics_sessions' AND policyname = 'analytics_sessions_authenticated_select'
  ) THEN
    EXECUTE 'CREATE POLICY analytics_sessions_authenticated_select ON public.analytics_sessions FOR SELECT TO authenticated USING (true)';
  END IF;
END;
$$;

-- Required indexes for analytics workloads
CREATE INDEX IF NOT EXISTS analytics_events_occurred_at_idx ON public.analytics_events (occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_event_name_occurred_at_idx ON public.analytics_events (event_name, occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_session_id_idx ON public.analytics_events (session_id);
CREATE INDEX IF NOT EXISTS analytics_events_anon_id_idx ON public.analytics_events (anon_id);
CREATE INDEX IF NOT EXISTS analytics_events_event_props_gin_idx ON public.analytics_events USING gin (event_props);

CREATE INDEX IF NOT EXISTS analytics_sessions_started_at_idx ON public.analytics_sessions (started_at);
CREATE INDEX IF NOT EXISTS analytics_sessions_last_seen_at_idx ON public.analytics_sessions (last_seen_at);
CREATE INDEX IF NOT EXISTS analytics_sessions_anon_id_idx ON public.analytics_sessions (anon_id);

-- Session lifecycle helpers used by the Edge Function
CREATE OR REPLACE FUNCTION public.touch_session(
  p_session uuid,
  p_anon uuid,
  p_user uuid DEFAULT NULL,
  p_ts timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.analytics_sessions (session_id, anon_id, user_id, started_at, last_seen_at)
  VALUES (p_session, p_anon, p_user, p_ts, p_ts)
  ON CONFLICT (session_id) DO UPDATE SET
    anon_id = EXCLUDED.anon_id,
    user_id = COALESCE(EXCLUDED.user_id, analytics_sessions.user_id),
    started_at = LEAST(analytics_sessions.started_at, EXCLUDED.started_at),
    last_seen_at = GREATEST(analytics_sessions.last_seen_at, EXCLUDED.last_seen_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_session(
  p_session uuid,
  p_ts timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.analytics_sessions
  SET ended_at = GREATEST(COALESCE(ended_at, p_ts), p_ts),
      last_seen_at = GREATEST(last_seen_at, p_ts)
  WHERE session_id = p_session;
END;
$$;

-- KPI rollup for dashboard tiles
CREATE OR REPLACE FUNCTION public.analytics_kpis(
  days_back integer DEFAULT 0,
  tz text DEFAULT 'America/New_York'
) RETURNS TABLE (
  daily_active bigint,
  unique_visitors bigint,
  avg_session_minutes numeric,
  listing_views bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d integer := GREATEST(days_back, 0);
  start_local timestamptz;
  end_local timestamptz;
  start_utc timestamptz;
  end_utc timestamptz;
BEGIN
  start_local := date_trunc('day', timezone(tz, now())) - make_interval(days => d);
  end_local := start_local + interval '1 day';
  start_utc := start_local AT TIME ZONE tz;
  end_utc := end_local AT TIME ZONE tz;

  RETURN QUERY
  WITH session_window AS (
    SELECT
      session_id,
      anon_id,
      user_id,
      GREATEST(started_at, start_utc) AS start_at,
      LEAST(COALESCE(ended_at, last_seen_at), end_utc) AS end_at
    FROM public.analytics_sessions
    WHERE started_at < end_utc
      AND COALESCE(ended_at, last_seen_at) >= start_utc
  ),
  durations AS (
    SELECT GREATEST(0, EXTRACT(EPOCH FROM (end_at - start_at)) / 60.0) AS minutes
    FROM session_window
    WHERE end_at > start_at
  ),
  events_window AS (
    SELECT *
    FROM public.analytics_events
    WHERE occurred_at >= start_utc
      AND occurred_at < end_utc
  )
  SELECT
    COALESCE((SELECT COUNT(DISTINCT session_id) FROM session_window), 0)::bigint,
    COALESCE((SELECT COUNT(DISTINCT anon_id) FROM session_window), 0)::bigint,
    COALESCE((SELECT AVG(minutes) FROM durations), 0)::numeric,
    COALESCE((SELECT COUNT(*) FROM events_window WHERE event_name = 'listing_view'), 0)::bigint;
END;
$$;

-- Posting funnel summary
CREATE OR REPLACE FUNCTION public.analytics_summary(
  days_back integer DEFAULT 0,
  tz text DEFAULT 'America/New_York'
) RETURNS TABLE (
  post_starts bigint,
  post_submits bigint,
  post_successes bigint,
  post_abandoned bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d integer := GREATEST(days_back, 0);
  start_local timestamptz;
  end_local timestamptz;
  start_utc timestamptz;
  end_utc timestamptz;
BEGIN
  start_local := date_trunc('day', timezone(tz, now())) - make_interval(days => d);
  end_local := start_local + interval '1 day';
  start_utc := start_local AT TIME ZONE tz;
  end_utc := end_local AT TIME ZONE tz;

  RETURN QUERY
  WITH events_window AS (
    SELECT *
    FROM public.analytics_events
    WHERE occurred_at >= start_utc
      AND occurred_at < end_utc
  )
  SELECT
    COALESCE((SELECT COUNT(*) FROM events_window WHERE event_name = 'post_started'), 0)::bigint,
    COALESCE((SELECT COUNT(*) FROM events_window WHERE event_name = 'post_submitted'), 0)::bigint,
    COALESCE((SELECT COUNT(*) FROM events_window WHERE event_name = 'post_success'), 0)::bigint,
    COALESCE((SELECT COUNT(*) FROM events_window WHERE event_name = 'post_abandoned'), 0)::bigint;
END;
$$;

-- Top listings (views vs impressions)
CREATE OR REPLACE FUNCTION public.analytics_top_listings(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
) RETURNS TABLE (
  listing_id text,
  views bigint,
  impressions bigint,
  ctr numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d integer := GREATEST(days_back, 0);
  start_local timestamptz;
  end_local timestamptz;
  start_utc timestamptz;
  end_utc timestamptz;
BEGIN
  start_local := date_trunc('day', timezone(tz, now())) - make_interval(days => d);
  end_local := start_local + interval '1 day';
  start_utc := start_local AT TIME ZONE tz;
  end_utc := end_local AT TIME ZONE tz;

  RETURN QUERY
  WITH windowed AS (
    SELECT *
    FROM public.analytics_events
    WHERE occurred_at >= start_utc
      AND occurred_at < end_utc
      AND event_name IN ('listing_view', 'listing_impression_batch')
  ),
  views AS (
    SELECT
      COALESCE(
        event_props->>'listing_id',
        event_props->>'id',
        event_props->>'listingId'
      ) AS listing_id
    FROM windowed
    WHERE event_name = 'listing_view'
  ),
  impressions AS (
    SELECT
      COALESCE(arr.listing_id,
        event_props->>'listing_id',
        event_props->>'id',
        event_props->>'listingId'
      ) AS listing_id
    FROM windowed w
    LEFT JOIN LATERAL (
      SELECT jsonb_array_elements_text(w.event_props->'ids') AS listing_id
      UNION ALL
      SELECT jsonb_array_elements_text(w.event_props->'listing_ids') AS listing_id
    ) arr ON TRUE
    WHERE w.event_name = 'listing_impression_batch'
  ),
  listing_ids AS (
    SELECT listing_id FROM views
    UNION
    SELECT listing_id FROM impressions
  ),
  aggregated AS (
    SELECT
      lid AS listing_id,
      COALESCE((SELECT COUNT(*) FROM views WHERE listing_id = lid), 0)::bigint AS view_count,
      COALESCE((SELECT COUNT(*) FROM impressions WHERE listing_id = lid), 0)::bigint AS impression_count
    FROM (
      SELECT listing_id AS lid FROM listing_ids WHERE listing_id IS NOT NULL AND listing_id <> ''
    ) s
  )
  SELECT
    listing_id,
    view_count AS views,
    impression_count AS impressions,
    CASE
      WHEN impression_count > 0 THEN ROUND((view_count::numeric / impression_count::numeric) * 100, 2)
      ELSE 0::numeric
    END AS ctr
  FROM aggregated
  ORDER BY views DESC, impressions DESC, listing_id
  LIMIT limit_count;
END;
$$;

-- Top applied filters
CREATE OR REPLACE FUNCTION public.analytics_top_filters(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
) RETURNS TABLE (
  filter_key text,
  filter_value text,
  uses bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d integer := GREATEST(days_back, 0);
  start_local timestamptz;
  end_local timestamptz;
  start_utc timestamptz;
  end_utc timestamptz;
BEGIN
  start_local := date_trunc('day', timezone(tz, now())) - make_interval(days => d);
  end_local := start_local + interval '1 day';
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
  expanded AS (
    SELECT
      key AS filter_key,
      CASE
        WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}'
        WHEN jsonb_typeof(value) = 'number' THEN value #>> '{}'
        WHEN jsonb_typeof(value) = 'boolean' THEN value #>> '{}'
        ELSE value::text
      END AS filter_value
    FROM filter_events fe,
    LATERAL jsonb_each(
      CASE
        WHEN fe.event_props ? 'filters' THEN fe.event_props->'filters'
        ELSE fe.event_props
      END
    ) AS kv(key, value)
    WHERE key NOT IN ('page', 'result_count', 'items', 'source', 'test_id')
  )
  SELECT
    filter_key,
    filter_value,
    COUNT(*)::bigint AS uses
  FROM expanded
  WHERE filter_value IS NOT NULL AND filter_value <> '' AND filter_value <> 'null'
  GROUP BY filter_key, filter_value
  ORDER BY uses DESC, filter_key, filter_value
  LIMIT limit_count;
END;
$$;

-- Verification
-- last 10 events
SELECT id, session_id, anon_id, event_name, occurred_at
FROM public.analytics_events
ORDER BY occurred_at DESC
LIMIT 10;

SELECT * FROM public.analytics_kpis(0, 'America/New_York');

SELECT * FROM public.analytics_top_listings(0, 10, 'America/New_York');
