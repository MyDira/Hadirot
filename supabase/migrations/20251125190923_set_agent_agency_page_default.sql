/*
  # Set Default Agency Page Access for Agents

  1. Changes
    - Add default value for `can_manage_agency` field to be true when role is 'agent'
    - Create a trigger to automatically set `can_manage_agency` to true for new agent signups
    - Backfill existing agents to have `can_manage_agency` enabled

  2. Security
    - No changes to RLS policies
    - Maintains existing security controls
*/

-- Add trigger function to automatically enable agency management for agents
CREATE OR REPLACE FUNCTION auto_enable_agency_for_agents()
RETURNS TRIGGER AS $$
BEGIN
  -- If the user is signing up as an agent, automatically enable agency management
  IF NEW.role = 'agent' THEN
    NEW.can_manage_agency = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new profile inserts
DROP TRIGGER IF EXISTS trigger_auto_enable_agency_for_agents ON profiles;
CREATE TRIGGER trigger_auto_enable_agency_for_agents
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_enable_agency_for_agents();

-- Backfill: Enable agency management for all existing agents who don't already have it
UPDATE profiles
SET can_manage_agency = true
WHERE role = 'agent' AND (can_manage_agency IS NULL OR can_manage_agency = false);
