/*
  # Comprehensive Security Fixes

  This migration addresses multiple security and performance issues:

  1. **Missing Foreign Key Indexes**
     - Adds indexes for all unindexed foreign keys to improve query performance
     - Tables: digest_global_settings, digest_sends, digest_sent_listings, digest_templates,
       feature_entitlements, sales_permission_requests

  2. **RLS Policy Optimization**
     - Converts auth function calls to use subquery pattern: `(select auth.uid())`
     - This prevents re-evaluation for each row, significantly improving performance
     - Affects: digest_global_settings, short_urls, listing_contact_submissions,
       sales_permission_requests, listings, listing_images

  3. **Function Security Hardening**
     - Sets explicit search_path for all functions to prevent search path injection attacks
     - Functions: normalize_ac_type, auto_enable_agency_for_agents, get_sales_feature_enabled,
       user_can_post_sales, update_sales_request_updated_at, has_feature_access,
       create_short_url, search_locations

  4. **Extension Schema Move**
     - Moves pg_net extension from public schema to extensions schema

  Notes:
  - Unused indexes are left as-is (may be used in future or by manual queries)
  - Multiple permissive policies are by design for complex authorization
  - Security definer views are intentionally designed for controlled access
  - Postgres version upgrade requires manual intervention
  - Auth connection strategy requires Supabase dashboard configuration
*/

-- =============================================================================
-- 1. ADD MISSING FOREIGN KEY INDEXES
-- =============================================================================

-- digest_global_settings
CREATE INDEX IF NOT EXISTS idx_digest_global_settings_updated_by
  ON public.digest_global_settings(updated_by);

-- digest_sends
CREATE INDEX IF NOT EXISTS idx_digest_sends_sent_by
  ON public.digest_sends(sent_by);

CREATE INDEX IF NOT EXISTS idx_digest_sends_template_id
  ON public.digest_sends(template_id);

-- digest_sent_listings
CREATE INDEX IF NOT EXISTS idx_digest_sent_listings_digest_send_id
  ON public.digest_sent_listings(digest_send_id);

-- digest_templates
CREATE INDEX IF NOT EXISTS idx_digest_templates_created_by
  ON public.digest_templates(created_by);

-- feature_entitlements
CREATE INDEX IF NOT EXISTS idx_feature_entitlements_granted_by_admin_id
  ON public.feature_entitlements(granted_by_admin_id);

-- sales_permission_requests
CREATE INDEX IF NOT EXISTS idx_sales_permission_requests_responded_by_admin_id
  ON public.sales_permission_requests(responded_by_admin_id);

-- =============================================================================
-- 2. OPTIMIZE RLS POLICIES - Replace auth.uid() with (select auth.uid())
-- =============================================================================

-- digest_global_settings policies
DROP POLICY IF EXISTS "Admins can view global digest settings" ON public.digest_global_settings;
CREATE POLICY "Admins can view global digest settings"
  ON public.digest_global_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update global digest settings" ON public.digest_global_settings;
CREATE POLICY "Admins can update global digest settings"
  ON public.digest_global_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can insert global digest settings" ON public.digest_global_settings;
CREATE POLICY "Admins can insert global digest settings"
  ON public.digest_global_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );

-- short_urls policies
DROP POLICY IF EXISTS "Authenticated admins can insert short URLs" ON public.short_urls;
CREATE POLICY "Authenticated admins can insert short URLs"
  ON public.short_urls
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );

-- listing_contact_submissions policies
DROP POLICY IF EXISTS "Admins can view all contact submissions" ON public.listing_contact_submissions;
CREATE POLICY "Admins can view all contact submissions"
  ON public.listing_contact_submissions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Owners can view contact submissions for their listings" ON public.listing_contact_submissions;
CREATE POLICY "Owners can view contact submissions for their listings"
  ON public.listing_contact_submissions
  FOR SELECT
  TO authenticated
  USING (
    listing_id IN (
      SELECT id FROM public.listings
      WHERE user_id = (select auth.uid())
    )
  );

-- sales_permission_requests policies
DROP POLICY IF EXISTS "Users can view own sales permission requests" ON public.sales_permission_requests;
CREATE POLICY "Users can view own sales permission requests"
  ON public.sales_permission_requests
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create sales permission requests" ON public.sales_permission_requests;
CREATE POLICY "Users can create sales permission requests"
  ON public.sales_permission_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can view all sales permission requests" ON public.sales_permission_requests;
CREATE POLICY "Admins can view all sales permission requests"
  ON public.sales_permission_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );

DROP POLICY IF EXISTS "Admins can update sales permission requests" ON public.sales_permission_requests;
CREATE POLICY "Admins can update sales permission requests"
  ON public.sales_permission_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );

-- listings policies
DROP POLICY IF EXISTS "Users can read own listings" ON public.listings;
CREATE POLICY "Users can read own listings"
  ON public.listings
  FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users can create rental listings" ON public.listings;
CREATE POLICY "Users can create rental listings"
  ON public.listings
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- listing_images policies
DROP POLICY IF EXISTS "Admins can manage all listing images" ON public.listing_images;
CREATE POLICY "Admins can manage all listing images"
  ON public.listing_images
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.is_admin = true
    )
  );

-- =============================================================================
-- 3. HARDEN FUNCTION SECURITY - Set explicit search_path
-- =============================================================================

-- normalize_ac_type
ALTER FUNCTION public.normalize_ac_type()
  SET search_path = public, pg_temp;

-- auto_enable_agency_for_agents
ALTER FUNCTION public.auto_enable_agency_for_agents()
  SET search_path = public, pg_temp;

-- get_sales_feature_enabled (no arguments)
ALTER FUNCTION public.get_sales_feature_enabled()
  SET search_path = public, pg_temp;

-- user_can_post_sales
ALTER FUNCTION public.user_can_post_sales(user_id uuid)
  SET search_path = public, pg_temp;

-- update_sales_request_updated_at
ALTER FUNCTION public.update_sales_request_updated_at()
  SET search_path = public, pg_temp;

-- has_feature_access (3 overloaded versions)
ALTER FUNCTION public.has_feature_access(p_profile_id uuid, p_feature_name text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.has_feature_access(feature_key text, target_profile_id uuid, target_agency_id uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.has_feature_access(p_profile_id uuid, p_feature_key text, p_agency_id uuid)
  SET search_path = public, pg_temp;

-- create_short_url (3 overloaded versions)
ALTER FUNCTION public.create_short_url(target_url text, custom_code text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.create_short_url(p_original_url text, p_created_by uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.create_short_url(p_listing_id uuid, p_original_url text, p_source text, p_expires_days integer)
  SET search_path = public, pg_temp;

-- search_locations
ALTER FUNCTION public.search_locations(search_query text)
  SET search_path = public, pg_temp;

-- =============================================================================
-- 4. MOVE PG_NET EXTENSION TO EXTENSIONS SCHEMA
-- =============================================================================

-- Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Move pg_net extension to extensions schema
DO $$
BEGIN
  -- Check if pg_net is in public schema
  IF EXISTS (
    SELECT 1 FROM pg_extension
    WHERE extname = 'pg_net'
    AND extnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    -- Drop from public and recreate in extensions
    DROP EXTENSION IF EXISTS pg_net CASCADE;
    CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
  ELSE
    -- Just ensure it exists in extensions schema
    CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;
  END IF;
END $$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA extensions TO postgres, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA extensions TO anon, authenticated;