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
