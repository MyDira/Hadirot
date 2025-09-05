/*
  # Fix Analytics Summary Function Syntax

  1. Changes
    - Fix SELECT statements that have no destination for result data
    - Use RETURN QUERY instead of intermediate variables
    - Ensure proper PostgreSQL function syntax

  2. Security
    - Maintains existing RLS policies
    - No changes to permissions
*/

-- Drop and recreate the analytics_summary function with correct syntax
DROP FUNCTION IF EXISTS analytics_summary(integer);

CREATE OR REPLACE FUNCTION analytics_summary(days_back integer DEFAULT 1)
RETURNS TABLE (
  dau integer,
  visitors integer,
  returners integer,
  avg_session_minutes numeric,
  listing_views integer,
  post_starts integer,
  post_submits integer,
  post_success integer,
  post_abandoned integer
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH date_range AS (
    SELECT 
      (date(timezone('America/New_York', now())) - (days_back - 1))::date as start_date,
      date(timezone('America/New_York', now()))::date as end_date
  ),
  events_filtered AS (
    SELECT DISTINCT
      e.id,
      e.session_id,
      e.user_id,
      e.event_name,
      e.ts,
      e.props
    FROM analytics_events e
    CROSS JOIN date_range dr
    WHERE timezone('America/New_York', e.ts)::date >= dr.start_date
      AND timezone('America/New_York', e.ts)::date <= dr.end_date
  ),
  session_stats AS (
    SELECT 
      session_id,
      user_id,
      MIN(ts) as session_start,
      MAX(ts) as session_end,
      EXTRACT(EPOCH FROM (MAX(ts) - MIN(ts))) / 60.0 as session_minutes
    FROM events_filtered
    GROUP BY session_id, user_id
  ),
  user_sessions AS (
    SELECT 
      user_id,
      COUNT(*) as session_count
    FROM session_stats
    WHERE user_id IS NOT NULL
    GROUP BY user_id
  )
  SELECT 
    -- DAU: Distinct authenticated users
    (SELECT COUNT(DISTINCT user_id) FROM events_filtered WHERE user_id IS NOT NULL)::integer,
    
    -- Visitors: Distinct sessions (includes anonymous)
    (SELECT COUNT(DISTINCT session_id) FROM events_filtered)::integer,
    
    -- Returners: Users with multiple sessions
    (SELECT COUNT(*) FROM user_sessions WHERE session_count > 1)::integer,
    
    -- Average session duration in minutes
    (SELECT COALESCE(AVG(session_minutes), 0) FROM session_stats)::numeric,
    
    -- Listing views: Unique sessions that viewed listings
    (SELECT COUNT(DISTINCT session_id) FROM events_filtered WHERE event_name = 'listing_view')::integer,
    
    -- Post starts: Unique sessions that started posting
    (SELECT COUNT(DISTINCT session_id) FROM events_filtered WHERE event_name = 'listing_post_start')::integer,
    
    -- Post submits: Unique sessions that submitted posts
    (SELECT COUNT(DISTINCT session_id) FROM events_filtered WHERE event_name = 'listing_post_submit')::integer,
    
    -- Post success: Unique sessions that successfully posted
    (SELECT COUNT(DISTINCT session_id) FROM events_filtered WHERE event_name = 'listing_post_success')::integer,
    
    -- Post abandoned: Unique sessions that started but didn't succeed
    (SELECT COUNT(DISTINCT e1.session_id) 
     FROM events_filtered e1 
     WHERE e1.event_name = 'listing_post_start'
       AND NOT EXISTS (
         SELECT 1 FROM events_filtered e2 
         WHERE e2.session_id = e1.session_id 
           AND e2.event_name = 'listing_post_success'
       ))::integer;
END;
$$;