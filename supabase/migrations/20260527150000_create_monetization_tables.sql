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
