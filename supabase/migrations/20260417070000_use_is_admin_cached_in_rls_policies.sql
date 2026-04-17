-- Replace raw admin EXISTS subqueries in RLS policies with is_admin_cached().
--
-- Current state (from pg_policy diagnostic):
--   40 policies across 24 tables use the pattern
--   EXISTS ( SELECT 1 FROM profiles
--            WHERE profiles.id = (SELECT auth.uid())
--              AND profiles.is_admin = true )
--
-- Why change it:
--   * is_admin_cached() is a STABLE SECURITY DEFINER helper that Postgres
--     caches once per query. Raw EXISTS subqueries can be planned per-row.
--   * Single source of truth for "is caller admin". Future changes (e.g.,
--     moving admin trust to JWT app_metadata) land in one function instead
--     of 40 policies.
--
-- Pattern:
--   Each policy is DROPped and re-created. The admin check becomes
--   (SELECT public.is_admin_cached()).
--   For compound expressions like agencies_*_owner_or_admin, only the admin
--   subquery is swapped; the owner check is preserved verbatim.

-- ============================================================================
-- admin_settings
-- ============================================================================
DROP POLICY IF EXISTS "Only admins can update settings" ON public.admin_settings;
CREATE POLICY "Only admins can update settings"
  ON public.admin_settings FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- agencies
-- ============================================================================
DROP POLICY IF EXISTS "agencies_delete_admin" ON public.agencies;
CREATE POLICY "agencies_delete_admin"
  ON public.agencies FOR DELETE
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "agencies_insert_owner_or_admin" ON public.agencies;
CREATE POLICY "agencies_insert_owner_or_admin"
  ON public.agencies FOR INSERT
  TO authenticated
  WITH CHECK (
    (owner_profile_id = (SELECT auth.uid()))
    OR (SELECT public.is_admin_cached())
  );

DROP POLICY IF EXISTS "agencies_update_owner_or_admin" ON public.agencies;
CREATE POLICY "agencies_update_owner_or_admin"
  ON public.agencies FOR UPDATE
  TO authenticated
  USING (
    (owner_profile_id = (SELECT auth.uid()))
    OR (SELECT public.is_admin_cached())
  );

-- ============================================================================
-- commercial_listing_images
-- ============================================================================
DROP POLICY IF EXISTS "Admins can manage all commercial listing images" ON public.commercial_listing_images;
CREATE POLICY "Admins can manage all commercial listing images"
  ON public.commercial_listing_images FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin_cached()))
  WITH CHECK ((SELECT public.is_admin_cached()));

-- ============================================================================
-- commercial_listings
-- ============================================================================
DROP POLICY IF EXISTS "Admins can manage all commercial listings" ON public.commercial_listings;
CREATE POLICY "Admins can manage all commercial listings"
  ON public.commercial_listings FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin_cached()))
  WITH CHECK ((SELECT public.is_admin_cached()));

-- ============================================================================
-- concierge_submissions
-- ============================================================================
DROP POLICY IF EXISTS "Admins can update submissions" ON public.concierge_submissions;
CREATE POLICY "Admins can update submissions"
  ON public.concierge_submissions FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin_cached()))
  WITH CHECK ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "Admins can view all submissions" ON public.concierge_submissions;
CREATE POLICY "Admins can view all submissions"
  ON public.concierge_submissions FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- concierge_subscriptions
-- ============================================================================
DROP POLICY IF EXISTS "Admins can update subscriptions" ON public.concierge_subscriptions;
CREATE POLICY "Admins can update subscriptions"
  ON public.concierge_subscriptions FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin_cached()))
  WITH CHECK ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.concierge_subscriptions;
CREATE POLICY "Admins can view all subscriptions"
  ON public.concierge_subscriptions FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- daily_admin_digest_config
-- ============================================================================
DROP POLICY IF EXISTS "Admins can update digest config" ON public.daily_admin_digest_config;
CREATE POLICY "Admins can update digest config"
  ON public.daily_admin_digest_config FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin_cached()))
  WITH CHECK ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "Admins can view digest config" ON public.daily_admin_digest_config;
CREATE POLICY "Admins can view digest config"
  ON public.daily_admin_digest_config FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- daily_admin_digest_logs
-- ============================================================================
DROP POLICY IF EXISTS "Admins can view digest logs" ON public.daily_admin_digest_logs;
CREATE POLICY "Admins can view digest logs"
  ON public.daily_admin_digest_logs FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- daily_admin_digest_sent_listings
-- ============================================================================
DROP POLICY IF EXISTS "Admins can view sent listings" ON public.daily_admin_digest_sent_listings;
CREATE POLICY "Admins can view sent listings"
  ON public.daily_admin_digest_sent_listings FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- digest_global_settings
-- ============================================================================
DROP POLICY IF EXISTS "Admins can insert global digest settings" ON public.digest_global_settings;
CREATE POLICY "Admins can insert global digest settings"
  ON public.digest_global_settings FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "Admins can update global digest settings" ON public.digest_global_settings;
CREATE POLICY "Admins can update global digest settings"
  ON public.digest_global_settings FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin_cached()))
  WITH CHECK ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "Admins can view global digest settings" ON public.digest_global_settings;
CREATE POLICY "Admins can view global digest settings"
  ON public.digest_global_settings FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- featured_purchases
-- ============================================================================
DROP POLICY IF EXISTS "Admins can insert purchases" ON public.featured_purchases;
CREATE POLICY "Admins can insert purchases"
  ON public.featured_purchases FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "Admins can update purchases" ON public.featured_purchases;
CREATE POLICY "Admins can update purchases"
  ON public.featured_purchases FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin_cached()))
  WITH CHECK ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "Admins can view all purchases" ON public.featured_purchases;
CREATE POLICY "Admins can view all purchases"
  ON public.featured_purchases FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- footer_sections
-- ============================================================================
DROP POLICY IF EXISTS "Only admins can manage footer sections" ON public.footer_sections;
CREATE POLICY "Only admins can manage footer sections"
  ON public.footer_sections FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- knowledge_base_articles
-- ============================================================================
DROP POLICY IF EXISTS "Admins can manage articles" ON public.knowledge_base_articles;
CREATE POLICY "Admins can manage articles"
  ON public.knowledge_base_articles FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- knowledge_base_categories
-- ============================================================================
DROP POLICY IF EXISTS "Admins can manage categories" ON public.knowledge_base_categories;
CREATE POLICY "Admins can manage categories"
  ON public.knowledge_base_categories FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- listing_contact_submissions
-- ============================================================================
DROP POLICY IF EXISTS "Admins can view all contact submissions" ON public.listing_contact_submissions;
CREATE POLICY "Admins can view all contact submissions"
  ON public.listing_contact_submissions FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- listing_images
-- ============================================================================
DROP POLICY IF EXISTS "Admins can manage all listing images" ON public.listing_images;
CREATE POLICY "Admins can manage all listing images"
  ON public.listing_images FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin_cached()))
  WITH CHECK ((SELECT public.is_admin_cached()));

-- ============================================================================
-- listings
-- ============================================================================
DROP POLICY IF EXISTS "Admins can manage all listings" ON public.listings;
CREATE POLICY "Admins can manage all listings"
  ON public.listings FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- modal_popups
-- ============================================================================
DROP POLICY IF EXISTS "Admins can delete modals" ON public.modal_popups;
CREATE POLICY "Admins can delete modals"
  ON public.modal_popups FOR DELETE
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "Admins can insert modals" ON public.modal_popups;
CREATE POLICY "Admins can insert modals"
  ON public.modal_popups FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "Admins can read all modals" ON public.modal_popups;
CREATE POLICY "Admins can read all modals"
  ON public.modal_popups FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "Admins can update modals" ON public.modal_popups;
CREATE POLICY "Admins can update modals"
  ON public.modal_popups FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- modal_user_interactions
-- ============================================================================
DROP POLICY IF EXISTS "Admins can read all interactions" ON public.modal_user_interactions;
CREATE POLICY "Admins can read all interactions"
  ON public.modal_user_interactions FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- profiles (admin update any profile)
-- The raw version aliased the subquery to profiles_1 to avoid ambiguity.
-- is_admin_cached() is SECURITY DEFINER and does its own lookup, so no alias
-- is needed.
-- ============================================================================
DROP POLICY IF EXISTS "Allow admins to update any profile" ON public.profiles;
CREATE POLICY "Allow admins to update any profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- sales_permission_requests
-- ============================================================================
DROP POLICY IF EXISTS "Admins can update sales permission requests" ON public.sales_permission_requests;
CREATE POLICY "Admins can update sales permission requests"
  ON public.sales_permission_requests FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin_cached()))
  WITH CHECK ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "Admins can view all sales permission requests" ON public.sales_permission_requests;
CREATE POLICY "Admins can view all sales permission requests"
  ON public.sales_permission_requests FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

-- ============================================================================
-- scraped_listings
-- ============================================================================
DROP POLICY IF EXISTS "Admins can read all scraped_listings" ON public.scraped_listings;
CREATE POLICY "Admins can read all scraped_listings"
  ON public.scraped_listings FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "Admins can update scraped_listings" ON public.scraped_listings;
CREATE POLICY "Admins can update scraped_listings"
  ON public.scraped_listings FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin_cached()))
  WITH CHECK ((SELECT public.is_admin_cached()));

-- ============================================================================
-- short_urls
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated admins can insert short URLs" ON public.short_urls;
CREATE POLICY "Authenticated admins can insert short URLs"
  ON public.short_urls FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_admin_cached()));

-- ============================================================================
-- static_pages
-- ============================================================================
DROP POLICY IF EXISTS "Admins can delete static pages" ON public.static_pages;
CREATE POLICY "Admins can delete static pages"
  ON public.static_pages FOR DELETE
  TO authenticated
  USING ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "Admins can insert static pages" ON public.static_pages;
CREATE POLICY "Admins can insert static pages"
  ON public.static_pages FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_admin_cached()));

DROP POLICY IF EXISTS "Admins can update static pages" ON public.static_pages;
CREATE POLICY "Admins can update static pages"
  ON public.static_pages FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin_cached()));
