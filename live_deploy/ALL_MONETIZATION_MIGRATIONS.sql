
-- ============================================================================
-- MIGRATION: 20260527150000_create_monetization_tables.sql
-- ============================================================================
/*
  # Create residential-rental monetization tables

  Scope: residential rentals only. Sales + commercial untouched.

  1. New Tables
    - `listing_subscriptions`
      - Tracks Agent ($50/mo, 7-listing cap) and VIP ($100/mo, unlimited) subscriptions.
      - Supports admin-granted (no Stripe) and Stripe-managed lifecycles.
      - `billing_day_of_month` (1-28) drives renewal day. For Stripe subs mirrors the start day;
        for admin-granted is picked by the admin.
    - `paid_listing_payments`
      - Append-only ledger of one-off payments for individual listings ($25/$15/multi-month packages).
      - Drives "first paid month $25 vs subsequent $15" pricing logic by counting prior rows.
      - `is_initial_purchase` records whether this payment was made at-posting (only then can
        the 30 bonus days be granted; webhook enforces this).
    - `paid_listing_refunds`
      - Audit log of Stripe refunds. No automatic day-reversal — admins handle disputes manually.

  2. Indexes
    - User lookups, status lookups, listing lookups, day-of-month lookups for the
      "who renews next" admin sort.

  3. Security
    - RLS enabled on all three tables.
    - Users see their own rows. Admins see all and can modify.
    - System (service_role) bypasses RLS for webhook + cron writes.
*/

-- =============================================================
-- listing_subscriptions
-- =============================================================
CREATE TABLE IF NOT EXISTS listing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('agent', 'vip')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'past_due', 'cancelled', 'expired', 'admin_active')),
  listing_cap integer,
  stripe_subscription_id text,
  stripe_customer_id text,
  current_period_end timestamptz,
  billing_day_of_month integer CHECK (billing_day_of_month IS NULL OR (billing_day_of_month BETWEEN 1 AND 28)),
  is_admin_granted boolean NOT NULL DEFAULT false,
  granted_by_admin_id uuid REFERENCES profiles(id),
  admin_active_from timestamptz,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  -- Listing cap is set at insert time based on plan: 7 for agent, NULL (unlimited) for vip.
  -- Enforced via CHECK to keep the invariant readable.
  CONSTRAINT listing_subscriptions_plan_cap_consistent CHECK (
    (plan = 'agent' AND listing_cap = 7)
    OR (plan = 'vip' AND listing_cap IS NULL)
  ),
  -- Admin-granted rows must have a granted_by + admin_active_from + billing_day_of_month
  CONSTRAINT listing_subscriptions_admin_grant_complete CHECK (
    is_admin_granted = false
    OR (granted_by_admin_id IS NOT NULL AND admin_active_from IS NOT NULL AND billing_day_of_month IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_listing_subscriptions_user_id ON listing_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_listing_subscriptions_status ON listing_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_listing_subscriptions_stripe_sub ON listing_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
-- Admin "who renews next" sort key
CREATE INDEX IF NOT EXISTS idx_listing_subscriptions_renewal_sort ON listing_subscriptions(current_period_end)
  WHERE status IN ('active', 'admin_active');
-- Enforce one ACTIVE subscription per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_subscriptions_one_active_per_user
  ON listing_subscriptions(user_id)
  WHERE status IN ('active', 'admin_active', 'past_due');

ALTER TABLE listing_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own listing subscriptions"
  ON listing_subscriptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all listing subscriptions"
  ON listing_subscriptions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

CREATE POLICY "Admins can insert listing subscriptions"
  ON listing_subscriptions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

CREATE POLICY "Admins can update listing subscriptions"
  ON listing_subscriptions FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

CREATE POLICY "Admins can delete listing subscriptions"
  ON listing_subscriptions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_listing_subscriptions_updated_at') THEN
    CREATE TRIGGER set_listing_subscriptions_updated_at
      BEFORE UPDATE ON listing_subscriptions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- =============================================================
-- paid_listing_payments
-- =============================================================
CREATE TABLE IF NOT EXISTS paid_listing_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  days_granted integer NOT NULL CHECK (days_granted > 0),
  bonus_days integer NOT NULL DEFAULT 0 CHECK (bonus_days >= 0),
  source text NOT NULL CHECK (source IN ('stripe', 'admin_grant')),
  is_initial_purchase boolean NOT NULL DEFAULT false,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  granted_by_admin_id uuid REFERENCES profiles(id),
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paid_listing_payments_listing ON paid_listing_payments(listing_id);
CREATE INDEX IF NOT EXISTS idx_paid_listing_payments_user ON paid_listing_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_paid_listing_payments_stripe_session ON paid_listing_payments(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
-- Idempotency: a given Stripe session can produce at most one payment row
CREATE UNIQUE INDEX IF NOT EXISTS idx_paid_listing_payments_stripe_session_unique
  ON paid_listing_payments(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

ALTER TABLE paid_listing_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payments"
  ON paid_listing_payments FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all payments"
  ON paid_listing_payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

CREATE POLICY "Admins can insert payments"
  ON paid_listing_payments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- =============================================================
-- paid_listing_refunds
-- =============================================================
CREATE TABLE IF NOT EXISTS paid_listing_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES paid_listing_payments(id) ON DELETE SET NULL,
  listing_id uuid REFERENCES listings(id) ON DELETE SET NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  stripe_charge_id text,
  stripe_refund_id text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paid_listing_refunds_payment ON paid_listing_refunds(payment_id);
CREATE INDEX IF NOT EXISTS idx_paid_listing_refunds_listing ON paid_listing_refunds(listing_id);

ALTER TABLE paid_listing_refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view refunds"
  ON paid_listing_refunds FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

CREATE POLICY "Admins can insert refunds"
  ON paid_listing_refunds FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- =============================================================
-- Comments
-- =============================================================
COMMENT ON TABLE listing_subscriptions IS
  'Agent ($50/mo, 7 listings) and VIP ($100/mo, unlimited) subscriptions for residential-rental posting. Supports both Stripe-managed and admin-granted lifecycles.';
COMMENT ON COLUMN listing_subscriptions.billing_day_of_month IS
  'Day each month the subscription renews (1-28 to avoid month-end rollover). For Stripe subs, mirrors the Stripe start day. For admin-granted, picked by the admin.';
COMMENT ON TABLE paid_listing_payments IS
  'Append-only ledger of one-off payments for individual residential-rental listings. Used to compute first-time ($25) vs renewal ($15) pricing and to gate the 30-bonus-days sweetener.';
COMMENT ON COLUMN paid_listing_payments.is_initial_purchase IS
  'True only when payment is made at-posting (wizard checkout sets metadata.is_initial_purchase=true). The webhook enforces that only this case can grant bonus_days.';
COMMENT ON COLUMN paid_listing_payments.bonus_days IS
  'Bonus days granted (30 only for the at-posting first payment; 0 otherwise).';
COMMENT ON TABLE paid_listing_refunds IS
  'Audit log of Stripe refunds for paid listing payments. No automatic day-reversal — admins handle disputes manually.';

-- ============================================================================
-- MIGRATION: 20260527150100_add_monetization_columns_to_listings.sql
-- ============================================================================
/*
  # Add monetization columns to listings (residential-rental only)

  Scope: residential rentals only. Sale listings keep payment_kind = NULL.

  1. New columns on `listings`
    - `payment_kind` text (nullable for sale listings; required for rentals via wizard service)
       Values:
        - 'individual_trial'  — listing is in its 14-day free trial.
        - 'individual_paid'   — listing has paid balance (paid_until in the future, or banked
                                in paused_paid_days while inactive).
        - 'subscription'      — listing is covered by an active listing_subscriptions row.
        - 'admin_granted'     — admin marked the listing as exempt from payment checks.
        - 'legacy_free'       — pre-existing listings at launch that were already inactive
                                (so they don't get deactivated by payment logic if reactivated).
    - `trial_started_at` timestamptz — when the 14-day trial began (set on listing insert
       or by grandfather migration).
    - `paid_until` timestamptz — absolute date when paid balance ends IF listing stays
       continuously active. NULL while listing is inactive (balance is banked instead).
    - `paused_paid_days` integer default 0 — banked paid days while listing is inactive.
       Trigger (in a later migration) handles the pause/resume math.

  2. Indexes
    - For the auto-inactivate cron to efficiently find trial-expired and
      paid-balance-exhausted listings.

  3. Notes
    - Existing `payment_status` column (from the removed payment system) is left untouched.
      It is unused by current code; do not delete it in case of analytics references.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'payment_kind'
  ) THEN
    ALTER TABLE listings ADD COLUMN payment_kind text;
    ALTER TABLE listings ADD CONSTRAINT listings_payment_kind_check
      CHECK (payment_kind IS NULL OR payment_kind IN (
        'individual_trial',
        'individual_paid',
        'subscription',
        'admin_granted',
        'legacy_free'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'trial_started_at'
  ) THEN
    ALTER TABLE listings ADD COLUMN trial_started_at timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'paid_until'
  ) THEN
    ALTER TABLE listings ADD COLUMN paid_until timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'listings' AND column_name = 'paused_paid_days'
  ) THEN
    ALTER TABLE listings ADD COLUMN paused_paid_days integer NOT NULL DEFAULT 0
      CHECK (paused_paid_days >= 0);
  END IF;
END $$;

-- =============================================================
-- Indexes for the cron's deactivation queries
-- =============================================================

-- Trial-expiry lookup
CREATE INDEX IF NOT EXISTS idx_listings_trial_expiry
  ON listings(trial_started_at)
  WHERE listing_type = 'rental'
    AND payment_kind = 'individual_trial'
    AND is_active = true;

-- Paid-balance-exhausted lookup
CREATE INDEX IF NOT EXISTS idx_listings_paid_until
  ON listings(paid_until)
  WHERE listing_type = 'rental'
    AND payment_kind = 'individual_paid'
    AND is_active = true;

-- Phone trial-eligibility lookup (per-phone, recent activity check)
CREATE INDEX IF NOT EXISTS idx_listings_phone_recent_activity
  ON listings(contact_phone_e164, listing_type, is_active, deactivated_at)
  WHERE contact_phone_e164 IS NOT NULL
    AND listing_type = 'rental';

-- =============================================================
-- Comments
-- =============================================================
COMMENT ON COLUMN listings.payment_kind IS
  'Residential-rental monetization classifier. NULL for sale listings or transient pre-insert state. See migration 20260527150100 for value semantics.';
COMMENT ON COLUMN listings.trial_started_at IS
  '14-day free-trial start. Trial expires at trial_started_at + interval ''14 days''.';
COMMENT ON COLUMN listings.paid_until IS
  'Absolute date paid balance runs out IF listing stays continuously active. Trigger pauses this to paused_paid_days on deactivation and restores on reactivation.';
COMMENT ON COLUMN listings.paused_paid_days IS
  'Banked paid days while listing is inactive. On reactivation the trigger restores paid_until = NOW() + paused_paid_days.';

-- ============================================================================
-- MIGRATION: 20260527150200_extend_concierge_for_addon_tier.sql
-- ============================================================================
/*
  # Extend concierge_subscriptions for the addon_concierge tier

  Adds `addon_concierge` as a new tier value. When a user with an Agent/VIP
  listing_subscription adds the concierge add-on ($50/mo), a concierge_subscriptions
  row is created with tier='addon_concierge' and listing_subscription_id pointing
  at the parent. When the parent subscription cancels, the Stripe webhook (and
  admin actions) cascade-cancel the addon row.

  Standalone tier1/2/3 concierge subscriptions are untouched and continue to
  work independently.

  1. Schema changes
    - Replace the tier CHECK constraint to allow 'addon_concierge'.
    - Add `listing_subscription_id` FK column (nullable; required only for addon tier).
    - Add CHECK that addon_concierge rows must have a parent listing_subscription_id.

  2. Index
    - Lookup by parent listing_subscription_id (used by cascade logic).
*/

-- Drop and recreate tier CHECK constraint with the new value.
-- (The CHECK constraint was originally inline so its name is the default
-- `concierge_subscriptions_tier_check`.)
ALTER TABLE concierge_subscriptions
  DROP CONSTRAINT IF EXISTS concierge_subscriptions_tier_check;

ALTER TABLE concierge_subscriptions
  ADD CONSTRAINT concierge_subscriptions_tier_check
  CHECK (tier IN ('tier1_quick', 'tier2_forward', 'tier3_vip', 'addon_concierge'));

-- Add FK column to parent listing_subscriptions.
-- Required only when tier='addon_concierge'.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'concierge_subscriptions' AND column_name = 'listing_subscription_id'
  ) THEN
    ALTER TABLE concierge_subscriptions
      ADD COLUMN listing_subscription_id uuid
        REFERENCES listing_subscriptions(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE concierge_subscriptions
  DROP CONSTRAINT IF EXISTS concierge_subscriptions_addon_requires_parent;

ALTER TABLE concierge_subscriptions
  ADD CONSTRAINT concierge_subscriptions_addon_requires_parent
  CHECK (
    tier != 'addon_concierge'
    OR listing_subscription_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_concierge_subs_listing_subscription
  ON concierge_subscriptions(listing_subscription_id)
  WHERE listing_subscription_id IS NOT NULL;

COMMENT ON COLUMN concierge_subscriptions.listing_subscription_id IS
  'Parent listing_subscriptions row (Agent/VIP) when this row is an addon_concierge add-on. NULL for standalone tier1/2/3 subscriptions. Cascade-cancelled when parent ends.';

-- ============================================================================
-- MIGRATION: 20260527150300_create_monetization_helper_fns.sql
-- ============================================================================
/*
  # Monetization helper functions

  1. `is_phone_trial_eligible(p_phone_e164 text) RETURNS boolean`
     - Returns true if the phone has NO active rental listing and NO rental
       listing deactivated within the last 30 days.
     - Used by:
        - Wizard pre-post to decide whether to show "Free 14-day trial" or
          "Pay $25" branch.
        - The grandfather migration's edge cases.
     - Called from RLS-aware authenticated contexts AND from service_role
       (webhook + cron). Marked SECURITY DEFINER + STABLE.

  2. `is_listing_locked(p_listing_id uuid) RETURNS boolean`
     - Returns true if the residential rental listing is older than 10 days
       AND the calling user is NOT an admin. Used by the listings service
       to gate edits to bedrooms, neighborhood, location, full_address, lat/long,
       and contact_phone.
     - Returns false for non-rental listings (lock is rentals-only).
*/

CREATE OR REPLACE FUNCTION is_phone_trial_eligible(p_phone_e164 text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM listings
    WHERE contact_phone_e164 = p_phone_e164
      AND listing_type = 'rental'
      AND (
        is_active = true
        OR (deactivated_at IS NOT NULL AND deactivated_at > NOW() - INTERVAL '30 days')
      )
  );
$$;

COMMENT ON FUNCTION is_phone_trial_eligible(text) IS
  'Returns true if the phone has no rental listing active or deactivated within the last 30 days. Drives the 14-day free trial gate.';

GRANT EXECUTE ON FUNCTION is_phone_trial_eligible(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION is_listing_locked(p_listing_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing_type text;
  v_created_at timestamptz;
  v_is_admin boolean;
BEGIN
  -- Caller is admin? Locks don't apply.
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
    FROM profiles p WHERE p.id = auth.uid();
  IF v_is_admin THEN
    RETURN false;
  END IF;

  SELECT listing_type::text, created_at INTO v_listing_type, v_created_at
    FROM listings WHERE id = p_listing_id;

  -- Listing not found OR not a rental → not locked.
  IF NOT FOUND OR v_listing_type <> 'rental' THEN
    RETURN false;
  END IF;

  RETURN v_created_at IS NOT NULL AND v_created_at < NOW() - INTERVAL '10 days';
END;
$$;

COMMENT ON FUNCTION is_listing_locked(uuid) IS
  'Returns true if a residential-rental listing is >10 days old and the caller is not an admin. Used to gate edits to bedrooms, location, phone.';

GRANT EXECUTE ON FUNCTION is_listing_locked(uuid) TO authenticated, service_role;

-- ============================================================================
-- MIGRATION: 20260527150400_extend_listing_lifecycle_for_payments.sql
-- ============================================================================
/*
  # Extend listing lifecycle functions for monetization

  Two surgical changes to existing functions. Existing freshness logic is preserved
  exactly; the new logic is layered alongside.

  1. `set_listing_deactivated_timestamp()` trigger
     Existing behavior preserved:
      - On active → inactive: set deactivated_at = NOW().
      - On inactive → active: clear deactivated_at, set last_published_at = NOW(),
        compute fresh expires_at if not supplied (per-listing-type via admin_settings).
     New behavior:
      - On active → inactive for residential rentals with payment_kind='individual_paid'
        and a future paid_until: bank the remaining days into paused_paid_days and
        clear paid_until.
      - On inactive → active for residential rentals with payment_kind='individual_paid'
        and paused_paid_days > 0: restore paid_until = NOW() + paused_paid_days days,
        clear paused_paid_days, and clamp expires_at to <= paid_until.

  2. `auto_inactivate_old_listings()` RPC
     Existing behavior preserved: deactivate listings past their freshness window
     (per-type active_days from admin_settings).
     New behavior (residential rentals only): also deactivate when
      - payment_kind='individual_trial' and trial_started_at < NOW() - interval '14 days'
      - payment_kind='individual_paid'  and paid_until < NOW()
      - payment_kind='subscription'     and the user has no active listing_subscriptions row

     The subscription condition is the SAFETY NET; the primary cascade is the Stripe
     webhook's cascade-deactivate-subscription edge fn. This catches missed cascades
     within 24h.

  3. Notes
    - The trigger is responsible for atomically banking paid days on deactivation.
      This means the RPC's UPDATE statement (single SET is_active=false) automatically
      triggers the bank, so paid days are never lost to race conditions.
    - For trial listings being deactivated by the RPC, the trigger has no pause action
      (trials don't accrue banked days). The listing simply becomes inactive.
*/

-- =============================================================
-- Extended trigger function
-- =============================================================
CREATE OR REPLACE FUNCTION public.set_listing_deactivated_timestamp()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_rental_days integer;
  v_sale_days integer;
BEGIN
  -- Deactivation branch (active -> inactive)
  IF OLD.is_active = true AND NEW.is_active = false THEN
    NEW.deactivated_at = NOW();

    -- Bank remaining paid days for residential rentals.
    IF NEW.listing_type = 'rental'
       AND NEW.payment_kind = 'individual_paid'
       AND NEW.paid_until IS NOT NULL
       AND NEW.paid_until > NOW() THEN
      NEW.paused_paid_days = GREATEST(
        0,
        CEIL(EXTRACT(EPOCH FROM (NEW.paid_until - NOW())) / 86400.0)::int
      );
      NEW.paid_until = NULL;
    END IF;
  END IF;

  -- Reactivation branch (inactive -> active)
  IF OLD.is_active = false AND NEW.is_active = true THEN
    NEW.deactivated_at = NULL;
    NEW.last_published_at = NOW();

    -- Restore banked paid days BEFORE computing expires_at, so the clamp below uses
    -- the restored paid_until.
    IF NEW.listing_type = 'rental'
       AND NEW.payment_kind = 'individual_paid'
       AND COALESCE(NEW.paused_paid_days, 0) > 0 THEN
      NEW.paid_until = NOW() + (NEW.paused_paid_days || ' days')::interval;
      NEW.paused_paid_days = 0;
    END IF;

    -- Existing freshness logic: compute expires_at if caller didn't supply one.
    IF NEW.expires_at IS NULL OR NEW.expires_at <= NOW() THEN
      SELECT rental_active_days, sale_active_days
        INTO v_rental_days, v_sale_days
        FROM admin_settings LIMIT 1;

      v_rental_days := COALESCE(v_rental_days, 30);
      v_sale_days := COALESCE(v_sale_days, 30);

      IF NEW.listing_type = 'sale' AND NEW.sale_status = 'in_contract' THEN
        NEW.expires_at = NOW() + INTERVAL '42 days';
      ELSIF NEW.listing_type = 'sale' THEN
        NEW.expires_at = NOW() + (v_sale_days * INTERVAL '1 day');
      ELSE
        NEW.expires_at = NOW() + (v_rental_days * INTERVAL '1 day');
      END IF;
    END IF;

    -- Clamp expires_at to paid_until for paid rentals — the freshness cap can never
    -- exceed the paid balance window.
    IF NEW.listing_type = 'rental'
       AND NEW.payment_kind = 'individual_paid'
       AND NEW.paid_until IS NOT NULL
       AND NEW.expires_at IS NOT NULL
       AND NEW.expires_at > NEW.paid_until THEN
      NEW.expires_at = NEW.paid_until;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- =============================================================
-- Extended auto_inactivate RPC
-- =============================================================
CREATE OR REPLACE FUNCTION public.auto_inactivate_old_listings()
  RETURNS TABLE(inactivated_count integer, listing_ids uuid[])
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
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
  v_sale_days := COALESCE(v_sale_days, 30);

  WITH to_inactivate AS (
    SELECT l.id FROM listings l
    WHERE l.is_active = true
      AND l.approved = true
      AND (
        -- (1) EXISTING freshness logic, unchanged
        (
          (
            l.expires_at IS NOT NULL
            AND l.last_published_at IS NOT NULL
            AND GREATEST(
              l.expires_at,
              l.last_published_at + (
                CASE WHEN l.listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
                * INTERVAL '1 day'
              )
            ) < NOW()
          )
          OR (
            l.expires_at IS NOT NULL
            AND l.last_published_at IS NULL
            AND l.expires_at < NOW()
          )
          OR (
            l.expires_at IS NULL
            AND l.last_published_at IS NOT NULL
            AND l.last_published_at < NOW() - (
              CASE WHEN l.listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
              * INTERVAL '1 day'
            )
          )
        )
        -- (2) NEW: trial expired (residential rentals only)
        OR (
          l.listing_type = 'rental'
          AND l.payment_kind = 'individual_trial'
          AND l.trial_started_at IS NOT NULL
          AND l.trial_started_at < NOW() - INTERVAL '14 days'
        )
        -- (3) NEW: paid balance exhausted (residential rentals only)
        OR (
          l.listing_type = 'rental'
          AND l.payment_kind = 'individual_paid'
          AND l.paid_until IS NOT NULL
          AND l.paid_until < NOW()
        )
        -- (4) NEW: subscription no longer active (safety net for missed cascade)
        OR (
          l.listing_type = 'rental'
          AND l.payment_kind = 'subscription'
          AND NOT EXISTS (
            SELECT 1 FROM listing_subscriptions ls
            WHERE ls.user_id = l.user_id
              AND ls.status IN ('active', 'admin_active')
          )
        )
      )
  )
  SELECT array_agg(id), COUNT(*)::integer
    INTO affected_ids, affected_count
    FROM to_inactivate;

  IF affected_ids IS NULL OR affected_count = 0 THEN
    affected_ids := ARRAY[]::uuid[];
    affected_count := 0;
  ELSE
    -- The trigger handles paused_paid_days banking automatically for paid rentals.
    UPDATE listings
    SET is_active = false,
        updated_at = NOW()
    WHERE id = ANY(affected_ids);
  END IF;

  RETURN QUERY SELECT affected_count, affected_ids;
END;
$function$;

COMMENT ON FUNCTION public.set_listing_deactivated_timestamp() IS
  'Trigger function that manages is_active transitions: deactivated_at timestamp, expires_at freshness window, and (new) paid_until banking via paused_paid_days for individual_paid residential rentals.';
COMMENT ON FUNCTION public.auto_inactivate_old_listings() IS
  'Hourly cron. Deactivates listings past freshness AND (new) residential rentals whose trial expired, paid balance ran out, or subscription is gone (safety net).';

-- ============================================================================
-- MIGRATION: 20260527150500_grandfather_existing_rentals.sql
-- ============================================================================
/*
  # Grandfather existing residential rentals — DEFERRED (Phase J change)

  Originally this migration ran a bulk UPDATE to tag every active rental with
  payment_kind='individual_trial' and trial_started_at=NOW() at deploy time.

  That's now DEFERRED to an explicit admin action so the trial countdown
  starts on the real launch day, not the day migrations are applied. The
  bulk UPDATE moved to the `enable_monetization()` RPC, created by
  20260527150800_monetization_feature_flag.sql.

  Workflow now:
    1) Apply migrations (this one is a no-op).
    2) Test internally with monetization_enabled = false.
    3) On launch day, from the admin Subscriptions page, click
       "Activate monetization". That calls enable_monetization() which:
         - flips admin_settings.monetization_enabled to true
         - sets payment_kind='individual_trial', trial_started_at=NOW()
           on all currently-active residential rentals
         - sets payment_kind='legacy_free' on inactive ones
       …in a single transaction.

  Leaving this file in place (instead of deleting it) so the migration
  history remains stable. The file does nothing on apply.
*/

DO $$
BEGIN
  RAISE NOTICE 'Grandfather migration is a no-op. Bulk UPDATE deferred to enable_monetization() RPC.';
END $$;

-- ============================================================================
-- MIGRATION: 20260527150600_schedule_paid_listing_reminders.sql
-- ============================================================================
/*
  # Schedule send-paid-listing-reminders daily cron job

  Phase G of the residential-rental monetization plan.

  Schedules the new send-paid-listing-reminders edge function to fire daily at
  10:00 AM Eastern Time (matches the existing send-renewal-reminders cadence).
  The edge function itself handles Shabbat skip (Friday + Saturday in NY tz),
  so we just need a daily trigger.

  Pattern mirrors 20251020000001_setup_daily_email_cron.sql — uses pg_cron +
  pg_net and reads the project URL + service role key from Postgres settings.
  Those settings must be configured once on the Supabase project (see comment
  block at bottom for the setup commands).
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotency: drop any prior schedule with the same name.
DO $$
BEGIN
  PERFORM cron.unschedule('send-paid-listing-reminders');
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'send-paid-listing-reminders',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/send-paid-listing-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- Set timezone to America/New_York so 10:00 means 10 AM ET (not UTC).
-- Guarded: cron.job.timezone is a Supabase-hosted-only column (absent in
-- upstream pg_cron). Runs unchanged on live; skipped on a from-scratch local DB.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'cron' AND table_name = 'job' AND column_name = 'timezone') THEN
    UPDATE cron.job SET timezone = 'America/New_York'
    WHERE jobname = 'send-paid-listing-reminders';
  END IF;
END $$;

-- ---------------------------------------------------------------
-- One-time setup notes (NOT run by this migration):
--
-- 1) Ensure app.supabase_url and app.supabase_service_role_key are set in
--    Postgres settings. From Supabase Studio SQL editor, once per project:
--      ALTER DATABASE postgres SET app.supabase_url
--        = 'https://<project-ref>.supabase.co';
--      ALTER DATABASE postgres SET app.supabase_service_role_key
--        = 'eyJhbGc…';
--
-- 2) Edge function env vars (Supabase dashboard → Edge Functions → secrets):
--      TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
--      PUBLIC_SITE_URL (e.g. https://hadirot.com)
--      STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET
--      STRIPE_AGENT_PRICE_ID, STRIPE_VIP_PRICE_ID, STRIPE_ADDON_CONCIERGE_PRICE_ID
--
-- 3) Verify:
--      SELECT jobname, schedule, timezone FROM cron.job
--      WHERE jobname = 'send-paid-listing-reminders';
-- ---------------------------------------------------------------

-- ============================================================================
-- MIGRATION: 20260527150700_add_subscription_free_trial.sql
-- ============================================================================
/*
  # Add 14-day free trial for Agent / VIP subscriptions

  Phase H of the residential-rental monetization plan.

  Per the product spec, agents need a 14-day frontend-only free trial so they
  can post multiple listings before being charged. Trials do NOT go through
  Stripe — they're tracked in listing_subscriptions with status='trial' and
  stripe_subscription_id IS NULL. After 14 days the row auto-expires and the
  user's covered listings deactivate via the existing cascade logic.

  Schema changes:
   - Extend listing_subscriptions.status CHECK to allow 'trial'.
   - Expand the "one active subscription per user" unique index to also
     prevent overlapping trials.

  Behavior:
   - auto_inactivate_old_listings RPC is extended to flip trial rows older
     than 14 days to status='expired' BEFORE evaluating listing deactivation
     conditions. The existing "subscription gone" safety-net then catches
     the user's subscription-covered listings and deactivates them in the
     same call.

  Status mapping:
   - trial         — user-initiated, no Stripe, ≤14 days from created_at.
   - active        — Stripe-managed, currently being charged.
   - admin_active  — manually granted by an admin, no Stripe.
   - past_due      — Stripe says payment failed; dunning in flight.
   - cancelled     — explicitly cancelled (by user, admin, or trial expiry).
   - expired       — period ended without renewal.
*/

-- ---------------------------------------------------------------
-- 1. Extend status CHECK to allow 'trial'.
-- ---------------------------------------------------------------
ALTER TABLE listing_subscriptions
  DROP CONSTRAINT IF EXISTS listing_subscriptions_status_check;

ALTER TABLE listing_subscriptions
  ADD CONSTRAINT listing_subscriptions_status_check
  CHECK (status IN ('pending', 'active', 'past_due', 'cancelled', 'expired', 'admin_active', 'trial'));

-- ---------------------------------------------------------------
-- 2. Update the active-uniqueness index to include trial.
-- ---------------------------------------------------------------
DROP INDEX IF EXISTS idx_listing_subscriptions_one_active_per_user;

CREATE UNIQUE INDEX IF NOT EXISTS idx_listing_subscriptions_one_active_per_user
  ON listing_subscriptions(user_id)
  WHERE status IN ('active', 'admin_active', 'past_due', 'trial');

-- ---------------------------------------------------------------
-- 3. Extend the "who counts as covered" portion of auto_inactivate.
--    The previous version checked status IN ('active', 'admin_active').
--    Now trial counts as covered too (during the 14-day window).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_inactivate_old_listings()
  RETURNS TABLE(inactivated_count integer, listing_ids uuid[])
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  affected_ids uuid[];
  affected_count integer;
  v_rental_days integer;
  v_sale_days integer;
BEGIN
  -- ---------------------------------------------------
  -- STEP 1: expire any 14d+ trial subscriptions first.
  -- The next query catches their listings via the
  -- "subscription gone" branch.
  -- ---------------------------------------------------
  UPDATE listing_subscriptions
  SET status = 'expired',
      cancelled_at = NOW(),
      updated_at = NOW()
  WHERE status = 'trial'
    AND created_at < NOW() - INTERVAL '14 days';

  -- ---------------------------------------------------
  -- STEP 2: load per-listing-type freshness windows.
  -- ---------------------------------------------------
  SELECT rental_active_days, sale_active_days
    INTO v_rental_days, v_sale_days
    FROM admin_settings LIMIT 1;

  v_rental_days := COALESCE(v_rental_days, 30);
  v_sale_days := COALESCE(v_sale_days, 30);

  -- ---------------------------------------------------
  -- STEP 3: find listings to inactivate.
  -- ---------------------------------------------------
  WITH to_inactivate AS (
    SELECT l.id FROM listings l
    WHERE l.is_active = true
      AND l.approved = true
      AND (
        -- (1) EXISTING freshness logic, unchanged.
        (
          (
            l.expires_at IS NOT NULL
            AND l.last_published_at IS NOT NULL
            AND GREATEST(
              l.expires_at,
              l.last_published_at + (
                CASE WHEN l.listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
                * INTERVAL '1 day'
              )
            ) < NOW()
          )
          OR (
            l.expires_at IS NOT NULL
            AND l.last_published_at IS NULL
            AND l.expires_at < NOW()
          )
          OR (
            l.expires_at IS NULL
            AND l.last_published_at IS NOT NULL
            AND l.last_published_at < NOW() - (
              CASE WHEN l.listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
              * INTERVAL '1 day'
            )
          )
        )
        -- (2) trial expired (residential rentals only)
        OR (
          l.listing_type = 'rental'
          AND l.payment_kind = 'individual_trial'
          AND l.trial_started_at IS NOT NULL
          AND l.trial_started_at < NOW() - INTERVAL '14 days'
        )
        -- (3) paid balance exhausted (residential rentals only)
        OR (
          l.listing_type = 'rental'
          AND l.payment_kind = 'individual_paid'
          AND l.paid_until IS NOT NULL
          AND l.paid_until < NOW()
        )
        -- (4) subscription no longer active (safety net + handles trial expiry above)
        OR (
          l.listing_type = 'rental'
          AND l.payment_kind = 'subscription'
          AND NOT EXISTS (
            SELECT 1 FROM listing_subscriptions ls
            WHERE ls.user_id = l.user_id
              AND ls.status IN ('active', 'admin_active', 'trial')
          )
        )
      )
  )
  SELECT array_agg(id), COUNT(*)::integer
    INTO affected_ids, affected_count
    FROM to_inactivate;

  IF affected_ids IS NULL OR affected_count = 0 THEN
    affected_ids := ARRAY[]::uuid[];
    affected_count := 0;
  ELSE
    UPDATE listings
    SET is_active = false,
        updated_at = NOW()
    WHERE id = ANY(affected_ids);
  END IF;

  RETURN QUERY SELECT affected_count, affected_ids;
END;
$function$;

COMMENT ON FUNCTION public.auto_inactivate_old_listings() IS
  'Hourly cron. (1) Auto-expires trial subscriptions older than 14d. (2) Deactivates listings past freshness OR with expired trial/balance/subscription. The "subscription gone" branch covers users whose trial just expired.';

-- ============================================================================
-- MIGRATION: 20260527150800_monetization_feature_flag.sql
-- ============================================================================
/*
  # Monetization feature flag + safe activation RPC

  Phase J. Lets the admin deploy migrations + code well before launch,
  test internally, then flip a single boolean on launch day to activate
  the whole monetization system in one atomic step.

  Behavior:
    - admin_settings.monetization_enabled (default false).
    - When false: the wizard creates rental listings exactly like today
      (payment_kind=NULL, trial_started_at=NULL). The auto_inactivate
      RPC ignores the new payment-kind branches and only enforces the
      existing freshness window. Dashboard pills, trial banner, and
      monetization modal hide on the client.
    - When true (post enable_monetization()): full system active.

  This migration ALSO supersedes the auto_inactivate_old_listings RPC
  definition from migrations 20260527150400 and 20260527150700. The
  final version now gates conditions (2), (3), (4) on
  monetization_enabled.
*/

-- ---------------------------------------------------------------
-- 1. Feature flag column.
-- ---------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_settings' AND column_name = 'monetization_enabled'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN monetization_enabled boolean NOT NULL DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'admin_settings' AND column_name = 'monetization_enabled_at'
  ) THEN
    ALTER TABLE admin_settings ADD COLUMN monetization_enabled_at timestamptz;
  END IF;
END $$;

COMMENT ON COLUMN admin_settings.monetization_enabled IS
  'Master switch for the residential-rental monetization system. Flipped to true via enable_monetization() RPC on launch day.';
COMMENT ON COLUMN admin_settings.monetization_enabled_at IS
  'When monetization was activated (informational only). Set by enable_monetization().';

-- ---------------------------------------------------------------
-- 2. Activation RPC.
--    Flips the flag and grandfathers existing rentals atomically.
--    Idempotent — safe to call more than once; the listing UPDATEs use
--    `payment_kind IS NULL` guards so they only touch un-tagged rows.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enable_monetization()
RETURNS TABLE(
  enabled boolean,
  trialed_count integer,
  legacy_count integer,
  enabled_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_is_admin boolean;
  v_trialed integer := 0;
  v_legacy integer := 0;
  v_now timestamptz := NOW();
BEGIN
  -- Admin-only.
  SELECT COALESCE(p.is_admin, false) INTO v_caller_is_admin
    FROM profiles p WHERE p.id = auth.uid();
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Only admins may call enable_monetization';
  END IF;

  -- Flip the flag.
  UPDATE admin_settings
  SET monetization_enabled = true,
      monetization_enabled_at = COALESCE(monetization_enabled_at, v_now);

  -- Grandfather active rentals into 14-day trial.
  WITH t AS (
    UPDATE listings
    SET payment_kind = 'individual_trial',
        trial_started_at = v_now,
        updated_at = v_now
    WHERE listing_type = 'rental'
      AND is_active = true
      AND payment_kind IS NULL
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_trialed FROM t;

  -- Tag inactive rentals as legacy_free.
  WITH l AS (
    UPDATE listings
    SET payment_kind = 'legacy_free',
        updated_at = v_now
    WHERE listing_type = 'rental'
      AND is_active = false
      AND payment_kind IS NULL
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_legacy FROM l;

  RETURN QUERY SELECT true, v_trialed, v_legacy, v_now;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.enable_monetization() TO authenticated;

COMMENT ON FUNCTION public.enable_monetization() IS
  'Admin-only. Flips admin_settings.monetization_enabled to true and grandfathers existing residential rentals (active→individual_trial, inactive→legacy_free). Idempotent — safe to call again, only touches rows with NULL payment_kind.';

-- ---------------------------------------------------------------
-- 3. Optional disable RPC for emergencies.
--    Flips the flag back to false. Does NOT undo grandfather tags
--    (existing payment_kind values stay) so we can re-enable later
--    without retagging.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disable_monetization()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_is_admin boolean;
BEGIN
  SELECT COALESCE(p.is_admin, false) INTO v_caller_is_admin
    FROM profiles p WHERE p.id = auth.uid();
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Only admins may call disable_monetization';
  END IF;

  UPDATE admin_settings SET monetization_enabled = false;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.disable_monetization() TO authenticated;

COMMENT ON FUNCTION public.disable_monetization() IS
  'Admin-only emergency switch. Sets monetization_enabled to false. Does not undo grandfather tags so re-enabling is safe.';

-- ---------------------------------------------------------------
-- 4. Final auto_inactivate_old_listings RPC.
--    Supersedes the earlier versions from 150400 and 150700. The new
--    payment-kind branches (trial expired, paid balance, subscription
--    gone) are SKIPPED when monetization_enabled = false. Existing
--    freshness logic always runs. Trial-subscription auto-expiry only
--    fires when the flag is on.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_inactivate_old_listings()
  RETURNS TABLE(inactivated_count integer, listing_ids uuid[])
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  affected_ids uuid[];
  affected_count integer;
  v_rental_days integer;
  v_sale_days integer;
  v_monetization_on boolean;
BEGIN
  SELECT rental_active_days, sale_active_days, COALESCE(monetization_enabled, false)
    INTO v_rental_days, v_sale_days, v_monetization_on
    FROM admin_settings LIMIT 1;

  v_rental_days := COALESCE(v_rental_days, 30);
  v_sale_days := COALESCE(v_sale_days, 30);

  -- Trial-subscription auto-expiry only when monetization is on.
  -- Phase K: Stripe now manages trial→active transitions for Stripe-backed
  -- trials. We only expire trial rows that have NO stripe_subscription_id
  -- (admin-granted no-card trials, if any are ever created via SQL).
  IF v_monetization_on THEN
    UPDATE listing_subscriptions
    SET status = 'expired',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE status = 'trial'
      AND stripe_subscription_id IS NULL
      AND created_at < NOW() - INTERVAL '14 days';
  END IF;

  WITH to_inactivate AS (
    SELECT l.id FROM listings l
    WHERE l.is_active = true
      AND l.approved = true
      AND (
        -- (1) EXISTING freshness — always applies.
        (
          (
            l.expires_at IS NOT NULL
            AND l.last_published_at IS NOT NULL
            AND GREATEST(
              l.expires_at,
              l.last_published_at + (
                CASE WHEN l.listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
                * INTERVAL '1 day'
              )
            ) < NOW()
          )
          OR (
            l.expires_at IS NOT NULL
            AND l.last_published_at IS NULL
            AND l.expires_at < NOW()
          )
          OR (
            l.expires_at IS NULL
            AND l.last_published_at IS NOT NULL
            AND l.last_published_at < NOW() - (
              CASE WHEN l.listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
              * INTERVAL '1 day'
            )
          )
        )
        -- (2)-(4) NEW payment-kind branches — gated on flag.
        OR (
          v_monetization_on AND (
            (
              l.listing_type = 'rental'
              AND l.payment_kind = 'individual_trial'
              AND l.trial_started_at IS NOT NULL
              AND l.trial_started_at < NOW() - INTERVAL '14 days'
            )
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'individual_paid'
              AND l.paid_until IS NOT NULL
              AND l.paid_until < NOW()
            )
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'subscription'
              AND NOT EXISTS (
                SELECT 1 FROM listing_subscriptions ls
                WHERE ls.user_id = l.user_id
                  AND ls.status IN ('active', 'admin_active', 'trial')
              )
            )
          )
        )
      )
  )
  SELECT array_agg(id), COUNT(*)::integer
    INTO affected_ids, affected_count
    FROM to_inactivate;

  IF affected_ids IS NULL OR affected_count = 0 THEN
    affected_ids := ARRAY[]::uuid[];
    affected_count := 0;
  ELSE
    UPDATE listings
    SET is_active = false,
        updated_at = NOW()
    WHERE id = ANY(affected_ids);
  END IF;

  RETURN QUERY SELECT affected_count, affected_ids;
END;
$function$;

COMMENT ON FUNCTION public.auto_inactivate_old_listings() IS
  'Hourly cron. Always enforces freshness. The new payment-kind branches (trial/paid/subscription) only fire when admin_settings.monetization_enabled = true.';

-- ============================================================================
-- MIGRATION: 20260527150900_pending_payment_and_subscription_cap.sql
-- ============================================================================
/*
  # pending_payment kind + server-side subscription cap

  Three hardening changes surfaced by the pre-launch audit.

  1. New payment_kind value 'pending_payment'.
     The wizard's "must pay" branch now creates the listing with
     payment_kind='pending_payment' (instead of NULL) before redirecting to
     Stripe. If the user abandons checkout the listing can no longer be mistaken
     for a free/legacy listing at admin-approval time. The Stripe webhook flips
     it to 'individual_paid' on payment success exactly as before (the webhook's
     "fresh purchase" branch handles it — no bonus days, since bonus requires
     payment_kind='individual_trial').

  2. auto_inactivate_old_listings (FINAL) gains a branch (5): when monetization
     is on, any APPROVED + ACTIVE rental still sitting in 'pending_payment' is
     deactivated. This is the safety net for the case where an admin approves an
     unpaid "must pay" listing — it can never enjoy a free 30-day freshness run.

  3. enforce_subscription_listing_cap() BEFORE INSERT trigger on listings.
     The Agent 7-listing cap was previously enforced only client-side (wizard
     gate). A tampered client could insert listings with
     payment_kind='subscription' past the cap. This trigger re-checks on insert:
       - only fires for residential rentals tagged 'subscription'
       - only when monetization_enabled = true
       - admins are exempt
       - requires an active/admin_active/trial subscription
       - counts the user's subscription rentals already live OR pending approval
         (is_active = true OR approved = false) and rejects at/over cap.
     VIP (listing_cap NULL) is treated as unlimited.
     The Stripe webhook covers existing listings via UPDATE (not INSERT) and
     already respects the cap, so this INSERT-only trigger doesn't interfere.
*/

-- ---------------------------------------------------------------
-- 1. Extend payment_kind CHECK to allow 'pending_payment'.
-- ---------------------------------------------------------------
ALTER TABLE listings DROP CONSTRAINT IF EXISTS listings_payment_kind_check;
ALTER TABLE listings ADD CONSTRAINT listings_payment_kind_check
  CHECK (payment_kind IS NULL OR payment_kind IN (
    'individual_trial',
    'individual_paid',
    'subscription',
    'admin_granted',
    'legacy_free',
    'pending_payment'
  ));

COMMENT ON COLUMN listings.payment_kind IS
  'Residential-rental monetization classifier. NULL for sale listings or pre-monetization rentals. ''pending_payment'' = wizard "must pay" listing whose Stripe checkout has not completed. See migrations 20260527150100 / 20260527150900.';

-- ---------------------------------------------------------------
-- 2. Final auto_inactivate_old_listings — adds the pending_payment branch (5).
--    Supersedes 150400 / 150700 / 150800.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_inactivate_old_listings()
  RETURNS TABLE(inactivated_count integer, listing_ids uuid[])
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  affected_ids uuid[];
  affected_count integer;
  v_rental_days integer;
  v_sale_days integer;
  v_monetization_on boolean;
BEGIN
  SELECT rental_active_days, sale_active_days, COALESCE(monetization_enabled, false)
    INTO v_rental_days, v_sale_days, v_monetization_on
    FROM admin_settings LIMIT 1;

  v_rental_days := COALESCE(v_rental_days, 30);
  v_sale_days := COALESCE(v_sale_days, 30);

  -- Trial-subscription auto-expiry only when monetization is on. Stripe manages
  -- Stripe-backed trials; we only expire no-card admin/SQL trials.
  IF v_monetization_on THEN
    UPDATE listing_subscriptions
    SET status = 'expired',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE status = 'trial'
      AND stripe_subscription_id IS NULL
      AND created_at < NOW() - INTERVAL '14 days';
  END IF;

  WITH to_inactivate AS (
    SELECT l.id FROM listings l
    WHERE l.is_active = true
      AND l.approved = true
      AND (
        -- (1) EXISTING freshness — always applies.
        (
          (
            l.expires_at IS NOT NULL
            AND l.last_published_at IS NOT NULL
            AND GREATEST(
              l.expires_at,
              l.last_published_at + (
                CASE WHEN l.listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
                * INTERVAL '1 day'
              )
            ) < NOW()
          )
          OR (
            l.expires_at IS NOT NULL
            AND l.last_published_at IS NULL
            AND l.expires_at < NOW()
          )
          OR (
            l.expires_at IS NULL
            AND l.last_published_at IS NOT NULL
            AND l.last_published_at < NOW() - (
              CASE WHEN l.listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
              * INTERVAL '1 day'
            )
          )
        )
        -- (2)-(5) payment-kind branches — gated on flag.
        OR (
          v_monetization_on AND (
            (
              l.listing_type = 'rental'
              AND l.payment_kind = 'individual_trial'
              AND l.trial_started_at IS NOT NULL
              AND l.trial_started_at < NOW() - INTERVAL '14 days'
            )
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'individual_paid'
              AND l.paid_until IS NOT NULL
              AND l.paid_until < NOW()
            )
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'subscription'
              AND NOT EXISTS (
                SELECT 1 FROM listing_subscriptions ls
                WHERE ls.user_id = l.user_id
                  AND ls.status IN ('active', 'admin_active', 'trial')
              )
            )
            -- (5) NEW: never-paid "must pay" listing that slipped through approval.
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'pending_payment'
            )
          )
        )
      )
  )
  SELECT array_agg(id), COUNT(*)::integer
    INTO affected_ids, affected_count
    FROM to_inactivate;

  IF affected_ids IS NULL OR affected_count = 0 THEN
    affected_ids := ARRAY[]::uuid[];
    affected_count := 0;
  ELSE
    UPDATE listings
    SET is_active = false,
        updated_at = NOW()
    WHERE id = ANY(affected_ids);
  END IF;

  RETURN QUERY SELECT affected_count, affected_ids;
END;
$function$;

COMMENT ON FUNCTION public.auto_inactivate_old_listings() IS
  'Hourly cron. Always enforces freshness. When monetization is on, also deactivates expired trials, exhausted paid balances, gone subscriptions, and never-paid pending_payment listings.';

-- ---------------------------------------------------------------
-- 3. Server-side subscription listing-cap enforcement (BEFORE INSERT).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_subscription_listing_cap()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_monetization_on boolean;
  v_is_admin boolean;
  v_has_sub boolean;
  v_cap integer;
  v_used integer;
BEGIN
  -- Only guard residential rentals tagged as subscription-covered.
  IF NEW.listing_type <> 'rental' OR NEW.payment_kind IS DISTINCT FROM 'subscription' THEN
    RETURN NEW;
  END IF;

  -- Only enforce when monetization is active.
  SELECT COALESCE(monetization_enabled, false) INTO v_monetization_on
    FROM admin_settings LIMIT 1;
  IF NOT v_monetization_on THEN
    RETURN NEW;
  END IF;

  -- Admins are exempt from caps.
  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
    FROM profiles p WHERE p.id = auth.uid();
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Find the user's covering subscription. NULL listing_cap (VIP) = unlimited,
  -- represented as a large sentinel so the comparison below always passes.
  SELECT
    bool_or(true),
    MAX(CASE WHEN listing_cap IS NULL THEN 2147483647 ELSE listing_cap END)
  INTO v_has_sub, v_cap
  FROM listing_subscriptions
  WHERE user_id = NEW.user_id
    AND status IN ('active', 'admin_active', 'trial');

  IF NOT COALESCE(v_has_sub, false) THEN
    RAISE EXCEPTION 'No active subscription to cover this listing'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Count the user's subscription rentals already consuming a slot: live OR
  -- still pending approval. (The NEW row is not yet inserted.)
  SELECT COUNT(*) INTO v_used
  FROM listings
  WHERE user_id = NEW.user_id
    AND listing_type = 'rental'
    AND payment_kind = 'subscription'
    AND (is_active = true OR approved = false);

  IF v_used >= v_cap THEN
    RAISE EXCEPTION 'Subscription listing cap reached (% of %)', v_used, v_cap
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'enforce_subscription_listing_cap_trg') THEN
    CREATE TRIGGER enforce_subscription_listing_cap_trg
      BEFORE INSERT ON listings
      FOR EACH ROW EXECUTE FUNCTION enforce_subscription_listing_cap();
  END IF;
END $$;

COMMENT ON FUNCTION public.enforce_subscription_listing_cap() IS
  'BEFORE INSERT guard: rejects new subscription-covered residential rentals that exceed the user''s plan cap (Agent=7, VIP=unlimited). Admins exempt; only active when monetization_enabled = true.';

-- ============================================================================
-- MIGRATION: 20260604000000_reconcile_individual_listing_anchors.sql
-- ============================================================================
/*
  # Reconcile dropped individual-listing payment anchors (race safety net)

  Audit finding M1. The at-posting payment clock is anchored at ADMIN APPROVAL.
  Two independent processes touch that anchor:

    • approve-listing  — sums the paid_listing_payments ledger and computes
                         paid_until / expires_at, flipping payment_kind to
                         'individual_paid'.
    • stripe-webhook   — records the ledger row, then (only if the listing was
                         already approved) applies the day-math; otherwise it
                         DEFERS to approval.

  These are correct in every normal ordering and CANNOT double-count (approve
  reads the ledger before it sets approved=true; the webhook reads approved
  before it inserts the ledger row). But there is a single narrow interleave —
  an admin clicking "approve" in the ~1-2s the at-posting webhook is mid-flight —
  where BOTH sides miss the other's write:

      webhook reads approved=false  →  approve reads empty ledger
      approve sets pure trial       →  webhook inserts ledger, defers (stale)

  Result: the owner paid, a ledger row exists, but the listing is left as
  'individual_trial' (free trial only) with no paid_until — the paid + bonus
  days are silently dropped. It fails toward the customer (they keep the free
  trial) and never corrupts data, but it is a money loss with no self-heal.

  This migration adds an hourly, fully IDEMPOTENT reconciliation that heals
  exactly that case. It recomputes paid_until purely from fixed inputs (the
  approval anchor + the trial length + the initial-purchase ledger sum), so it
  is safe to run any number of times and safe to run concurrently with the
  hot path — every run produces the same value, and once a listing is
  'individual_paid' it is excluded.

  It ONLY touches rentals that are:
    • approved = true
    • still tagged 'individual_trial' or 'pending_payment'
    • AND have at least one is_initial_purchase ledger row (i.e. genuinely a
      dropped at-posting payment).
  Pure free trials (no ledger row) and unpaid must-pay listings (no ledger row)
  are left untouched.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.reconcile_individual_listing_anchors()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_monetization_on boolean;
  v_count integer := 0;
BEGIN
  SELECT COALESCE(monetization_enabled, false)
    INTO v_monetization_on
    FROM admin_settings LIMIT 1;
  IF NOT v_monetization_on THEN
    RETURN 0;
  END IF;

  WITH cand AS (
    SELECT
      l.id,
      -- Anchor = the approval timestamp. For trials approve stamps
      -- trial_started_at at approval, so it is the exact anchor. For a dropped
      -- must-pay (no trial_started_at) we fall back to now(); the heal is rare
      -- and a few-hours drift on a must-pay anchor is acceptable.
      COALESCE(l.trial_started_at, NOW()) AS anchor,
      (l.trial_started_at IS NOT NULL)    AS had_trial,
      (
        SELECT COALESCE(SUM(p.days_granted), 0) + COALESCE(SUM(p.bonus_days), 0)
        FROM paid_listing_payments p
        WHERE p.listing_id = l.id
          AND p.is_initial_purchase = true
      ) AS initial_days
    FROM listings l
    WHERE l.listing_type = 'rental'
      AND l.approved = true
      AND l.payment_kind IN ('individual_trial', 'pending_payment')
      AND EXISTS (
        SELECT 1 FROM paid_listing_payments p2
        WHERE p2.listing_id = l.id
          AND p2.is_initial_purchase = true
      )
  ),
  upd AS (
    UPDATE listings l
    SET
      payment_kind = 'individual_paid',
      paid_until = c.anchor
        + (((CASE WHEN c.had_trial THEN 14 ELSE 0 END) + c.initial_days) * INTERVAL '1 day'),
      expires_at = LEAST(
        NOW() + INTERVAL '30 days',
        c.anchor
          + (((CASE WHEN c.had_trial THEN 14 ELSE 0 END) + c.initial_days) * INTERVAL '1 day')
      ),
      paused_paid_days = 0,
      -- Reactivate a dropped must-pay listing. paused_paid_days is 0 here, so the
      -- reactivation trigger will NOT clobber the paid_until we set above.
      is_active = true,
      last_published_at = COALESCE(l.last_published_at, NOW()),
      updated_at = NOW()
    FROM cand c
    WHERE l.id = c.id
      AND c.initial_days > 0
    RETURNING l.id
  )
  SELECT COUNT(*)::integer INTO v_count FROM upd;

  RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.reconcile_individual_listing_anchors() IS
  'Hourly safety net (audit M1). Idempotently re-anchors residential rentals whose at-posting payment was dropped by the approve/webhook race: approved + still individual_trial/pending_payment + has an is_initial_purchase ledger row. Recomputes paid_until from approval anchor + trial + initial ledger sum. No-op when monetization is off.';

GRANT EXECUTE ON FUNCTION public.reconcile_individual_listing_anchors() TO service_role;

-- ---------------------------------------------------------------
-- Schedule it hourly (at minute 7, offset from other crons). Pure SQL call —
-- no edge function / pg_net needed.
-- ---------------------------------------------------------------
DO $$
BEGIN
  PERFORM cron.unschedule('reconcile-individual-listing-anchors');
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_function THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'reconcile-individual-listing-anchors',
  '7 * * * *',
  $$ SELECT public.reconcile_individual_listing_anchors(); $$
);

-- ============================================================================
-- MIGRATION: 20260604120000_create_subscription_trial_eligibility_fn.sql
-- ============================================================================
/*
  # Subscription free-trial eligibility

  `is_subscription_trial_eligible(p_user_id uuid DEFAULT auth.uid()) RETURNS boolean`

  Drives the 14-day free trial gate for the LISTING SUBSCRIPTION (Agent/VIP),
  which is separate from the per-listing wizard trial (is_phone_trial_eligible).

  A user is ELIGIBLE for the subscription trial only if they look like a
  genuinely new lister. They are INELIGIBLE (return false) if EITHER:

    (a) They already own ANY listing (rental OR sale) that is currently active,
        OR was deactivated within the last 30 days; OR

    (b) Any contact phone that appears on one of THEIR OWN listings also appears
        on a DIFFERENT user's listing that is active or deactivated within the
        last 30 days. This catches a returning lister who opens a fresh account
        but reuses a phone number that is still live on another account.

  Per product decision the phone fingerprint is based ONLY on the contact phone
  recorded on listings (listings.contact_phone_e164); profiles.phone is NOT
  unioned in.

  Returns false when p_user_id is null (no authenticated caller) so that a trial
  is never granted without a resolved user.

  Called from authenticated contexts (the subscribe modal) AND from service_role
  (the create-listing-subscription-checkout edge function). Marked
  SECURITY DEFINER + STABLE.
*/

CREATE OR REPLACE FUNCTION is_subscription_trial_eligible(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM listings l
      WHERE
        -- (a) the user's own active/recent listing, any type
        (
          l.user_id = p_user_id
          AND (
            l.is_active = true
            OR (l.deactivated_at IS NOT NULL AND l.deactivated_at > NOW() - INTERVAL '30 days')
          )
        )
        OR
        -- (b) another user's active/recent listing sharing one of this user's contact phones
        (
          l.user_id <> p_user_id
          AND l.contact_phone_e164 IS NOT NULL
          AND (
            l.is_active = true
            OR (l.deactivated_at IS NOT NULL AND l.deactivated_at > NOW() - INTERVAL '30 days')
          )
          AND l.contact_phone_e164 IN (
            SELECT l2.contact_phone_e164
            FROM listings l2
            WHERE l2.user_id = p_user_id
              AND l2.contact_phone_e164 IS NOT NULL
          )
        )
    )
  END;
$$;

COMMENT ON FUNCTION is_subscription_trial_eligible(uuid) IS
  'Returns true only for genuinely new listers: false if the user owns any active/recent listing, or if a contact phone on their listings is live on another account. Drives the listing-subscription 14-day trial gate.';

GRANT EXECUTE ON FUNCTION is_subscription_trial_eligible(uuid) TO authenticated, service_role;

-- ============================================================================
-- MIGRATION: 20260609000000_monetization_hardening.sql
-- ============================================================================
/*
  # Monetization hardening — pre-launch audit fixes (June 2026)

  Six server-side fixes surfaced by the production-readiness audit. Each is
  independent; together they close every known way a residential rental can
  be active without coverage, and every way payment state can be tampered with.

  1. payment_kind default + tamper guard (trigger `zz_monetization_payment_guard`)
     - INSERT (rentals, monetization on):
        • NULL payment_kind no longer slips through (the old listing form at
          /post-old and the admin scraped-listings pipeline never set it).
          Default: admins → 'individual_trial' (admins may post unlimited
          free-trial listings by design); non-admins → 'individual_trial' when
          the contact phone is trial-eligible, else 'pending_payment'.
        • Non-admin inserts may not pre-set trial_started_at / paid_until /
          paused_paid_days, may not claim 'admin_granted'/'legacy_free'/
          'individual_paid', and an explicit 'individual_trial' from an
          ineligible phone is downgraded to 'pending_payment'.
     - UPDATE (rentals, monetization on): non-admin authenticated callers can
       no longer change payment_kind / trial_started_at / paid_until /
       paused_paid_days (RLS "Users can update own listings" allows any column;
       this trigger silently reverts those four). Service-role (webhooks, cron,
       SECURITY DEFINER RPCs) and admins are unaffected.

  2. is_phone_trial_eligible now also counts PENDING listings (approved=false,
     never deactivated, created in the last 30 days). Previously a phone could
     queue unlimited "first free trial" listings while none were yet approved.

  3. enable_monetization(): pending-approval rentals at launch are tagged
     'individual_trial' (clock stamps at approval) instead of falling into the
     inactive→'legacy_free' bucket (which would have made them free forever).

  4. auto_inactivate_old_listings (FINAL — supersedes 20260527150900):
     a. 'past_due' now counts as covered (Stripe dunning grace — the webhook
        maps terminal 'unpaid' to 'expired', which is not covered).
     b. New branch (6): active 'individual_paid' rentals with NO paid_until and
        NO banked days are deactivated. Closes the free-republish loophole
        (republish restored nothing but still granted a 30-day freshness run).
     c. Admin-granted subscriptions roll current_period_end forward monthly so
        the admin "who renews next" sort stays correct.

  5. enforce_subscription_listing_cap: 'past_due' counts as a covering status
     (consistent with 4a).
*/

-- ---------------------------------------------------------------
-- 1. Default + tamper-guard trigger.
--    Two trigger registrations of the same function — ordering matters
--    because BEFORE triggers fire alphabetically:
--      • INSERT guard is named zz_* so it runs AFTER
--        trg_normalize_contact_phone and sees contact_phone_e164 populated
--        for the trial-eligibility check.
--      • UPDATE guard is named aa_* so it runs BEFORE
--        listing_deactivation_timestamp_trigger — the guard reverts
--        user-supplied tampering first, then the lifecycle trigger applies
--        its legitimate paid_until banking/restore on is_active flips.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.monetization_payment_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_monetization_on boolean;
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_eligible boolean;
BEGIN
  -- Only residential rentals are monetized.
  IF NEW.listing_type IS DISTINCT FROM 'rental' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(monetization_enabled, false) INTO v_monetization_on
    FROM admin_settings LIMIT 1;
  IF NOT v_monetization_on THEN
    RETURN NEW;
  END IF;

  -- Service-role / cron / SECURITY DEFINER internals have no auth.uid().
  -- They are trusted writers (stripe-webhook, approve-listing, cascade,
  -- reconcile) — let them through untouched.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
    FROM profiles p WHERE p.id = v_uid;

  IF TG_OP = 'INSERT' THEN
    IF v_is_admin THEN
      -- Admins may post unlimited free-trial listings (by design) through any
      -- form, including /post-old and the scraped-listings pipeline. Default
      -- the kind so no admin path bypasses the payment system.
      IF NEW.payment_kind IS NULL THEN
        NEW.payment_kind := 'individual_trial';
      END IF;
      RETURN NEW;
    END IF;

    -- Non-admin inserts: clocks/balances are only ever set server-side.
    NEW.trial_started_at := NULL;
    NEW.paid_until := NULL;
    NEW.paused_paid_days := 0;

    -- Non-admins cannot claim privileged kinds.
    IF NEW.payment_kind IN ('admin_granted', 'legacy_free', 'individual_paid') THEN
      NEW.payment_kind := NULL;
    END IF;

    IF NEW.payment_kind IS NULL OR NEW.payment_kind = 'individual_trial' THEN
      v_eligible := (
        NEW.contact_phone_e164 IS NULL
        OR is_phone_trial_eligible(NEW.contact_phone_e164)
      );
      NEW.payment_kind := CASE WHEN v_eligible THEN 'individual_trial' ELSE 'pending_payment' END;
    END IF;
    -- 'subscription' is validated separately by enforce_subscription_listing_cap.
    RETURN NEW;
  END IF;

  -- UPDATE: silently revert non-admin changes to monetization columns.
  IF NOT v_is_admin THEN
    NEW.payment_kind := OLD.payment_kind;
    NEW.trial_started_at := OLD.trial_started_at;
    NEW.paid_until := OLD.paid_until;
    NEW.paused_paid_days := OLD.paused_paid_days;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zz_monetization_payment_guard ON listings;
DROP TRIGGER IF EXISTS zz_monetization_payment_guard_ins ON listings;
DROP TRIGGER IF EXISTS aa_monetization_payment_guard_upd ON listings;

CREATE TRIGGER zz_monetization_payment_guard_ins
  BEFORE INSERT ON listings
  FOR EACH ROW EXECUTE FUNCTION monetization_payment_guard();

CREATE TRIGGER aa_monetization_payment_guard_upd
  BEFORE UPDATE ON listings
  FOR EACH ROW
  WHEN (
    OLD.payment_kind IS DISTINCT FROM NEW.payment_kind
    OR OLD.trial_started_at IS DISTINCT FROM NEW.trial_started_at
    OR OLD.paid_until IS DISTINCT FROM NEW.paid_until
    OR OLD.paused_paid_days IS DISTINCT FROM NEW.paused_paid_days
  )
  EXECUTE FUNCTION monetization_payment_guard();

COMMENT ON FUNCTION public.monetization_payment_guard() IS
  'Guard on listings (rentals, monetization on). INSERT (zz_, after phone normalization): defaults payment_kind for paths that skip the wizard (old form, pipeline) — admins → individual_trial, others → trial if phone-eligible else pending_payment. UPDATE (aa_, before the lifecycle trigger): reverts non-admin changes to payment_kind/trial_started_at/paid_until/paused_paid_days. Service-role writers unaffected.';

-- ---------------------------------------------------------------
-- 2. Phone trial eligibility: pending listings count too.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_phone_trial_eligible(p_phone_e164 text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM listings
    WHERE contact_phone_e164 = p_phone_e164
      AND listing_type = 'rental'
      AND (
        is_active = true
        OR (deactivated_at IS NOT NULL AND deactivated_at > NOW() - INTERVAL '30 days')
        -- Pending approval (never deactivated): occupies the phone so a user
        -- can't queue multiple "first free trial" listings before approval.
        OR (
          approved = false
          AND is_active = false
          AND deactivated_at IS NULL
          AND created_at > NOW() - INTERVAL '30 days'
        )
      )
  );
$$;

COMMENT ON FUNCTION is_phone_trial_eligible(text) IS
  'Returns true if the phone has no rental listing active, pending approval (last 30d), or deactivated within the last 30 days. Drives the 14-day free trial gate.';

-- ---------------------------------------------------------------
-- 3. enable_monetization: pending rentals → individual_trial.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enable_monetization()
RETURNS TABLE(
  enabled boolean,
  trialed_count integer,
  legacy_count integer,
  enabled_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_is_admin boolean;
  v_trialed integer := 0;
  v_pending integer := 0;
  v_legacy integer := 0;
  v_now timestamptz := NOW();
BEGIN
  SELECT COALESCE(p.is_admin, false) INTO v_caller_is_admin
    FROM profiles p WHERE p.id = auth.uid();
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Only admins may call enable_monetization';
  END IF;

  UPDATE admin_settings
  SET monetization_enabled = true,
      monetization_enabled_at = COALESCE(monetization_enabled_at, v_now);

  -- Active rentals → 14-day trial starting now.
  WITH t AS (
    UPDATE listings
    SET payment_kind = 'individual_trial',
        trial_started_at = v_now,
        updated_at = v_now
    WHERE listing_type = 'rental'
      AND is_active = true
      AND payment_kind IS NULL
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_trialed FROM t;

  -- Pending-approval rentals (never deactivated) → individual_trial with NO
  -- trial_started_at; approve-listing stamps the clock at approval. Without
  -- this they'd fall into the legacy_free bucket below and post free forever.
  WITH p AS (
    UPDATE listings
    SET payment_kind = 'individual_trial',
        updated_at = v_now
    WHERE listing_type = 'rental'
      AND is_active = false
      AND approved = false
      AND deactivated_at IS NULL
      AND payment_kind IS NULL
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_pending FROM p;

  -- Remaining inactive rentals (previously live, now deactivated) → legacy_free.
  WITH l AS (
    UPDATE listings
    SET payment_kind = 'legacy_free',
        updated_at = v_now
    WHERE listing_type = 'rental'
      AND is_active = false
      AND payment_kind IS NULL
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_legacy FROM l;

  RETURN QUERY SELECT true, v_trialed + v_pending, v_legacy, v_now;
END;
$function$;

COMMENT ON FUNCTION public.enable_monetization() IS
  'Admin-only launch switch. Flips monetization_enabled and grandfathers rentals: active → individual_trial (clock now), pending-approval → individual_trial (clock at approval), deactivated → legacy_free. Idempotent.';

-- ---------------------------------------------------------------
-- 4. auto_inactivate_old_listings FINAL (supersedes 20260527150900).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_inactivate_old_listings()
  RETURNS TABLE(inactivated_count integer, listing_ids uuid[])
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  affected_ids uuid[];
  affected_count integer;
  v_rental_days integer;
  v_sale_days integer;
  v_monetization_on boolean;
BEGIN
  SELECT rental_active_days, sale_active_days, COALESCE(monetization_enabled, false)
    INTO v_rental_days, v_sale_days, v_monetization_on
    FROM admin_settings LIMIT 1;

  v_rental_days := COALESCE(v_rental_days, 30);
  v_sale_days := COALESCE(v_sale_days, 30);

  IF v_monetization_on THEN
    -- Expire no-card (admin/SQL) trial subscriptions after 14 days. Stripe
    -- manages Stripe-backed trials.
    UPDATE listing_subscriptions
    SET status = 'expired',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE status = 'trial'
      AND stripe_subscription_id IS NULL
      AND created_at < NOW() - INTERVAL '14 days';

    -- Roll admin-granted renewal anchors forward to the next occurrence of
    -- billing_day_of_month so the admin "who renews next" sort stays honest.
    UPDATE listing_subscriptions
    SET current_period_end = CASE
          WHEN date_trunc('month', NOW()) + ((billing_day_of_month - 1) * INTERVAL '1 day') > NOW()
            THEN date_trunc('month', NOW()) + ((billing_day_of_month - 1) * INTERVAL '1 day')
          ELSE date_trunc('month', NOW() + INTERVAL '1 month') + ((billing_day_of_month - 1) * INTERVAL '1 day')
        END,
        updated_at = NOW()
    WHERE status = 'admin_active'
      AND billing_day_of_month IS NOT NULL
      AND current_period_end IS NOT NULL
      AND current_period_end < NOW();
  END IF;

  WITH to_inactivate AS (
    SELECT l.id FROM listings l
    WHERE l.is_active = true
      AND l.approved = true
      AND (
        -- (1) EXISTING freshness — always applies.
        (
          (
            l.expires_at IS NOT NULL
            AND l.last_published_at IS NOT NULL
            AND GREATEST(
              l.expires_at,
              l.last_published_at + (
                CASE WHEN l.listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
                * INTERVAL '1 day'
              )
            ) < NOW()
          )
          OR (
            l.expires_at IS NOT NULL
            AND l.last_published_at IS NULL
            AND l.expires_at < NOW()
          )
          OR (
            l.expires_at IS NULL
            AND l.last_published_at IS NOT NULL
            AND l.last_published_at < NOW() - (
              CASE WHEN l.listing_type = 'sale' THEN v_sale_days ELSE v_rental_days END
              * INTERVAL '1 day'
            )
          )
        )
        -- (2)-(6) payment-kind branches — gated on flag.
        OR (
          v_monetization_on AND (
            (
              l.listing_type = 'rental'
              AND l.payment_kind = 'individual_trial'
              AND l.trial_started_at IS NOT NULL
              AND l.trial_started_at < NOW() - INTERVAL '14 days'
            )
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'individual_paid'
              AND l.paid_until IS NOT NULL
              AND l.paid_until < NOW()
            )
            -- (4) subscription no longer covering. 'past_due' stays covered
            -- (Stripe dunning grace); the webhook maps terminal 'unpaid' to
            -- 'expired', which is not in this list.
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'subscription'
              AND NOT EXISTS (
                SELECT 1 FROM listing_subscriptions ls
                WHERE ls.user_id = l.user_id
                  AND ls.status IN ('active', 'admin_active', 'trial', 'past_due')
              )
            )
            -- (5) never-paid "must pay" listing that slipped through approval.
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'pending_payment'
            )
            -- (6) paid listing with no balance left AND nothing banked — e.g.
            -- republished after its paid days ran out. Without this branch a
            -- free republish bought 30 fresh days on an exhausted listing.
            OR (
              l.listing_type = 'rental'
              AND l.payment_kind = 'individual_paid'
              AND l.paid_until IS NULL
              AND COALESCE(l.paused_paid_days, 0) <= 0
            )
          )
        )
      )
  )
  SELECT array_agg(id), COUNT(*)::integer
    INTO affected_ids, affected_count
    FROM to_inactivate;

  IF affected_ids IS NULL OR affected_count = 0 THEN
    affected_ids := ARRAY[]::uuid[];
    affected_count := 0;
  ELSE
    UPDATE listings
    SET is_active = false,
        updated_at = NOW()
    WHERE id = ANY(affected_ids);
  END IF;

  RETURN QUERY SELECT affected_count, affected_ids;
END;
$function$;

COMMENT ON FUNCTION public.auto_inactivate_old_listings() IS
  'Hourly cron. Always enforces freshness. When monetization is on: expires no-card trials, rolls admin-granted renewal anchors, and deactivates expired trials, exhausted/empty paid balances, uncovered subscription listings (past_due = still covered), and never-paid pending_payment listings.';

-- ---------------------------------------------------------------
-- 5. Cap trigger: past_due counts as covering (matches 4a).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_subscription_listing_cap()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_monetization_on boolean;
  v_is_admin boolean;
  v_has_sub boolean;
  v_cap integer;
  v_used integer;
BEGIN
  IF NEW.listing_type <> 'rental' OR NEW.payment_kind IS DISTINCT FROM 'subscription' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(monetization_enabled, false) INTO v_monetization_on
    FROM admin_settings LIMIT 1;
  IF NOT v_monetization_on THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
    FROM profiles p WHERE p.id = auth.uid();
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  SELECT
    bool_or(true),
    MAX(CASE WHEN listing_cap IS NULL THEN 2147483647 ELSE listing_cap END)
  INTO v_has_sub, v_cap
  FROM listing_subscriptions
  WHERE user_id = NEW.user_id
    AND status IN ('active', 'admin_active', 'trial', 'past_due');

  IF NOT COALESCE(v_has_sub, false) THEN
    RAISE EXCEPTION 'No active subscription to cover this listing'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COUNT(*) INTO v_used
  FROM listings
  WHERE user_id = NEW.user_id
    AND listing_type = 'rental'
    AND payment_kind = 'subscription'
    AND (is_active = true OR approved = false);

  IF v_used >= v_cap THEN
    RAISE EXCEPTION 'Subscription listing cap reached (% of %)', v_used, v_cap
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================================================
-- MIGRATION: 20260610000000_stagger_grandfather_trials.sql
-- ============================================================================
/*
  # Grandfathering v2 — split by phone volume, stagger trials over 3 days

  Product decisions (June 10 2026):

  1. SINGULAR listings (no other currently-active rental shares the same
     contact phone) → 14-day free trial with the SMS payment links, staggered
     into three even daily cohorts (trial_started_at = now / +1d / +2d) so
     expirations land on days 14–16 instead of one cliff.

  2. HIGH-VOLUME listings (two or more active rentals share a contact phone —
     almost certainly an agent) → tagged 'legacy_free' and left exactly as
     they behave today: the freshness window from the admin panel
     (admin_settings.rental_active_days) keeps governing deactivation, no
     payment is ever demanded, no trial SMS fires. The admin converts these
     accounts to subscriptions manually.

  Unchanged from 20260609000000:
   - Pending-approval rentals → 'individual_trial' (clock stamps at approval).
   - Previously-deactivated rentals → 'legacy_free'.
   - Idempotent: only rows with NULL payment_kind are touched.

  The return signature gains high_volume_count, so the old function is
  dropped first (CREATE OR REPLACE cannot change OUT parameters).
*/

DROP FUNCTION IF EXISTS public.enable_monetization();

CREATE FUNCTION public.enable_monetization()
RETURNS TABLE(
  enabled boolean,
  trialed_count integer,
  high_volume_count integer,
  legacy_count integer,
  enabled_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_is_admin boolean;
  v_trialed integer := 0;
  v_high_volume integer := 0;
  v_pending integer := 0;
  v_legacy integer := 0;
  v_now timestamptz := NOW();
BEGIN
  SELECT COALESCE(p.is_admin, false) INTO v_caller_is_admin
    FROM profiles p WHERE p.id = auth.uid();
  IF NOT v_caller_is_admin THEN
    RAISE EXCEPTION 'Only admins may call enable_monetization';
  END IF;

  UPDATE admin_settings
  SET monetization_enabled = true,
      monetization_enabled_at = COALESCE(monetization_enabled_at, v_now);

  -- ------------------------------------------------------------------
  -- Active rentals, step 1: SINGULAR phones → staggered 14-day trial.
  -- A listing is singular when its contact_phone_e164 is NULL or appears
  -- on no other currently-active untagged rental.
  -- ------------------------------------------------------------------
  WITH active_rentals AS (
    SELECT id, contact_phone_e164
    FROM listings
    WHERE listing_type = 'rental'
      AND is_active = true
      AND payment_kind IS NULL
  ),
  multi_phones AS (
    SELECT contact_phone_e164
    FROM active_rentals
    WHERE contact_phone_e164 IS NOT NULL
    GROUP BY contact_phone_e164
    HAVING COUNT(*) >= 2
  ),
  singles AS (
    SELECT ar.id,
           ((ROW_NUMBER() OVER (ORDER BY ar.id)) % 3) AS bucket
    FROM active_rentals ar
    WHERE ar.contact_phone_e164 IS NULL
       OR ar.contact_phone_e164 NOT IN (SELECT mp.contact_phone_e164 FROM multi_phones mp)
  ),
  t AS (
    UPDATE listings l
    SET payment_kind = 'individual_trial',
        trial_started_at = v_now + (s.bucket * INTERVAL '1 day'),
        updated_at = v_now
    FROM singles s
    WHERE l.id = s.id
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_trialed FROM t;

  -- ------------------------------------------------------------------
  -- Active rentals, step 2: everything still untagged shares a phone with
  -- another active rental → high-volume lister, leave behavior as today.
  -- 'legacy_free' = freshness window only (admin panel days), never
  -- payment-blocked, no trial SMS.
  -- ------------------------------------------------------------------
  WITH hv AS (
    UPDATE listings
    SET payment_kind = 'legacy_free',
        updated_at = v_now
    WHERE listing_type = 'rental'
      AND is_active = true
      AND payment_kind IS NULL
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_high_volume FROM hv;

  -- Pending-approval rentals → individual_trial, clock stamped at approval.
  WITH p AS (
    UPDATE listings
    SET payment_kind = 'individual_trial',
        updated_at = v_now
    WHERE listing_type = 'rental'
      AND is_active = false
      AND approved = false
      AND deactivated_at IS NULL
      AND payment_kind IS NULL
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_pending FROM p;

  -- Remaining inactive rentals (previously live, deactivated) → legacy_free.
  WITH l AS (
    UPDATE listings
    SET payment_kind = 'legacy_free',
        updated_at = v_now
    WHERE listing_type = 'rental'
      AND is_active = false
      AND payment_kind IS NULL
    RETURNING 1
  )
  SELECT COUNT(*)::integer INTO v_legacy FROM l;

  RETURN QUERY SELECT true, v_trialed + v_pending, v_high_volume, v_legacy, v_now;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.enable_monetization() TO authenticated;

COMMENT ON FUNCTION public.enable_monetization() IS
  'Admin-only launch switch. Flips monetization_enabled and grandfathers rentals: singular-phone actives → individual_trial staggered over 3 daily cohorts; shared-phone (high-volume/agent) actives → legacy_free (freshness-only, as today); pending-approval → individual_trial (clock at approval); deactivated → legacy_free. Idempotent.';
