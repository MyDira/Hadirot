/*
  # Disable Agency Page Auto-Enable for New Signups

  1. Changes
    - Remove trigger that automatically enables agency management for new agents
    - Remove the auto-enable function
    - Set default behavior: new users will NOT have agency page access by default
    - Admins can manually grant can_manage_agency permission on a case-by-case basis

  2. Security
    - No changes to RLS policies
    - Maintains existing security controls
    - Only affects default behavior for new signups
*/

-- Drop the trigger that auto-enables agency management
DROP TRIGGER IF EXISTS trigger_auto_enable_agency_for_agents ON profiles;

-- Drop the function that was used by the trigger
DROP FUNCTION IF EXISTS auto_enable_agency_for_agents();

-- Add comment to document the permission model
COMMENT ON COLUMN profiles.can_manage_agency IS
  'Permission to create and manage agency pages. Defaults to false. Admins can manually grant this permission to users.';
