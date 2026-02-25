/*
  # Create Concierge Service System

  1. New Tables
    - `concierge_subscriptions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `tier` (text: tier1_quick, tier2_forward, tier3_vip)
      - `status` (text: pending, active, cancelled, expired, past_due)
      - `stripe_subscription_id` (text, nullable for tier1)
      - `stripe_customer_id` (text)
      - `email_handle` (text, only for tier2)
      - `sources` (jsonb, only for tier3 - array of source strings)
      - `last_checked_at` (timestamptz, only for tier3 admin tracking)
      - `admin_notes` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `cancelled_at` (timestamptz)
    - `concierge_submissions` (for tier1 individual blurb submissions)
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `subscription_id` (uuid, references concierge_subscriptions)
      - `blurb` (text, the freeform listing description)
      - `status` (text: pending, paid, processing, posted, rejected)
      - `stripe_checkout_session_id` (text)
      - `stripe_payment_intent_id` (text)
      - `amount_cents` (integer, default 2500 = $25)
      - `admin_notes` (text)
      - `listing_id` (uuid, references listings - filled when admin creates listing)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Indexes
    - User and status lookups on both tables
    - Unique partial index on email_handle

  3. Security
    - RLS enabled on both tables
    - Users can read/insert their own records
    - Admins can update status and administrative fields
*/

-- concierge_subscriptions
CREATE TABLE IF NOT EXISTS concierge_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('tier1_quick', 'tier2_forward', 'tier3_vip')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'cancelled', 'expired', 'past_due')),
  stripe_subscription_id text,
  stripe_customer_id text,
  email_handle text,
  sources jsonb,
  last_checked_at timestamptz,
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz
);

-- concierge_submissions
CREATE TABLE IF NOT EXISTS concierge_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES concierge_subscriptions(id),
  blurb text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'processing', 'posted', 'rejected')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  amount_cents integer NOT NULL DEFAULT 2500,
  admin_notes text,
  listing_id uuid REFERENCES listings(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_concierge_subscriptions_user_id ON concierge_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_concierge_subscriptions_status ON concierge_subscriptions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_concierge_subscriptions_email_handle
  ON concierge_subscriptions(email_handle)
  WHERE email_handle IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_concierge_submissions_user_id ON concierge_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_concierge_submissions_status ON concierge_submissions(status);

-- Enable RLS
ALTER TABLE concierge_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE concierge_submissions ENABLE ROW LEVEL SECURITY;

-- RLS: concierge_subscriptions
CREATE POLICY "Users can view own subscriptions"
  ON concierge_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own subscriptions"
  ON concierge_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins can update subscriptions"
  ON concierge_subscriptions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can view all subscriptions"
  ON concierge_subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- RLS: concierge_submissions
CREATE POLICY "Users can view own submissions"
  ON concierge_submissions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own submissions"
  ON concierge_submissions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins can update submissions"
  ON concierge_submissions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

CREATE POLICY "Admins can view all submissions"
  ON concierge_submissions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_admin = true
    )
  );

-- Updated_at trigger function (reuse if exists)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_concierge_subscriptions_updated_at'
  ) THEN
    CREATE TRIGGER set_concierge_subscriptions_updated_at
      BEFORE UPDATE ON concierge_subscriptions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_concierge_submissions_updated_at'
  ) THEN
    CREATE TRIGGER set_concierge_submissions_updated_at
      BEFORE UPDATE ON concierge_submissions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
