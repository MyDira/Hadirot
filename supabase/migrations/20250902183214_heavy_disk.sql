/*
  # Analytics Health Check - Verify Impressions and Session Fixes
  
  This migration runs read-only queries to verify:
  1. Impressions are properly counted from listing_impression_batch arrays
  2. CTR calculations are realistic 
  3. Session durations are capped and realistic (not inflated by idle tabs)
  4. Daily rollups contain proper data
  
  No data modifications - read-only verification only.
*/

-- Health Check A: Yesterday's daily_top_listings (top 10) with non-zero impressions + CTR
DO $$
DECLARE
    yesterday_date DATE := (NOW() AT TIME ZONE 'UTC')::DATE - INTERVAL '1 day';
    rec RECORD;
    row_count INTEGER := 0;
BEGIN
    RAISE NOTICE '=== A) Yesterday''s daily_top_listings (%) ===', yesterday_date;
    RAISE NOTICE 'listing_id | views | impressions | ctr';
    RAISE NOTICE '-----------|-------|-------------|----';
    
    FOR rec IN 
        SELECT listing_id, views, impressions, ctr, rank
        FROM public.daily_top_listings 
        WHERE date = yesterday_date 
        ORDER BY rank ASC 
        LIMIT 10
    LOOP
        row_count := row_count + 1;
        RAISE NOTICE '% | % | % | %', 
            SUBSTRING(rec.listing_id::TEXT, 1, 8) || '...', 
            rec.views, 
            rec.impressions, 
            ROUND(rec.ctr, 2);
    END LOOP;
    
    IF row_count = 0 THEN
        RAISE NOTICE 'No data found for yesterday (%). Rollup may not have run yet.', yesterday_date;
    END IF;
END $$;

-- Health Check B: analytics_top_listings(7,10) output
DO $$
DECLARE
    rec RECORD;
    row_count INTEGER := 0;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== B) analytics_top_listings(7,10) RPC output ===';
    RAISE NOTICE 'listing_id | views | impressions | ctr';
    RAISE NOTICE '-----------|-------|-------------|----';
    
    FOR rec IN 
        SELECT * FROM public.analytics_top_listings(7, 10)
    LOOP
        row_count := row_count + 1;
        RAISE NOTICE '% | % | % | %', 
            SUBSTRING(rec.listing_id::TEXT, 1, 8) || '...', 
            rec.views, 
            rec.impressions, 
            ROUND(rec.ctr, 2);
    END LOOP;
    
    IF row_count = 0 THEN
        RAISE NOTICE 'No listings returned from analytics_top_listings(7,10)';
    END IF;
END $$;

-- Health Check C: daily_analytics last 3 days with avg_session_minutes
DO $$
DECLARE
    rec RECORD;
    row_count INTEGER := 0;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== C) daily_analytics last 3 days ===';
    RAISE NOTICE 'date | dau | visitors | avg_session_minutes';
    RAISE NOTICE '-----|-----|----------|-------------------';
    
    FOR rec IN 
        SELECT date, dau, visitors, avg_session_minutes
        FROM public.daily_analytics 
        ORDER BY date DESC 
        LIMIT 3
    LOOP
        row_count := row_count + 1;
        RAISE NOTICE '% | % | % | %', 
            rec.date, 
            rec.dau, 
            rec.visitors, 
            ROUND(rec.avg_session_minutes, 2);
    END LOOP;
    
    IF row_count = 0 THEN
        RAISE NOTICE 'No daily_analytics data found. Rollup may not have run yet.';
    END IF;
END $$;

-- Health Check D: Today's analytics_summary(7) snippet with avg_session_minutes
DO $$
DECLARE
    rec RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== D) analytics_summary(7) - avg_session_minutes ===';
    
    SELECT avg_session_minutes INTO rec
    FROM public.analytics_summary(7)
    LIMIT 1;
    
    IF rec.avg_session_minutes IS NOT NULL THEN
        RAISE NOTICE 'avg_session_minutes: %', ROUND(rec.avg_session_minutes, 2);
        
        -- Validate that session minutes are reasonable (not inflated)
        IF rec.avg_session_minutes > 20 THEN
            RAISE NOTICE 'WARNING: Session duration seems high (% minutes). May indicate tab inflation not fully fixed.', ROUND(rec.avg_session_minutes, 2);
        ELSIF rec.avg_session_minutes BETWEEN 1 AND 15 THEN
            RAISE NOTICE 'SUCCESS: Session duration looks realistic (% minutes).', ROUND(rec.avg_session_minutes, 2);
        ELSE
            RAISE NOTICE 'INFO: Session duration is % minutes.', ROUND(rec.avg_session_minutes, 2);
        END IF;
    ELSE
        RAISE NOTICE 'No data returned from analytics_summary(7)';
    END IF;
END $$;

-- Health Check E: Verify impression counting is working
DO $$
DECLARE
    batch_events_count INTEGER;
    total_impressions_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== E) Impression counting verification ===';
    
    -- Count listing_impression_batch events in last 7 days
    SELECT COUNT(*) INTO batch_events_count
    FROM public.analytics_events
    WHERE event_name = 'listing_impression_batch'
      AND ts > NOW() - INTERVAL '7 days';
    
    -- Count total impressions by expanding arrays
    SELECT COUNT(*) INTO total_impressions_count
    FROM public.analytics_events ae,
         jsonb_array_elements_text(
           COALESCE(ae.props->'ids', ae.props->'listing_ids', '[]'::jsonb)
         ) AS listing_id
    WHERE ae.event_name = 'listing_impression_batch'
      AND ae.ts > NOW() - INTERVAL '7 days';
    
    RAISE NOTICE 'Batch events (last 7d): %', batch_events_count;
    RAISE NOTICE 'Total impressions (expanded): %', total_impressions_count;
    
    IF total_impressions_count > batch_events_count THEN
        RAISE NOTICE 'SUCCESS: Impressions are being properly expanded from batch events.';
    ELSIF batch_events_count > 0 AND total_impressions_count = 0 THEN
        RAISE NOTICE 'WARNING: Batch events exist but no impressions counted. Check array format.';
    ELSE
        RAISE NOTICE 'INFO: Impression expansion ratio: % impressions per batch event', 
            CASE WHEN batch_events_count > 0 THEN ROUND(total_impressions_count::NUMERIC / batch_events_count, 2) ELSE 0 END;
    END IF;
END $$;