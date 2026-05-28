/*
  # Grandfather existing residential-rental listings into the new monetization system

  Run-once at deploy time:
    - Active residential rentals  → payment_kind='individual_trial', trial_started_at=NOW().
                                    They get a fresh 14-day free trial starting at deploy.
    - Inactive residential rentals → payment_kind='legacy_free'.
                                    Immune from payment-based deactivation; freshness still applies.

  Sale and commercial listings are untouched. Their payment_kind stays NULL forever
  (it's not a column on commercial_listings, and on the listings table sale rows just
  carry NULL — the cron skips them because all the new conditions are gated on
  listing_type='rental').

  After this migration:
    - The 14-day trial countdown starts now for all active rentals at launch.
    - The 5-day "is the listing still available?" SMS reminder continues as before.
    - The new 3-day "renew or pay?" SMS reminder will start firing for these listings
      as their trials approach expiry.

  Reactivation behavior (handled in application layer post-launch):
    - When a user reactivates a 'legacy_free' listing, the dashboard/edge-fn checks
      phone-trial-eligibility and either grants a fresh trial or requires $25 payment.
*/

UPDATE listings
SET payment_kind = 'individual_trial',
    trial_started_at = NOW(),
    updated_at = NOW()
WHERE listing_type = 'rental'
  AND is_active = true
  AND payment_kind IS NULL;

UPDATE listings
SET payment_kind = 'legacy_free',
    updated_at = NOW()
WHERE listing_type = 'rental'
  AND is_active = false
  AND payment_kind IS NULL;

-- Sanity check (logged in migration output, not enforced as a constraint):
DO $$
DECLARE
  v_trial_count integer;
  v_legacy_count integer;
  v_null_rentals integer;
BEGIN
  SELECT COUNT(*) INTO v_trial_count
    FROM listings WHERE listing_type = 'rental' AND payment_kind = 'individual_trial';
  SELECT COUNT(*) INTO v_legacy_count
    FROM listings WHERE listing_type = 'rental' AND payment_kind = 'legacy_free';
  SELECT COUNT(*) INTO v_null_rentals
    FROM listings WHERE listing_type = 'rental' AND payment_kind IS NULL;

  RAISE NOTICE 'Grandfather complete: % rentals into trial, % into legacy_free, % rentals still NULL (should be 0)',
    v_trial_count, v_legacy_count, v_null_rentals;
END $$;
