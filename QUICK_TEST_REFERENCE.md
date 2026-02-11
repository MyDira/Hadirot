# Quick Test Reference - Filter Persistence Fix

## 30-Second Test

1. Go to browse page: http://localhost:5173/browse
2. Open console (F12)
3. Select "2 BR" filter
4. Click any listing
5. Click back or "Back to Browse"
6. ✅ **PASS:** Listings show only 2-bedroom apartments
7. ❌ **FAIL:** Listings show all bedroom counts

## What to Look For in Console

### ✅ Success Pattern (Filter Works)
```
🔄 Restoring filters from sessionStorage: {bedrooms: 2}
🎛️ ListingFilters: Received filters prop: {bedrooms: 2}
🔍 BrowseListings: Loading listings with filters: {bedrooms: 2}
📦 BrowseListings: Fetching with service filters: {bedrooms: 2}
```

### ❌ Failure Pattern (Bug Still Present)
```
🔄 Restoring filters from sessionStorage: {bedrooms: 2}
🔍 BrowseListings: Loading listings with filters: {}
📦 BrowseListings: Fetching with service filters: {}
```
**Problem:** Empty filters in fetch despite restoration

### ❌ No Restoration (sessionStorage Issue)
```
📋 Parsing filters from URL: {}
🔍 BrowseListings: Loading listings with filters: {}
```
**Problem:** Not detecting return from detail page

## Quick Checks

| Check | What to Verify | Expected Result |
|-------|---------------|-----------------|
| **URL** | Browser address bar | `/browse?bedrooms=2&page=1` |
| **Filter UI** | Dropdown selection | Shows "2 BR" selected |
| **Listings** | Property cards | All show 2 bedrooms |
| **Console** | Log messages | See success pattern above |
| **No Errors** | Red console text | No JavaScript errors |

## All Filter Types Quick Test

### 5-Minute Comprehensive Test

1. **Bedrooms:** Select "1 BR" → Navigate → Back → ✅ Works?
2. **Price:** Set $1000-$2500 → Navigate → Back → ✅ Works?
3. **Neighborhoods:** Select 2 areas → Navigate → Back → ✅ Works?
4. **Poster:** Select "All Landlords" → Navigate → Back → ✅ Works?
5. **Property Type:** Select "Full House" → Navigate → Back → ✅ Works?
6. **Multiple:** Combine 2-3 filters → Navigate → Back → ✅ Works?
7. **Pagination:** Filter + Page 2 → Navigate → Back → ✅ Works?
8. **Mobile:** Test on mobile viewport → ✅ Works?

## Keyboard Shortcuts

- **F12** or **Cmd+Option+I**: Open DevTools
- **Cmd/Ctrl+R**: Refresh page
- **Cmd/Ctrl+Shift+R**: Hard refresh
- **Cmd/Ctrl+K**: Clear console

## Common Issues & Quick Fixes

| Issue | Cause | Quick Fix |
|-------|-------|-----------|
| No console logs | Browser cache | Hard refresh (Cmd/Ctrl+Shift+R) |
| sessionStorage blocked | Private browsing | Test in normal window |
| Empty filters persist | Old code cached | Clear cache and refresh |
| Rapid nav breaks it | Race condition | Wait 100ms between clicks |

## Report Format (If Bug Found)

**Quick Bug Report:**
```
Test: [Test number/name]
Browser: [Chrome/Safari/Firefox + version]
Device: [Desktop/Mobile]
Console logs: [Copy paste the emoji logs]
URL: [Address bar content]
Expected: [What should happen]
Actual: [What actually happened]
```

## Success Criteria

### ✅ Complete Success When:
1. All 8 filter types work individually
2. Multiple filters work together
3. Pagination works with filters
4. Mobile and desktop both work
5. Rapid navigation doesn't break it
6. Console shows correct log patterns
7. No JavaScript errors
8. URL matches filter state

## Test Status Tracker

Mark with ✅ or ❌ as you test:

- [ ] Bedrooms filter
- [ ] Price range filter
- [ ] Neighborhoods filter
- [ ] Poster type filter
- [ ] Property type filter
- [ ] Parking checkbox
- [ ] No fee checkbox
- [ ] Multiple filters
- [ ] Pagination + filters
- [ ] Rapid navigation
- [ ] Mobile viewport
- [ ] Desktop viewport

## Need More Detail?

See `FILTER_FIX_TESTING_GUIDE.md` for comprehensive testing instructions.
See `FILTER_PERSISTENCE_BUG_FIX.md` for technical implementation details.
