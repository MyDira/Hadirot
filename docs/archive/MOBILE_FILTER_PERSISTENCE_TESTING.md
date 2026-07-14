# Mobile Filter Persistence Testing Guide

## Overview
This document provides a comprehensive testing strategy for verifying that filter selections persist correctly when navigating between the browse page and listing detail pages on mobile devices.

## Implementation Summary

### Changes Made
1. **New Hook: `useBrowseFilters`** - Custom hook that manages filter state persistence using:
   - URL parameters (primary source of truth)
   - sessionStorage (for rapid restoration on back navigation)
   - Scroll position tracking and restoration

2. **Updated Components**:
   - `BrowseListings.tsx` - Now uses the `useBrowseFilters` hook
   - `ListingCard.tsx` - Marks navigation to detail page
   - `ListingDetail.tsx` - Marks navigation back to browse
   - `App.tsx` - ScrollToTop component respects browse page restoration

### How It Works
1. When a user applies filters on the browse page, they are stored in both URL parameters and sessionStorage
2. When navigating to a listing detail page, a flag is set in sessionStorage
3. When returning to browse page (via back button or "Back to Browse" link), the hook:
   - Detects the return navigation via the sessionStorage flag
   - Restores filter state from sessionStorage
   - Restores scroll position to where the user was
   - Updates URL to match the restored state

## Testing Checklist

### Prerequisites
- Access to mobile device or browser dev tools mobile emulation
- Test on multiple browsers: Safari (iOS), Chrome Mobile, Firefox Mobile

### Test Scenarios

#### 1. Basic Filter Persistence (Single Filter)
**Steps:**
1. Navigate to browse page on mobile
2. Open filter modal
3. Select "2 BR" bedrooms filter
4. Close modal and verify listings are filtered
5. Tap on any listing card
6. View the listing detail page
7. Tap "Back to Browse" or use browser back button
8. **Expected:** Browse page shows with 2 BR filter still active

#### 2. Multiple Filters Persistence
**Steps:**
1. Navigate to browse page
2. Apply multiple filters:
   - Bedrooms: 1 BR
   - Price: Min $1000, Max $3000
   - No Broker Fee: checked
3. Tap on a filtered listing
4. View detail page
5. Return to browse page
6. **Expected:** All three filters remain active

#### 3. Neighborhood Filter Persistence
**Steps:**
1. Navigate to browse page
2. Open filter modal
3. Select multiple neighborhoods (e.g., "Downtown", "Midtown")
4. Close modal
5. Tap on a listing
6. Return to browse page
7. **Expected:** Selected neighborhoods still show as active

#### 4. Pagination + Filters Persistence
**Steps:**
1. Apply any filter (e.g., 2 BR)
2. Navigate to page 2 of results
3. Tap on a listing from page 2
4. Return to browse page
5. **Expected:**
   - Still on page 2
   - Filters still active
   - Scroll position approximately restored

#### 5. Scroll Position Restoration
**Steps:**
1. Navigate to browse page
2. Scroll down to view listings in middle of page
3. Tap on a listing that's currently visible
4. View detail page
5. Return to browse page
6. **Expected:** Page scrolls back to approximately where user was

#### 6. Browser Back Button (iOS Safari)
**Test specifically on iOS Safari:**
1. Apply filters
2. Navigate to listing
3. Use iOS swipe-back gesture or back button
4. **Expected:** Filters and scroll position restored

#### 7. Browser Back Button (Chrome Mobile)
**Test on Chrome Mobile (Android/iOS):**
1. Apply filters
2. Navigate to listing
3. Use Chrome back button
4. **Expected:** Filters and scroll position restored

#### 8. "Back to Browse" Link
**Steps:**
1. Apply filters
2. Navigate to listing
3. Click "Back to Browse" link (not browser back button)
4. **Expected:** Filters and scroll position restored

#### 9. Filter Modal Interaction
**Steps:**
1. Apply filters
2. Navigate to listing
3. Return to browse
4. Open filter modal again
5. **Expected:** Filter selections still show correctly in modal

#### 10. Clear Filters After Return
**Steps:**
1. Apply filters
2. Navigate to listing
3. Return to browse (filters restored)
4. Open filter modal
5. Click "Clear All"
6. **Expected:** All filters cleared, URL updated

### Edge Cases

#### 11. Private Browsing Mode
**Steps:**
1. Open app in private/incognito mode
2. Apply filters
3. Navigate to listing
4. Return to browse
5. **Expected:**
   - Filters may not restore from sessionStorage (graceful degradation)
   - URL parameters should still work
   - No errors in console

#### 12. Low Memory Situation
**Test on low-end device:**
1. Apply filters
2. Open many apps in background
3. Navigate to listing
4. Switch to other apps (force memory pressure)
5. Return to browser and browse page
6. **Expected:** Filters restore from URL if sessionStorage cleared

#### 13. Direct URL Navigation
**Steps:**
1. Apply filters (e.g., bedrooms=2&no_fee_only=1)
2. Copy URL from address bar
3. Navigate away from browse page
4. Paste URL and navigate back
5. **Expected:** Filters applied from URL parameters

#### 14. Fresh Page Load
**Steps:**
1. Apply filters
2. Navigate to listing
3. Completely refresh the listing page (hard refresh)
4. Click back to browse
5. **Expected:**
   - Filters NOT restored (fresh session)
   - Default browse page shown

#### 15. Multiple Listings Navigation
**Steps:**
1. Apply filters
2. View listing A
3. Return to browse
4. Verify filters restored
5. View listing B
6. Return to browse
7. **Expected:** Filters still restored correctly

### Performance Testing

#### 16. Page Load Performance
**Steps:**
1. Apply all available filters
2. Navigate to listing
3. Return to browse
4. Measure time to interactive
5. **Expected:** No significant performance degradation

#### 17. Storage Cleanup
**Steps:**
1. Use browser dev tools to inspect sessionStorage
2. Apply filters and navigate multiple times
3. Verify no storage bloat
4. **Expected:** Only `browse_state` and `browse_scroll_restore` keys present

### Browser-Specific Tests

#### iOS Safari
- Test swipe-back gesture
- Test with Safari's aggressive memory management
- Test in low-power mode
- Verify viewport and scroll behavior

#### Chrome Mobile (Android)
- Test back button
- Test with Chrome's tab restoration
- Test with Data Saver mode

#### Chrome Mobile (iOS)
- Test back button
- Test with iOS Safari view underneath

#### Firefox Mobile
- Test back button
- Test with tracking protection enabled

## Validation Criteria

### Success Metrics
✅ Filters persist across navigation in 100% of normal scenarios
✅ Scroll position restored within ±100px on mobile devices
✅ No console errors or warnings
✅ Graceful degradation in edge cases (private browsing, etc.)
✅ URL remains shareable with filters intact
✅ Performance impact < 50ms on mid-range devices

### Failure Indicators
❌ Filters reset to default after navigation
❌ Console errors related to storage access
❌ Scroll position not restored (jumps to top)
❌ URL not updated correctly
❌ Filter modal shows incorrect state
❌ Pagination lost after return

## Debugging Tips

### Check sessionStorage
```javascript
// In browser console
console.log(sessionStorage.getItem('browse_state'));
console.log(sessionStorage.getItem('browse_scroll_restore'));
```

### Monitor Navigation
```javascript
// In browser console, watch for navigation events
window.addEventListener('popstate', (e) => {
  console.log('Navigation detected:', e);
});
```

### Verify URL Parameters
```javascript
// In browser console
console.log(new URLSearchParams(window.location.search).toString());
```

## Known Limitations

1. **Private Browsing**: sessionStorage may not be available in some private browsing modes. The implementation gracefully falls back to URL-only state.

2. **Memory Pressure**: On low-memory devices, sessionStorage may be cleared by the browser. URL parameters provide backup.

3. **Cross-Origin**: sessionStorage is origin-specific and won't persist across different domains.

4. **Scroll Restoration Timing**: On very slow devices, scroll restoration may take a moment to complete.

## Rollback Procedure

If issues are discovered, the implementation can be easily rolled back by:
1. Reverting `src/hooks/useBrowseFilters.ts` (delete file)
2. Reverting changes to `src/pages/BrowseListings.tsx`
3. Reverting changes to `src/components/listings/ListingCard.tsx`
4. Reverting changes to `src/pages/ListingDetail.tsx`
5. Reverting changes to `src/App.tsx`

The app will fall back to URL-based filter state without scroll restoration.
