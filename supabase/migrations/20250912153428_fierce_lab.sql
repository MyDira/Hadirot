/*
  # Add deactivation email tracking to listings

  1. Schema Changes
    - Add `last_deactivation_email_sent_at` column to `listings` table
    - This column tracks when the last deactivation email was sent for a listing
    - Ensures idempotency - only one email per deactivation cycle

  2. Purpose
    - Enables automated email notifications when listings are auto-deactivated
    - Prevents duplicate emails for the same deactivation event
    - Allows for multiple emails if listing is renewed and deactivated again
*/

-- Add column to track when deactivation email was last sent
ALTER TABLE listings 
ADD COLUMN IF NOT EXISTS last_deactivation_email_sent_at timestamptz DEFAULT NULL;

-- Add index for efficient querying of listings needing deactivation emails
CREATE INDEX IF NOT EXISTS listings_deactivation_email_idx 
ON listings (is_active, deactivated_at, last_deactivation_email_sent_at) 
WHERE is_active = false;