/*
  # Comprehensive Security Fixes
  
  ## Security Issues Addressed
  
  1. **Unindexed Foreign Keys**
     - Add index for feature_entitlements.granted_by_admin_id
  
  2. **Auth RLS Performance Issues**
     - Fix all RLS policies to use subqueries instead of direct auth function calls
     - Affects: daily_admin_digest_*, feature_entitlements tables
  
  3. **Duplicate Indexes**
     - Drop duplicate index analytics_events_listing_id_idx (keeping the newer one)
  
  4. **Unused Indexes**
     - Drop indexes that are not being used to reduce maintenance overhead
  
  5. **Function Search Paths**
     - Fix functions to use immutable search_path
  
  ## Impact
  - Improved query performance at scale
  - Reduced index maintenance overhead
  - Better security posture
  - No breaking changes to application functionality
*/

-- =====================================================
-- 1. FIX UNINDEXED FOREIGN KEYS
-- =====================================================

-- Add index for feature_entitlements.granted_by_admin_id foreign key
CREATE INDEX IF NOT EXISTS idx_feature_entitlements_granted_by_admin 
ON feature_entitlements(granted_by_admin_id)
WHERE granted_by_admin_id IS NOT NULL;

-- =====================================================
-- 2. FIX AUTH RLS POLICIES TO USE SUBQUERIES
-- =====================================================

-- Fix daily_admin_digest_sent_listings policies
DROP POLICY IF EXISTS "Admins can view sent listings" ON daily_admin_digest_sent_listings;
CREATE POLICY "Admins can view sent listings"
  ON daily_admin_digest_sent_listings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
        AND profiles.is_admin = true
    )
  );

-- Fix daily_admin_digest_logs policies
DROP POLICY IF EXISTS "Admins can view digest logs" ON daily_admin_digest_logs;
CREATE POLICY "Admins can view digest logs"
  ON daily_admin_digest_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
        AND profiles.is_admin = true
    )
  );

-- Fix daily_admin_digest_config policies
DROP POLICY IF EXISTS "Admins can update digest config" ON daily_admin_digest_config;
CREATE POLICY "Admins can update digest config"
  ON daily_admin_digest_config
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
        AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
        AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can view digest config" ON daily_admin_digest_config;
CREATE POLICY "Admins can view digest config"
  ON daily_admin_digest_config
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
        AND profiles.is_admin = true
    )
  );

-- Fix feature_entitlements policies
DROP POLICY IF EXISTS "Only admins can manage entitlements" ON feature_entitlements;
CREATE POLICY "Only admins can manage entitlements"
  ON feature_entitlements
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
        AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = (SELECT auth.uid()) 
        AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Users can read own entitlements" ON feature_entitlements;
CREATE POLICY "Users can read own entitlements"
  ON feature_entitlements
  FOR SELECT
  TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    OR agency_id IN (
      SELECT id FROM agencies 
      WHERE owner_profile_id = (SELECT auth.uid())
    )
  );

-- =====================================================
-- 3. DROP DUPLICATE INDEXES
-- =====================================================

-- Drop the older duplicate index (keeping analytics_events_event_props_listing_id_idx)
DROP INDEX IF EXISTS analytics_events_listing_id_idx;

-- =====================================================
-- 4. DROP UNUSED INDEXES
-- =====================================================

-- Drop unused indexes that are not being utilized by queries
DROP INDEX IF EXISTS idx_daily_admin_digest_logs_success;
DROP INDEX IF EXISTS favorites_user_listing_idx;
DROP INDEX IF EXISTS agencies_owner_profile_id_idx;
DROP INDEX IF EXISTS analytics_sessions_user_id_idx;
DROP INDEX IF EXISTS knowledge_base_feedback_user_id_idx;
DROP INDEX IF EXISTS analytics_events_session_id_idx;
DROP INDEX IF EXISTS idx_feature_entitlements_profile;
DROP INDEX IF EXISTS idx_feature_entitlements_agency;
DROP INDEX IF EXISTS chat_messages_chat_id_idx;
DROP INDEX IF EXISTS idx_feature_entitlements_feature;
DROP INDEX IF EXISTS chat_transcripts_user_id_idx;
DROP INDEX IF EXISTS favorites_listing_id_idx;
DROP INDEX IF EXISTS idx_feature_entitlements_active;
DROP INDEX IF EXISTS idx_profiles_stripe_customer;
DROP INDEX IF EXISTS idx_listings_payment_status;
DROP INDEX IF EXISTS idx_short_urls_created_at;

-- Keep these analytics indexes as they were just added and are needed
-- DROP INDEX IF EXISTS analytics_events_event_props_listing_id_idx;
-- DROP INDEX IF EXISTS analytics_events_props_listing_id_idx;

-- =====================================================
-- 5. FIX FUNCTION SEARCH PATHS
-- =====================================================

-- Fix has_feature_access function
CREATE OR REPLACE FUNCTION has_feature_access(
  p_profile_id uuid,
  p_feature_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM feature_entitlements
    WHERE profile_id = p_profile_id
      AND feature_name = p_feature_name
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;

-- Fix trigger_daily_digest_if_time function
CREATE OR REPLACE FUNCTION trigger_daily_digest_if_time()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  config_row daily_admin_digest_config%ROWTYPE;
  last_sent_row daily_admin_digest_logs%ROWTYPE;
  current_ny_time time;
  current_ny_date date;
  should_send boolean;
BEGIN
  -- Get config
  SELECT * INTO config_row FROM daily_admin_digest_config LIMIT 1;
  
  IF NOT FOUND OR NOT config_row.enabled THEN
    RETURN;
  END IF;

  -- Get current NY time
  current_ny_time := (now() AT TIME ZONE 'America/New_York')::time;
  current_ny_date := (now() AT TIME ZONE 'America/New_York')::date;

  -- Check if we should send
  should_send := false;

  IF current_ny_time >= config_row.send_time AND 
     current_ny_time < (config_row.send_time + interval '1 hour') THEN
    
    SELECT * INTO last_sent_row 
    FROM daily_admin_digest_logs 
    ORDER BY sent_at DESC 
    LIMIT 1;

    IF NOT FOUND OR last_sent_row.sent_at::date < current_ny_date THEN
      should_send := true;
    END IF;
  END IF;

  IF should_send THEN
    PERFORM net.http_post(
      url := current_setting('app.settings.supabase_url') || '/functions/v1/send-daily-admin-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
      ),
      body := '{}'::jsonb
    );
  END IF;
END;
$$;

-- Fix generate_short_code function
CREATE OR REPLACE FUNCTION generate_short_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  chars text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i int;
  code_exists boolean;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    
    SELECT EXISTS(SELECT 1 FROM short_urls WHERE short_code = result) INTO code_exists;
    
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  RETURN result;
END;
$$;

-- Fix increment_short_url_clicks function
CREATE OR REPLACE FUNCTION increment_short_url_clicks(p_short_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE short_urls 
  SET 
    click_count = click_count + 1,
    last_clicked_at = now()
  WHERE short_code = p_short_code;
END;
$$;

-- Fix create_short_url function
CREATE OR REPLACE FUNCTION create_short_url(
  p_original_url text,
  p_created_by uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_short_code text;
BEGIN
  v_short_code := generate_short_code();
  
  INSERT INTO short_urls (short_code, original_url, created_by)
  VALUES (v_short_code, p_original_url, p_created_by);
  
  RETURN v_short_code;
END;
$$;

-- =====================================================
-- 6. ADD COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON INDEX idx_feature_entitlements_granted_by_admin IS 
'Index for foreign key lookup performance on granted_by_admin_id column';

COMMENT ON POLICY "Admins can view sent listings" ON daily_admin_digest_sent_listings IS
'Uses subquery for auth.uid() to improve RLS performance at scale';

COMMENT ON POLICY "Admins can view digest logs" ON daily_admin_digest_logs IS
'Uses subquery for auth.uid() to improve RLS performance at scale';

COMMENT ON POLICY "Admins can update digest config" ON daily_admin_digest_config IS
'Uses subquery for auth.uid() to improve RLS performance at scale';

COMMENT ON POLICY "Admins can view digest config" ON daily_admin_digest_config IS
'Uses subquery for auth.uid() to improve RLS performance at scale';

COMMENT ON POLICY "Only admins can manage entitlements" ON feature_entitlements IS
'Uses subquery for auth.uid() to improve RLS performance at scale';

COMMENT ON POLICY "Users can read own entitlements" ON feature_entitlements IS
'Uses subquery for auth.uid() to improve RLS performance at scale';
