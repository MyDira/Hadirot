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
