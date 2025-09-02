/*
  # Analytics Rollups and Retention System

  1. New Tables
    - `daily_analytics` - Daily KPI snapshots (DAU, visitors, session metrics, posting funnel)
    - `daily_top_listings` - Top N listings by views/impressions per day
    - `daily_top_filters` - Most used filter combinations per day

  2. Rollup Functions
    - `rollup_analytics_events()` - Nightly aggregation of yesterday's data
    - `cleanup_analytics_events()` - Retention cleanup (30/90 day windows)

  3. Scheduling
    - pg_cron jobs for automated nightly execution
    - Rollup at 06:10 UTC (02:10 ET), cleanup at 06:20 UTC (02:20 ET)

  4. Updated RPCs
    - Modified existing analytics functions to use summary tables
    - Live computation only for "today" data when needed
    - Maintains existing return schemas for compatibility

  5. Security
    - RLS enabled on all new tables
    - SECURITY DEFINER functions with proper search_path
    - Public read access, service role write access
*/

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create daily_analytics table for KPI snapshots
CREATE TABLE IF NOT EXISTS public.daily_analytics (
    date DATE PRIMARY KEY,
    dau INTEGER NOT NULL DEFAULT 0,
    visitors INTEGER NOT NULL DEFAULT 0,
    returners INTEGER NOT NULL DEFAULT 0,
    avg_session_minutes NUMERIC NOT NULL DEFAULT 0.0,
    listing_views INTEGER NOT NULL DEFAULT 0,
    post_starts INTEGER NOT NULL DEFAULT 0,
    post_submits INTEGER NOT NULL DEFAULT 0,
    post_success INTEGER NOT NULL DEFAULT 0,
    post_abandoned INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.daily_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to daily_analytics" 
ON public.daily_analytics FOR SELECT USING (true);

-- Create daily_top_listings table for top listings per day
CREATE TABLE IF NOT EXISTS public.daily_top_listings (
    date DATE NOT NULL,
    listing_id UUID NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    impressions INTEGER NOT NULL DEFAULT 0,
    ctr NUMERIC NOT NULL DEFAULT 0.0,
    rank INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (date, listing_id)
);

ALTER TABLE public.daily_top_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to daily_top_listings" 
ON public.daily_top_listings FOR SELECT USING (true);

-- Create daily_top_filters table for top filters per day
CREATE TABLE IF NOT EXISTS public.daily_top_filters (
    date DATE NOT NULL,
    filter_key TEXT NOT NULL,
    filter_value TEXT NOT NULL,
    uses INTEGER NOT NULL DEFAULT 0,
    rank INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (date, filter_key, filter_value)
);

ALTER TABLE public.daily_top_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to daily_top_filters" 
ON public.daily_top_filters FOR SELECT USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_analytics_date ON public.daily_analytics(date);
CREATE INDEX IF NOT EXISTS idx_daily_top_listings_date ON public.daily_top_listings(date);
CREATE INDEX IF NOT EXISTS idx_daily_top_listings_rank ON public.daily_top_listings(date, rank);
CREATE INDEX IF NOT EXISTS idx_daily_top_filters_date ON public.daily_top_filters(date);
CREATE INDEX IF NOT EXISTS idx_daily_top_filters_rank ON public.daily_top_filters(date, rank);

-- Rollup function: aggregates yesterday's analytics_events into summary tables
CREATE OR REPLACE FUNCTION public.rollup_analytics_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    yesterday_date DATE;
    log_message TEXT;
    start_ts TIMESTAMPTZ;
    end_ts TIMESTAMPTZ;
    duration_ms NUMERIC;
    rows_processed INTEGER := 0;
BEGIN
    start_ts := clock_timestamp();
    yesterday_date := (NOW() AT TIME ZONE 'UTC')::date - INTERVAL '1 day';

    RAISE NOTICE 'Starting analytics rollup for date: %', yesterday_date;

    -- Rollup daily_analytics with stepwise aggregation
    WITH session_metrics AS (
        SELECT
            session_id,
            EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 60.0 AS session_duration_minutes
        FROM
            public.analytics_events
        WHERE
            (ts AT TIME ZONE 'UTC')::date = yesterday_date
        GROUP BY
            session_id
    ),
    daily_metrics AS (
        SELECT
            COALESCE(COUNT(DISTINCT CASE WHEN ae.event_name = 'page_view' AND ae.user_id IS NOT NULL THEN ae.user_id END), 0) AS dau,
            COALESCE(COUNT(DISTINCT CASE WHEN ae.event_name = 'page_view' THEN ae.session_id END), 0) AS visitors,
            COALESCE(COUNT(DISTINCT
                CASE
                    WHEN ae.event_name = 'page_view' AND ae.user_id IS NOT NULL AND EXISTS (
                        SELECT 1
                        FROM public.analytics_events prev_ae
                        WHERE prev_ae.user_id = ae.user_id
                          AND prev_ae.ts < yesterday_date
                    ) THEN ae.user_id
                END
            ), 0) AS returners,
            COALESCE(AVG(sm.session_duration_minutes), 0.0) AS avg_session_minutes,
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_view' THEN 1 END), 0) AS listing_views,
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_start' THEN 1 END), 0) AS post_starts,
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_submit' THEN 1 END), 0) AS post_submits,
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_submit_success' THEN 1 END), 0) AS post_success,
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_abandoned' THEN 1 END), 0) AS post_abandoned
        FROM
            public.analytics_events ae
        LEFT JOIN session_metrics sm ON ae.session_id = sm.session_id
        WHERE
            (ae.ts AT TIME ZONE 'UTC')::date = yesterday_date
    )
    INSERT INTO public.daily_analytics (
        date, dau, visitors, returners, avg_session_minutes, listing_views,
        post_starts, post_submits, post_success, post_abandoned
    )
    SELECT
        yesterday_date,
        dm.dau, dm.visitors, dm.returners, dm.avg_session_minutes, dm.listing_views,
        dm.post_starts, dm.post_submits, dm.post_success, dm.post_abandoned
    FROM daily_metrics dm
    ON CONFLICT (date) DO UPDATE SET
        dau = EXCLUDED.dau,
        visitors = EXCLUDED.visitors,
        returners = EXCLUDED.returners,
        avg_session_minutes = EXCLUDED.avg_session_minutes,
        listing_views = EXCLUDED.listing_views,
        post_starts = EXCLUDED.post_starts,
        post_submits = EXCLUDED.post_submits,
        post_success = EXCLUDED.post_success,
        post_abandoned = EXCLUDED.post_abandoned,
        created_at = NOW();

    GET DIAGNOSTICS rows_processed = ROW_COUNT;

    -- Rollup daily_top_listings
    WITH daily_listing_metrics AS (
        SELECT
            (props->>'listing_id')::uuid AS listing_id,
            COUNT(CASE WHEN event_name = 'listing_view' THEN 1 END) AS views,
            COUNT(CASE WHEN event_name = 'listing_impression_batch' THEN 1 END) AS impressions
        FROM
            public.analytics_events
        WHERE
            (ts AT TIME ZONE 'UTC')::date = yesterday_date
            AND (props->>'listing_id') IS NOT NULL
            AND (props->>'listing_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        GROUP BY
            1
    ),
    ranked_listings AS (
        SELECT
            listing_id,
            views,
            impressions,
            CASE
                WHEN impressions > 0 THEN (views::NUMERIC / impressions) * 100
                ELSE 0.0
            END AS ctr,
            RANK() OVER (ORDER BY views DESC, impressions DESC) AS rank
        FROM
            daily_listing_metrics
        WHERE
            views > 0 OR impressions > 0
    )
    INSERT INTO public.daily_top_listings (date, listing_id, views, impressions, ctr, rank)
    SELECT
        yesterday_date,
        listing_id,
        views,
        impressions,
        ctr,
        rank
    FROM
        ranked_listings
    WHERE
        rank <= 50
    ON CONFLICT (date, listing_id) DO UPDATE SET
        views = EXCLUDED.views,
        impressions = EXCLUDED.impressions,
        ctr = EXCLUDED.ctr,
        rank = EXCLUDED.rank,
        created_at = NOW();

    -- Rollup daily_top_filters
    WITH daily_filter_metrics AS (
        SELECT
            filter_key,
            filter_value,
            COUNT(*) AS uses
        FROM (
            SELECT
                jsonb_object_keys(props->'filters') AS filter_key,
                props->'filters'->>jsonb_object_keys(props->'filters') AS filter_value
            FROM
                public.analytics_events
            WHERE
                (ts AT TIME ZONE 'UTC')::date = yesterday_date
                AND event_name = 'filter_apply'
                AND props ? 'filters'
                AND jsonb_typeof(props->'filters') = 'object'
        ) filter_expansions
        GROUP BY
            filter_key, filter_value
    ),
    ranked_filters AS (
        SELECT
            filter_key,
            filter_value,
            uses,
            RANK() OVER (ORDER BY uses DESC) AS rank
        FROM
            daily_filter_metrics
        WHERE
            uses > 0
    )
    INSERT INTO public.daily_top_filters (date, filter_key, filter_value, uses, rank)
    SELECT
        yesterday_date,
        filter_key,
        filter_value,
        uses,
        rank
    FROM
        ranked_filters
    WHERE
        rank <= 50
    ON CONFLICT (date, filter_key, filter_value) DO UPDATE SET
        uses = EXCLUDED.uses,
        rank = EXCLUDED.rank,
        created_at = NOW();

    end_ts := clock_timestamp();
    duration_ms := EXTRACT(EPOCH FROM (end_ts - start_ts)) * 1000;
    log_message := FORMAT('Analytics rollup for %s completed in %s ms. Processed %s daily_analytics rows.',
                          yesterday_date, ROUND(duration_ms, 2), rows_processed);
    RAISE NOTICE '%', log_message;

EXCEPTION
    WHEN OTHERS THEN
        log_message := FORMAT('Error during analytics rollup for %s: %s', yesterday_date, SQLERRM);
        RAISE EXCEPTION '%', log_message;
END;
$$;

-- Cleanup function: removes old analytics_events based on retention policy
CREATE OR REPLACE FUNCTION public.cleanup_analytics_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    log_message TEXT;
    start_ts TIMESTAMPTZ;
    end_ts TIMESTAMPTZ;
    duration_ms NUMERIC;
    deleted_impressions_count INT;
    deleted_other_events_count INT;
BEGIN
    start_ts := clock_timestamp();
    RAISE NOTICE 'Starting analytics events cleanup.';

    -- Delete listing_impression_batch events older than 30 days
    DELETE FROM public.analytics_events
    WHERE event_name = 'listing_impression_batch'
      AND ts < (NOW() AT TIME ZONE 'UTC') - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_impressions_count = ROW_COUNT;

    -- Delete all other events older than 90 days
    DELETE FROM public.analytics_events
    WHERE event_name != 'listing_impression_batch'
      AND ts < (NOW() AT TIME ZONE 'UTC') - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_other_events_count = ROW_COUNT;

    end_ts := clock_timestamp();
    duration_ms := EXTRACT(EPOCH FROM (end_ts - start_ts)) * 1000;
    log_message := FORMAT('Analytics events cleanup completed in %s ms. Deleted %s impression events and %s other events.',
                          ROUND(duration_ms, 2), deleted_impressions_count, deleted_other_events_count);
    RAISE NOTICE '%', log_message;

EXCEPTION
    WHEN OTHERS THEN
        log_message := FORMAT('Error during analytics events cleanup: %s', SQLERRM);
        RAISE EXCEPTION '%', log_message;
END;
$$;

-- Schedule nightly rollup job (06:10 UTC = 02:10 ET)
SELECT cron.schedule(
    'daily-analytics-rollup',
    '10 6 * * *',
    'SELECT public.rollup_analytics_events();'
);

-- Schedule nightly cleanup job (06:20 UTC = 02:20 ET)
SELECT cron.schedule(
    'daily-analytics-cleanup',
    '20 6 * * *',
    'SELECT public.cleanup_analytics_events();'
);

-- Update analytics_summary RPC to use summary tables
CREATE OR REPLACE FUNCTION public.analytics_summary(days_back INTEGER DEFAULT 7)
RETURNS TABLE (
    start_date DATE,
    end_date DATE,
    dau INTEGER,
    visitors_7d INTEGER,
    returns_7d INTEGER,
    avg_session_minutes NUMERIC,
    listing_views_7d INTEGER,
    post_starts_7d INTEGER,
    post_submits_7d INTEGER,
    post_success_7d INTEGER,
    post_abandoned_7d INTEGER,
    dau_sparkline INTEGER[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    _start_date DATE;
    _end_date DATE;
    _today_utc_date DATE;
    _dau_sparkline INTEGER[];
    _today_dau INTEGER := 0;
    _today_visitors INTEGER := 0;
    _today_returners INTEGER := 0;
    _today_avg_session_minutes NUMERIC := 0.0;
    _today_listing_views INTEGER := 0;
    _today_post_starts INTEGER := 0;
    _today_post_submits INTEGER := 0;
    _today_post_success INTEGER := 0;
    _today_post_abandoned INTEGER := 0;
    _historical_days INTEGER;
BEGIN
    _today_utc_date := (NOW() AT TIME ZONE 'UTC')::date;
    _start_date := _today_utc_date - (days_back - 1) * INTERVAL '1 day';
    _end_date := _today_utc_date;

    -- Initialize return values
    start_date := _start_date;
    end_date := _end_date;
    dau := 0;
    visitors_7d := 0;
    returns_7d := 0;
    avg_session_minutes := 0.0;
    listing_views_7d := 0;
    post_starts_7d := 0;
    post_submits_7d := 0;
    post_success_7d := 0;
    post_abandoned_7d := 0;
    dau_sparkline := '{}';

    -- Fetch historical data from daily_analytics (excluding today)
    SELECT
        COALESCE(SUM(da.dau), 0),
        COALESCE(SUM(da.visitors), 0),
        COALESCE(SUM(da.returners), 0),
        COALESCE(AVG(da.avg_session_minutes), 0.0),
        COALESCE(SUM(da.listing_views), 0),
        COALESCE(SUM(da.post_starts), 0),
        COALESCE(SUM(da.post_submits), 0),
        COALESCE(SUM(da.post_success), 0),
        COALESCE(SUM(da.post_abandoned), 0),
        ARRAY_AGG(COALESCE(da.dau, 0) ORDER BY da.date ASC),
        COUNT(*)
    INTO
        dau, visitors_7d, returns_7d, avg_session_minutes, listing_views_7d,
        post_starts_7d, post_submits_7d, post_success_7d, post_abandoned_7d, 
        _dau_sparkline, _historical_days
    FROM
        public.daily_analytics da
    WHERE
        da.date BETWEEN _start_date AND _today_utc_date - INTERVAL '1 day';

    -- Calculate today's data live from analytics_events
    WITH today_session_metrics AS (
        SELECT
            session_id,
            EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 60.0 AS session_duration_minutes
        FROM
            public.analytics_events
        WHERE
            (ts AT TIME ZONE 'UTC')::date = _today_utc_date
        GROUP BY
            session_id
    )
    SELECT
        COALESCE(COUNT(DISTINCT CASE WHEN ae.event_name = 'page_view' AND ae.user_id IS NOT NULL THEN ae.user_id END), 0),
        COALESCE(COUNT(DISTINCT CASE WHEN ae.event_name = 'page_view' THEN ae.session_id END), 0),
        COALESCE(COUNT(DISTINCT
            CASE
                WHEN ae.event_name = 'page_view' AND ae.user_id IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM public.analytics_events prev_ae
                    WHERE prev_ae.user_id = ae.user_id
                      AND prev_ae.ts < _today_utc_date
                ) THEN ae.user_id
            END
        ), 0),
        COALESCE(AVG(tsm.session_duration_minutes), 0.0),
        COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_view' THEN 1 END), 0),
        COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_start' THEN 1 END), 0),
        COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_submit' THEN 1 END), 0),
        COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_submit_success' THEN 1 END), 0),
        COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_abandoned' THEN 1 END), 0)
    INTO
        _today_dau, _today_visitors, _today_returners, _today_avg_session_minutes,
        _today_listing_views, _today_post_starts, _today_post_submits,
        _today_post_success, _today_post_abandoned
    FROM
        public.analytics_events ae
    LEFT JOIN today_session_metrics tsm ON ae.session_id = tsm.session_id
    WHERE
        (ae.ts AT TIME ZONE 'UTC')::date = _today_utc_date;

    -- Add today's data to totals
    dau := dau + _today_dau;
    visitors_7d := visitors_7d + _today_visitors;
    returns_7d := returns_7d + _today_returners;
    
    -- For average session minutes, weight by number of days
    IF _historical_days > 0 AND _today_avg_session_minutes > 0 THEN
        avg_session_minutes := (avg_session_minutes * _historical_days + _today_avg_session_minutes) / (_historical_days + 1);
    ELSIF _today_avg_session_minutes > 0 THEN
        avg_session_minutes := _today_avg_session_minutes;
    END IF;

    listing_views_7d := listing_views_7d + _today_listing_views;
    post_starts_7d := post_starts_7d + _today_post_starts;
    post_submits_7d := post_submits_7d + _today_post_submits;
    post_success_7d := post_success_7d + _today_post_success;
    post_abandoned_7d := post_abandoned_7d + _today_post_abandoned;

    -- Add today's DAU to sparkline
    IF _dau_sparkline IS NULL THEN
        _dau_sparkline := ARRAY[_today_dau];
    ELSE
        _dau_sparkline := array_append(_dau_sparkline, _today_dau);
    END IF;

    dau_sparkline := _dau_sparkline;

    -- Rollup daily_top_listings
    WITH daily_listing_metrics AS (
        SELECT
            (props->>'listing_id')::uuid AS listing_id,
            COUNT(CASE WHEN event_name = 'listing_view' THEN 1 END) AS views,
            COUNT(CASE WHEN event_name = 'listing_impression_batch' THEN 1 END) AS impressions
        FROM
            public.analytics_events
        WHERE
            (ts AT TIME ZONE 'UTC')::date = yesterday_date
            AND (props->>'listing_id') IS NOT NULL
            AND (props->>'listing_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        GROUP BY
            1
    ),
    ranked_listings AS (
        SELECT
            listing_id,
            views,
            impressions,
            CASE
                WHEN impressions > 0 THEN (views::NUMERIC / impressions) * 100
                ELSE 0.0
            END AS ctr,
            RANK() OVER (ORDER BY views DESC, impressions DESC) AS rank
        FROM
            daily_listing_metrics
        WHERE
            views > 0 OR impressions > 0
    )
    INSERT INTO public.daily_top_listings (date, listing_id, views, impressions, ctr, rank)
    SELECT
        yesterday_date,
        listing_id,
        views,
        impressions,
        ctr,
        rank
    FROM
        ranked_listings
    WHERE
        rank <= 50
    ON CONFLICT (date, listing_id) DO UPDATE SET
        views = EXCLUDED.views,
        impressions = EXCLUDED.impressions,
        ctr = EXCLUDED.ctr,
        rank = EXCLUDED.rank,
        created_at = NOW();

    -- Rollup daily_top_filters
    WITH daily_filter_metrics AS (
        SELECT
            filter_key,
            filter_value,
            COUNT(*) AS uses
        FROM (
            SELECT
                jsonb_object_keys(props->'filters') AS filter_key,
                props->'filters'->>jsonb_object_keys(props->'filters') AS filter_value
            FROM
                public.analytics_events
            WHERE
                (ts AT TIME ZONE 'UTC')::date = yesterday_date
                AND event_name = 'filter_apply'
                AND props ? 'filters'
                AND jsonb_typeof(props->'filters') = 'object'
        ) filter_expansions
        GROUP BY
            filter_key, filter_value
    ),
    ranked_filters AS (
        SELECT
            filter_key,
            filter_value,
            uses,
            RANK() OVER (ORDER BY uses DESC) AS rank
        FROM
            daily_filter_metrics
        WHERE
            uses > 0
    )
    INSERT INTO public.daily_top_filters (date, filter_key, filter_value, uses, rank)
    SELECT
        yesterday_date,
        filter_key,
        filter_value,
        uses,
        rank
    FROM
        ranked_filters
    WHERE
        rank <= 50
    ON CONFLICT (date, filter_key, filter_value) DO UPDATE SET
        uses = EXCLUDED.uses,
        rank = EXCLUDED.rank,
        created_at = NOW();

    end_ts := clock_timestamp();
    duration_ms := EXTRACT(EPOCH FROM (end_ts - start_ts)) * 1000;
    log_message := FORMAT('Analytics rollup for %s completed in %s ms. Processed %s daily_analytics rows.',
                          yesterday_date, ROUND(duration_ms, 2), rows_processed);
    RAISE NOTICE '%', log_message;

EXCEPTION
    WHEN OTHERS THEN
        log_message := FORMAT('Error during analytics rollup for %s: %s', yesterday_date, SQLERRM);
        RAISE EXCEPTION '%', log_message;
END;
$$;

-- Cleanup function: removes old analytics_events based on retention policy
CREATE OR REPLACE FUNCTION public.cleanup_analytics_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    log_message TEXT;
    start_ts TIMESTAMPTZ;
    end_ts TIMESTAMPTZ;
    duration_ms NUMERIC;
    deleted_impressions_count INT;
    deleted_other_events_count INT;
BEGIN
    start_ts := clock_timestamp();
    RAISE NOTICE 'Starting analytics events cleanup.';

    -- Delete listing_impression_batch events older than 30 days
    DELETE FROM public.analytics_events
    WHERE event_name = 'listing_impression_batch'
      AND ts < (NOW() AT TIME ZONE 'UTC') - INTERVAL '30 days';
    GET DIAGNOSTICS deleted_impressions_count = ROW_COUNT;

    -- Delete all other events older than 90 days
    DELETE FROM public.analytics_events
    WHERE event_name != 'listing_impression_batch'
      AND ts < (NOW() AT TIME ZONE 'UTC') - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_other_events_count = ROW_COUNT;

    end_ts := clock_timestamp();
    duration_ms := EXTRACT(EPOCH FROM (end_ts - start_ts)) * 1000;
    log_message := FORMAT('Analytics events cleanup completed in %s ms. Deleted %s impression events and %s other events.',
                          ROUND(duration_ms, 2), deleted_impressions_count, deleted_other_events_count);
    RAISE NOTICE '%', log_message;

EXCEPTION
    WHEN OTHERS THEN
        log_message := FORMAT('Error during analytics events cleanup: %s', SQLERRM);
        RAISE EXCEPTION '%', log_message;
END;
$$;

-- Update analytics_summary RPC to use summary tables
CREATE OR REPLACE FUNCTION public.analytics_summary(days_back INTEGER DEFAULT 7)
RETURNS TABLE (
    start_date DATE,
    end_date DATE,
    dau INTEGER,
    visitors_7d INTEGER,
    returns_7d INTEGER,
    avg_session_minutes NUMERIC,
    listing_views_7d INTEGER,
    post_starts_7d INTEGER,
    post_submits_7d INTEGER,
    post_success_7d INTEGER,
    post_abandoned_7d INTEGER,
    dau_sparkline INTEGER[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    _start_date DATE;
    _end_date DATE;
    _today_utc_date DATE;
    _dau_sparkline INTEGER[];
    _today_dau INTEGER := 0;
    _today_visitors INTEGER := 0;
    _today_returners INTEGER := 0;
    _today_avg_session_minutes NUMERIC := 0.0;
    _today_listing_views INTEGER := 0;
    _today_post_starts INTEGER := 0;
    _today_post_submits INTEGER := 0;
    _today_post_success INTEGER := 0;
    _today_post_abandoned INTEGER := 0;
    _historical_days INTEGER;
    _has_today_data BOOLEAN := false;
BEGIN
    _today_utc_date := (NOW() AT TIME ZONE 'UTC')::date;
    _start_date := _today_utc_date - (days_back - 1) * INTERVAL '1 day';
    _end_date := _today_utc_date;

    -- Initialize return values
    start_date := _start_date;
    end_date := _end_date;
    dau := 0;
    visitors_7d := 0;
    returns_7d := 0;
    avg_session_minutes := 0.0;
    listing_views_7d := 0;
    post_starts_7d := 0;
    post_submits_7d := 0;
    post_success_7d := 0;
    post_abandoned_7d := 0;
    dau_sparkline := '{}';

    -- Fetch historical data from daily_analytics (excluding today)
    SELECT
        COALESCE(SUM(da.dau), 0),
        COALESCE(SUM(da.visitors), 0),
        COALESCE(SUM(da.returners), 0),
        COALESCE(AVG(da.avg_session_minutes), 0.0),
        COALESCE(SUM(da.listing_views), 0),
        COALESCE(SUM(da.post_starts), 0),
        COALESCE(SUM(da.post_submits), 0),
        COALESCE(SUM(da.post_success), 0),
        COALESCE(SUM(da.post_abandoned), 0),
        ARRAY_AGG(COALESCE(da.dau, 0) ORDER BY da.date ASC),
        COUNT(*)
    INTO
        dau, visitors_7d, returns_7d, avg_session_minutes, listing_views_7d,
        post_starts_7d, post_submits_7d, post_success_7d, post_abandoned_7d, 
        _dau_sparkline, _historical_days
    FROM
        public.daily_analytics da
    WHERE
        da.date BETWEEN _start_date AND _today_utc_date - INTERVAL '1 day';

    -- Check if we have any events for today
    SELECT EXISTS(
        SELECT 1 FROM public.analytics_events 
        WHERE (ts AT TIME ZONE 'UTC')::date = _today_utc_date
        LIMIT 1
    ) INTO _has_today_data;

    -- Calculate today's data live from analytics_events if we have data
    IF _has_today_data THEN
        WITH today_session_metrics AS (
            SELECT
                session_id,
                EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 60.0 AS session_duration_minutes
            FROM
                public.analytics_events
            WHERE
                (ts AT TIME ZONE 'UTC')::date = _today_utc_date
            GROUP BY
                session_id
        )
        SELECT
            COALESCE(COUNT(DISTINCT CASE WHEN ae.event_name = 'page_view' AND ae.user_id IS NOT NULL THEN ae.user_id END), 0),
            COALESCE(COUNT(DISTINCT CASE WHEN ae.event_name = 'page_view' THEN ae.session_id END), 0),
            COALESCE(COUNT(DISTINCT
                CASE
                    WHEN ae.event_name = 'page_view' AND ae.user_id IS NOT NULL AND EXISTS (
                        SELECT 1
                        FROM public.analytics_events prev_ae
                        WHERE prev_ae.user_id = ae.user_id
                          AND prev_ae.ts < _today_utc_date
                    ) THEN ae.user_id
                END
            ), 0),
            COALESCE(AVG(tsm.session_duration_minutes), 0.0),
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_view' THEN 1 END), 0),
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_start' THEN 1 END), 0),
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_submit' THEN 1 END), 0),
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_submit_success' THEN 1 END), 0),
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_abandoned' THEN 1 END), 0)
        INTO
            _today_dau, _today_visitors, _today_returners, _today_avg_session_minutes,
            _today_listing_views, _today_post_starts, _today_post_submits,
            _today_post_success, _today_post_abandoned
        FROM
            public.analytics_events ae
        LEFT JOIN today_session_metrics tsm ON ae.session_id = tsm.session_id
        WHERE
            (ae.ts AT TIME ZONE 'UTC')::date = _today_utc_date;

        -- Add today's data to totals
        dau := dau + _today_dau;
        visitors_7d := visitors_7d + _today_visitors;
        returns_7d := returns_7d + _today_returners;
        
        -- For average session minutes, weight by number of days
        IF _historical_days > 0 AND _today_avg_session_minutes > 0 THEN
            avg_session_minutes := (avg_session_minutes * _historical_days + _today_avg_session_minutes) / (_historical_days + 1);
        ELSIF _today_avg_session_minutes > 0 THEN
            avg_session_minutes := _today_avg_session_minutes;
        END IF;

        listing_views_7d := listing_views_7d + _today_listing_views;
        post_starts_7d := post_starts_7d + _today_post_starts;
        post_submits_7d := post_submits_7d + _today_post_submits;
        post_success_7d := post_success_7d + _today_post_success;
        post_abandoned_7d := post_abandoned_7d + _today_post_abandoned;

        -- Add today's DAU to sparkline
        IF _dau_sparkline IS NULL THEN
            _dau_sparkline := ARRAY[_today_dau];
        ELSE
            _dau_sparkline := array_append(_dau_sparkline, _today_dau);
        END IF;
    END IF;

    dau_sparkline := COALESCE(_dau_sparkline, '{}');

    RETURN NEXT;
END;
$$;

-- Update analytics_top_listings RPC to use summary tables
CREATE OR REPLACE FUNCTION public.analytics_top_listings(days_back INTEGER DEFAULT 7, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    listing_id UUID,
    views INTEGER,
    impressions INTEGER,
    ctr NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    _start_date DATE;
    _end_date DATE;
    _today_utc_date DATE;
    _has_today_data BOOLEAN := false;
BEGIN
    _today_utc_date := (NOW() AT TIME ZONE 'UTC')::date;
    _start_date := _today_utc_date - (days_back - 1) * INTERVAL '1 day';
    _end_date := _today_utc_date;

    -- Check if we have any events for today
    SELECT EXISTS(
        SELECT 1 FROM public.analytics_events 
        WHERE (ts AT TIME ZONE 'UTC')::date = _today_utc_date
        AND (props->>'listing_id') IS NOT NULL
        LIMIT 1
    ) INTO _has_today_data;

    RETURN QUERY
    WITH combined_metrics AS (
        -- Historical data from daily_top_listings
        SELECT
            dtl.listing_id,
            dtl.views,
            dtl.impressions
        FROM
            public.daily_top_listings dtl
        WHERE
            dtl.date BETWEEN _start_date AND _today_utc_date - INTERVAL '1 day'

        UNION ALL

        -- Today's data from analytics_events (only if we have data)
        SELECT
            (props->>'listing_id')::uuid AS listing_id,
            COUNT(CASE WHEN event_name = 'listing_view' THEN 1 END) AS views,
            COUNT(CASE WHEN event_name = 'listing_impression_batch' THEN 1 END) AS impressions
        FROM
            public.analytics_events
        WHERE
            _has_today_data
            AND (ts AT TIME ZONE 'UTC')::date = _today_utc_date
            AND (props->>'listing_id') IS NOT NULL
            AND (props->>'listing_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        GROUP BY
            (props->>'listing_id')::uuid
    )
    SELECT
        cm.listing_id,
        SUM(cm.views)::INTEGER AS views,
        SUM(cm.impressions)::INTEGER AS impressions,
        CASE
            WHEN SUM(cm.impressions) > 0 THEN (SUM(cm.views)::NUMERIC / SUM(cm.impressions)) * 100
            ELSE 0.0
        END AS ctr
    FROM
        combined_metrics cm
    WHERE
        cm.listing_id IS NOT NULL
    GROUP BY
        cm.listing_id
    HAVING
        SUM(cm.views) > 0 OR SUM(cm.impressions) > 0
    ORDER BY
        views DESC, impressions DESC
    LIMIT limit_count;
END;
$$;

-- Update analytics_top_filters RPC to use summary tables
CREATE OR REPLACE FUNCTION public.analytics_top_filters(days_back INTEGER DEFAULT 7, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    filter_key TEXT,
    filter_value TEXT,
    uses INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    _start_date DATE;
    _end_date DATE;
    _today_utc_date DATE;
    _has_today_data BOOLEAN := false;
BEGIN
    _today_utc_date := (NOW() AT TIME ZONE 'UTC')::date;
    _start_date := _today_utc_date - (days_back - 1) * INTERVAL '1 day';
    _end_date := _today_utc_date;

    -- Check if we have any filter events for today
    SELECT EXISTS(
        SELECT 1 FROM public.analytics_events 
        WHERE (ts AT TIME ZONE 'UTC')::date = _today_utc_date
        AND event_name = 'filter_apply'
        AND props ? 'filters'
        LIMIT 1
    ) INTO _has_today_data;

    RETURN QUERY
    WITH combined_metrics AS (
        -- Historical data from daily_top_filters
        SELECT
            dtf.filter_key,
            dtf.filter_value,
            dtf.uses
        FROM
            public.daily_top_filters dtf
        WHERE
            dtf.date BETWEEN _start_date AND _today_utc_date - INTERVAL '1 day'

        UNION ALL

        -- Today's data from analytics_events (only if we have data)
        SELECT
            filter_key,
            filter_value,
            COUNT(*)::INTEGER AS uses
        FROM (
            SELECT
                jsonb_object_keys(props->'filters') AS filter_key,
                props->'filters'->>jsonb_object_keys(props->'filters') AS filter_value
            FROM
                public.analytics_events
            WHERE
                _has_today_data
                AND (ts AT TIME ZONE 'UTC')::date = _today_utc_date
                AND event_name = 'filter_apply'
                AND props ? 'filters'
                AND jsonb_typeof(props->'filters') = 'object'
        ) filter_expansions
        GROUP BY
            filter_key, filter_value
    )
    SELECT
        cm.filter_key,
        cm.filter_value,
        SUM(cm.uses)::INTEGER AS uses
    FROM
        combined_metrics cm
    WHERE
        cm.filter_key IS NOT NULL AND cm.filter_value IS NOT NULL
    GROUP BY
        cm.filter_key, cm.filter_value
    HAVING
        SUM(cm.uses) > 0
    ORDER BY
        uses DESC
    LIMIT limit_count;
END;
$$;

-- Grant necessary permissions for the scheduled functions
GRANT EXECUTE ON FUNCTION public.rollup_analytics_events() TO postgres;
GRANT EXECUTE ON FUNCTION public.cleanup_analytics_events() TO postgres;

-- Grant RLS bypass for service role on new tables (for rollup functions)
GRANT ALL ON public.daily_analytics TO service_role;
GRANT ALL ON public.daily_top_listings TO service_role;
GRANT ALL ON public.daily_top_filters TO service_role;