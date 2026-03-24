/*
  # Create Commercial Listings System

  ## Summary
  Creates a full commercial real estate listings system parallel to the residential `listings` table.
  Commercial listings are an independent domain with their own images, favorites, expiration, and
  anonymization RPCs. All patterns mirror the residential system exactly.

  ## New Tables

  ### 1. commercial_listings
  Main commercial listings table with:
  - All shared columns from residential listings (approval flow, expiration, featured, contact, etc.)
  - last_deactivation_email_sent_at (timestamptz) — used by send-deactivation-emails edge function
  - is_commercial (boolean, always true) — for query clarity
  - commercial_space_type — core space categorization
  - commercial_subtype — optional subcategory
  - Spec columns: available_sf, price_per_sf_year, lease_type, build_out_condition, floor_level, ceiling_height_ft
  - Type-specific spec row fields: frontage, clear height, loading docks, kitchen exhaust, etc.
  - Building & infrastructure: total_building_sf, zoning, electrical, HVAC, parking, etc.
  - Lease term columns: cam_per_sf, ti_allowance_per_sf, renewal_options, escalation, etc.
  - Sale financial columns: cap_rate, noi, property_taxes_annual, tenancy_type, etc.

  ### 2. commercial_listing_images
  Mirrors listing_images exactly. FK to commercial_listings ON DELETE CASCADE.

  ### 3. commercial_favorites
  Mirrors favorites. FK to commercial_listings ON DELETE CASCADE.
  Unique constraint on (user_id, listing_id).

  ## Security
  - RLS enabled on all 3 tables
  - commercial_listings: 7 policies (public read active+approved, auth own CRUD, admin ALL, banned block)
  - commercial_listing_images: 3 policies (public read, auth own manage, admin ALL)
  - commercial_favorites: 3 policies (auth own SELECT/INSERT/DELETE)

  ## RPCs
  - auto_inactivate_old_commercial_listings() — mirrors auto_inactivate_old_listings()
  - auto_delete_very_old_commercial_listings() — mirrors auto_delete_very_old_listings()

  ## Notes
  - listing_type uses plain text (not the residential enum type) for independence
  - updated_at trigger uses existing update_updated_at_column() function
  - Deletion RPC references storage buckets: commercial-listing-images, commercial-listing-videos
    (buckets must be provisioned separately; storage errors are silently caught)
*/

-- ============================================================
-- TABLE: commercial_listings
-- ============================================================
CREATE TABLE IF NOT EXISTS commercial_listings (
  -- Identity
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  agency_id uuid,

  -- Listing classification
  listing_type text NOT NULL DEFAULT 'rental',
  is_commercial boolean NOT NULL DEFAULT true,

  -- Core details
  title text,
  description text,

  -- Location
  neighborhood text,
  full_address text,
  cross_street_a text,
  cross_street_b text,
  latitude numeric,
  longitude numeric,

  -- Pricing
  price numeric,
  asking_price numeric,
  call_for_price boolean NOT NULL DEFAULT false,

  -- Contact
  contact_name text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',

  -- Featured / boost
  is_featured boolean NOT NULL DEFAULT false,
  featured_expires_at timestamptz,
  featured_started_at timestamptz,
  featured_plan text,

  -- Lifecycle
  is_active boolean NOT NULL DEFAULT true,
  approved boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  deactivated_at timestamptz,
  last_published_at timestamptz,
  last_deactivation_email_sent_at timestamptz,

  -- Metrics
  views integer NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  direct_views integer NOT NULL DEFAULT 0,

  -- Admin-assigned metadata
  admin_custom_agency_name text,
  admin_listing_type_display text,

  -- Media
  video_url text,
  video_thumbnail_url text,

  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- ── Commercial-specific core ──────────────────────────────
  commercial_space_type text NOT NULL DEFAULT 'office',
  commercial_subtype text,
  available_sf integer,
  price_per_sf_year numeric,
  lease_type text,
  build_out_condition text,
  floor_level text,
  ceiling_height_ft numeric,

  -- ── Type-specific spec fields ─────────────────────────────
  frontage_ft numeric,
  clear_height_ft numeric,
  loading_docks integer,
  drive_in_doors integer,
  building_class text,
  exam_rooms integer,
  kitchen_exhaust boolean,
  grease_trap boolean,
  corner_location boolean,
  three_phase_power boolean,
  private_offices integer,
  ada_accessible boolean,
  separate_entrance boolean,
  previous_use text,
  seating_capacity integer,
  gas_line boolean,

  -- ── Building & infrastructure ─────────────────────────────
  total_building_sf integer,
  construction_type text,
  parking_spaces integer,
  parking_type text,
  parking_ratio text,
  signage_rights boolean,
  private_entrance boolean,
  elevator_count integer,
  freight_elevator_count integer,
  zoning_code text,
  sprinkler_type text,
  electrical_amps integer,
  electrical_voltage text,
  rail_access boolean,
  column_spacing text,
  hvac_type text,
  foot_traffic_vpd integer,
  liquor_license_transferable boolean,
  conference_rooms integer,
  capacity_min integer,
  capacity_max integer,
  layout_type text,
  plumbing_wet_columns boolean,
  waiting_room boolean,
  natural_light boolean,
  ventilation boolean,
  moisture_waterproofing boolean,
  outdoor_space text,
  permitted_uses_commercial text,
  use_restrictions text,
  occupancy_limit integer,
  office_warehouse_ratio text,
  floor_load_capacity text,
  truck_court_depth text,
  crane_capacity text,
  use_breakdown text,
  current_rental_income numeric,
  year_built integer,
  year_renovated integer,
  number_of_floors integer,
  unit_count integer,

  -- ── Lease terms (rental) ──────────────────────────────────
  lease_term_text text,
  cam_per_sf numeric,
  expense_stop_per_sf numeric,
  ti_allowance_per_sf numeric,
  renewal_options text,
  escalation text,
  sublease boolean,
  security_deposit text,
  available_date text,

  -- ── Sale financials ───────────────────────────────────────
  cap_rate numeric,
  noi numeric,
  property_taxes_annual numeric,
  tenancy_type text,
  current_lease_tenant text,
  current_lease_expiration date,
  current_lease_rent numeric
);

-- ============================================================
-- TABLE: commercial_listing_images
-- ============================================================
CREATE TABLE IF NOT EXISTS commercial_listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES commercial_listings(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  is_featured boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- TABLE: commercial_favorites
-- ============================================================
CREATE TABLE IF NOT EXISTS commercial_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  listing_id uuid NOT NULL REFERENCES commercial_listings(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, listing_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_commercial_listings_is_active
  ON commercial_listings (is_active);

CREATE INDEX IF NOT EXISTS idx_commercial_listings_approved
  ON commercial_listings (approved);

CREATE INDEX IF NOT EXISTS idx_commercial_listings_listing_type
  ON commercial_listings (listing_type);

CREATE INDEX IF NOT EXISTS idx_commercial_listings_space_type
  ON commercial_listings (commercial_space_type);

CREATE INDEX IF NOT EXISTS idx_commercial_listings_neighborhood
  ON commercial_listings (neighborhood);

CREATE INDEX IF NOT EXISTS idx_commercial_listings_lat_lng
  ON commercial_listings (latitude, longitude);

CREATE INDEX IF NOT EXISTS idx_commercial_listings_user_id
  ON commercial_listings (user_id);

CREATE INDEX IF NOT EXISTS idx_commercial_listings_agency_id
  ON commercial_listings (agency_id);

CREATE INDEX IF NOT EXISTS idx_commercial_listings_expires_at
  ON commercial_listings (expires_at);

CREATE INDEX IF NOT EXISTS idx_commercial_listings_is_featured
  ON commercial_listings (is_featured);

CREATE INDEX IF NOT EXISTS idx_commercial_listing_images_listing_id
  ON commercial_listing_images (listing_id);

CREATE INDEX IF NOT EXISTS idx_commercial_favorites_user_id
  ON commercial_favorites (user_id);

CREATE INDEX IF NOT EXISTS idx_commercial_favorites_listing_id
  ON commercial_favorites (listing_id);

-- ============================================================
-- TRIGGER: updated_at
-- ============================================================
CREATE TRIGGER set_commercial_listings_updated_at
  BEFORE UPDATE ON commercial_listings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE commercial_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_listing_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE commercial_favorites ENABLE ROW LEVEL SECURITY;

-- ── commercial_listings policies ──────────────────────────────

CREATE POLICY "Anyone can view active approved commercial listings"
  ON commercial_listings
  FOR SELECT
  TO public
  USING (is_active = true AND approved = true);

CREATE POLICY "Authenticated users can view own commercial listings"
  ON commercial_listings
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Authenticated users can insert own commercial listings"
  ON commercial_listings
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Banned users cannot insert commercial listings"
  ON commercial_listings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.is_banned = true
    )
  );

CREATE POLICY "Authenticated users can update own commercial listings"
  ON commercial_listings
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Authenticated users can delete own commercial listings"
  ON commercial_listings
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Admins can manage all commercial listings"
  ON commercial_listings
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

-- ── commercial_listing_images policies ────────────────────────

CREATE POLICY "Anyone can view commercial listing images"
  ON commercial_listing_images
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM commercial_listings
      WHERE commercial_listings.id = commercial_listing_images.listing_id
        AND commercial_listings.is_active = true
    )
  );

CREATE POLICY "Users can manage own commercial listing images"
  ON commercial_listing_images
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM commercial_listings
      WHERE commercial_listings.id = commercial_listing_images.listing_id
        AND commercial_listings.user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins can manage all commercial listing images"
  ON commercial_listing_images
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

-- ── commercial_favorites policies ─────────────────────────────

CREATE POLICY "Users can read own commercial favorites"
  ON commercial_favorites
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own commercial favorites"
  ON commercial_favorites
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own commercial favorites"
  ON commercial_favorites
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================
-- RPC: auto_inactivate_old_commercial_listings
-- Mirrors auto_inactivate_old_listings() exactly, targeting commercial_listings
-- ============================================================
CREATE OR REPLACE FUNCTION auto_inactivate_old_commercial_listings()
RETURNS TABLE (affected_count integer, affected_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_ids uuid[];
  affected_count integer;
  v_rental_days integer;
  v_sale_days integer;
BEGIN
  SELECT rental_active_days, sale_active_days
  INTO v_rental_days, v_sale_days
  FROM admin_settings LIMIT 1;

  v_rental_days := COALESCE(v_rental_days, 30);
  v_sale_days   := COALESCE(v_sale_days, 30);

  SELECT
    array_agg(id),
    COUNT(*)::integer
  INTO
    affected_ids,
    affected_count
  FROM commercial_listings
  WHERE
    is_active = true
    AND approved = true
    AND (
      (
        expires_at IS NOT NULL
        AND last_published_at IS NOT NULL
        AND GREATEST(
          expires_at,
          last_published_at + (
            CASE WHEN listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
            * INTERVAL '1 day'
          )
        ) < NOW()
      )
      OR (
        expires_at IS NOT NULL
        AND last_published_at IS NULL
        AND expires_at < NOW()
      )
      OR (
        expires_at IS NULL
        AND last_published_at IS NOT NULL
        AND last_published_at < NOW() - (
          CASE WHEN listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
          * INTERVAL '1 day'
        )
      )
    );

  IF affected_ids IS NULL OR affected_count = 0 THEN
    affected_ids  := ARRAY[]::uuid[];
    affected_count := 0;
  ELSE
    UPDATE commercial_listings
    SET
      is_active     = false,
      deactivated_at = NOW(),
      updated_at    = NOW()
    WHERE id = ANY(affected_ids);
  END IF;

  RETURN QUERY SELECT affected_count, affected_ids;
END;
$$;

-- ============================================================
-- RPC: auto_delete_very_old_commercial_listings
-- Mirrors auto_delete_very_old_listings() exactly, targeting commercial tables
-- Anonymizes rows (user_id = NULL) rather than hard-deleting them
-- ============================================================
CREATE OR REPLACE FUNCTION auto_delete_very_old_commercial_listings()
RETURNS TABLE (affected_count integer, affected_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_ids   uuid[];
  affected_count integer;
  listing_record RECORD;
  image_record   RECORD;
BEGIN
  SELECT
    array_agg(id),
    COUNT(*)::integer
  INTO
    affected_ids,
    affected_count
  FROM commercial_listings
  WHERE
    is_active       = false
    AND deactivated_at IS NOT NULL
    AND deactivated_at < NOW() - INTERVAL '30 days'
    AND user_id IS NOT NULL;

  IF affected_ids IS NULL OR affected_count = 0 THEN
    affected_ids   := ARRAY[]::uuid[];
    affected_count := 0;
  ELSE
    FOR listing_record IN
      SELECT id, video_url
      FROM commercial_listings
      WHERE id = ANY(affected_ids)
    LOOP
      FOR image_record IN
        SELECT image_url
        FROM commercial_listing_images
        WHERE listing_id = listing_record.id
      LOOP
        BEGIN
          DELETE FROM storage.objects
          WHERE bucket_id = 'commercial-listing-images'
            AND name LIKE listing_record.id::text || '/%';
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END LOOP;

      IF listing_record.video_url IS NOT NULL THEN
        BEGIN
          DELETE FROM storage.objects
          WHERE bucket_id = 'commercial-listing-videos'
            AND name LIKE listing_record.id::text || '/%';
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;

      DELETE FROM commercial_listing_images
      WHERE listing_id = listing_record.id;

      UPDATE commercial_listings
      SET
        user_id    = NULL,
        video_url  = NULL,
        updated_at = NOW()
      WHERE id = listing_record.id;
    END LOOP;
  END IF;

  RETURN QUERY SELECT affected_count, affected_ids;
END;
$$;
