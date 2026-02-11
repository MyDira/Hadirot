# AI Parser Quick Start Guide

## For Admins: How to Use the AI Quick Upload Feature

### Step 1: Access the Feature
1. Sign in as an admin user
2. Navigate to the "Post a Listing" page
3. Look for the purple **"AI Quick Upload"** section at the top (below listing type selector)

### Step 2: Open the Parser
- Click the **"Try Easy AI Parser"** button with sparkles icon ✨
- The section will expand showing a large text area

### Step 3: Paste Listing Text
Copy and paste raw listing text from any source:
- Email from landlord/agent
- WhatsApp message
- Text document
- Website listing
- Scanned document text

**Example Input:**
```
Beautiful 2BR apartment in Downtown Brooklyn
2 bedrooms, 1 bathroom
$2,500/month
Located near Bedford Ave
Modern kitchen with stainless steel appliances
Hardwood floors throughout
Washer/dryer in unit
Street parking available
Contact: John Doe
Phone: (555) 123-4567
```

### Step 4: Parse with AI
- Click the **"Parse with AI"** button
- Wait 2-5 seconds while the AI processes the text
- A loading spinner will show progress

### Step 5: Review Pre-filled Fields
- ✅ Success message appears
- Form fields automatically populate
- Section auto-collapses after 2 seconds
- Purple badge shows "Form populated with AI-parsed data"

### Step 6: Manual Review & Edit
- Scroll through the form
- Verify all fields are correct
- Manually edit any incorrect fields
- Add missing information (images, etc.)

### Step 7: Submit
- Complete remaining required fields
- Upload images if not already present
- Review and submit the listing

## Clearing AI Data

If you need to start over:
1. Click **"Clear AI Data"** button (visible when AI data is present)
2. Confirm the action
3. All fields reset to defaults
4. Paste new text and try again

## Tips for Best Results

### Good Text Format
✅ Include clear section headers
✅ Use numbers and $ symbols for prices
✅ Mention bedrooms and bathrooms explicitly
✅ Include neighborhood/location names
✅ List amenities separately
✅ Provide contact information

### Poor Text Format
❌ All text in one long paragraph
❌ Missing key details (beds, price)
❌ Ambiguous abbreviations
❌ Mixed languages without context
❌ Images only (extract text first)

## Troubleshooting

### "Please paste listing text first"
- The textarea is empty
- **Solution:** Paste some text before clicking parse

### "Failed to connect to AI parser"
- Network issue or webhook is down
- **Solution:** Check internet connection, try again in a moment

### "Failed to parse listing"
- The text format couldn't be understood
- **Solution:** Try reformatting the text or entering manually

### Fields not populating correctly
- Some information was ambiguous
- **Solution:** Manually correct the incorrect fields

### Parse button disabled
- Textarea is empty or currently loading
- **Solution:** Wait for current operation to finish or add text

## What Fields Can Be Parsed?

The AI can extract and fill these fields:

**Basic Info:**
- Listing type (rental/sale)
- Title
- Description
- Location/Address
- Neighborhood

**Property Details:**
- Bedrooms
- Bathrooms
- Floor number
- Square footage
- Property type

**Pricing:**
- Monthly rent
- Sale price
- HOA fees
- Property taxes

**Amenities:**
- Parking
- Washer/dryer
- Dishwasher
- AC type
- Heating

**Features:**
- Apartment conditions (modern, renovated, etc.)
- Outdoor space (balcony, yard, etc.)
- Interior features (hardwood floors, etc.)
- Utilities included

**Contact Info:**
- Contact name
- Phone number

**Advanced:**
- Year built
- Property condition
- Building type
- Basement details
- And many more...

## When to Use AI Parser

**Perfect for:**
- Quick data entry from existing listings
- Converting email/message formats
- Bulk listing imports
- Listings from multiple sources
- Time-sensitive postings

**Not recommended for:**
- First-time use (try manual form first)
- Complex multi-unit properties
- Listings with special requirements
- When you prefer complete control
- Final verification (always review!)

## Keyboard Shortcuts

- `Tab` - Navigate between fields after parse
- `Ctrl/Cmd + V` - Paste into textarea
- `Enter` - Submit form (when complete)
- `Esc` - Close any open modals

## Privacy & Security

- All data sent to secure N8N webhook
- No personal data stored by parser
- Same security as manual entry
- Admin-only access
- Audit logs maintained

## Support

Having issues? Check:
1. Browser console for detailed errors
2. Network tab to verify API calls
3. This guide for common solutions
4. Contact tech support if problems persist

## Example Workflows

### Workflow 1: Email Listing
1. Receive listing via email
2. Copy entire email body
3. Open AI Parser
4. Paste email text
5. Click Parse
6. Review and adjust
7. Upload photos
8. Submit

### Workflow 2: WhatsApp Group
1. Landlord posts to WhatsApp group
2. Long-press message → Copy
3. Open post listing page
4. Expand AI Parser
5. Paste message
6. Parse and verify
7. Complete and post

### Workflow 3: Batch Entry
1. Have 5 listings to post
2. For each listing:
   - Use AI Parser
   - Quick review
   - Upload media
   - Submit
3. Complete 5x faster than manual

## Version History

**v1.0** (Current)
- Initial release
- Basic field mapping
- N8N webhook integration
- Success/error handling
- Manual override support

**Coming Soon:**
- Confidence scores
- Batch upload
- Image extraction
- Enhanced templates
