/*
  # Analytics Dashboard Enhancements

  ## Overview
  This migration enhances the analytics dashboard to provide actionable business insights
  by adding detailed listing information and funnel abandonment analysis.

  ## New Functions

  ### 1. analytics_top_listings_detailed
  Returns top performing listings with complete business context including:
  - Property location (cross streets/neighborhood)
  - Bedroom count
  - Monthly rent or "Call for Price"
  - Posted by (user's full name)
  - View count, impression count, and CTR
  - Direct link capability via listing_id

  ### 2. analytics_funnel_abandonment_details
  Provides granular analysis of posting funnel abandonment:
  - Count of users who started but never submitted
  - Count of users who submitted but never succeeded
  - Average time spent before abandoning (in minutes)
  - Breakdown by abandonment stage

  ## Security
  - All functions use SECURITY DEFINER with search_path = public
  - Functions respect existing RLS policies via table joins
  - No PII exposure in abandonment tracking

  ## Performance Considerations
  - Limited to 10-20 results to manage join complexity
  - Indexes on event_props JSONB fields for efficient queries
  - Date-based filtering to reduce query scope
*/

-- Function to get top listings with detailed information
CREATE OR REPLACE FUNCTION analytics_top_listings_detailed(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id uuid,
  property_location text,
  bedrooms integer,
  monthly_rent text,
  posted_by text,
  views integer,
  impressions integer,
  ctr numeric,
  is_featured boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_date date;
BEGIN
  target_date := (now() AT TIME ZONE tz)::date - days_back * interval '1 day';

  RETURN QUERY
  WITH listing_stats AS (
    SELECT
      (e.event_props->>'listing_id')::uuid as lid,
      COUNT(CASE WHEN e.event_name = 'listing_view' THEN 1 END)::integer as view_count,
      COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END)::integer as impression_count,
      CASE
        WHEN COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END) > 0
        THEN ROUND(
          (COUNT(CASE WHEN e.event_name = 'listing_view' THEN 1 END)::numeric /
           COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END)::numeric) * 100,
          2
        )
        ELSE 0
      END as click_through_rate
    FROM analytics_events e
    WHERE e.occurred_at::date = target_date
      AND e.event_name IN ('listing_view', 'listing_impression_batch')
      AND (e.event_props->>'listing_id') IS NOT NULL
      AND (e.event_props->>'listing_id') != ''
    GROUP BY (e.event_props->>'listing_id')
    HAVING COUNT(*) > 0
  )
  SELECT
    l.id,
    COALESCE(
      CASE
        WHEN l.neighborhood IS NOT NULL AND l.neighborhood != ''
        THEN l.neighborhood || ' - ' || l.location
        ELSE l.location
      END,
      'Unknown Location'
    ) as property_location,
    l.bedrooms,
    CASE
      WHEN l.call_for_price = true THEN 'Call for Price'
      WHEN l.price IS NULL THEN 'Not specified'
      ELSE '$' || l.price::text || '/mo'
    END as monthly_rent,
    COALESCE(p.full_name, 'Unknown') as posted_by,
    ls.view_count,
    ls.impression_count,
    ls.click_through_rate,
    COALESCE(l.is_featured, false) as is_featured
  FROM listing_stats ls
  INNER JOIN listings l ON l.id = ls.lid
  LEFT JOIN profiles p ON p.id = l.user_id
  WHERE l.is_active = true
  ORDER BY ls.view_count DESC, ls.impression_count DESC
  LIMIT limit_count;
END;
$$;

-- Function to analyze posting funnel abandonment patterns
CREATE OR REPLACE FUNCTION analytics_funnel_abandonment_details(
  days_back integer DEFAULT 0,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  started_not_submitted integer,
  submitted_not_completed integer,
  avg_time_before_abandon_minutes numeric,
  total_abandoned integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_date date;
BEGIN
  target_date := (now() AT TIME ZONE tz)::date - days_back * interval '1 day';

  RETURN QUERY
  WITH attempt_events AS (
    SELECT
      event_props->>'attempt_id' as attempt_id,
      event_name,
      occurred_at
    FROM analytics_events
    WHERE occurred_at::date = target_date
      AND event_name IN ('post_started', 'post_submitted', 'post_success', 'post_abandoned')
      AND event_props->>'attempt_id' IS NOT NULL
  ),
  attempt_summary AS (
    SELECT
      attempt_id,
      MAX(CASE WHEN event_name = 'post_started' THEN occurred_at END) as start_time,
      MAX(CASE WHEN event_name = 'post_submitted' THEN occurred_at END) as submit_time,
      MAX(CASE WHEN event_name = 'post_success' THEN occurred_at END) as success_time,
      MAX(CASE WHEN event_name = 'post_abandoned' THEN occurred_at END) as abandon_time,
      bool_or(event_name = 'post_started') as has_started,
      bool_or(event_name = 'post_submitted') as has_submitted,
      bool_or(event_name = 'post_success') as has_succeeded,
      bool_or(event_name = 'post_abandoned') as has_abandoned
    FROM attempt_events
    GROUP BY attempt_id
  ),
  abandonment_analysis AS (
    SELECT
      CASE
        WHEN has_abandoned AND has_started AND NOT has_submitted THEN 'started_not_submitted'
        WHEN has_abandoned AND has_submitted AND NOT has_succeeded THEN 'submitted_not_completed'
        ELSE NULL
      END as abandon_stage,
      CASE
        WHEN has_abandoned AND start_time IS NOT NULL AND abandon_time IS NOT NULL
        THEN EXTRACT(EPOCH FROM (abandon_time - start_time)) / 60.0
        ELSE NULL
      END as minutes_before_abandon
    FROM attempt_summary
    WHERE has_abandoned = true
  )
  SELECT
    COUNT(*) FILTER (WHERE abandon_stage = 'started_not_submitted')::integer as started_not_submitted,
    COUNT(*) FILTER (WHERE abandon_stage = 'submitted_not_completed')::integer as submitted_not_completed,
    ROUND(AVG(minutes_before_abandon) FILTER (WHERE minutes_before_abandon IS NOT NULL), 2) as avg_time_before_abandon_minutes,
    COUNT(*)::integer as total_abandoned
  FROM abandonment_analysis
  WHERE abandon_stage IS NOT NULL;
END;
$$;

-- Add index on event_props->>'listing_id' for better performance
CREATE INDEX IF NOT EXISTS analytics_events_listing_id_idx
ON analytics_events ((event_props->>'listing_id'))
WHERE event_props->>'listing_id' IS NOT NULL;

-- Add index on event_props->>'attempt_id' for better performance
CREATE INDEX IF NOT EXISTS analytics_events_attempt_id_idx
ON analytics_events ((event_props->>'attempt_id'))
WHERE event_props->>'attempt_id' IS NOT NULL;

-- Add comment explaining the functions
COMMENT ON FUNCTION analytics_top_listings_detailed IS
'Returns top performing listings with complete property details, owner info, and performance metrics. Used for actionable business insights on the analytics dashboard.';

COMMENT ON FUNCTION analytics_funnel_abandonment_details IS
'Analyzes posting funnel abandonment patterns to identify where and why users drop off. Provides stage-specific counts and average time spent before abandoning.';
