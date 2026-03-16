/*
  # Fix reactivation trigger to respect application-provided expires_at

  ## Summary
  Adds a guard clause to the set_listing_deactivated_timestamp() trigger so that
  when a reactivation UPDATE already includes a future expires_at value (as SMS
  renewal and dashboard renewal both do), the trigger does NOT overwrite it.

  ## Problem
  Previously, whenever is_active changed from false → true, the trigger
  unconditionally set expires_at = NOW() + listing_active_days regardless of
  what value the UPDATE statement itself provided for expires_at.

  This broke the SMS renewal flow: an expired listing being renewed via SMS would
  have its carefully calculated +14 day extension overwritten by a full
  listing_active_days reset.

  ## Change
  In the reactivation branch, last_published_at and deactivated_at are still
  reset unconditionally (correct behaviour for any reactivation). But expires_at
  is only computed and written if the incoming NEW.expires_at is NULL or already
  in the past. If the UPDATE provided a future expires_at the trigger leaves it
  untouched.

  ## Code paths affected
  - Admin panel toggle (no expires_at in UPDATE → stale past value stays → trigger sets fresh value) ✓
  - Dashboard renewListing (sets future expires_at → trigger skips → value preserved) ✓
  - SMS renewal on expired listing (sets future +14d expires_at → trigger skips → +14d preserved) ✓
  - SMS renewal on still-active listing (is_active unchanged → trigger branch never enters) ✓
*/

CREATE OR REPLACE FUNCTION public.set_listing_deactivated_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  active_days integer;
BEGIN
  -- Deactivation branch (active -> inactive)
  IF OLD.is_active = true AND NEW.is_active = false THEN
    NEW.deactivated_at = NOW();
  END IF;

  -- Reactivation branch (inactive -> active)
  IF OLD.is_active = false AND NEW.is_active = true THEN
    NEW.deactivated_at = NULL;
    NEW.last_published_at = NOW();

    -- Only compute a fresh expires_at when the UPDATE did not already supply
    -- a future value. This lets SMS renewal (+14 days) and manual renewals
    -- preserve their own expires_at calculations rather than being overwritten.
    IF NEW.expires_at IS NULL OR NEW.expires_at <= NOW() THEN
      SELECT listing_active_days INTO active_days FROM admin_settings LIMIT 1;
      IF active_days IS NULL THEN
        active_days := 30;
      END IF;

      IF NEW.listing_type = 'sale' AND NEW.sale_status = 'in_contract' THEN
        NEW.expires_at = NOW() + INTERVAL '42 days';
      ELSE
        NEW.expires_at = NOW() + (active_days * INTERVAL '1 day');
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
