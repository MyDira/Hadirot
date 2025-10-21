/*
  # Backfill agency_id for existing listings
  
  1. Purpose
    - Populates the agency_id field for listings created by agency owners
    - Fixes listings that were created before the agency_id field was properly populated
  
  2. Changes
    - Updates listings table to set agency_id based on user's owned agency
    - Only affects listings where agency_id is currently NULL
    - Links listings to agencies via the owner_profile_id relationship
  
  3. Process
    - Joins listings with agencies through profiles
    - Matches listing user_id to agency owner_profile_id
    - Updates only listings that belong to agency owners
  
  4. Notes
    - Safe to run multiple times (uses WHERE agency_id IS NULL)
    - Does not affect listings from non-agency users
    - Preserves existing agency_id values if already set
*/

-- Backfill agency_id for existing listings created by agency owners
UPDATE listings
SET agency_id = agencies.id
FROM agencies
WHERE listings.user_id = agencies.owner_profile_id
  AND listings.agency_id IS NULL;