/*
  # Extend concierge_subscriptions for the addon_concierge tier

  Adds `addon_concierge` as a new tier value. When a user with an Agent/VIP
  listing_subscription adds the concierge add-on ($50/mo), a concierge_subscriptions
  row is created with tier='addon_concierge' and listing_subscription_id pointing
  at the parent. When the parent subscription cancels, the Stripe webhook (and
  admin actions) cascade-cancel the addon row.

  Standalone tier1/2/3 concierge subscriptions are untouched and continue to
  work independently.

  1. Schema changes
    - Replace the tier CHECK constraint to allow 'addon_concierge'.
    - Add `listing_subscription_id` FK column (nullable; required only for addon tier).
    - Add CHECK that addon_concierge rows must have a parent listing_subscription_id.

  2. Index
    - Lookup by parent listing_subscription_id (used by cascade logic).
*/

-- Drop and recreate tier CHECK constraint with the new value.
-- (The CHECK constraint was originally inline so its name is the default
-- `concierge_subscriptions_tier_check`.)
ALTER TABLE concierge_subscriptions
  DROP CONSTRAINT IF EXISTS concierge_subscriptions_tier_check;

ALTER TABLE concierge_subscriptions
  ADD CONSTRAINT concierge_subscriptions_tier_check
  CHECK (tier IN ('tier1_quick', 'tier2_forward', 'tier3_vip', 'addon_concierge'));

-- Add FK column to parent listing_subscriptions.
-- Required only when tier='addon_concierge'.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'concierge_subscriptions' AND column_name = 'listing_subscription_id'
  ) THEN
    ALTER TABLE concierge_subscriptions
      ADD COLUMN listing_subscription_id uuid
        REFERENCES listing_subscriptions(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE concierge_subscriptions
  DROP CONSTRAINT IF EXISTS concierge_subscriptions_addon_requires_parent;

ALTER TABLE concierge_subscriptions
  ADD CONSTRAINT concierge_subscriptions_addon_requires_parent
  CHECK (
    tier != 'addon_concierge'
    OR listing_subscription_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS idx_concierge_subs_listing_subscription
  ON concierge_subscriptions(listing_subscription_id)
  WHERE listing_subscription_id IS NOT NULL;

COMMENT ON COLUMN concierge_subscriptions.listing_subscription_id IS
  'Parent listing_subscriptions row (Agent/VIP) when this row is an addon_concierge add-on. NULL for standalone tier1/2/3 subscriptions. Cascade-cancelled when parent ends.';
