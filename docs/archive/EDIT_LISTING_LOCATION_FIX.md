# Edit Listing Form Location Fields Fix

## Summary
Fixed the edit listing form to display location fields correctly based on listing type (rental vs. sales), matching the behavior of the original posting forms.

## Problem
The edit listing form was showing the same location field structure for both rental and sales listings (cross streets only), which differed from how the posting forms work:
- **Rental Listings**: Use cross streets + neighborhood selection
- **Sales Listings**: Use full address (street, unit, city, state, zip code)

## Solution

### 1. Conditional Location Field Rendering
Added conditional rendering in `EditListing.tsx` to display different location fields based on `formData.listing_type`:

**For Sales Listings:**
- Street Address (required)
- Unit/Apt # (optional)
- ZIP Code (required)
- City (required)
- State (required)
- LocationPicker configured for address-based geocoding

**For Rental Listings:**
- Cross Streets (2 fields using MapboxStreetAutocomplete)
- Neighborhood dropdown (required)
- LocationPicker configured for cross-street-based geocoding

### 2. Listing Type Field Lock
Added a read-only display of the listing type with visual badge:
- Shows "For Sale" (blue) or "For Rent" (green) badge
- Includes "(Cannot be changed)" text
- Prevents users from switching listing types during editing

### 3. Validation Updates
Enhanced form validation in `handleSubmit`:
- **Rental Listings**: Validates neighborhood selection
- **Sales Listings**: Validates all address fields (street, city, state, zip code)
- Both: Validate coordinates and location confirmation

### 4. Payload Construction
Updated the update payload to include address fields for sales listings:
- Builds full address string from individual fields
- Includes street_address, unit_number, city, state, zip_code
- Sets full_address field for display purposes

## Files Modified
- `/tmp/cc-agent/54127071/project/src/pages/EditListing.tsx`

## Changes Made

### Location Field Structure (Lines 1255-1438)
Replaced the universal cross streets section with conditional rendering:
```typescript
{isSaleListing ? (
  // Sales listing: Full address fields
  <>
    <div className="lg:col-span-2">
      <label>Street Address *</label>
      <input type="text" name="street_address" ... />
    </div>
    // ... city, state, zip, unit fields
  </>
) : (
  // Rental listing: Cross streets + neighborhood
  <>
    <div className="lg:col-span-2">
      <label>Cross Streets *</label>
      <MapboxStreetAutocomplete ... />
    </div>
    <div>
      <label>Neighborhood *</label>
      <select ... />
    </div>
  </>
)}
```

### Listing Type Display (Lines 1255-1272)
Added read-only listing type indicator:
```typescript
<div>
  <label>Listing Type</label>
  <div className="flex items-center h-10 px-3 py-2 bg-gray-50 border border-gray-300 rounded-md">
    <span className={`badge ${isSaleListing ? 'blue' : 'green'}`}>
      {isSaleListing ? 'For Sale' : 'For Rent'}
    </span>
    <span>(Cannot be changed)</span>
  </div>
</div>
```

### Address Validation (Lines 745-770)
Added validation for sales listing address fields:
```typescript
if (isSaleListing) {
  if (!formData.street_address?.trim()) {
    alert("Please enter a street address");
    return;
  }
  // ... validate city, state, zip
}
```

### Payload Updates (Lines 889-934)
Enhanced payload construction for sales listings:
```typescript
if (isSaleListing) {
  const addressParts = [
    formData.street_address,
    formData.unit_number ? `Unit ${formData.unit_number}` : '',
    formData.city || 'Brooklyn',
    formData.state || 'NY',
    formData.zip_code || ''
  ].filter(Boolean);
  const fullAddress = addressParts.join(', ');

  Object.assign(updatePayload, {
    street_address: formData.street_address || null,
    unit_number: formData.unit_number || null,
    city: formData.city || null,
    state: formData.state || null,
    zip_code: formData.zip_code || null,
    full_address: fullAddress,
    // ... other sales fields
  });
}
```

## Testing Checklist

### Rental Listing Edit
- [ ] Cross streets fields appear and populate correctly
- [ ] Neighborhood dropdown appears with correct selection
- [ ] Custom neighborhood input works when "Other" is selected
- [ ] LocationPicker opens and allows setting coordinates
- [ ] Cross streets update location field correctly
- [ ] Form saves successfully with all fields preserved

### Sales Listing Edit
- [ ] Street address field appears and populates correctly
- [ ] Unit number, city, state, zip fields appear with existing data
- [ ] LocationPicker opens and allows setting coordinates
- [ ] Address-based geocoding works correctly
- [ ] Form saves successfully with address fields preserved
- [ ] Neighborhood auto-derives from coordinates on save

### General
- [ ] Listing type badge displays correctly (blue for sale, green for rent)
- [ ] Listing type cannot be changed (field is read-only)
- [ ] Form validation works for required fields
- [ ] Coordinate validation and confirmation works
- [ ] No console errors during editing or saving
- [ ] Build succeeds without TypeScript errors

## Expected Behavior

### Rental Listing
1. User opens edit form for rental listing
2. Sees "For Rent" badge (locked)
3. Sees cross streets fields with existing values
4. Sees neighborhood dropdown with current selection
5. Can update cross streets and neighborhood
6. Can set/update map coordinates
7. Saves successfully preserving all rental fields

### Sales Listing
1. User opens edit form for sales listing
2. Sees "For Sale" badge (locked)
3. Sees full address fields with existing values
4. Can update street, unit, city, state, zip
5. Can set/update map coordinates
6. Saves successfully preserving all address fields
7. Neighborhood auto-derives from coordinates

## Notes
- The listing type field is intentionally locked to prevent users from converting rentals to sales or vice versa
- Sales listings automatically derive neighborhood from coordinates during save
- Rental listings require manual neighborhood selection
- All existing form validation and submission logic is preserved
- The fix maintains consistency with the PostListing.tsx implementation
