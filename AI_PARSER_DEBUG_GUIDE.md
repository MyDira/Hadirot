# AI Parser Debug Guide

## Bug Fixed: Form Fields Not Pre-filling

### Problem
The AI parser was successfully calling the webhook and showing success message, but form fields were not being updated.

### Root Causes Fixed

1. **Wrong Data Reference**: Code was using `parsedData` instead of extracting the actual data object
2. **Nested Response Structure**: Webhook might return `{ listing: {...} }` or `{ data: {...} }` instead of flat structure
3. **Alternative Field Names**: Fields like `cross_streets` vs `location`, `rent` vs `price`
4. **No Debugging**: Impossible to see what webhook actually returned

### Changes Made

#### 1. Added Comprehensive Console Logging

**Before:**
```javascript
const parsedData = await response.json();
console.log('AI Parsed Data:', parsedData);
```

**After:**
```javascript
const parsedData = await response.json();

console.log('========== N8N WEBHOOK RESPONSE ==========');
console.log('Full Response:', JSON.stringify(parsedData, null, 2));
console.log('Response Type:', typeof parsedData);
console.log('Response Keys:', Object.keys(parsedData));
console.log('==========================================');

// Handle different response structures
const data = parsedData.listing || parsedData.data || parsedData;

console.log('========== EXTRACTED DATA ==========');
console.log('Data to map:', JSON.stringify(data, null, 2));
console.log('Data Keys:', Object.keys(data));
console.log('====================================');
```

#### 2. Handle Nested Response Structures

The code now automatically detects and extracts data from:
- `response.listing` → `data`
- `response.data` → `data`
- `response` directly → `data`

```javascript
const data = parsedData.listing || parsedData.data || parsedData;
```

#### 3. Updated All Field References

**Before:**
```javascript
if (parsedData.bedrooms !== undefined) updatedFormData.bedrooms = Number(parsedData.bedrooms) || 1;
if (parsedData.price !== undefined) updatedFormData.price = Number(parsedData.price) || null;
```

**After:**
```javascript
if (data.bedrooms !== undefined) updatedFormData.bedrooms = Number(data.bedrooms) || 1;
if (data.price !== undefined) updatedFormData.price = Number(data.price) || null;
```

#### 4. Added Alternative Field Name Support

**Location Field:**
```javascript
// Handle location - might be 'location', 'cross_streets', or 'address'
if (data.location) updatedFormData.location = data.location;
else if (data.cross_streets) updatedFormData.location = data.cross_streets;
else if (data.address) updatedFormData.location = data.address;
```

**Price Field:**
```javascript
// Handle price and rent (might be called different things)
if (data.price !== undefined) updatedFormData.price = Number(data.price) || null;
else if (data.rent !== undefined) updatedFormData.price = Number(data.rent) || null;
else if (data.monthly_rent !== undefined) updatedFormData.price = Number(data.monthly_rent) || null;
```

#### 5. Added Form Update Logging

```javascript
console.log('========== MAPPED FORM DATA ==========');
console.log('Fields to update:', Object.keys(updatedFormData));
console.log('Updated form data:', JSON.stringify(updatedFormData, null, 2));
console.log('======================================');

console.log('Current formData before update:', formData);
setFormData(prev => {
  const newFormData = { ...prev, ...updatedFormData };
  console.log('New formData after merge:', newFormData);
  return newFormData;
});
```

## How to Debug Now

### Step 1: Test with Sample Text

Paste this into the AI parser:
```
3BR 2BA $2800/mo Ocean Parkway near Avenue M. Renovated kitchen, parking. Contact Pearl 718-608-4979
```

### Step 2: Open Browser Console

1. Open DevTools (F12)
2. Go to Console tab
3. Click "Parse with AI"

### Step 3: Read the Console Output

You'll see 4 sections:

#### Section 1: N8N Webhook Response
```
========== N8N WEBHOOK RESPONSE ==========
Full Response: {
  "bedrooms": 3,
  "bathrooms": 2,
  "price": 2800,
  ...
}
Response Type: object
Response Keys: ["bedrooms", "bathrooms", "price", ...]
==========================================
```

**What to check:**
- Is it a flat object or nested? (`{ listing: {...} }`)
- What field names does it use?
- Are values strings or numbers?

#### Section 2: Extracted Data
```
========== EXTRACTED DATA ==========
Data to map: {
  "bedrooms": 3,
  "bathrooms": 2,
  "price": 2800,
  ...
}
Data Keys: ["bedrooms", "bathrooms", "price", ...]
====================================
```

**What to check:**
- Was data correctly extracted from nested structure?
- Are all expected fields present?

#### Section 3: Mapped Form Data
```
========== MAPPED FORM DATA ==========
Fields to update: ["bedrooms", "bathrooms", "price", "location", ...]
Updated form data: {
  "bedrooms": 3,
  "bathrooms": 2,
  "price": 2800,
  ...
}
======================================
```

**What to check:**
- How many fields were mapped? (Should be >0)
- Do the mapped values look correct?
- Are types converted properly? (numbers as numbers, not strings)

#### Section 4: Form State Updates
```
Current formData before update: {...}
New formData after merge: {...}
```

**What to check:**
- Is the new formData different from the old?
- Were the mapped fields actually merged in?

## Common Issues & Solutions

### Issue 1: Empty updatedFormData
**Console shows:** `Fields to update: []`

**Cause:** Field names in webhook response don't match expected names

**Solution:** Check Section 1 "Response Keys" and add field name mappings:
```javascript
if (data.monthly_rent) updatedFormData.price = Number(data.monthly_rent);
if (data.cross_streets) updatedFormData.location = data.cross_streets;
```

### Issue 2: Nested Response Not Extracted
**Console shows:** Section 2 has different keys than Section 1

**Cause:** Response is wrapped in unexpected structure

**Solution:** Update extraction logic:
```javascript
const data = parsedData.result || parsedData.listing || parsedData.data || parsedData;
```

### Issue 3: Wrong Data Types
**Console shows:** `"bedrooms": "3"` (string) instead of `"bedrooms": 3` (number)

**Cause:** Webhook returns strings but form expects numbers

**Solution:** Already handled! Code uses `Number()` conversion:
```javascript
if (data.bedrooms !== undefined) updatedFormData.bedrooms = Number(data.bedrooms) || 1;
```

### Issue 4: Form Doesn't Update After Merge
**Console shows:** New formData looks correct but UI doesn't change

**Cause:** React state update issue or form field binding problem

**Solution:** Check if form fields are bound to `formData` state:
```javascript
<input value={formData.bedrooms} onChange={handleInputChange} />
```

## Expected Webhook Response Format

### Option 1: Flat Response (Preferred)
```json
{
  "listing_type": "rental",
  "title": "Beautiful 3BR Apartment",
  "bedrooms": 3,
  "bathrooms": 2,
  "price": 2800,
  "location": "Ocean Parkway near Avenue M",
  "neighborhood": "Midwood",
  "parking": "yes",
  "contact_name": "Pearl",
  "contact_phone": "718-608-4979"
}
```

### Option 2: Nested Response (Handled)
```json
{
  "listing": {
    "listing_type": "rental",
    "title": "Beautiful 3BR Apartment",
    "bedrooms": 3,
    "bathrooms": 2,
    "price": 2800,
    "location": "Ocean Parkway near Avenue M"
  }
}
```

### Option 3: Alternative Field Names (Handled)
```json
{
  "bedrooms": 3,
  "bathrooms": 2,
  "rent": 2800,
  "cross_streets": "Ocean Parkway near Avenue M",
  "neighborhood": "Midwood",
  "parking": "yes",
  "contact_name": "Pearl",
  "contact_phone": "718-608-4979"
}
```

## Field Name Mappings

The code handles these alternative names:

| Form Field | Webhook Alternatives |
|------------|---------------------|
| `location` | `location`, `cross_streets`, `address` |
| `price` | `price`, `rent`, `monthly_rent` |
| All others | Exact match required |

## Adding New Field Name Mappings

If the webhook uses different field names, add mappings like this:

```javascript
// Example: webhook returns "sqft" but form expects "square_footage"
if (data.sqft !== undefined) updatedFormData.square_footage = Number(data.sqft);

// Example: webhook returns "beds" but form expects "bedrooms"
if (data.beds !== undefined) updatedFormData.bedrooms = Number(data.beds);

// Example: webhook returns "baths" but form expects "bathrooms"
if (data.baths !== undefined) updatedFormData.bathrooms = Number(data.baths);
```

## Testing Checklist

After reviewing console logs:

- [ ] N8N webhook returns valid JSON
- [ ] Response structure is correctly extracted
- [ ] At least 3-5 fields are mapped
- [ ] Mapped values have correct types (numbers, booleans, strings)
- [ ] setFormData is called with merged data
- [ ] Form UI updates to show new values
- [ ] Success message appears
- [ ] Section auto-collapses after 2 seconds

## Next Steps

1. **Test the parser** with sample text
2. **Check console logs** - all 4 sections
3. **Share console output** if fields still don't update
4. **Identify missing mappings** from Section 1 keys
5. **Add custom mappings** as needed

## Getting Help

If fields still don't update, provide:
1. Full console output (all 4 sections)
2. Sample text you pasted
3. Which fields should have been filled but weren't
4. Screenshot of form before/after parse

With this information, we can identify exactly what field name mappings are missing!
