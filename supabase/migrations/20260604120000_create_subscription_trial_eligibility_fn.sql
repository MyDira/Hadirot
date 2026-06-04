/*
  # Subscription free-trial eligibility

  `is_subscription_trial_eligible(p_user_id uuid DEFAULT auth.uid()) RETURNS boolean`

  Drives the 14-day free trial gate for the LISTING SUBSCRIPTION (Agent/VIP),
  which is separate from the per-listing wizard trial (is_phone_trial_eligible).

  A user is ELIGIBLE for the subscription trial only if they look like a
  genuinely new lister. They are INELIGIBLE (return false) if EITHER:

    (a) They already own ANY listing (rental OR sale) that is currently active,
        OR was deactivated within the last 30 days; OR

    (b) Any contact phone that appears on one of THEIR OWN listings also appears
        on a DIFFERENT user's listing that is active or deactivated within the
        last 30 days. This catches a returning lister who opens a fresh account
        but reuses a phone number that is still live on another account.

  Per product decision the phone fingerprint is based ONLY on the contact phone
  recorded on listings (listings.contact_phone_e164); profiles.phone is NOT
  unioned in.

  Returns false when p_user_id is null (no authenticated caller) so that a trial
  is never granted without a resolved user.

  Called from authenticated contexts (the subscribe modal) AND from service_role
  (the create-listing-subscription-checkout edge function). Marked
  SECURITY DEFINER + STABLE.
*/

CREATE OR REPLACE FUNCTION is_subscription_trial_eligible(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user_id IS NULL THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM listings l
      WHERE
        -- (a) the user's own active/recent listing, any type
        (
          l.user_id = p_user_id
          AND (
            l.is_active = true
            OR (l.deactivated_at IS NOT NULL AND l.deactivated_at > NOW() - INTERVAL '30 days')
          )
        )
        OR
        -- (b) another user's active/recent listing sharing one of this user's contact phones
        (
          l.user_id <> p_user_id
          AND l.contact_phone_e164 IS NOT NULL
          AND (
            l.is_active = true
            OR (l.deactivated_at IS NOT NULL AND l.deactivated_at > NOW() - INTERVAL '30 days')
          )
          AND l.contact_phone_e164 IN (
            SELECT l2.contact_phone_e164
            FROM listings l2
            WHERE l2.user_id = p_user_id
              AND l2.contact_phone_e164 IS NOT NULL
          )
        )
    )
  END;
$$;

COMMENT ON FUNCTION is_subscription_trial_eligible(uuid) IS
  'Returns true only for genuinely new listers: false if the user owns any active/recent listing, or if a contact phone on their listings is live on another account. Drives the listing-subscription 14-day trial gate.';

GRANT EXECUTE ON FUNCTION is_subscription_trial_eligible(uuid) TO authenticated, service_role;
