# Digest Listing Groups Fix

## Problem Summary

When adding listing groups to digest emails, no listings were being sent even though the groups were configured correctly. The issue was a data type mismatch in the parking filter.

## Root Cause

The parking filter in three digest-related components was storing boolean values (`true`/`false`) instead of the actual database string values used by the listings table:

- Database parking values: `'yes'`, `'included'`, `'optional'`, `'no'`
- Components were storing: `true` (for with parking) or `false` (for no parking)

This mismatch caused the database queries to return zero results because:
1. When the UI sent `true`, the query looked for `parking = true` in the database
2. But the database contains string values like `'yes'`, `'included'`, etc.
3. Since `true` !== `'yes'`, no rows matched and zero listings were returned

## Files Modified

1. **src/components/admin/ListingGroupsBuilder.tsx**
   - Fixed parking filter dropdown to use database string values
   - Updated options to: Any, Yes (Separate), Included, Optional, No Parking
   - Changed value handling from boolean to string

2. **src/components/admin/CollectionConfigEditor.tsx**
   - Applied same parking filter fix as above
   - Ensures collection configs also use correct parking values

3. **src/components/admin/ListingFilterConfig.tsx**
   - Applied same parking filter fix as above
   - Ensures all digest filter configurations are consistent

## Changes Made

### Before
```typescript
// Boolean-based parking filter (incorrect)
<select
  value={group.filters.parking === undefined ? '' : group.filters.parking.toString()}
  onChange={(e) => handleUpdateFilter(index, 'parking', e.target.value === '' ? undefined : e.target.value === 'true')}
>
  <option value="">Any</option>
  <option value="true">With Parking</option>
  <option value="false">No Parking</option>
</select>
```

### After
```typescript
// String-based parking filter matching database schema (correct)
<select
  value={group.filters.parking || ''}
  onChange={(e) => handleUpdateFilter(index, 'parking', e.target.value || undefined)}
>
  <option value="">Any</option>
  <option value="yes">Yes (Separate)</option>
  <option value="included">Included</option>
  <option value="optional">Optional</option>
  <option value="no">No Parking</option>
</select>
```

## Database Schema

The listings table parking column uses these values:
```typescript
type ParkingType = 'yes' | 'included' | 'optional' | 'no';
```

- **yes**: Parking is available but separate
- **included**: Parking is included in the rent
- **optional**: Parking is optional
- **no**: No parking available

## Testing Instructions

1. Navigate to Admin Panel > WhatsApp Digest Manager
2. Create or edit a digest template
3. Expand the "Listings (Optional)" section
4. Click "Add Listing Group"
5. Configure the group:
   - Set a listing limit (e.g., 10)
   - Set a time filter (e.g., Last 24h)
   - Set parking filter to "Included" or "Yes (Separate)"
   - Add other filters as needed (bedrooms, property type, etc.)
6. Enable the group using the toggle
7. Click "Generate Preview"
8. Verify that listings matching your filters appear in the preview
9. Check that the parking filter is correctly filtering listings

## Expected Behavior

- Listings with parking set to "yes" should appear when "Yes (Separate)" is selected
- Listings with parking set to "included" should appear when "Included" is selected
- Listings with parking set to "no" should appear when "No Parking" is selected
- Listings with parking set to "optional" should appear when "Optional" is selected
- All listings should appear when "Any" is selected (parking filter not applied)

## Additional Notes

- The fix ensures consistency between the UI filter configuration and database queries
- All three digest-related components now use the same parking value format
- The database query logic in `digest.ts` was already correct (using `.eq('parking', value)`)
- The issue was purely in the UI layer sending incorrect filter values
