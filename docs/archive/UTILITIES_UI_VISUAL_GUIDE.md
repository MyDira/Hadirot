# Utilities Checkbox UI - Visual Guide

## Location in Rental Listing Form

The utilities checkbox section was added to the **Property Details** section of rental listings.

---

## Form Layout Before Fix

```
┌─────────────────────────────────────────────────────┐
│         PROPERTY DETAILS (Rental Only)              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Bedrooms: [dropdown]    Bathrooms: [dropdown]     │
│  Square Feet: [input]    Lease Length: [dropdown]  │
│                                                     │
│  Parking: [dropdown]                                │
│  Heat: [dropdown]         <-- OLD: Only dropdown   │
│  Air Conditioning: [dropdown]                       │
│                                                     │
│  Apartment Conditions:                              │
│  [ ] Modern    [ ] Renovated    [ ] Spacious       │
│                                                     │
│  [ ] Washer/Dryer Hookup    [ ] Dishwasher         │
│  [ ] Broker Fee             [ ] Feature Listing    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Form Layout After Fix

```
┌─────────────────────────────────────────────────────┐
│         PROPERTY DETAILS (Rental Only)              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Bedrooms: [dropdown]    Bathrooms: [dropdown]     │
│  Square Feet: [input]    Lease Length: [dropdown]  │
│                                                     │
│  Parking: [dropdown]                                │
│  Heat: [dropdown]         <-- Syncs with checkbox  │
│  Air Conditioning: [dropdown]                       │
│                                                     │
│  Apartment Conditions:                              │
│  [ ] Modern    [ ] Renovated    [ ] Spacious       │
│                                                     │
│  [ ] Washer/Dryer Hookup    [ ] Dishwasher         │
│  [ ] Broker Fee             [ ] Feature Listing    │
│                                                     │
│  ┌───────────────────────────────────────────────┐ │
│  │  Utilities Included                  <- NEW  │ │
│  │  [ ] Heat           [ ] Hot Water            │ │
│  │  [ ] Gas            [ ] Electric             │ │
│  │  [ ] Water/Sewer    [ ] Internet             │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Visual Comparison

### Before Fix
```
Property Details Section:
├── Bedrooms/Bathrooms
├── Square Feet/Lease Length
├── Parking/Heat/AC
├── Apartment Conditions
└── Checkboxes (Washer, Dishwasher, Broker Fee, Featured)
    └── END OF SECTION ❌ No utilities checkboxes
```

### After Fix
```
Property Details Section:
├── Bedrooms/Bathrooms
├── Square Feet/Lease Length
├── Parking/Heat/AC
├── Apartment Conditions
├── Checkboxes (Washer, Dishwasher, Broker Fee, Featured)
└── Utilities Included Section ✅ NEW
    ├── [ ] Heat
    ├── [ ] Hot Water
    ├── [ ] Gas
    ├── [ ] Electric
    ├── [ ] Water/Sewer
    └── [ ] Internet
```

---

## Checkbox Grid Layout

The utilities section uses a responsive grid:

**Desktop (md and up):**
```
┌──────────────────┬──────────────────┬──────────────────┐
│  [ ] Heat        │  [ ] Hot Water   │  [ ] Gas         │
├──────────────────┼──────────────────┼──────────────────┤
│  [ ] Electric    │  [ ] Water/Sewer │  [ ] Internet    │
└──────────────────┴──────────────────┴──────────────────┘
```

**Mobile (< md):**
```
┌──────────────────┬──────────────────┐
│  [ ] Heat        │  [ ] Hot Water   │
├──────────────────┼──────────────────┤
│  [ ] Gas         │  [ ] Electric    │
├──────────────────┼──────────────────┤
│  [ ] Water/Sewer │  [ ] Internet    │
└──────────────────┴──────────────────┘
```

---

## Interaction Examples

### Example 1: Checking Heat Checkbox

**User Action:** Clicks "Heat" checkbox

**Before:**
```
Heat Dropdown: [Tenant Pays]
Utilities:
  [ ] Heat      <- Unchecked
  [ ] Hot Water
```

**After:**
```
Heat Dropdown: [Heat Included]  <- Auto-updated!
Utilities:
  [✓] Heat      <- Checked
  [ ] Hot Water
```

**Console:**
```
🔧 Utilities included updated: ["heat"]
🔧 Heat field value: included
```

---

### Example 2: Using Heat Dropdown

**User Action:** Changes heat dropdown to "Heat Included"

**Before:**
```
Heat Dropdown: [Tenant Pays]
Utilities:
  [ ] Heat      <- Unchecked
```

**After:**
```
Heat Dropdown: [Heat Included]
Utilities:
  [✓] Heat      <- Auto-checked!
```

---

### Example 3: Webhook Parsing

**User Action:** Pastes listing text with utilities, clicks "Parse with AI"

**Webhook Returns:**
```json
{
  "utilities_included": ["heat", "hot water", "gas"]
}
```

**Result in UI:**
```
Heat Dropdown: [Heat Included]  <- Auto-set
Utilities:
  [✓] Heat         <- Checked
  [✓] Hot Water    <- Checked
  [✓] Gas          <- Checked
  [ ] Electric
  [ ] Water/Sewer
  [ ] Internet
```

**Console:**
```
========== WEBHOOK RESPONSE ==========
utilities_included: ["heat", "hot water", "gas"]
======================================

========== MAPPED FORM DATA ==========
utilities_included: ["heat", "hot_water", "gas"]
heat: "included"
======================================

🔧 Utilities included updated: ["heat", "hot_water", "gas"]
🔧 Heat field value: included
```

---

## CSS Classes Used

```css
/* Section Container */
.mt-6                    /* Margin top for spacing */

/* Label */
.block                   /* Display block */
.text-sm                 /* Small text */
.font-medium             /* Medium font weight */
.text-gray-700           /* Dark gray text */
.mb-3                    /* Margin bottom */

/* Grid Container */
.grid                    /* CSS Grid */
.grid-cols-2             /* 2 columns on mobile */
.md:grid-cols-3          /* 3 columns on desktop */
.gap-3                   /* Gap between items */

/* Individual Checkbox */
.flex                    /* Flexbox */
.items-center            /* Center align items */

/* Checkbox Input */
.h-4                     /* Height 4 (16px) */
.w-4                     /* Width 4 (16px) */
.text-brand-700          /* Brand color when checked */
.focus:ring-[#273140]    /* Focus ring color */
.border-gray-300         /* Border color */
.rounded                 /* Rounded corners */
.mr-2                    /* Margin right */

/* Checkbox Label */
.text-sm                 /* Small text */
.text-gray-700           /* Dark gray text */
```

---

## Accessibility Features

- **Keyboard Navigation:** All checkboxes are keyboard accessible (Tab to navigate, Space to toggle)
- **Labels:** Each checkbox has a proper label element wrapping both input and text
- **Focus States:** Checkboxes show focus ring when selected via keyboard
- **ARIA:** Checkboxes use native HTML input[type=checkbox] for screen reader support
- **Contrast:** Text and checkbox colors meet WCAG AA standards

---

## Mobile Responsiveness

**Mobile View (< 768px):**
- Grid uses 2 columns
- Checkboxes remain easily tappable (44px minimum tap target)
- Section scrolls naturally with rest of form

**Desktop View (≥ 768px):**
- Grid uses 3 columns
- More compact layout
- Better visual hierarchy

---

## State Management

### formData Structure:
```typescript
{
  listing_type: 'rental',
  heat: 'included' | 'tenant_pays',
  utilities_included: string[],  // e.g., ["heat", "hot_water", "gas"]
  // ... other fields
}
```

### Checkbox State Calculation:
```typescript
checked={
  formData.utilities_included?.includes(
    utility.toLowerCase().replace('/', '_').replace(' ', '_')
  ) || false
}
```

### Toggle Handler:
```typescript
onChange={() => handleUtilityToggle(
  utility.toLowerCase().replace('/', '_').replace(' ', '_')
)}
```

---

## Testing Checklist

UI Testing:
- [ ] Utilities section renders for rental listings
- [ ] Utilities section does NOT render for sale listings
- [ ] All 6 utility checkboxes display correctly
- [ ] Checkboxes are properly aligned
- [ ] Labels are readable and not truncated
- [ ] Grid layout responsive (2 cols mobile, 3 cols desktop)

Functionality Testing:
- [ ] Clicking checkbox toggles its state
- [ ] Checking "Heat" updates heat dropdown to "Heat Included"
- [ ] Unchecking "Heat" updates heat dropdown to "Tenant Pays"
- [ ] Changing heat dropdown updates heat checkbox
- [ ] Multiple utilities can be selected simultaneously
- [ ] Console logs utilities changes correctly

Data Flow Testing:
- [ ] Webhook utilities map to UI checkboxes
- [ ] formData.utilities_included updates when checkbox toggled
- [ ] Draft save preserves utilities
- [ ] Draft load restores utilities
- [ ] Form submission includes utilities_included

---

## Known Behavior

### Heat Field Synchronization
- The old "Heat" dropdown and new "Heat" checkbox are **always synchronized**
- If heat checkbox is checked, dropdown shows "Heat Included"
- If heat checkbox is unchecked, dropdown shows "Tenant Pays"
- This is by design for backward compatibility

### Other Utilities
- Other utilities (Hot Water, Gas, Electric, Water/Sewer, Internet) only affect the utilities_included array
- They do not have separate dedicated fields like heat does
- This is intentional - heat field exists for legacy reasons

---

## Future Considerations

### Option 1: Keep Both Heat Controls
**Pros:**
- Backward compatible
- Familiar to existing users
- Clear visual indicator of heat inclusion

**Cons:**
- Duplicate controls for heat
- Potentially confusing to have two ways to set heat

### Option 2: Remove Heat Dropdown
**Pros:**
- Cleaner, single source of truth
- Consistent with other utilities
- Simpler data model

**Cons:**
- Breaking change for existing workflows
- Need database migration to convert heat field to utilities_included

### Recommendation:
Keep both controls for now (current implementation). Consider deprecating heat dropdown in future version after user feedback.

---

**UI Implementation Status:** ✅ COMPLETE
**Visual Testing:** ✅ READY
**User Experience:** ✅ CONSISTENT WITH SALES LISTINGS
