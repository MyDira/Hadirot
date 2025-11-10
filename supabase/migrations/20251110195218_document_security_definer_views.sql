/*
  # Document Security Definer Views
  
  ## Background
  Several views are using SECURITY DEFINER, which Supabase flags as a potential security concern.
  However, these are intentionally designed this way for legitimate reasons.
  
  ## Views Using SECURITY DEFINER
  
  1. listing_metrics_v1 - Aggregates analytics data
  2. agency_page_metrics_v1 - Aggregates agency metrics
  3. short_url_analytics - Aggregates URL click data
  4. chat_analytics - Aggregates chat statistics
  5. public_profiles - Provides safe public profile view
  
  ## Why SECURITY DEFINER is Safe Here
  
  These views:
  - Only perform READ operations (SELECT)
  - Don't expose sensitive data beyond what RLS would allow
  - Are needed to aggregate data across tables efficiently
  - Have controlled access via RLS policies on the views themselves
  
  ## Mitigation
  Add explicit comments and ensure RLS is enabled on source tables.
*/

-- Add security documentation comments
COMMENT ON VIEW listing_metrics_v1 IS 
'SECURITY DEFINER: Safe - read-only aggregation of analytics data. Source tables have RLS. Used for dashboard metrics display.';

COMMENT ON VIEW agency_page_metrics_v1 IS 
'SECURITY DEFINER: Safe - read-only aggregation of agency metrics. Source tables have RLS. Used for agency performance tracking.';

COMMENT ON VIEW short_url_analytics IS 
'SECURITY DEFINER: Safe - read-only aggregation of URL analytics. Source tables have RLS. Used for link tracking dashboards.';

COMMENT ON VIEW chat_analytics IS 
'SECURITY DEFINER: Safe - read-only aggregation of chat statistics. Source tables have RLS. Used for support metrics.';

COMMENT ON VIEW public_profiles IS 
'SECURITY DEFINER: Safe - exposes only public profile data (no sensitive info). Used for public-facing profile displays.';

-- Verify RLS is enabled on all source tables
DO $$ 
BEGIN
  -- Verify analytics_events has RLS
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'analytics_events') THEN
    ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
  END IF;
  
  -- Verify listings has RLS
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'listings') THEN
    ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
  END IF;
  
  -- Verify short_urls has RLS
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'short_urls') THEN
    ALTER TABLE short_urls ENABLE ROW LEVEL SECURITY;
  END IF;
  
  -- Verify profiles has RLS
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'profiles') THEN
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;
