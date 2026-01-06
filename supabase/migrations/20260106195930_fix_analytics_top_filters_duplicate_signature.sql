/*
  # Fix Duplicate analytics_top_filters Function Signatures
  
  ## Problem
  Multiple versions of analytics_top_filters exist with different parameter orders:
  - (days_back => integer, limit_count => integer, tz => text)
  - (days_back => integer, tz => text, limit_count => integer)
  
  This causes PostgreSQL to fail choosing between overloaded functions.
  
  ## Solution
  Drop all existing versions and create a single canonical version with consistent
  parameter order: (days_back, tz, limit_count)
*/

-- Drop all existing versions of analytics_top_filters
DROP FUNCTION IF EXISTS analytics_top_filters(integer, integer, text);
DROP FUNCTION IF EXISTS analytics_top_filters(integer, text, integer);

-- Create single canonical version
CREATE OR REPLACE FUNCTION analytics_top_filters(
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York',
  limit_count integer DEFAULT 10
)
RETURNS TABLE (
  filter_key text,
  filter_value text,
  uses bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
BEGIN
  PERFORM require_admin();
  
  start_ts := (now() AT TIME ZONE tz - (days_back || ' days')::interval);
  
  RETURN QUERY
  WITH filter_events AS (
    SELECT
      ae.event_props,
      ae.props
    FROM analytics_events ae
    WHERE ae.event_name = 'filter_apply'
      AND ae.occurred_at >= start_ts
  ),
  extracted_filters AS (
    SELECT
      key,
      value
    FROM filter_events,
    LATERAL jsonb_each_text(COALESCE(event_props->'filters', props->'filters', '{}'::jsonb))
    WHERE value IS NOT NULL AND value != '' AND value != 'null'
  )
  SELECT
    key,
    value,
    COUNT(*)::bigint AS use_count
  FROM extracted_filters
  GROUP BY key, value
  ORDER BY use_count DESC
  LIMIT limit_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION analytics_top_filters(integer, text, integer) TO authenticated;
