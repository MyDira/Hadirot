/*
  # Add partial unique index to featured_purchases to prevent race conditions

  ## Problem
  Two simultaneous checkout requests (from create-checkout-session or create-boost-checkout)
  could both pass the application-level "existing pending purchase" check before either
  write completed, resulting in two pending featured_purchases rows for the same listing.
  This is a TOCTOU (time-of-check/time-of-use) race condition.

  ## Solution
  A partial unique index on listing_id filtered to active statuses makes it structurally
  impossible to have two concurrent rows for the same listing in any of the blocking states,
  regardless of concurrency or which edge function performs the insert.

  ## Notes
  - Statuses 'expired', 'cancelled', 'refunded', and 'free' are intentionally excluded
    so a listing can be featured again after a prior purchase expires or is cancelled,
    and so admin-granted free features are never blocked.
  - The application-level duplicate check in both edge functions is preserved as a
    first-line guard (defense in depth). This index is the hard enforcement layer.
*/

CREATE UNIQUE INDEX IF NOT EXISTS idx_featured_purchases_one_active_per_listing
  ON featured_purchases (listing_id)
  WHERE status IN ('pending', 'paid', 'active');
