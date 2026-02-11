# Daily Admin Digest Email System - Enhancements

## Overview
This document describes the enhancements made to the daily admin digest email system, including fixes for the cron scheduling issue, new email content, and URL shortening with click tracking.

## Changes Implemented

### 1. Fixed Cron Job Scheduling Issue

**Problem:** The cron job migration file (`20251030185814_setup_daily_admin_digest_cron.sql`) was incomplete and missing the actual scheduling command.

**Solution:** Created a new comprehensive migration (`20251107000000_fix_daily_digest_cron_complete.sql`) that:
- Ensures `pg_cron` and `pg_net` extensions are enabled
- Configures database settings for Edge Function URLs
- Schedules hourly checks that execute at the configured delivery time
- Includes robust error handling and fallback to environment variables
- Provides detailed logging and verification

**How it works:**
- Cron runs every hour (0 * * * *)
- Checks if current hour matches the configured delivery time
- Only sends email if enabled and time matches
- Uses Eastern Time (America/New_York) timezone
- Default delivery time: 9:00 AM EST

**To verify it's working:**
1. Go to Content Management > Email Tools in admin panel
2. Check that "Automated Digest" shows as "Active"
3. Review "Recent Digest Runs" table for scheduled executions
4. Check Supabase logs for cron job output

### 2. Enhanced Email Content

**New Introduction Section:**
- Adds friendly greeting: "Here are the latest apartments posted on Hadirot:"
- Displays dynamic count of total active listings
- Rounds count down to nearest 10 (e.g., 83 → 80+)
- Includes clickable link: "To see all [count]+ active apartments click here: Hadirot.com/browse"

**Improved Listing Section:**
- Clear header: "📋 X New Listings (Past 24 Hours)"
- Horizontal rules to separate sections
- Better visual hierarchy with styled separators

**New WhatsApp Community Section:**
- Green-themed call-to-action box at email end
- Text: "💬 Join the Hadirot WhatsApp Community"
- Clickable link: https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt
- Styled with brand colors for consistency

### 3. URL Shortening and Click Tracking System

**Database Schema:**
New `short_urls` table with:
- `short_code`: Unique 6-character code (e.g., "abc123")
- `original_url`: Full listing URL
- `listing_id`: Foreign key to listings
- `source`: Origin of short URL (default: "digest_email")
- `click_count`: Tracks total clicks
- `last_clicked_at`: Timestamp of most recent click
- `expires_at`: Optional expiration (default: 90 days)

**Functions Created:**
- `generate_short_code()`: Creates unique 6-char random codes
- `create_short_url()`: Creates or retrieves existing short URL
- `increment_short_url_clicks()`: Atomically increments click counter
- `cleanup_expired_short_urls()`: Removes expired unused URLs

**Edge Function:**
- `redirect-short-url`: Handles /l/[code] requests
  - Looks up short code in database
  - Increments click count
  - Tracks click in analytics_events table
  - Redirects to original listing URL
  - Returns 404 for invalid codes
  - Returns 410 for expired links

**Frontend Route:**
- New route: `/l/:code`
- Component: `ShortUrlRedirect.tsx`
- Shows loading state while redirecting
- Handles errors gracefully

**Email Integration:**
- Digest function automatically creates short URLs for each listing
- Format: `hadirot.com/l/abc123` instead of `hadirot.com/listing/[uuid]`
- Falls back to original URL if short URL creation fails
- URLs expire after 90 days but remain functional if clicked

**Analytics:**
- Click events stored in `analytics_events` table
- Event name: "digest_link_click"
- Event properties include: short_code, listing_id, source
- New view: `short_url_analytics` for admin reporting
- Tracks click-through rate per digest

### 4. Security Measures

**Row Level Security (RLS):**
- `short_urls` table has RLS enabled
- Public can read (needed for redirects)
- Only service role can create/update
- Admins can view analytics

**Data Privacy:**
- IP addresses are hashed before storage
- No PII exposed in tracking
- Click tracking is anonymous
- Short URLs expire to limit data retention

## Testing the Implementation

### Manual Test via Admin Panel

1. **Access Email Tools:**
   - Log in as admin
   - Navigate to: Content Management > Email Tools
   - Check that "Automated Digest" shows current status

2. **Send Test Email:**
   - Click "Send Now" button
   - Confirm the prompt
   - Check toast notification for success/failure

3. **Verify Email Content:**
   - Check admin email inbox
   - Verify new intro text with listing count
   - Confirm WhatsApp community section at bottom
   - Note short URLs in listing links (e.g., hadirot.com/l/abc123)

4. **Test Short URLs:**
   - Click a short URL from the email
   - Should redirect to the full listing page
   - Check that click was tracked (view analytics)

5. **Review Logs:**
   - Check "Recent Digest Runs" table
   - Verify successful execution
   - Review click statistics

### Database Verification

```sql
-- Check cron job is scheduled
SELECT * FROM cron.job WHERE jobname = 'daily-admin-digest-email';

-- Check digest configuration
SELECT * FROM daily_admin_digest_config;

-- View recent digest logs
SELECT * FROM daily_admin_digest_logs ORDER BY run_at DESC LIMIT 5;

-- View short URLs created
SELECT * FROM short_url_analytics ORDER BY created_at DESC LIMIT 10;

-- Check click counts
SELECT short_code, click_count, created_at, last_clicked_at
FROM short_urls
WHERE source = 'digest_email'
ORDER BY click_count DESC;
```

### Edge Function Testing

```bash
# Test redirect function (replace abc123 with real code)
curl -I https://[your-project].supabase.co/functions/v1/redirect-short-url/abc123

# Should return 302 redirect with Location header
```

## Configuration

### Database Settings

The cron job requires these database settings to be configured:
- `app.settings.supabase_url`: Your Supabase project URL
- `app.settings.service_role_key`: Service role key for authentication

These are typically set automatically by Supabase, but can be configured manually:

```sql
-- Set in database (if needed)
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://[project].supabase.co';
ALTER DATABASE postgres SET app.settings.service_role_key = '[your-service-role-key]';
```

### Email Configuration

Ensure these environment variables are set in Supabase Edge Functions:
- `ZEPTO_TOKEN`: ZeptoMail API token
- `ZEPTO_FROM_ADDRESS`: Sender email address
- `ZEPTO_FROM_NAME`: Sender display name
- `PUBLIC_SITE_URL`: Base URL for the site (default: https://hadirot.com)

### Digest Schedule

To change the delivery time:
1. Go to Content Management > Email Tools
2. Click edit icon next to "Delivery Time"
3. Select new time
4. Click "Save"

Changes take effect on the next hourly cron check.

## Troubleshooting

### Cron Job Not Running

1. **Check if pg_cron is enabled:**
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. **Verify job is scheduled:**
   ```sql
   SELECT * FROM cron.job WHERE jobname = 'daily-admin-digest-email';
   ```

3. **Check cron job history:**
   ```sql
   SELECT * FROM cron.job_run_details
   WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-admin-digest-email')
   ORDER BY start_time DESC LIMIT 10;
   ```

4. **Review database settings:**
   ```sql
   SELECT current_setting('app.settings.supabase_url', true);
   SELECT current_setting('app.settings.service_role_key', true);
   ```

### Emails Not Sending

1. Check digest is enabled in config
2. Verify ZEPTO_TOKEN is set in Edge Functions
3. Review daily_admin_digest_logs for error messages
4. Check Supabase Edge Function logs in dashboard
5. Ensure admin users exist in profiles table

### Short URLs Not Working

1. Verify redirect Edge Function is deployed
2. Check short_urls table has entries
3. Test with existing short code
4. Review Edge Function logs for errors
5. Ensure RLS policies allow public reads

### Click Tracking Issues

1. Check analytics_events table has entries
2. Verify event_name is 'digest_link_click'
3. Review short_urls.click_count values
4. Check browser console for errors
5. Ensure analytics system is functioning

## Files Modified/Created

### Migrations
- `supabase/migrations/20251107000000_fix_daily_digest_cron_complete.sql` - Complete cron setup
- `supabase/migrations/20251107000001_create_url_shortener_system.sql` - URL shortening schema

### Edge Functions
- `supabase/functions/send-daily-admin-digest/index.ts` - Enhanced with new content
- `supabase/functions/redirect-short-url/index.ts` - New redirect handler

### Frontend
- `src/pages/ShortUrlRedirect.tsx` - New redirect component
- `src/App.tsx` - Added /l/:code route

## Performance Considerations

- Short URL lookups are indexed for fast retrieval
- Click count updates use atomic operations
- Analytics tracking is asynchronous (doesn't block redirects)
- Expired URLs are cleaned up periodically (can schedule with cron)
- Short codes are reused when possible to minimize database growth

## Future Enhancements

Potential improvements for consideration:
1. Admin dashboard for short URL analytics
2. A/B testing different email formats
3. Scheduled cleanup of old short URLs
4. Email open tracking
5. Custom short URL domains
6. Bulk short URL generation API
7. Click heatmaps by time of day
8. Geographic tracking (if needed)

## Support

For issues or questions:
1. Check Supabase dashboard logs
2. Review daily_admin_digest_logs table
3. Test manually via admin panel
4. Check this documentation for troubleshooting steps
