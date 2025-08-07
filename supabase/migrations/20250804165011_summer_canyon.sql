/*
  # Create listings_with_owner view for efficient filtering

  1. New View
    - `listings_with_owner` - combines listings with owner profile data
    - Includes all listing fields plus owner_name, owner_role, owner_agency
    - Enables direct filtering on owner properties without complex joins

  2. Benefits
    - Allows filtering on owner_role and owner_agency directly
    - Improves query performance by avoiding complex joins in application code
    - Maintains data consistency and reduces frontend complexity
*/

create or replace view listings_with_owner as
select
  l.*,
  p.full_name as owner_name,
  p.role as owner_role,
  p.agency as owner_agency
from listings l
join profiles p on p.id = l.user_id;