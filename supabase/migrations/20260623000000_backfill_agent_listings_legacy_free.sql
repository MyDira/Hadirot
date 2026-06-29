/*
  # One-time backfill: free existing agents' trial listings

  Companion to 20260622000000_agent_free_posting.sql. That migration makes NEW
  agent posts free (legacy_free), but existing agent-owned rentals were put on
  the monetization clock (payment_kind='individual_trial') by the original
  enable_monetization() grandfather step. While charge_agents is OFF those
  listings should NOT be charged, get "pay $25" SMS, or be deactivated by the
  monetization trial-expiry branch.

  This re-tags agent-owned rental listings from 'individual_trial' to
  'legacy_free' (which every monetization job already excludes). Both active and
  inactive trials are converted so the reactivation/pay SMS branch also skips
  them.

  Scope / deliberate exclusions:
    - 'individual_paid' is LEFT ALONE — those agents bought days; honor them.
    - 'subscription' is LEFT ALONE — paying subscribers keep their plan.
    - Only listing_type='rental' (monetization is residential-rental only).

  "Agent" matches the same rule as the posting gate:
    role='agent' OR free_posting_agent OR lifetime listing count >= 3.

  Idempotent: re-running finds no remaining matching trials.
*/

UPDATE listings l
SET payment_kind = 'legacy_free',
    updated_at = NOW()
WHERE l.listing_type = 'rental'
  AND l.payment_kind = 'individual_trial'
  AND l.user_id IN (
    SELECT p.id FROM profiles p
    WHERE p.role = 'agent'
       OR COALESCE(p.free_posting_agent, false)
       OR get_user_lifetime_listing_count(p.id) >= 3
  );
