/*
  # Fix: payment guard strips agents' legacy_free (monetization audit 2026-07-10)

  ROOT CAUSE — the June 9 hardening trigger (20260609000000) treats
  'legacy_free' as a privileged payment_kind no non-admin may claim. Agent-free
  posting (20260622000000) works by having the wizard insert
  payment_kind='legacy_free' for qualifying agents; the trigger silently
  stripped it on every insert, so since ~June 24 every agent post became
  'individual_trial' (fresh phone) or 'pending_payment' (phone already on an
  active listing). Result verified in prod on July 10: 162 mis-tagged agent
  listings, trial deactivations + pay prompts starting July 9.

  This migration:

  1. `is_free_posting_agent(p_user_id)` — server-side single source of truth
     for the agent-free rule (mirrors src/services/agentFreePosting.ts):
     charge_agents OFF AND (role='agent' OR free_posting_agent OR
     >=3 lifetime listings). Returns false when charge_agents is ON, so
     flipping that switch instantly puts agents back on the paid flow with no
     further schema change.

  2. `monetization_payment_guard()` rewritten:
     - Non-admin INSERT: the guard now DERIVES the kind server-side. If the
       poster qualifies as a free agent → 'legacy_free' (no client trust
       needed; even an old client build gets the right kind). Otherwise the
       previous behavior is preserved exactly (strip privileged kinds, then
       trial-vs-pending by phone eligibility).
     - Admin INSERT with NULL kind: default now considers the ASSIGNED OWNER
       (NEW.user_id) — admin posting for/assigning to a free agent (or to
       themselves) yields 'legacy_free' with the normal admin-controlled
       expiration, instead of putting the listing on a 14-day trial clock.
       Admin-supplied explicit kinds are still passed through untouched.
     - UPDATE branch unchanged (reverts non-admin tampering).

  3. One-time repair backfill:
     a. Capture cron-deactivated victims BEFORE clocks are nulled:
        trial listings killed at/after trial_started_at+14d, and
        pending_payment listings killed by the nightly job — all approved,
        all with the midnight-UTC cron signature on deactivated_at. (One
        listing deactivated via the reported-rented SMS timeout is naturally
        excluded by these criteria: its trial had not expired.)
     b. Re-tag ALL mis-tagged agent-qualifying rentals
        (individual_trial + pending_payment) to 'legacy_free' and null the
        payment clocks. individual_paid and subscription are deliberately
        left alone (same policy as the 20260623 backfill).
     c. Reactivate the captured victims. The existing lifecycle trigger
        (set_listing_deactivated_timestamp) does the bookkeeping: clears
        deactivated_at, stamps last_published_at, computes a fresh
        expires_at when the stored one is stale.

  Idempotent: functions are CREATE OR REPLACE; the backfill finds no rows on
  a second run. The migration connection has auth.uid() = NULL, so the
  guard's UPDATE branch passes its own writes through untouched.
*/

-- ---------------------------------------------------------------
-- 1. Server-side agent-free rule.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_free_posting_agent(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge_agents boolean;
  v_role text;
  v_flagged boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(charge_agents, false) INTO v_charge_agents
    FROM admin_settings LIMIT 1;
  IF v_charge_agents THEN
    RETURN false;
  END IF;

  SELECT p.role::text, COALESCE(p.free_posting_agent, false)
    INTO v_role, v_flagged
    FROM profiles p WHERE p.id = p_user_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN v_role = 'agent'
      OR v_flagged
      OR public.get_user_lifetime_listing_count(p_user_id) >= 3;
END;
$$;

COMMENT ON FUNCTION public.is_free_posting_agent(uuid) IS
  'True when the user posts residential rentals free: admin_settings.charge_agents is OFF and the user is role=agent, admin-flagged free_posting_agent, or has >=3 lifetime listings. Mirrors src/services/agentFreePosting.ts. Used by monetization_payment_guard.';

GRANT EXECUTE ON FUNCTION public.is_free_posting_agent(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------
-- 2. Guard rewrite — agent-aware on INSERT (both caller and assigned owner).
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
  -- reconcile, migrations) — let them through untouched.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
    FROM profiles p WHERE p.id = v_uid;

  IF TG_OP = 'INSERT' THEN
    IF v_is_admin THEN
      -- Admin explicit kinds pass through. A NULL kind is defaulted by the
      -- ASSIGNED OWNER: posting for / assigning to a free-posting agent (or
      -- to an admin's own agent-qualifying account) yields legacy_free with
      -- the normal admin-controlled expiration; anything else stays on the
      -- unlimited admin free-trial default so no admin path (old form,
      -- scraped-listings pipeline) bypasses the payment system.
      IF NEW.payment_kind IS NULL THEN
        IF public.is_free_posting_agent(NEW.user_id) THEN
          NEW.payment_kind := 'legacy_free';
        ELSE
          NEW.payment_kind := 'individual_trial';
        END IF;
      END IF;
      RETURN NEW;
    END IF;

    -- Non-admin inserts: clocks/balances are only ever set server-side.
    NEW.trial_started_at := NULL;
    NEW.paid_until := NULL;
    NEW.paused_paid_days := 0;

    -- Free-posting agents: the kind is DERIVED here, not trusted from the
    -- client. 'subscription' is the one client-declared kind allowed to
    -- stand (it is validated by enforce_subscription_listing_cap).
    IF public.is_free_posting_agent(v_uid) THEN
      IF NEW.payment_kind IS DISTINCT FROM 'subscription' THEN
        NEW.payment_kind := 'legacy_free';
      END IF;
      RETURN NEW;
    END IF;

    -- Non-agents cannot claim privileged kinds.
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

COMMENT ON FUNCTION public.monetization_payment_guard() IS
  'Guard on listings (rentals, monetization on). INSERT: free-posting agents (is_free_posting_agent) get payment_kind=legacy_free derived server-side — for non-admin posters by caller, for admin NULL-kind inserts by the assigned owner (NEW.user_id); other non-admins default to individual_trial/pending_payment by phone eligibility; other admin inserts default to individual_trial. UPDATE: reverts non-admin changes to payment_kind/trial_started_at/paid_until/paused_paid_days. Service-role writers unaffected.';

-- ---------------------------------------------------------------
-- 3. Repair backfill.
-- ---------------------------------------------------------------
DO $$
DECLARE
  v_react_ids uuid[];
  v_retagged integer;
  v_reactivated integer;
BEGIN
  -- (a) Capture reactivation victims FIRST (criteria need trial_started_at,
  --     which step b nulls). Midnight-UTC deactivated_at = nightly cron
  --     signature; a manual owner deactivation virtually never lands there,
  --     and the reported-rented timeout case fails the trial-expiry test.
  SELECT COALESCE(array_agg(l.id), ARRAY[]::uuid[]) INTO v_react_ids
  FROM listings l
  WHERE l.listing_type = 'rental'
    AND l.is_active = false
    AND l.approved = true
    AND l.deactivated_at IS NOT NULL
    AND l.deactivated_at > '2026-06-24'::timestamptz
    AND l.deactivated_at::time < time '00:05'
    AND (
      (l.payment_kind = 'individual_trial'
        AND l.trial_started_at IS NOT NULL
        AND l.deactivated_at >= l.trial_started_at + INTERVAL '14 days')
      OR l.payment_kind = 'pending_payment'
    )
    AND public.is_free_posting_agent(l.user_id);

  -- (b) Re-tag every mis-tagged agent-qualifying rental to legacy_free and
  --     clear the payment clocks. Paid/subscription listings are untouched.
  UPDATE listings l
  SET payment_kind = 'legacy_free',
      trial_started_at = NULL,
      paid_until = NULL,
      paused_paid_days = 0,
      updated_at = NOW()
  WHERE l.listing_type = 'rental'
    AND l.payment_kind IN ('individual_trial', 'pending_payment')
    AND public.is_free_posting_agent(l.user_id);
  GET DIAGNOSTICS v_retagged = ROW_COUNT;

  -- (c) Bring the wrongly-deactivated ones back. The lifecycle trigger
  --     clears deactivated_at, stamps last_published_at = NOW() and computes
  --     a fresh expires_at when the stored one is past.
  UPDATE listings
  SET is_active = true,
      updated_at = NOW()
  WHERE id = ANY(v_react_ids);
  GET DIAGNOSTICS v_reactivated = ROW_COUNT;

  RAISE NOTICE 'agent_free_posting_guard_fix: retagged % listings to legacy_free, reactivated %',
    v_retagged, v_reactivated;
END $$;
