# Daily Cards System - Manual Deployment Fix

## Issue
The Edge Function `daily-listing-cards` exists but has a bug: it references `listing_images.url` when the correct column name is `listing_images.image_url`.

## Fix Applied
Updated `/supabase/functions/daily-listing-cards/index.ts`:
- Changed `listing_images(url, is_featured, sort_order)` to `listing_images(image_url, is_featured, sort_order)`
- Updated TypeScript interface to use `image_url` instead of `url`
- Updated access to use `sortedImages?.[0]?.image_url`

## How to Deploy

### Option 1: Using Supabase CLI (Recommended)

```bash
# Navigate to project directory
cd /path/to/project

# Deploy the updated function
supabase functions deploy daily-listing-cards
```

### Option 2: Using Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to Edge Functions
4. Find `daily-listing-cards` function
5. Click "Edit"
6. Copy the entire content from `/supabase/functions/daily-listing-cards/index.ts`
7. Paste and save

### Option 3: Re-create via API

The function code is ready in the file system at:
- Main: `/supabase/functions/daily-listing-cards/index.ts`
- Shared:
  - `/supabase/functions/_shared/cors.ts`
  - `/supabase/functions/_shared/zepto.ts`
  - `/supabase/functions/_shared/dailyCardsEmailTemplate.ts`

## Testing After Deployment

1. Go to Admin Panel → Daily Cards tab
2. Add your email to recipients
3. Ensure you have at least one approved, active listing in the database
4. Click "Send Test Email"
5. Check your email inbox

## What the System Does

When working, the system will:
1. Fetch active listings based on your filters
2. Use existing listing images (simplified - no custom card generation)
3. Generate a formatted HTML email with:
   - Listing photos
   - Price, beds, baths, location details
   - WhatsApp-ready copy-paste messages
   - Direct links to each listing
4. Send via ZeptoMail
5. Log execution to database

## Known Simplification

The current implementation uses existing listing photos rather than generating custom card graphics (with Satori/resvg). This was done because:
- Satori/resvg-wasm have compatibility issues in Supabase Deno runtime
- The email still looks professional with existing photos + formatted HTML
- Can be enhanced later if needed

## Next Enhancement (Optional)

To add custom card graphics showing price/beds/baths burned into images:
- Use the existing `generate-listing-image` function (htmlcsstoimage.com)
- Or implement a Canvas-based solution
- Or use a screenshot service API
