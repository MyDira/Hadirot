/*
  # Add current_period_end to concierge_subscriptions

  ## Summary
  Adds a single nullable timestamptz column to track when the current Stripe
  billing period ends. This value is used to display the access expiry date
  to users who have cancelled their subscription but whose service continues
  until the end of the paid period (cancel_at_period_end = true state).

  ## Changes
  - `concierge_subscriptions`
    - New column: `current_period_end` (timestamptz, nullable) — populated from
      Stripe's subscription.current_period_end Unix timestamp whenever a
      customer.subscription.updated or customer.subscription.deleted webhook
      is received.

  ## Notes
  - No RLS changes needed — this column is on an existing table with policies
    already in place.
  - Column is nullable so existing rows are unaffected.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'concierge_subscriptions' AND column_name = 'current_period_end'
  ) THEN
    ALTER TABLE concierge_subscriptions ADD COLUMN current_period_end timestamptz;
  END IF;
END $$;
