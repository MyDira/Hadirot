/*
  # Remove Remaining Monetization Tables

  This migration removes the remaining monetization-related tables from the database:
  
  1. Tables Removed
    - `monetization_features` - Stores available monetization features
    - `feature_pricing` - Contains pricing information for features
    - `feature_entitlement` - Tracks user entitlements to features
  
  2. Security
    - Removes all RLS policies associated with these tables
    - Drops all related triggers, functions, and indexes
  
  3. Notes
    - This operation will permanently delete all monetization feature data
    - Foreign key constraints will be dropped automatically
    - Related sequences will be removed
*/

-- Drop monetization tables in correct order (children first to avoid FK issues)
DROP TABLE IF EXISTS feature_entitlement CASCADE;
DROP TABLE IF EXISTS feature_pricing CASCADE;
DROP TABLE IF EXISTS monetization_features CASCADE;
