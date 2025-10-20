/*
  # Add Approval Email Tracking System

  1. Schema Changes
    - Add `approval_email_sent_at` column to `listings` table
    - Tracks when approval notification email was last sent
    - Enables daily digest of newly approved listings
    - Prevents duplicate emails for same approval

  2. Indexing
    - Create index for efficient querying of listings needing approval emails
    - Optimized for daily batch processing

  3. Purpose
    - Supports automated daily email to admins with newly approved listings
    - Enables manual email sends from admin panel
    - Allows multiple emails if listing is re-approved
*/

-- Add column to track when approval email was last sent
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS approval_email_sent_at timestamptz DEFAULT NULL;

-- Add index for efficient querying of listings needing approval emails
CREATE INDEX IF NOT EXISTS listings_approval_email_idx
ON listings (approved, approval_email_sent_at, updated_at)
WHERE approved = true;

-- Add comment for documentation
COMMENT ON COLUMN listings.approval_email_sent_at IS 'Timestamp when the approval notification email was last sent to admins. Used to track which listings have been included in daily digest emails.';
