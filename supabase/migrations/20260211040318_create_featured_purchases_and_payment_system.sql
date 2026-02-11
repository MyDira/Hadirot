/*
  # Featured Purchases & Stripe Payment System

  1. New Tables
    - `featured_purchases`
      - `id` (uuid, primary key)
      - `listing_id` (uuid, FK to listings)
      - `user_id` (uuid, FK to auth.users)
      - `stripe_checkout_session_id` (text, nullable)
      - `stripe_payment_intent_id` (text, nullable)
      - `plan` (text, one of: 7day, 14day, 30day)
      - `amount_cents` (integer)
      - `status` (text, one of: pending, paid, active, expired, cancelled, refunded, free)
      - `purchased_at` (timestamptz)
      - `featured_start` (timestamptz)
      - `featured_end` (timestamptz)
      - `duration_days` (integer)
      - `is_admin_granted` (boolean)
      - `granted_by_admin_id` (uuid, FK to auth.users)
      - `promo_code_used` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Indexes
    - `idx_featured_purchases_listing` on listing_id
    - `idx_featured_purchases_user` on user_id
    - `idx_featured_purchases_status` on status
    - `idx_featured_purchases_stripe_session` on stripe_checkout_session_id

  3. Security
    - RLS enabled on `featured_purchases`
    - Users can view their own purchases
    - Admins can view all purchases
    - Inserts/updates handled by service role (edge functions)

  4. Updated Functions
    - `handle_featured_listing_update()` — no longer overrides payment-set expirations
    - `expire_featured_listings()` — also expires purchase records
    - New `activate_pending_featured_purchase()` — activates paid purchases when listing is approved

  5. Cron
    - Hourly cron job for `expire_featured_listings()`
*/

-- ============================================================
-- 1. Create featured_purchases table
-- ============================================================
CREATE TABLE IF NOT EXISTS featured_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  plan text NOT NULL CHECK (plan IN ('7day', '14day', '30day')),
  amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'active', 'expired', 'cancelled', 'refunded', 'free')),
  purchased_at timestamptz,
  featured_start timestamptz,
  featured_end timestamptz,
  duration_days integer NOT NULL,
  is_admin_granted boolean DEFAULT false,
  granted_by_admin_id uuid REFERENCES auth.users(id),
  promo_code_used text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_featured_purchases_listing ON featured_purchases(listing_id);
CREATE INDEX IF NOT EXISTS idx_featured_purchases_user ON featured_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_featured_purchases_status ON featured_purchases(status);
CREATE INDEX IF NOT EXISTS idx_featured_purchases_stripe_session ON featured_purchases(stripe_checkout_session_id);

ALTER TABLE featured_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
  ON featured_purchases FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Admins can view all purchases"
  ON featured_purchases FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND is_admin = true
  ));

CREATE POLICY "Admins can insert purchases"
  ON featured_purchases FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND is_admin = true
  ));

CREATE POLICY "Admins can update purchases"
  ON featured_purchases FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND is_admin = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = (SELECT auth.uid()) AND is_admin = true
  ));

-- ============================================================
-- 2. Update handle_featured_listing_update() trigger function
--    The trigger is already bound as BEFORE UPDATE on listings.
--    Key change: don't override featured_expires_at/featured_started_at
--    if they are already set in the NEW row (payment system sets its own).
-- ============================================================
CREATE OR REPLACE FUNCTION handle_featured_listing_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_featured = true AND (OLD.is_featured = false OR OLD.is_featured IS NULL) THEN
    IF NEW.featured_expires_at IS NULL THEN
      NEW.featured_expires_at = now() + interval '7 days';
    END IF;
    IF NEW.featured_started_at IS NULL THEN
      NEW.featured_started_at = now();
    END IF;
  END IF;

  IF NEW.is_featured = false AND (OLD.is_featured = true OR OLD.is_featured IS NULL) THEN
    NEW.featured_expires_at = null;
    NEW.featured_started_at = null;
    NEW.featured_plan = null;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 3. Create activate_pending_featured_purchase() trigger function
--    Fires BEFORE UPDATE on listings. When a listing is approved,
--    checks for a paid-but-not-started purchase and activates it.
-- ============================================================
CREATE OR REPLACE FUNCTION activate_pending_featured_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  purchase_record RECORD;
BEGIN
  IF NEW.approved = true AND (OLD.approved = false OR OLD.approved IS NULL) THEN
    SELECT * INTO purchase_record
    FROM featured_purchases
    WHERE listing_id = NEW.id
      AND status = 'paid'
      AND featured_start IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      UPDATE featured_purchases
      SET
        status = 'active',
        featured_start = now(),
        featured_end = now() + (purchase_record.duration_days || ' days')::interval,
        updated_at = now()
      WHERE id = purchase_record.id;

      NEW.is_featured = true;
      NEW.featured_started_at = now();
      NEW.featured_expires_at = now() + (purchase_record.duration_days || ' days')::interval;
      NEW.featured_plan = purchase_record.plan;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activate_featured_on_approval ON listings;
CREATE TRIGGER activate_featured_on_approval
  BEFORE UPDATE ON listings
  FOR EACH ROW
  EXECUTE FUNCTION activate_pending_featured_purchase();

-- ============================================================
-- 4. Update expire_featured_listings() to also expire purchases
-- ============================================================
CREATE OR REPLACE FUNCTION expire_featured_listings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE listings
  SET
    is_featured = false,
    featured_expires_at = null,
    featured_started_at = null,
    featured_plan = null,
    updated_at = now()
  WHERE
    is_featured = true
    AND featured_expires_at IS NOT NULL
    AND featured_expires_at <= now();

  UPDATE featured_purchases
  SET
    status = 'expired',
    updated_at = now()
  WHERE
    status = 'active'
    AND featured_end IS NOT NULL
    AND featured_end <= now();
END;
$$;

-- ============================================================
-- 5. Hourly cron job for expire_featured_listings
-- ============================================================
SELECT cron.schedule(
  'expire-featured-listings-hourly',
  '0 * * * *',
  $$SELECT expire_featured_listings()$$
);
