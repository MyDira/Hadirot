/*
  # Fix ambiguous column reference in analytics_top_filters

  1. Changes
    - Fix ambiguous column reference for filter_key in analytics_top_filters function
    - Properly qualify column references with table aliases
    - Ensure the function returns correct results without ambiguity errors

  2. Security
    - Maintains existing RLS and security policies
*/

-- Drop and recreate the analytics_top_filters function with proper column qualification
DROP FUNCTION IF EXISTS analytics_top_filters(integer, integer);

CREATE OR REPLACE FUNCTION analytics_top_filters(
  days_back integer DEFAULT 1,
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  filter_key text,
  filter_value text,
  uses integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH filter_events AS (
    SELECT 
      e.session_id,
      jsonb_each_text(e.props) AS filter_pair
    FROM analytics_events e
    WHERE e.event_name = 'search_filters_applied'
      AND timezone('America/New_York', e.ts)::date >= 
          date(timezone('America/New_York', now())) - (days_back - 1)
      AND timezone('America/New_York', e.ts)::date <= 
          date(timezone('America/New_York', now()))
  ),
  filter_usage AS (
    SELECT 
      (fe.filter_pair).key AS filter_key_col,
      (fe.filter_pair).value AS filter_value_col,
      COUNT(DISTINCT fe.session_id) AS usage_count
    FROM filter_events fe
    WHERE (fe.filter_pair).key IS NOT NULL 
      AND (fe.filter_pair).value IS NOT NULL
      AND (fe.filter_pair).value != ''
      AND (fe.filter_pair).key NOT IN ('page', 'referrer', 'user_agent', 'ip')
    GROUP BY (fe.filter_pair).key, (fe.filter_pair).value
  )
  SELECT 
    fu.filter_key_col,
    fu.filter_value_col,
    fu.usage_count::integer
  FROM filter_usage fu
  ORDER BY fu.usage_count DESC
  LIMIT limit_count;
END;
$$;