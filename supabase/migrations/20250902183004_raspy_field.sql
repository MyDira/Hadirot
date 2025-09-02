/*
  # Fix session duration calculation to prevent tab inflation

  1. Updates
    - Modified `rollup_analytics_events` function to calculate session duration by summing gaps between consecutive events, capping each gap at 30 minutes
    - Updated `analytics_summary` RPC to use the same logic for today's live calculation
    - Prevents sessions from being inflated by idle tabs left open

  2. Changes
    - Session duration now calculated as sum of capped gaps between events
    - Maximum gap between events is 30 minutes (1800 seconds)
    - More realistic session duration metrics
*/

-- Update the rollup_analytics_events function to fix session calculation
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

    -- Calculate session durations with capped gaps
    WITH session_events AS (
        SELECT 
            session_id,
            ts,
            LAG(ts) OVER (PARTITION BY session_id ORDER BY ts) AS prev_ts
        FROM public.analytics_events
        WHERE (ts AT TIME ZONE 'UTC')::date = yesterday_date
    ),
    session_gaps AS (
        SELECT 
            session_id,
            CASE 
                WHEN prev_ts IS NULL THEN 0
                ELSE LEAST(EXTRACT(EPOCH FROM (ts - prev_ts)), 1800) -- Cap at 30 minutes (1800 seconds)
            END AS gap_seconds
        FROM session_events
        WHERE prev_ts IS NOT NULL OR (prev_ts IS NULL AND session_id IS NOT NULL)
    ),
    session_durations AS (
        SELECT 
            session_id,
            SUM(gap_seconds) / 60.0 AS session_duration_minutes
        FROM session_gaps
        GROUP BY session_id
    )
    -- Rollup daily_analytics with improved session calculation
    INSERT INTO public.daily_analytics (
        date,
        dau,
        visitors,
        returners,
        avg_session_minutes,
        listing_views,
        post_starts,
        post_submits,
        post_success,
        post_abandoned
    )
    SELECT
        yesterday_date,
        COALESCE(COUNT(DISTINCT CASE WHEN ae.event_name = 'page_view' AND ae.user_id IS NOT NULL THEN ae.user_id END), 0) AS dau,
        COALESCE(COUNT(DISTINCT CASE WHEN ae.event_name = 'page_view' THEN ae.session_id END), 0) AS visitors,
        COALESCE(COUNT(DISTINCT
            CASE
                WHEN ae.event_name = 'page_view' AND ae.user_id IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM public.analytics_events prev_ae
                    WHERE prev_ae.user_id = ae.user_id
                      AND (prev_ae.ts AT TIME ZONE 'UTC')::date < yesterday_date
                ) THEN ae.user_id
            END
        ), 0) AS returners,
        COALESCE(AVG(sd.session_duration_minutes), 0.0) AS avg_session_minutes,
        COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_view' THEN 1 END), 0) AS listing_views,
        COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_start' THEN 1 END), 0) AS post_starts,
        COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_submit' THEN 1 END), 0) AS post_submits,
        COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_submit_success' THEN 1 END), 0) AS post_success,
        COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_abandoned' THEN 1 END), 0) AS post_abandoned
    FROM
        public.analytics_events ae
    LEFT JOIN session_durations sd ON ae.session_id = sd.session_id
    WHERE
        (ae.ts AT TIME ZONE 'UTC')::date = yesterday_date
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

    -- Rollup daily_top_listings with proper impression counting
    WITH daily_listing_views AS (
        SELECT
            (props->>'listing_id')::uuid AS listing_id,
            COUNT(*) AS views
        FROM public.analytics_events
        WHERE (ts AT TIME ZONE 'UTC')::date = yesterday_date
          AND event_name = 'listing_view'
          AND props ? 'listing_id'
        GROUP BY 1
    ),
    daily_listing_impressions AS (
        SELECT
            listing_id::uuid,
            COUNT(*) AS impressions
        FROM public.analytics_events ae,
             LATERAL (
                 SELECT jsonb_array_elements_text(
                     COALESCE(ae.props->'ids', ae.props->'listing_ids', '[]'::jsonb)
                 ) AS listing_id
             ) AS expanded_ids
        WHERE (ae.ts AT TIME ZONE 'UTC')::date = yesterday_date
          AND ae.event_name = 'listing_impression_batch'
        GROUP BY 1
    ),
    daily_listing_metrics AS (
        SELECT
            COALESCE(v.listing_id, i.listing_id) AS listing_id,
            COALESCE(v.views, 0) AS views,
            COALESCE(i.impressions, 0) AS impressions,
            CASE
                WHEN COALESCE(i.impressions, 0) > 0 THEN (COALESCE(v.views, 0)::NUMERIC / i.impressions) * 100
                ELSE 0.0
            END AS ctr
        FROM daily_listing_views v
        FULL OUTER JOIN daily_listing_impressions i USING (listing_id)
        WHERE COALESCE(v.listing_id, i.listing_id) IS NOT NULL
    ),
    ranked_listings AS (
        SELECT
            listing_id,
            views,
            impressions,
            ctr,
            RANK() OVER (ORDER BY views DESC, impressions DESC) AS rank
        FROM daily_listing_metrics
    )
    INSERT INTO public.daily_top_listings (date, listing_id, views, impressions, ctr, rank)
    SELECT
        yesterday_date,
        listing_id,
        views,
        impressions,
        ctr,
        rank
    FROM ranked_listings
    WHERE rank <= 50 -- Top 50 listings
    ON CONFLICT (date, listing_id) DO UPDATE SET
        views = EXCLUDED.views,
        impressions = EXCLUDED.impressions,
        ctr = EXCLUDED.ctr,
        rank = EXCLUDED.rank,
        created_at = NOW();

    -- Rollup daily_top_filters (unchanged)
    WITH daily_filter_metrics AS (
        SELECT
            jsonb_object_keys(props->'filters') AS filter_key,
            props->'filters'->>jsonb_object_keys(props->'filters') AS filter_value,
            COUNT(*) AS uses
        FROM public.analytics_events
        WHERE (ts AT TIME ZONE 'UTC')::date = yesterday_date
          AND event_name = 'filter_apply'
          AND props ? 'filters'
          AND jsonb_typeof(props->'filters') = 'object'
        GROUP BY 1, 2
    ),
    ranked_filters AS (
        SELECT
            filter_key,
            filter_value,
            uses,
            RANK() OVER (ORDER BY uses DESC) AS rank
        FROM daily_filter_metrics
    )
    INSERT INTO public.daily_top_filters (date, filter_key, filter_value, uses, rank)
    SELECT
        yesterday_date,
        filter_key,
        filter_value,
        uses,
        rank
    FROM ranked_filters
    WHERE rank <= 50 -- Top 50 filters
    ON CONFLICT (date, filter_key, filter_value) DO UPDATE SET
        uses = EXCLUDED.uses,
        rank = EXCLUDED.rank,
        created_at = NOW();

    end_ts := clock_timestamp();
    duration_ms := EXTRACT(EPOCH FROM (end_ts - start_ts)) * 1000;
    log_message := FORMAT('Analytics rollup for %s completed in %s ms. Processed %s rows.', 
                         yesterday_date, ROUND(duration_ms, 2), rows_processed);
    RAISE NOTICE '%', log_message;

EXCEPTION
    WHEN OTHERS THEN
        log_message := FORMAT('Error during analytics rollup for %s: %s', yesterday_date, SQLERRM);
        RAISE EXCEPTION '%', log_message;
END;
$$;

-- Update analytics_summary RPC to use improved session calculation
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
    _today_dau INTEGER;
    _today_visitors INTEGER;
    _today_returners INTEGER;
    _today_avg_session_minutes NUMERIC;
    _today_listing_views INTEGER;
    _today_post_starts INTEGER;
    _today_post_submits INTEGER;
    _today_post_success INTEGER;
    _today_post_abandoned INTEGER;
    _historical_avg_session_minutes NUMERIC;
    _historical_days_count INTEGER;
BEGIN
    _today_utc_date := (NOW() AT TIME ZONE 'UTC')::date;
    _start_date := _today_utc_date - (days_back - 1) * INTERVAL '1 day';
    _end_date := _today_utc_date;

    -- Fetch historical data from daily_analytics
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
        ARRAY_AGG(da.dau ORDER BY da.date ASC),
        COUNT(*)
    INTO
        dau, visitors_7d, returns_7d, _historical_avg_session_minutes, listing_views_7d,
        post_starts_7d, post_submits_7d, post_success_7d, post_abandoned_7d, _dau_sparkline,
        _historical_days_count
    FROM
        public.daily_analytics da
    WHERE
        da.date BETWEEN _start_date AND _today_utc_date - INTERVAL '1 day';

    -- Calculate today's data live from analytics_events with improved session calculation
    WITH today_session_events AS (
        SELECT 
            session_id,
            ts,
            LAG(ts) OVER (PARTITION BY session_id ORDER BY ts) AS prev_ts
        FROM public.analytics_events
        WHERE (ts AT TIME ZONE 'UTC')::date = _today_utc_date
    ),
    today_session_gaps AS (
        SELECT 
            session_id,
            CASE 
                WHEN prev_ts IS NULL THEN 0
                ELSE LEAST(EXTRACT(EPOCH FROM (ts - prev_ts)), 1800) -- Cap at 30 minutes
            END AS gap_seconds
        FROM today_session_events
        WHERE prev_ts IS NOT NULL OR (prev_ts IS NULL AND session_id IS NOT NULL)
    ),
    today_session_durations AS (
        SELECT 
            session_id,
            SUM(gap_seconds) / 60.0 AS session_duration_minutes
        FROM today_session_gaps
        GROUP BY session_id
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
                      AND (prev_ae.ts AT TIME ZONE 'UTC')::date < _today_utc_date
                ) THEN ae.user_id
            END
        ), 0),
        COALESCE(AVG(tsd.session_duration_minutes), 0.0),
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
    LEFT JOIN today_session_durations tsd ON ae.session_id = tsd.session_id
    WHERE
        (ae.ts AT TIME ZONE 'UTC')::date = _today_utc_date;

    -- Add today's data to totals
    dau := dau + _today_dau;
    visitors_7d := visitors_7d + _today_visitors;
    returns_7d := returns_7d + _today_returners;
    
    -- Calculate weighted average for session minutes
    IF _historical_days_count > 0 AND _today_avg_session_minutes > 0 THEN
        avg_session_minutes := (_historical_avg_session_minutes * _historical_days_count + _today_avg_session_minutes) / (_historical_days_count + 1);
    ELSIF _today_avg_session_minutes > 0 THEN
        avg_session_minutes := _today_avg_session_minutes;
    ELSE
        avg_session_minutes := _historical_avg_session_minutes;
    END IF;

    listing_views_7d := listing_views_7d + _today_listing_views;
    post_starts_7d := post_starts_7d + _today_post_starts;
    post_submits_7d := post_submits_7d + _today_post_submits;
    post_success_7d := post_success_7d + _today_post_success;
    post_abandoned_7d := post_abandoned_7d + _today_post_abandoned;

    -- Add today's DAU to sparkline
    _dau_sparkline := array_append(COALESCE(_dau_sparkline, '{}'), _today_dau);

    -- Ensure we have a complete sparkline for the requested period
    WHILE array_length(_dau_sparkline, 1) < days_back LOOP
        _dau_sparkline := array_prepend(0, _dau_sparkline);
    END LOOP;

    -- Assign output variables
    start_date := _start_date;
    end_date := _end_date;
    dau_sparkline := _dau_sparkline;

    RETURN NEXT;
END;
$$;

-- Backfill the last 7 days with corrected session calculations
DO $$
DECLARE
    target_date DATE;
    days_to_backfill INTEGER := 7;
BEGIN
    FOR i IN 0..(days_to_backfill - 1) LOOP
        target_date := (NOW() AT TIME ZONE 'UTC')::date - (i + 1) * INTERVAL '1 day';
        
        RAISE NOTICE 'Backfilling analytics for date: %', target_date;
        
        -- Calculate session durations with capped gaps for the target date
        WITH session_events AS (
            SELECT 
                session_id,
                ts,
                LAG(ts) OVER (PARTITION BY session_id ORDER BY ts) AS prev_ts
            FROM public.analytics_events
            WHERE (ts AT TIME ZONE 'UTC')::date = target_date
        ),
        session_gaps AS (
            SELECT 
                session_id,
                CASE 
                    WHEN prev_ts IS NULL THEN 0
                    ELSE LEAST(EXTRACT(EPOCH FROM (ts - prev_ts)), 1800) -- Cap at 30 minutes
                END AS gap_seconds
            FROM session_events
            WHERE prev_ts IS NOT NULL OR (prev_ts IS NULL AND session_id IS NOT NULL)
        ),
        session_durations AS (
            SELECT 
                session_id,
                SUM(gap_seconds) / 60.0 AS session_duration_minutes
            FROM session_gaps
            GROUP BY session_id
        )
        -- Update daily_analytics with corrected session calculation
        INSERT INTO public.daily_analytics (
            date,
            dau,
            visitors,
            returners,
            avg_session_minutes,
            listing_views,
            post_starts,
            post_submits,
            post_success,
            post_abandoned
        )
        SELECT
            target_date,
            COALESCE(COUNT(DISTINCT CASE WHEN ae.event_name = 'page_view' AND ae.user_id IS NOT NULL THEN ae.user_id END), 0) AS dau,
            COALESCE(COUNT(DISTINCT CASE WHEN ae.event_name = 'page_view' THEN ae.session_id END), 0) AS visitors,
            COALESCE(COUNT(DISTINCT
                CASE
                    WHEN ae.event_name = 'page_view' AND ae.user_id IS NOT NULL AND EXISTS (
                        SELECT 1
                        FROM public.analytics_events prev_ae
                        WHERE prev_ae.user_id = ae.user_id
                          AND (prev_ae.ts AT TIME ZONE 'UTC')::date < target_date
                    ) THEN ae.user_id
                END
            ), 0) AS returners,
            COALESCE(AVG(sd.session_duration_minutes), 0.0) AS avg_session_minutes,
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_view' THEN 1 END), 0) AS listing_views,
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_start' THEN 1 END), 0) AS post_starts,
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_submit' THEN 1 END), 0) AS post_submits,
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_submit_success' THEN 1 END), 0) AS post_success,
            COALESCE(COUNT(CASE WHEN ae.event_name = 'listing_post_abandoned' THEN 1 END), 0) AS post_abandoned
        FROM
            public.analytics_events ae
        LEFT JOIN session_durations sd ON ae.session_id = sd.session_id
        WHERE
            (ae.ts AT TIME ZONE 'UTC')::date = target_date
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
    END LOOP;
    
    RAISE NOTICE 'Backfill completed for % days', days_to_backfill;
END;
$$;