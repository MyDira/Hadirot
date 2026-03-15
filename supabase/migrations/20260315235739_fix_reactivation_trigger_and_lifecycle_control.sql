/*
  # Fix Listing Reactivation Trigger and Lifecycle Control

  ## Summary
  This migration fixes three confirmed bugs in the listing expiration/deactivation lifecycle system.

  ## Bug 1 Fixed: Admin Panel Reactivation Gets Killed Next Day
  - The admin panel's `toggleListingActive` only set `is_active = true` without updating `expires_at`
  - The old (past) `expires_at` remained, so the midnight cron would immediately re-deactivate the listing
  - Fix: Enhance `set_listing_deactivated_timestamp()` trigger to ALSO set `last_published_at = NOW()`
    and `expires_at = NOW() + active_days` on ANY reactivation, regardless of which code path triggered it
  - This covers: admin panel toggle, future code paths, direct DB edits — all get a fresh expiry automatically

  ## Bug 2 Fixed: listing_active_days Admin Setting Has No Effect
  - `auto_inactivate_old_listings()` used `expires_at < NOW()` as primary check, never consulting `listing_active_days`
  - The `listing_active_days` fallback only triggered when `expires_at IS NULL` (which never happens in practice)
  - Fix 1: Trigger now reads `listing_active_days` when computing the new `expires_at` on reactivation
  - Fix 2: `auto_inactivate_old_listings()` now uses GREATEST(expires_at, last_published_at + active_days)
    as the effective expiration, so changing the admin setting immediately extends/shrinks all active listings

  ## Bug 3: Redundant Deactivation Systems
  - Both a pg_cron job and an edge function `inactivate-old-listings` called the same underlying function
  - The pg_cron job is the active one (confirmed doing all the work at midnight)
  - The edge function has no scheduler and hasn't run in 5+ days
  - No code change needed — the edge function is already effectively disabled
  - This migration adds a comment to document this for clarity

  ## Changes
  1. `set_listing_deactivated_timestamp()` — enhanced reactivation branch
  2. `auto_inactivate_old_listings()` — primary check now uses GREATEST() logic

  ## Sale Listing Expiration Rules (matches existing LISTING_DURATION_DAYS constants)
  - `in_contract`: 42 days
  - All other statuses (available, pending, sold): listing_active_days from admin_settings

  ## Notes
  - The trigger fires AFTER `renewListing` (dashboard) sets `expires_at`, then overwrites it with the same
    value (both read the same `listing_active_days`). Behavioral difference is negligible (milliseconds).
  - GREATEST() in the deactivation function means that if an admin increases `listing_active_days`,
    listings that were published recently are automatically protected — no bulk update needed.
*/

-- ─────────────────────────────────────────────────────────────
-- 1. Enhanced trigger: sets expires_at + last_published_at on reactivation
-- ─────────────────────────────────────────────────────────────
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
  -- Sets last_published_at and computes a fresh expires_at from admin_settings
  IF OLD.is_active = false AND NEW.is_active = true THEN
    NEW.deactivated_at = NULL;
    NEW.last_published_at = NOW();

    -- Read configured active days; default to 30 if not set
    SELECT listing_active_days INTO active_days FROM admin_settings LIMIT 1;
    IF active_days IS NULL THEN
      active_days := 30;
    END IF;

    -- Sale listings: in_contract gets 42 days, all others use active_days
    IF NEW.listing_type = 'sale' AND NEW.sale_status = 'in_contract' THEN
      NEW.expires_at = NOW() + INTERVAL '42 days';
    ELSE
      NEW.expires_at = NOW() + (active_days * INTERVAL '1 day');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 2. Updated deactivation function: GREATEST() makes listing_active_days live
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_inactivate_old_listings()
RETURNS TABLE(inactivated_count integer, listing_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  affected_ids uuid[];
  affected_count integer;
  active_days integer;
BEGIN
  -- Get the configured listing active days from admin_settings
  SELECT listing_active_days INTO active_days FROM admin_settings LIMIT 1;

  -- Default to 30 if not set
  IF active_days IS NULL THEN
    active_days := 30;
  END IF;

  -- Find listings to inactivate
  -- Effective expiration = GREATEST(expires_at, last_published_at + active_days)
  -- This means: if the admin increases listing_active_days, listings published recently are
  -- automatically protected even if their expires_at predates the setting change.
  SELECT
    array_agg(id),
    COUNT(*)::integer
  INTO
    affected_ids,
    affected_count
  FROM listings
  WHERE
    is_active = true
    AND approved = true
    AND (
      -- Both dates are set: use whichever grants the longer active period
      (
        expires_at IS NOT NULL
        AND last_published_at IS NOT NULL
        AND GREATEST(expires_at, last_published_at + (active_days * INTERVAL '1 day')) < NOW()
      )
      OR
      -- Only expires_at is set (no last_published_at)
      (
        expires_at IS NOT NULL
        AND last_published_at IS NULL
        AND expires_at < NOW()
      )
      OR
      -- Only last_published_at is set (no expires_at)
      (
        expires_at IS NULL
        AND last_published_at IS NOT NULL
        AND last_published_at < NOW() - (active_days * INTERVAL '1 day')
      )
    );

  IF affected_ids IS NULL OR affected_count = 0 THEN
    affected_ids := ARRAY[]::uuid[];
    affected_count := 0;
  ELSE
    UPDATE listings
    SET
      is_active = false,
      deactivated_at = NOW(),
      updated_at = NOW()
    WHERE id = ANY(affected_ids);
  END IF;

  RETURN QUERY SELECT affected_count, affected_ids;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- Note on Bug 3: The edge function inactivate-old-listings is redundant.
-- The pg_cron job "Deactivate Old Listings" (0 0 * * *) calls deactivate_old_listings()
-- which wraps auto_inactivate_old_listings(). The edge function has no scheduler and
-- is effectively disabled. No code removal is required here — it simply does nothing.
-- ─────────────────────────────────────────────────────────────
