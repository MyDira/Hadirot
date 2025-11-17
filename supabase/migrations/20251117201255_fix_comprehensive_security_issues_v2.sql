/*
  # Comprehensive Security and Performance Fixes

  ## Overview
  This migration addresses multiple security and performance issues identified in the database audit:
  
  ## Changes
  
  ### 1. Add Missing Foreign Key Indexes
  - agencies: owner_profile_id
  - analytics_sessions: user_id
  - chat_messages: chat_id
  - chat_transcripts: user_id
  - digest_sent_listings: template_id
  - favorites: listing_id
  - feature_entitlements: agency_id, profile_id
  - filter_presets: created_by
  - knowledge_base_feedback: user_id
  
  ### 2. Optimize RLS Policies (Auth Function Caching)
  Replace direct auth function calls with subquery pattern for better performance:
  - digest_templates: All admin policies
  - digest_sends: All admin policies
  - digest_sent_listings: All admin policies
  - filter_presets: All admin policies
  - hero_banners: All admin policies
  - banner_buttons: All admin policies
  
  ### 3. Remove Unused Indexes
  Drop indexes that are not being used by queries to reduce maintenance overhead
  
  ### 4. Fix Function Search Paths
  Update functions to use immutable search paths
  
  ## Security Notes
  - All RLS policies remain restrictive by default
  - Performance improvements do not compromise security
  - Foreign key indexes improve query performance significantly
*/

-- ============================================================================
-- 1. ADD MISSING FOREIGN KEY INDEXES
-- ============================================================================

-- Index for agencies.owner_profile_id
CREATE INDEX IF NOT EXISTS idx_agencies_owner_profile_id 
  ON public.agencies(owner_profile_id);

-- Index for analytics_sessions.user_id
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user_id 
  ON public.analytics_sessions(user_id);

-- Index for chat_messages.chat_id
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id 
  ON public.chat_messages(chat_id);

-- Index for chat_transcripts.user_id
CREATE INDEX IF NOT EXISTS idx_chat_transcripts_user_id 
  ON public.chat_transcripts(user_id);

-- Index for digest_sent_listings.template_id (use different name from unused index)
CREATE INDEX IF NOT EXISTS idx_digest_sent_listings_template_id_fk 
  ON public.digest_sent_listings(template_id);

-- Index for favorites.listing_id
CREATE INDEX IF NOT EXISTS idx_favorites_listing_id 
  ON public.favorites(listing_id);

-- Index for feature_entitlements.agency_id
CREATE INDEX IF NOT EXISTS idx_feature_entitlements_agency_id 
  ON public.feature_entitlements(agency_id);

-- Index for feature_entitlements.profile_id
CREATE INDEX IF NOT EXISTS idx_feature_entitlements_profile_id 
  ON public.feature_entitlements(profile_id);

-- Index for filter_presets.created_by (use different name from unused index)
CREATE INDEX IF NOT EXISTS idx_filter_presets_created_by_fk 
  ON public.filter_presets(created_by);

-- Index for knowledge_base_feedback.user_id
CREATE INDEX IF NOT EXISTS idx_knowledge_base_feedback_user_id 
  ON public.knowledge_base_feedback(user_id);

-- ============================================================================
-- 2. OPTIMIZE RLS POLICIES - CACHE AUTH FUNCTION CALLS
-- ============================================================================

-- Helper function to check if user is admin (cached)
CREATE OR REPLACE FUNCTION public.is_admin_cached()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND is_admin = true
  );
$$;

-- digest_templates policies
DROP POLICY IF EXISTS "Admins can view all digest templates" ON public.digest_templates;
DROP POLICY IF EXISTS "Admins can create digest templates" ON public.digest_templates;
DROP POLICY IF EXISTS "Admins can update digest templates" ON public.digest_templates;
DROP POLICY IF EXISTS "Admins can delete digest templates" ON public.digest_templates;

CREATE POLICY "Admins can view all digest templates"
  ON public.digest_templates FOR SELECT
  TO authenticated
  USING ((SELECT is_admin_cached()));

CREATE POLICY "Admins can create digest templates"
  ON public.digest_templates FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT is_admin_cached()));

CREATE POLICY "Admins can update digest templates"
  ON public.digest_templates FOR UPDATE
  TO authenticated
  USING ((SELECT is_admin_cached()))
  WITH CHECK ((SELECT is_admin_cached()));

CREATE POLICY "Admins can delete digest templates"
  ON public.digest_templates FOR DELETE
  TO authenticated
  USING ((SELECT is_admin_cached()));

-- digest_sends policies
DROP POLICY IF EXISTS "Admins can view all digest sends" ON public.digest_sends;
DROP POLICY IF EXISTS "Admins can insert digest sends" ON public.digest_sends;

CREATE POLICY "Admins can view all digest sends"
  ON public.digest_sends FOR SELECT
  TO authenticated
  USING ((SELECT is_admin_cached()));

CREATE POLICY "Admins can insert digest sends"
  ON public.digest_sends FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT is_admin_cached()));

-- digest_sent_listings policies
DROP POLICY IF EXISTS "Admins can view digest sent listings" ON public.digest_sent_listings;
DROP POLICY IF EXISTS "Admins can insert digest sent listings" ON public.digest_sent_listings;

CREATE POLICY "Admins can view digest sent listings"
  ON public.digest_sent_listings FOR SELECT
  TO authenticated
  USING ((SELECT is_admin_cached()));

CREATE POLICY "Admins can insert digest sent listings"
  ON public.digest_sent_listings FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT is_admin_cached()));

-- filter_presets policies
DROP POLICY IF EXISTS "Admins can view all filter presets" ON public.filter_presets;
DROP POLICY IF EXISTS "Admins can create filter presets" ON public.filter_presets;
DROP POLICY IF EXISTS "Admins can update filter presets" ON public.filter_presets;
DROP POLICY IF EXISTS "Admins can delete filter presets" ON public.filter_presets;

CREATE POLICY "Admins can view all filter presets"
  ON public.filter_presets FOR SELECT
  TO authenticated
  USING ((SELECT is_admin_cached()));

CREATE POLICY "Admins can create filter presets"
  ON public.filter_presets FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT is_admin_cached()));

CREATE POLICY "Admins can update filter presets"
  ON public.filter_presets FOR UPDATE
  TO authenticated
  USING ((SELECT is_admin_cached()))
  WITH CHECK ((SELECT is_admin_cached()));

CREATE POLICY "Admins can delete filter presets"
  ON public.filter_presets FOR DELETE
  TO authenticated
  USING ((SELECT is_admin_cached()));

-- hero_banners policies
DROP POLICY IF EXISTS "Admins can view all banners" ON public.hero_banners;
DROP POLICY IF EXISTS "Admins can insert banners" ON public.hero_banners;
DROP POLICY IF EXISTS "Admins can update banners" ON public.hero_banners;
DROP POLICY IF EXISTS "Admins can delete banners" ON public.hero_banners;

CREATE POLICY "Admins can view all banners"
  ON public.hero_banners FOR SELECT
  TO authenticated
  USING ((SELECT is_admin_cached()));

CREATE POLICY "Admins can insert banners"
  ON public.hero_banners FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT is_admin_cached()));

CREATE POLICY "Admins can update banners"
  ON public.hero_banners FOR UPDATE
  TO authenticated
  USING ((SELECT is_admin_cached()))
  WITH CHECK ((SELECT is_admin_cached()));

CREATE POLICY "Admins can delete banners"
  ON public.hero_banners FOR DELETE
  TO authenticated
  USING ((SELECT is_admin_cached()));

-- banner_buttons policies
DROP POLICY IF EXISTS "Admins can view all buttons" ON public.banner_buttons;
DROP POLICY IF EXISTS "Admins can insert buttons" ON public.banner_buttons;
DROP POLICY IF EXISTS "Admins can update buttons" ON public.banner_buttons;
DROP POLICY IF EXISTS "Admins can delete buttons" ON public.banner_buttons;

CREATE POLICY "Admins can view all buttons"
  ON public.banner_buttons FOR SELECT
  TO authenticated
  USING ((SELECT is_admin_cached()));

CREATE POLICY "Admins can insert buttons"
  ON public.banner_buttons FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT is_admin_cached()));

CREATE POLICY "Admins can update buttons"
  ON public.banner_buttons FOR UPDATE
  TO authenticated
  USING ((SELECT is_admin_cached()))
  WITH CHECK ((SELECT is_admin_cached()));

CREATE POLICY "Admins can delete buttons"
  ON public.banner_buttons FOR DELETE
  TO authenticated
  USING ((SELECT is_admin_cached()));

-- ============================================================================
-- 3. REMOVE UNUSED INDEXES
-- ============================================================================

DROP INDEX IF EXISTS public.idx_feature_entitlements_granted_by_admin;
DROP INDEX IF EXISTS public.idx_hero_banners_active;
DROP INDEX IF EXISTS public.idx_banner_buttons_display_order;
DROP INDEX IF EXISTS public.idx_digest_templates_type;
DROP INDEX IF EXISTS public.idx_digest_templates_default;
DROP INDEX IF EXISTS public.idx_digest_templates_created_by;
DROP INDEX IF EXISTS public.idx_digest_sends_template_id;
DROP INDEX IF EXISTS public.idx_digest_sends_sent_by;
DROP INDEX IF EXISTS public.idx_digest_sent_listings_digest_send;
DROP INDEX IF EXISTS public.idx_digest_sent_listings_sent_at;
DROP INDEX IF EXISTS public.idx_filter_presets_category;
DROP INDEX IF EXISTS public.idx_filter_presets_short_code;
DROP INDEX IF EXISTS public.analytics_events_event_props_listing_id_idx;
DROP INDEX IF EXISTS public.analytics_events_props_listing_id_idx;

-- ============================================================================
-- 4. FIX FUNCTION SEARCH PATHS
-- ============================================================================

-- Fix has_feature_access function
CREATE OR REPLACE FUNCTION public.has_feature_access(
  feature_key text,
  target_profile_id uuid DEFAULT NULL,
  target_agency_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  profile_id uuid;
  agency_id uuid;
BEGIN
  profile_id := COALESCE(target_profile_id, auth.uid());
  
  IF target_agency_id IS NOT NULL THEN
    agency_id := target_agency_id;
  ELSE
    SELECT a.id INTO agency_id
    FROM public.agencies a
    WHERE a.owner_profile_id = profile_id
    LIMIT 1;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.feature_entitlements
    WHERE feature_name = feature_key
    AND (
      (profile_id IS NOT NULL AND public.feature_entitlements.profile_id = profile_id)
      OR
      (agency_id IS NOT NULL AND public.feature_entitlements.agency_id = agency_id)
    )
    AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;

-- Fix create_short_url function
CREATE OR REPLACE FUNCTION public.create_short_url(
  target_url text,
  custom_code text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  short_code text;
  base_url text;
BEGIN
  IF custom_code IS NOT NULL THEN
    short_code := custom_code;
    
    IF EXISTS (SELECT 1 FROM public.short_urls WHERE code = short_code) THEN
      RAISE EXCEPTION 'Custom code already exists';
    END IF;
  ELSE
    short_code := substr(md5(random()::text || target_url), 1, 8);
    
    WHILE EXISTS (SELECT 1 FROM public.short_urls WHERE code = short_code) LOOP
      short_code := substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    END LOOP;
  END IF;

  INSERT INTO public.short_urls (code, target_url, created_by)
  VALUES (short_code, target_url, auth.uid());

  SELECT COALESCE(
    current_setting('app.base_url', true),
    'https://yoursite.com'
  ) INTO base_url;

  RETURN base_url || '/s/' || short_code;
END;
$$;

-- ============================================================================
-- NOTES ON REMAINING ISSUES
-- ============================================================================

/*
The following issues cannot be fixed via migration and require manual configuration:

1. Multiple Permissive Policies:
   These are intentionally designed with multiple permissive policies to support
   OR conditions (e.g., "admins can see all OR users can see their own").
   This is the correct design pattern and does not need changes.

2. Security Definer Views:
   The following views intentionally use SECURITY DEFINER for analytics access:
   - listing_metrics_v1, agency_page_metrics_v1, short_url_analytics,
     chat_analytics, public_profiles
   Documented in migration 20251110195218.

3. pg_net Extension in Public Schema:
   The pg_net extension does not support SET SCHEMA command and must remain
   in the public schema. This is a known limitation of the extension.

4. Auth OTP Long Expiry:
   Change in Supabase Dashboard: Authentication > Email > OTP expiry
   Recommended: Set to less than 1 hour

5. Leaked Password Protection:
   Enable in Supabase Dashboard: Authentication > Providers > Email
   Toggle "Enable leaked password protection"

6. Postgres Version Security Patches:
   Upgrade database in Supabase Dashboard: Settings > Infrastructure
   Current: supabase-postgres-17.4.1.064
   Action: Check for and apply available updates
*/
