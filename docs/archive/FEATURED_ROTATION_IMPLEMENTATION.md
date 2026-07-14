# Featured Listings Equal-Probability Rotation Implementation

## Summary

Implemented session-seeded random shuffle for featured listings to ensure every featured listing gets equal probability of appearing in premium positions (slots 0 and 1). Previously, listings featured earliest always dominated top slots, creating unfair advantage. Now all featured listings have statistically equal exposure value.

## Changes Made

### 1. Session Seed Utility (`src/utils/sessionSeed.ts`)
- **`getSessionSeed()`**: Generates stable random seed per session, stored in sessionStorage
- **`seededShuffle()`**: Deterministic shuffle using Mulberry32 PRNG + Fisher-Yates algorithm
- Same seed + same array = same order (session consistency)
- Different seed = different order (fairness across users)

### 2. Browse Pages Rotation Logic
Updated both `BrowseListings.tsx` and `BrowseSales.tsx`:
- Import session seed utilities
- Generate combined seed: `sessionSeed ^ filterHash`
- Filter hash ensures different shuffles for different filter states
- Apply seeded shuffle to featured listings array
- Page-based slicing with wrap-around and deduplication
- Keeps hourly zone randomization (zoneB/zoneC) unchanged

### 3. Service Layer (`src/services/listings.ts`)
- Changed `getFeaturedListingsForSearch()` ordering from `featured_started_at ASC` to `created_at DESC`
- Database ordering no longer matters since client-side shuffle overrides it
- `featured_started_at` column preserved (used in admin dashboard)

## What Was NOT Changed

- Injection zone positions [0, 1, ~7, ~12] — unchanged
- Hourly zone randomization for positions 7-8 and 12-13 — unchanged
- ListingCard visual treatment — unchanged
- Map pin styling and z-index — unchanged
- Map popup "Featured" labels — unchanged
- Homepage carousel — unchanged
- Admin settings and dashboard — unchanged
- Database schema — unchanged
- `showFeaturedBadge` logic — unchanged

## Testing Checklist

### Basic Functionality
- [ ] Featured listings appear at positions 0, 1, ~7, ~12 as before
- [ ] Featured badge shows in injection positions
- [ ] No featured badge in organic positions (dual exposure preserved)

### Randomization Tests
- [ ] **Different sessions**: Open site in two browsers (or normal + incognito) and verify different featured listings appear at positions 0 and 1
- [ ] **Session consistency**: Within one session, navigate to page 2 and back to page 1 — should see same featured listings
- [ ] **Filter changes shuffle**: Apply bedroom filter — different featured listings appear
- [ ] **Clear filters returns**: Remove all filters — returns to original session shuffle

### Edge Cases
- [ ] 0 featured listings: Page loads normally with only organic listings
- [ ] 1-2 featured listings: All show on page 1, no duplicates
- [ ] 3-4 featured listings: All show on page 1 (exactly fills 4 slots)
- [ ] 8+ featured listings: Page 1 shows 4, page 2 shows next 4 from shuffled array
- [ ] More pages than featured: Wrap-around works, no duplicate on same page

### Sales Page
- [ ] All above tests work identically on `/browse-sales` page

### Mobile
- [ ] Browse works correctly on mobile with shuffle
- [ ] No console errors related to sessionStorage

### Analytics & Performance
- [ ] No console errors
- [ ] Page load performance unchanged
- [ ] Featured impressions still tracked correctly

## Implementation Details

### Filter Hash Calculation
```typescript
const filterHash = JSON.stringify(serviceFilters).split('').reduce(
  (hash, char) => ((hash << 5) - hash) + char.charCodeAt(0), 0
);
```
- Uses simple string hash (djb2 algorithm variant)
- Includes all filter state: bedrooms, price, neighborhoods, etc.
- Different filters = different hash = different shuffle

### Seed Combination
```typescript
const combinedSeed = sessionSeed ^ filterHash;
```
- XOR combines session seed with filter hash
- Same session + same filters = same combined seed = same order
- Different filters = different combined seed = different order

### Deduplication
```typescript
featuredForThisPage = [...new Map(featuredForThisPage.map(f => [f.id, f])).values()];
```
- Prevents same listing appearing twice on one page during wrap-around
- Preserves original shuffle order (Map maintains insertion order)

## Expected Behavior

### Scenario 1: Fresh Session
1. User opens site for first time
2. Session seed generated: `1234567890`
3. No filters, so `filterHash = [hash of empty object]`
4. Featured listings shuffled with combined seed
5. User sees randomized order at positions 0, 1

### Scenario 2: Apply Filter
1. User selects "2 bedrooms" filter
2. `filterHash` changes (now includes bedrooms:2)
3. Combined seed changes
4. Featured listings re-shuffled with new seed
5. Different listings appear at positions 0, 1

### Scenario 3: Clear Filter
1. User removes "2 bedrooms" filter
2. `filterHash` returns to original (empty filters)
3. Combined seed returns to original
4. Original shuffle restored
5. Same listings as scenario 1 appear at positions 0, 1

### Scenario 4: Different User
1. Different user opens site
2. Different session seed generated: `9876543210`
3. Same filters, but different session seed
4. Different shuffle order
5. Likely sees different listings at positions 0, 1

## Statistical Fairness

With N featured listings matching current filters:
- Each listing has 1/N probability of appearing in any specific position
- Over multiple users/sessions, exposure is statistically equal
- No systematic bias toward early-featured or late-featured listings
- Premium positions (0 and 1) distributed fairly across all featured listings

## Session Lifecycle

- **Creation**: First page load in new tab/window
- **Persistence**: Throughout tab/window lifetime
- **Expiration**: When tab/window closes
- **Storage**: sessionStorage (browser-native, automatic cleanup)
- **Scope**: Per-tab isolation (different tabs = different seeds)

## Future Enhancements (Not Implemented)

Potential improvements if needed:
- Time-based seed rotation (e.g., daily seed change)
- Per-user seed (if authenticated users should see consistent order across sessions)
- A/B testing framework for rotation strategies
- Admin analytics on featured position performance
