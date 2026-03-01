/*
  # Cleanup Orphaned Pending Concierge Records

  1. Changes
    - Delete concierge_submissions linked to pending (unpaid) subscriptions
    - Delete concierge_subscriptions with status 'pending' (abandoned carts)

  2. Context
    - Previously, checkout created DB records before payment was completed
    - Users who abandoned checkout left orphan 'pending' records
    - Going forward, records are only created after successful payment via webhook
    - This migration cleans up the 4 existing orphaned records

  3. Important Notes
    - Only deletes records with status = 'pending'
    - Active/paid records are not affected
    - Safe to re-run (idempotent)
*/

DELETE FROM concierge_submissions
WHERE subscription_id IN (
  SELECT id FROM concierge_subscriptions WHERE status = 'pending'
);

DELETE FROM concierge_subscriptions WHERE status = 'pending';
