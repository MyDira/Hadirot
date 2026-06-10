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
