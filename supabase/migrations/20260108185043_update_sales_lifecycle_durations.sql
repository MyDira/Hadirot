/*
  # Update Sales Lifecycle Durations Documentation

  1. Changes
    - Update COMMENT on listings.sale_status to reflect new standard durations
    - Update COMMENT on listings.expires_at to clarify the duration standards
    
  2. New Duration Standards
    - Available: 30 days (updated from 14 days)
    - Pending: 30 days (updated from 14 days)
    - In Contract: 42 days (6 weeks, unchanged)
    - Sold: 30 days (unchanged, no extension allowed)
    - Rental: 30 days (unchanged)
    
  3. Notes
    - Extension window remains 7 days before expiration
    - Sold listings cannot be extended
    - This migration only updates documentation, no data changes
*/

-- Update sale_status column comment to reflect new durations
COMMENT ON COLUMN listings.sale_status IS 'Status of sale listing: available (30d), pending (30d), in_contract (42d), sold (30d, no extension)';

-- Update expires_at column comment to clarify duration standards
COMMENT ON COLUMN listings.expires_at IS 'Expiration date for listing. Rentals: 30d, Sales: 30d (available/pending/sold) or 42d (in_contract). Extension available 7d before expiration.';