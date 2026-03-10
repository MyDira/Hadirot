/*
  # Fix Unindexed Foreign Keys

  Adds covering indexes for 4 foreign key columns that lack them:

  1. concierge_submissions.listing_id
  2. concierge_submissions.subscription_id
  3. featured_purchases.granted_by_admin_id
  4. listing_renewal_conversations.user_id

  These indexes prevent full table scans on JOIN and ON DELETE CASCADE operations.
*/

CREATE INDEX IF NOT EXISTS idx_concierge_submissions_listing_id
  ON public.concierge_submissions (listing_id);

CREATE INDEX IF NOT EXISTS idx_concierge_submissions_subscription_id
  ON public.concierge_submissions (subscription_id);

CREATE INDEX IF NOT EXISTS idx_featured_purchases_granted_by_admin_id
  ON public.featured_purchases (granted_by_admin_id);

CREATE INDEX IF NOT EXISTS idx_listing_renewal_conversations_user_id
  ON public.listing_renewal_conversations (user_id);
