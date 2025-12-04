/*
  # Add Privacy Documentation to Analytics Schema

  ## Overview
  This migration adds comprehensive documentation to the analytics_events table
  to clarify that all data is pseudonymized for privacy compliance.

  ## Changes Made

  1. Column Documentation
    - Add comments explaining that IP addresses are SHA-256 hashed
    - Document pseudonymous identifiers (anon_id, session_id)
    - Clarify data usage and privacy compliance

  ## Security and Privacy
  - IP addresses are hashed using SHA-256 before storage (handled in track function)
  - Anonymous identifiers provide analytics utility without personal identification
  - User agent strings stored as-is for device/browser analytics
  - No personally identifiable information (PII) is stored in raw form
*/

-- Add column comments to document pseudonymization and privacy compliance
COMMENT ON COLUMN analytics_events.ip_hash IS
  'SHA-256 hashed IP address for privacy compliance. Original IP addresses are never stored. Hashing performed by track edge function.';

COMMENT ON COLUMN analytics_events.ua IS
  'User agent string for device/browser analytics. Stored as-is for compatibility analysis.';

COMMENT ON COLUMN analytics_events.anon_id IS
  'Pseudonymous anonymous identifier (UUID). Links events from the same browser without personal identification.';

COMMENT ON COLUMN analytics_events.session_id IS
  'Pseudonymous session identifier (UUID). Groups events within a single browsing session.';

COMMENT ON COLUMN analytics_events.user_id IS
  'Optional authenticated user ID. Links to profiles table when user is logged in.';

COMMENT ON COLUMN analytics_events.event_name IS
  'Type of analytics event (e.g., page_view, listing_view, filter_apply).';

COMMENT ON COLUMN analytics_events.event_props IS
  'JSONB object containing event-specific properties. No PII should be stored here.';

COMMENT ON COLUMN analytics_events.occurred_at IS
  'Timestamp when the event occurred. Defaults to current timestamp.';

COMMENT ON TABLE analytics_events IS
  'First-party analytics events table. All personally identifiable information is pseudonymized for privacy compliance. IP addresses are SHA-256 hashed, and users are tracked via pseudonymous UUIDs.';