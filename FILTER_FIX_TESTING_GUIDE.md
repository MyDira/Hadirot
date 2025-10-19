# Filter Persistence Fix - Testing Guide

## What Was Fixed

### Root Cause
The `hasInitialized.current` guard in `useBrowseFilters.ts` was preventing the effect from re-running after URL parameters were updated during sessionStorage restoration. This caused:
- Visual filter state to show correctly (from initial state restoration)
- But listings to be fetched with empty/stale filters (because URL parsing was blocked)

### Solution Implemented
1. **Refactored initialization logic** to allow URL parameter re-parsing after sessionStorage restoration
2. **Added `isRestoringFromSession` ref** to coordinate timing between restoration and URL parsing
3. **Created `parseFiltersFromURL` function** to centralize URL parameter parsing logic
4. **Added comprehensive console logging** to track filter state through the restoration process

### Key Changes

#### `src/hooks/useBrowseFilters.ts`
- Added `isRestoringFromSession` ref to track restoration state
- Created `parseFiltersFromURL` callback for centralized URL parsing
- Modified initialization useEffect to:
  - Restore from sessionStorage on first mount when returning from detail page
  - Skip URL parsing during restoration (first 50ms after restoration starts)
  - Parse from URL after restoration completes or on normal navigation
- Added console logs: `🔄 Restoring filters from sessionStorage` and `📋 Parsing filters from URL`

#### `src/pages/BrowseListings.tsx`
- Added console logs to track when listings are loaded: `🔍 BrowseListings: Loading listings with filters`
- Added console log before fetching: `📦 BrowseListings: Fetching with service filters`

#### `src/components/listings/ListingFilters.tsx`
- Added console log to track filter prop changes: `🎛️ ListingFilters: Received filters prop`

## How to Test

### Setup
1. Open your browser's Developer Console (F12 or Cmd+Option+I)
2. Navigate to the Browse page: http://localhost:5173/browse
3. Keep the console open to monitor the log messages

### Test 1: Single Filter - Bedrooms
**Steps:**
1. On Browse page, select "2 BR" from bedrooms filter
2. Verify listings are filtered to 2-bedroom apartments
3. Click on any listing to view details
4. Click "Back to Browse" or use browser back button
5. **Expected Results:**
   - Console shows: `🔄 Restoring filters from sessionStorage: {bedrooms: 2}`
   - Console shows: `🔍 BrowseListings: Loading listings with filters: {bedrooms: 2}`
   - Console shows: `📦 BrowseListings: Fetching with service filters: {bedrooms: 2}`
   - URL shows: `/browse?bedrooms=2&page=1`
   - Filter UI shows "2 BR" selected
   - Listings are filtered to 2-bedroom apartments
   - ✅ **PASS if listings match the filter**
   - ❌ **FAIL if listings show all bedrooms**

### Test 2: Price Range Filter
**Steps:**
1. On Browse page, set Min Price to "1000" and Max Price to "2500"
2. Verify listings are within price range
3. Click on a listing
4. Return to Browse page
5. **Expected Results:**
   - Console shows: `🔄 Restoring filters from sessionStorage: {min_price: 1000, max_price: 2500}`
   - URL shows: `/browse?min_price=1000&max_price=2500&page=1`
   - Both price inputs show the values
   - Listings are within the price range
   - ✅ **PASS if listings match the price range**

### Test 3: Multiple Filters Combined
**Steps:**
1. Apply multiple filters:
   - Bedrooms: 1 BR
   - Min Price: 1500
   - Max Price: 3000
   - Check "No Broker Fee only"
2. Verify listings match all criteria
3. Click on a listing
4. Return to Browse page
5. **Expected Results:**
   - Console shows all filters in restoration log
   - URL contains all parameters: `bedrooms=1&min_price=1500&max_price=3000&no_fee_only=1`
   - All filter UI elements show correct values
   - Listings match ALL filter criteria
   - ✅ **PASS if listings match all filters**

### Test 4: Neighborhood Filter
**Steps:**
1. Click on Neighborhoods dropdown
2. Select 2-3 neighborhoods (e.g., "Downtown", "Midtown")
3. Verify listings are from selected neighborhoods
4. Click on a listing
5. Return to Browse page
6. **Expected Results:**
   - Console shows: `🔄 Restoring filters from sessionStorage: {neighborhoods: ['Downtown', 'Midtown']}`
   - Neighborhood tags appear below filters
   - Listings are from selected neighborhoods only
   - ✅ **PASS if neighborhoods persist and filter works**

### Test 5: Poster Type Filter
**Steps:**
1. Select "All Landlords" from "Who is Listing?" dropdown
2. Verify only landlord listings show
3. Click on a listing
4. Return to Browse page
5. **Expected Results:**
   - Console shows: `🔄 Restoring filters from sessionStorage: {poster_type: 'owner'}`
   - Dropdown shows "All Landlords" selected
   - Only landlord-posted listings appear
   - ✅ **PASS if poster type filter works**

### Test 6: Property Type Filter
**Steps:**
1. Select "Full House" from Rental Type dropdown
2. Verify only full house listings show
3. Click on a listing
4. Return to Browse page
5. **Expected Results:**
   - Property type filter persists
   - Only full house listings appear
   - ✅ **PASS if property type filter works**

### Test 7: Pagination with Filters
**Steps:**
1. Apply any filter (e.g., "2 BR")
2. Navigate to page 2 using pagination controls
3. Verify URL shows `bedrooms=2&page=2`
4. Click on a listing
5. Return to Browse page
6. **Expected Results:**
   - Console shows: `🔄 Restoring filters from sessionStorage: {bedrooms: 2}` with page: 2
   - Still on page 2 of results
   - Filter still active
   - Listings on page 2 match filter
   - ✅ **PASS if both pagination and filters persist**

### Test 8: Rapid Navigation
**Steps:**
1. Apply filter (e.g., "1 BR")
2. Click a listing
3. **Immediately** click back button
4. Click another listing
5. Click back button again
6. Repeat 2-3 times rapidly
7. **Expected Results:**
   - Filter persists through all navigations
   - No console errors
   - Listings always match the filter
   - ✅ **PASS if filter remains functional**

### Test 9: Mobile Filter Modal
**Steps:**
1. Resize browser to mobile width (< 768px) or use device emulation
2. Click "Filter Listings" button
3. In modal, select "2 BR"
4. Click "Apply Filters" button
5. Modal closes, listings are filtered
6. Click a listing
7. Return to Browse page
8. **Expected Results:**
   - Filter persists from mobile modal
   - Can open modal again and see "2 BR" selected
   - ✅ **PASS if mobile filters work**

### Test 10: Clear Filters After Return
**Steps:**
1. Apply filters (e.g., "2 BR")
2. Navigate to listing and back
3. Verify filters restored
4. Click "Clear All" button
5. **Expected Results:**
   - All filters clear
   - URL updates to `/browse?page=1`
   - All listings appear (no filtering)
   - ✅ **PASS if clearing works after restoration**

## Console Log Patterns

### Successful Filter Restoration
```
🔄 Restoring filters from sessionStorage: {bedrooms: 2}
🎛️ ListingFilters: Received filters prop: {bedrooms: 2}
🔍 BrowseListings: Loading listings with filters: {bedrooms: 2} page: 1
📦 BrowseListings: Fetching with service filters: {bedrooms: 2, noFeeOnly: undefined}
```

### Fresh Page Load (No Restoration)
```
📋 Parsing filters from URL: {bedrooms: 2}
🎛️ ListingFilters: Received filters prop: {bedrooms: 2}
🔍 BrowseListings: Loading listings with filters: {bedrooms: 2} page: 1
📦 BrowseListings: Fetching with service filters: {bedrooms: 2, noFeeOnly: undefined}
```

### Incorrect Behavior (Bug Present)
```
🔄 Restoring filters from sessionStorage: {bedrooms: 2}
🔍 BrowseListings: Loading listings with filters: {} page: 1
📦 BrowseListings: Fetching with service filters: {noFeeOnly: undefined}
```
❌ This would indicate filters are NOT being applied to the fetch

## Troubleshooting

### If filters still don't work:
1. **Check console logs** - Look for the emoji patterns above
2. **Verify sessionStorage** - In console, run: `sessionStorage.getItem('browse_state')`
3. **Check URL parameters** - Ensure URL has filter params after navigation
4. **Clear browser cache** - Sometimes cached state interferes
5. **Check for console errors** - Look for red error messages

### Common Issues:
- **Empty filters in fetch**: The coordination mechanism failed
- **Filters show but listings don't match**: State/URL synchronization issue
- **Filters disappear**: sessionStorage was cleared or blocked
- **Multiple fetches**: Effect dependencies may need adjustment

## Success Criteria

### ✅ All Tests Pass When:
1. Filters persist visually after navigation (UI shows correct values)
2. Listings actually match the filters (data is correctly filtered)
3. Console logs show correct filter values throughout the flow
4. URL parameters match the active filters
5. No JavaScript errors in console
6. Works on both desktop and mobile layouts
7. Works across all filter types: bedrooms, price, neighborhoods, poster type, property type
8. Pagination works with filters
9. Rapid navigation doesn't break filter persistence
10. Clear filters works correctly after restoration

## Reporting Issues

If any test fails, please provide:
1. Which test failed (test number and name)
2. Screenshot or copy of console logs
3. Browser and version (Chrome, Safari, Firefox)
4. Desktop or mobile view
5. Any error messages in console
6. URL shown in address bar when bug occurs

## Next Steps

After testing confirms all filters work:
1. Remove debug console logs from production code (optional)
2. Consider adding automated tests for this functionality
3. Monitor for any edge cases in production
4. Consider adding user-facing feedback during filter restoration
