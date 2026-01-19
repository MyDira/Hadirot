/*
  # SMS System Enhancements
  
  1. Changes
    - Adds `metadata` jsonb column to `listing_renewal_conversations` table
    - This column stores flexible data for different conversation types:
      - Multi-listing selection: Array of listing options for user to choose from
      - Report-rented flow: Reporter info (name, email, report type)
  
  2. New Conversation States (TEXT column, no ALTER TYPE needed)
    - `awaiting_report_response`: User reported listing as rented, awaiting owner confirmation
    - `awaiting_listing_selection`: User has multiple listings, needs to select which one to deactivate
  
  3. Security
    - No RLS changes needed - existing policies cover the new column
    
  4. Notes
    - The `state` column is TEXT type, so new state values work automatically
    - The `metadata` column is nullable to avoid breaking existing records
*/

-- Add metadata column for storing conversation data
ALTER TABLE listing_renewal_conversations 
ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT NULL;

-- Add comment explaining metadata usage
COMMENT ON COLUMN listing_renewal_conversations.metadata IS 
'Stores flexible data: multi-listing selection array, reporter info for report-rented flow, etc.
Example for listing selection: {"listings": [{"id": "uuid", "index": 1, "location": "...", "price": 2500}]}
Example for report: {"reporter_name": "John", "reporter_email": "john@example.com", "report_type": "user_report"}';

-- Add index for efficient JSONB queries (only indexes non-null values)
CREATE INDEX IF NOT EXISTS idx_renewal_conv_metadata 
ON listing_renewal_conversations USING gin (metadata) 
WHERE metadata IS NOT NULL;
