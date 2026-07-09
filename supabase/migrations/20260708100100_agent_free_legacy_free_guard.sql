/*
  # Agent-free posting: let qualifying agents keep payment_kind='legacy_free'
  # (Track-3 billing audit P1)

  ⚠️⚠️ OWNER REVIEW REQUIRED BEFORE APPLYING ⚠️⚠️
  This migration changes MONETIZATION BEHAVIOR. Read the two decisions below and
  confirm they match product intent before running it against any database.

  ── The problem ──────────────────────────────────────────────────────────────
  1. The June-9 tamper guard (monetization_payment_guard) predates the June-22
     agent-free feature. On a NON-admin INSERT it strips payment_kind='legacy_free'
     to NULL and then defaults the listing to individual_trial/pending_payment.
     So when a free-posting agent posts (the wizard sends 'legacy_free'), the DB
     silently puts them on the 14-day paywall clock — the exact opposite of the
     feature's promise. (The one-time backfill worked only because it ran as
     service-role, which the guard exempts; live agent posts do NOT.)
  2. Eligibility was partly driven by the SELF-DECLARED profiles.role='agent'
     (chosen at signup, not in any privileged-column guard), so a landlord could
     self-select "agent" to bypass the paywall once charge_agents is turned on.

  ── Decision A (server-authoritative eligibility) ────────────────────────────
  New SECURITY DEFINER helper is_user_free_agent(uid) decides "free agent" as:
       charge_agents = false
       AND ( profiles.free_posting_agent = true          -- admin-set override
             OR get_user_lifetime_listing_count(uid) >= 3 )  -- established volume
  It DELIBERATELY OMITS profiles.role. Rationale: role is self-declared and not
  protected, so trusting it re-opens the paywall bypass. The client gate
  (agentFreePostingService.isUserFreeAgent) is changed in the same PR to also
  drop the role check, so client and server agree.

  ⚠️ PRODUCT CONSEQUENCE the owner must accept: a brand-new user who set
  role='agent' at signup, has < 3 lifetime listings, and has NOT been flagged
  free_posting_agent by an admin will NO LONGER post free while charge_agents is
  off — they go on the normal trial/pay flow until an admin flags them or they
  reach 3 listings. If you instead want role='agent' to remain a free-posting
  signal, you must FIRST protect profiles.role from self-service writes (add it
  to prevent_privileged_profile_updates/inserts) and then add role back here.

  ── Decision B (guard normalizes to legacy_free) ─────────────────────────────
  On a non-admin rental INSERT with monetization ON, if is_user_free_agent(uid)
  is true the guard sets payment_kind='legacy_free' and returns (no trial clock,
  no paywall). Otherwise today's behavior is unchanged: legacy_free/admin_granted/
  individual_paid are stripped and the listing defaults to individual_trial (if
  phone-eligible) or pending_payment.

  This migration re-creates two functions (helper is additive; guard is a
  CREATE OR REPLACE that preserves all prior behavior except the new agent-free
  branch). It does NOT change the master monetization switch or charge_agents
  default (still false).
*/

-- ---------------------------------------------------------------
-- 1. is_user_free_agent(uid) — server-authoritative free-agent test.
--    SECURITY DEFINER so it reads admin_settings/profiles regardless of RLS.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_user_free_agent(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    -- charge_agents off (default true / "agents free" when the row is missing)
    COALESCE((SELECT NOT charge_agents FROM admin_settings LIMIT 1), true)
    AND (
      COALESCE((SELECT free_posting_agent FROM profiles WHERE id = p_uid), false)
      OR public.get_user_lifetime_listing_count(p_uid) >= 3
    );
$function$;

GRANT EXECUTE ON FUNCTION public.is_user_free_agent(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_user_free_agent(uuid) IS
  'Server-authoritative free-posting-agent test: charge_agents off AND (admin-set free_posting_agent OR >=3 lifetime listings). Deliberately ignores self-declared profiles.role. Used by monetization_payment_guard to permit payment_kind=legacy_free for qualifying non-admin rental posters.';

-- ---------------------------------------------------------------
-- 2. monetization_payment_guard — add the agent-free legacy_free branch.
--    (Full body re-created; only the non-admin INSERT branch changes.)
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
  -- reconcile) — let them through untouched.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.is_admin, false) INTO v_is_admin
    FROM profiles p WHERE p.id = v_uid;

  IF TG_OP = 'INSERT' THEN
    IF v_is_admin THEN
      -- Admins may post unlimited free-trial listings (by design) through any
      -- form, including /post-old and the scraped-listings pipeline. Default
      -- the kind so no admin path bypasses the payment system.
      IF NEW.payment_kind IS NULL THEN
        NEW.payment_kind := 'individual_trial';
      END IF;
      RETURN NEW;
    END IF;

    -- Non-admin inserts: clocks/balances are only ever set server-side.
    NEW.trial_started_at := NULL;
    NEW.paid_until := NULL;
    NEW.paused_paid_days := 0;

    -- Agent-free posting: qualifying free agents keep the legacy (free) path
    -- instead of the paywall. Server-authoritative — does NOT trust the
    -- self-declared profiles.role. This is what makes the wizard's
    -- payment_kind='legacy_free' stick for real free agents (previously it was
    -- stripped and the agent was silently put on the 14-day trial clock).
    IF public.is_user_free_agent(v_uid) THEN
      NEW.payment_kind := 'legacy_free';
      RETURN NEW;
    END IF;

    -- Non-admins (and non-qualifying users) cannot claim privileged kinds.
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
  'Guard on listings (rentals, monetization on). INSERT (zz_, after phone normalization): admins -> individual_trial; qualifying free agents (is_user_free_agent) -> legacy_free; everyone else -> individual_trial if phone-eligible else pending_payment (legacy_free/admin_granted/individual_paid claims stripped). UPDATE (aa_, before the lifecycle trigger): reverts non-admin changes to payment_kind/trial_started_at/paid_until/paused_paid_days. Service-role writers unaffected.';
