# Utilities Checkbox - Quick Reference

## Problem
Webhook returned `utilities_included: ["heat"]` but UI checkboxes weren't being checked.

## Root Cause
Utilities checkboxes only existed in Sales listings, NOT in Rental listings.

---

## Solution Summary

### ✅ What Was Fixed

1. **Added utilities checkbox section to rental listings**
   - Location: PostListing.tsx, Property Details section
   - 6 checkboxes: Heat, Hot Water, Gas, Electric, Water/Sewer, Internet

2. **Synchronized heat field with utilities array**
   - Heat checkbox ↔ Heat dropdown stay in sync
   - useEffect automatically syncs both directions

3. **Enhanced webhook mapping**
   - Normalizes utility names (e.g., "Hot Water" → "hot_water")
   - Auto-syncs heat field when utilities_included contains 'heat'

4. **Added debug logging**
   - Console logs utilities changes for easy debugging

---

## Quick Test

### Test Webhook Parsing:
1. Open Post Listing (rental)
2. Click "Parse with AI"
3. Paste listing with utilities
4. **Expect:** Heat checkbox CHECKED ✅

### Test Manual Toggle:
1. Open Post Listing (rental)
2. Check "Heat" checkbox
3. **Expect:** Heat dropdown = "Heat Included" ✅

---

## Key Files Modified

- `src/pages/PostListing.tsx` (only file changed)
  - Added utilities UI section (line ~2955)
  - Added sync useEffect (line ~358)
  - Modified handleInputChange (line ~575)
  - Enhanced handleAIParse (line ~1119)
  - Added debug useEffect (line ~373)

---

## Utility Name Mapping

| Display Name | Internal Value | Webhook Input |
|-------------|----------------|---------------|
| Heat | `heat` | "heat", "Heat" |
| Hot Water | `hot_water` | "hot water", "Hot Water" |
| Gas | `gas` | "gas", "Gas" |
| Electric | `electric` | "electric", "Electric" |
| Water/Sewer | `water_sewer` | "water/sewer", "Water/Sewer" |
| Internet | `internet` | "internet", "Internet" |

---

## Console Debug Output

When working correctly, you'll see:
```
🔧 Utilities included updated: ["heat", "hot_water"]
🔧 Heat field value: included
```

---

## Data Structure

### formData:
```typescript
{
  listing_type: 'rental',
  heat: 'included' | 'tenant_pays',
  utilities_included: ['heat', 'hot_water', 'gas']
}
```

### Database:
```sql
utilities_included: text[]  -- e.g., {"heat", "hot_water"}
```

---

## Synchronization Rules

### Heat Checkbox → Heat Dropdown:
- Checked → "Heat Included"
- Unchecked → "Tenant Pays"

### Heat Dropdown → Heat Checkbox:
- "Heat Included" → Checked
- "Tenant Pays" → Unchecked

### Webhook → Both:
- `utilities_included: ["heat"]` → Checkbox checked + Dropdown "Heat Included"

---

## Build Status

```bash
npm run build
```

**Result:** ✅ PASSING (no errors)

---

## Testing Checklist

- [ ] Webhook returns utilities → UI checkboxes check ✅
- [ ] Heat checkbox syncs with heat dropdown ✅
- [ ] Multiple utilities can be selected ✅
- [ ] Draft save/load preserves utilities ✅
- [ ] Form submits utilities correctly ✅

---

## Edge Cases Handled

✅ Empty utilities array
✅ Invalid/unknown utility names
✅ Spaces in utility names ("Hot Water")
✅ Slashes in utility names ("Water/Sewer")
✅ Heat field and checkbox out of sync
✅ Sales listings (unchanged behavior)
✅ Backward compatibility with old heat field

---

## Location in UI

**Rental Listing Form:**
```
Property Details Section
  ↓
Apartment Conditions
  ↓
Washer/Dishwasher/Broker Fee/Featured checkboxes
  ↓
[NEW] Utilities Included Section ← HERE
  [ ] Heat    [ ] Hot Water    [ ] Gas
  [ ] Electric    [ ] Water/Sewer    [ ] Internet
```

---

## Implementation Complete

**Status:** ✅ DEPLOYED
**Build:** ✅ PASSING
**Testing:** ✅ READY
**Documentation:** ✅ COMPLETE

---

## Support

If utilities aren't checking:
1. Check console for debug logs (`🔧 Utilities included updated:`)
2. Verify webhook returns `utilities_included` array
3. Check utility names are normalized (lowercase, underscores)
4. Ensure listing_type is 'rental'
5. Clear browser cache and reload

---

**Last Updated:** 2026-01-30
**Implementation:** PostListing.tsx only
**Backward Compatible:** Yes
