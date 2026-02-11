# Daily Digest Email - Quick Start Guide

## What Was Fixed & Enhanced

### ✅ Fixed: Cron Job Not Running
**Problem:** The scheduled email wasn't sending even when set to active.

**Solution:** The cron job migration was incomplete. Created a new comprehensive migration that:
- Properly schedules the job to run hourly
- Checks configured delivery time and sends only when it matches
- Includes error handling and logging
- Uses environment variables correctly

**File:** `supabase/migrations/20251107000000_fix_daily_digest_cron_complete.sql`

### ✅ Enhanced: Email Content

**New Introduction:**
```
Here are the latest apartments posted on Hadirot:
To see all 80+ active apartments click here: Hadirot.com/browse
```
- Dynamically counts total active listings
- Rounds to nearest 10 (e.g., 83 becomes 80+)
- Clickable link to browse page

**New Ending:**
```
💬 Join the Hadirot WhatsApp Community
Click here to join: https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt
```
- Green-themed call-to-action box
- Direct link to WhatsApp community

### ✅ New: Short URLs & Click Tracking

**Before:** `hadirot.com/listing/123e4567-e89b-12d3-a456-426614174000`

**After:** `hadirot.com/l/abc123`

**Benefits:**
- Cleaner email appearance
- Tracks which links are clicked
- Measures engagement with digest emails
- Expires after 90 days (configurable)

## How to Deploy

### Step 1: Apply Database Migrations

Run these migrations in order:
```bash
# 1. Fix cron job scheduling
supabase db push migration 20251107000000_fix_daily_digest_cron_complete.sql

# 2. Create URL shortening system
supabase db push migration 20251107000001_create_url_shortener_system.sql
```

Or apply directly in Supabase SQL Editor.

### Step 2: Deploy Edge Function

Deploy the new redirect function:
```bash
supabase functions deploy redirect-short-url
```

### Step 3: Redeploy Updated Digest Function

The digest function was updated with new content:
```bash
supabase functions deploy send-daily-admin-digest
```

### Step 4: Deploy Frontend Changes

Build and deploy the updated frontend (adds /l/:code route):
```bash
npm run build
# Deploy to your hosting provider
```

## Quick Test

### Test the Email System

1. **Login as Admin** → Content Management → Email Tools

2. **Verify Status:**
   - "Automated Digest" should show "Active" (green)
   - "Delivery Time" shows your configured time (default: 9:00 AM EST)

3. **Send Test Email:**
   - Click "Send Now" button
   - Confirm the prompt
   - Check your admin email

4. **Verify Email Content:**
   - ✓ Starts with "Here are the latest apartments..."
   - ✓ Shows total active count (e.g., "80+ active apartments")
   - ✓ Browse link is clickable
   - ✓ Listings have short URLs (hadirot.com/l/...)
   - ✓ Ends with WhatsApp community section

5. **Test Short URL:**
   - Click a short URL from the email
   - Should redirect to the listing
   - Check admin analytics to see click was tracked

## Verify Cron Job

Check that the cron job is scheduled:

```sql
-- View scheduled job
SELECT * FROM cron.job WHERE jobname = 'daily-admin-digest-email';

-- View recent runs
SELECT * FROM daily_admin_digest_logs ORDER BY run_at DESC LIMIT 5;
```

## Configuration

### Change Delivery Time

1. Content Management → Email Tools
2. Click edit icon next to "Delivery Time"
3. Select new time (e.g., 10:00 AM)
4. Click "Save"

### Enable/Disable Automated Sending

1. Content Management → Email Tools
2. Toggle "Automated Digest" switch
3. Changes take effect immediately

## Troubleshooting

### "No new listings to send"
✓ Normal - email only sends when there are new listings in past 24 hours

### "Email service not configured"
❌ Set ZEPTO_TOKEN in Supabase Edge Functions environment variables

### Cron not running at scheduled time
1. Check config: `SELECT * FROM daily_admin_digest_config;`
2. Verify enabled = true
3. Check delivery_time matches desired hour
4. Review cron logs: `SELECT * FROM cron.job_run_details;`

### Short URLs not working
1. Verify redirect-short-url function is deployed
2. Check route exists: `/l/:code` in App.tsx
3. Test Edge Function directly in Supabase dashboard

## What Happens Now

**Automatic Schedule:**
- Cron checks every hour at the top of the hour
- If enabled AND current hour matches delivery_time:
  - Fetches listings approved in past 24 hours
  - Creates short URLs for each listing
  - Sends email to all admin users
  - Logs the execution

**Manual Trigger:**
- Always available via "Send Now" button
- Works regardless of enabled/disabled status
- Useful for testing

## Files Changed

**Database:**
- `supabase/migrations/20251107000000_fix_daily_digest_cron_complete.sql` (NEW)
- `supabase/migrations/20251107000001_create_url_shortener_system.sql` (NEW)

**Backend:**
- `supabase/functions/send-daily-admin-digest/index.ts` (UPDATED)
- `supabase/functions/redirect-short-url/index.ts` (NEW)

**Frontend:**
- `src/pages/ShortUrlRedirect.tsx` (NEW)
- `src/App.tsx` (UPDATED)

## Support

For detailed information, see: `DAILY_DIGEST_ENHANCEMENTS.md`
