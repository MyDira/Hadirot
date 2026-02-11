# Daily Approval Email Notification System

## Overview

The Daily Approval Email Notification System automatically sends a digest email to all administrators at 7:00 AM Eastern Time containing all listings that were approved in the previous 24 hours. The system also provides a manual send option through the admin panel for immediate notifications.

## Features

### 1. Automated Daily Emails
- **Schedule**: Every day at 7:00 AM Eastern Time (America/New_York timezone)
- **Recipients**: All users with `is_admin = true` in the profiles table
- **Content**: All listings approved in the last 24 hours that haven't been included in a previous daily email
- **Tracking**: Updates `approval_email_sent_at` timestamp after successful send to prevent duplicates

### 2. Manual Email Sends
- **Trigger**: "Send Email" button (mail icon) in admin panel listings table
- **Availability**: Only shown for approved listings
- **Behavior**: Sends immediate email to all admins for a single listing
- **Tracking**: Does NOT update `approval_email_sent_at` (allows listing to still appear in daily digest)

### 3. Email Content

Each listing in the email includes:
- **Listing Image**: Primary image from the listing
- **Price Information**: Formatted price or "Call for Price"
- **Property Details**: Bedrooms, bathrooms, parking status, and broker fee indicator with emojis
- **Location**: Full address or cross streets with map pin emoji
- **WhatsApp Community Link**: "Join the Hadirot WhatsApp Community" with link to https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt
- **Direct Link**: "View Listing" button linking to the listing detail page
- **Poster Information**: Owner name or agency name
- **Featured Badge**: If listing is featured

## Database Schema

### New Column: `approval_email_sent_at`

```sql
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS approval_email_sent_at timestamptz DEFAULT NULL;
```

**Purpose**: Tracks when the approval notification email was last sent to prevent duplicate emails in daily digests.

**Behavior**:
- Set to `NULL` initially and for listings that haven't been emailed
- Updated to current timestamp after successful daily email send
- NOT updated by manual email sends (allows listing to appear in future daily digest)
- Compared with listing update time to determine if listing needs to be included in email

### Index

```sql
CREATE INDEX IF NOT EXISTS listings_approval_email_idx
ON listings (approved, approval_email_sent_at, updated_at)
WHERE approved = true;
```

**Purpose**: Optimizes queries for finding listings that need to be included in daily emails.

## Architecture

### Edge Functions

#### 1. `send-daily-approved-listings`
**Path**: `/supabase/functions/send-daily-approved-listings/index.ts`

**Triggered by**: pg_cron job daily at 7 AM EST

**Process**:
1. Query all admin users from profiles table
2. Query listings approved in last 24 hours where `approval_email_sent_at` is NULL or older than 24 hours
3. Generate HTML email with all qualifying listings
4. Send email to all admin email addresses via ZeptoMail
5. Update `approval_email_sent_at` for all included listings

**Query Logic**:
```typescript
.eq("approved", true)
.eq("is_active", true)
.gte("updated_at", twentyFourHoursAgo)
.or(`approval_email_sent_at.is.null,approval_email_sent_at.lt.${twentyFourHoursAgo}`)
```

#### 2. `send-listing-email-manual`
**Path**: `/supabase/functions/send-listing-email-manual/index.ts`

**Triggered by**: Admin clicking "Send Email" button in admin panel

**Authentication**: Requires valid admin user authentication

**Process**:
1. Verify user is authenticated and has admin privileges
2. Query the specified listing with all details
3. Query all admin users
4. Generate HTML email for single listing
5. Send email to all admin email addresses
6. Does NOT update `approval_email_sent_at`

**Request Format**:
```json
{
  "listingId": "uuid-of-listing"
}
```

**Response Format**:
```json
{
  "success": true,
  "listingId": "uuid",
  "listingTitle": "Listing Title",
  "adminCount": 3
}
```

#### 3. `generate-listing-image` (Optional)
**Path**: `/supabase/functions/generate-listing-image/index.ts`

**Purpose**: Generate PNG images of listing cards for social media sharing

**Note**: Currently configured to use HTML/CSS to Image API (hcti.io) but requires API credentials to be set in environment variables.

### Frontend Components

#### AdminPanel.tsx Updates

**New State**:
```typescript
const [sendingEmailListingId, setSendingEmailListingId] = useState<string | null>(null);
```

**New Function**:
```typescript
const sendListingEmail = async (listingId: string, listingTitle: string)
```

**UI Changes**:
- Added Mail icon button in listings table Actions column
- Button only shown for approved listings
- Shows loading spinner while sending
- Displays success/error toast notifications

### Scheduling

#### pg_cron Job

**Migration**: `20251020000001_setup_daily_email_cron.sql`

**Schedule**: `0 7 * * *` (7:00 AM daily)

**Timezone**: `America/New_York` (Eastern Time)

**Job Name**: `daily-approved-listings-email`

**Implementation**:
```sql
SELECT cron.schedule(
  'daily-approved-listings-email',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/send-daily-approved-listings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
```

## Email Template

### Design
- Responsive HTML email template
- Hadirot branding header (blue background)
- White content area with listing cards
- Each listing in bordered card with image
- Inline CSS for maximum email client compatibility
- Mobile-friendly design

### Key Elements
- Property image (if available)
- Large, bold price display
- Emoji icons for property features (🛏️ 🛁 🅿️ 📍)
- WhatsApp community section with green accent
- Call-to-action button for viewing listing
- Footer with copyright information

## Configuration

### Environment Variables Required

**ZeptoMail (Email Service)**:
- `ZEPTO_TOKEN`: API token for ZeptoMail
- `ZEPTO_FROM_ADDRESS`: Sender email address (default: noreply@hadirot.com)
- `ZEPTO_FROM_NAME`: Sender display name (default: HaDirot)

**Supabase**:
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin operations
- `SUPABASE_ANON_KEY`: Anonymous key for client operations
- `PUBLIC_SITE_URL`: Public URL of the site (for generating listing links)

**Optional - HTML/CSS to Image API** (for future image attachment feature):
- `HTMLCSSTOIMAGE_USER_ID`: API user ID
- `HTMLCSSTOIMAGE_API_KEY`: API key

### Supabase Configuration

The cron job requires certain settings to be available:
- `app.supabase_url`: Set to your Supabase project URL
- `app.supabase_service_role_key`: Set to your service role key

These can be configured in your Supabase dashboard or via SQL:
```sql
ALTER DATABASE postgres SET app.supabase_url = 'https://your-project.supabase.co';
ALTER DATABASE postgres SET app.supabase_service_role_key = 'your-service-role-key';
```

## Testing

### Manual Testing

#### Test Daily Email Function
```bash
# Using curl
curl -X POST https://your-project.supabase.co/functions/v1/send-daily-approved-listings \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

#### Test Manual Send Function
```bash
# Using curl
curl -X POST https://your-project.supabase.co/functions/v1/send-listing-email-manual \
  -H "Authorization: Bearer YOUR_USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"listingId": "your-listing-id"}'
```

### Test Scenarios

1. **No New Listings**: Should return success with message about no new listings
2. **Single Listing**: Should send email with one listing card
3. **Multiple Listings**: Should send email with all listing cards properly formatted
4. **Manual Send**: Should trigger immediate email without affecting daily digest
5. **Timezone Test**: Verify cron job triggers at 7 AM Eastern Time

### Database Queries for Testing

#### Check listings pending email
```sql
SELECT id, title, approved, approval_email_sent_at, updated_at
FROM listings
WHERE approved = true
  AND is_active = true
  AND (approval_email_sent_at IS NULL
       OR approval_email_sent_at < updated_at - interval '24 hours');
```

#### Check all admin users
```sql
SELECT id, email, full_name
FROM profiles
WHERE is_admin = true;
```

#### Manually trigger listing for next email
```sql
UPDATE listings
SET approval_email_sent_at = NULL
WHERE id = 'your-listing-id';
```

#### Check cron job status
```sql
SELECT * FROM cron.job WHERE jobname = 'daily-approved-listings-email';
```

## Maintenance

### Monitoring

Check cron job execution history:
```sql
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-approved-listings-email')
ORDER BY start_time DESC
LIMIT 10;
```

### Troubleshooting

**Emails not being sent**:
1. Check cron job is active: `SELECT * FROM cron.job WHERE jobname = 'daily-approved-listings-email'`
2. Check job execution logs: `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5`
3. Verify ZeptoMail credentials are configured
4. Check edge function logs in Supabase dashboard
5. Verify at least one admin user exists

**Duplicate emails**:
1. Check `approval_email_sent_at` is being updated correctly
2. Verify query logic in edge function
3. Check for multiple cron jobs scheduled

**Manual send not working**:
1. Verify user has admin privileges
2. Check browser console for errors
3. Verify edge function is deployed
4. Check edge function logs

### Updating the Schedule

To change the email time:
```sql
UPDATE cron.job
SET schedule = '0 8 * * *'  -- Change to 8 AM
WHERE jobname = 'daily-approved-listings-email';
```

### Disabling Daily Emails

Temporarily disable:
```sql
UPDATE cron.job
SET active = false
WHERE jobname = 'daily-approved-listings-email';
```

Re-enable:
```sql
UPDATE cron.job
SET active = true
WHERE jobname = 'daily-approved-listings-email';
```

## Future Enhancements

### Potential Improvements

1. **Image Attachments**: Generate PNG images of listing cards and attach to emails for social media sharing
2. **Admin Preferences**: Allow admins to opt-in/opt-out of daily emails
3. **Custom Schedules**: Allow admins to set their preferred email time
4. **Email Templates**: Multiple template options (detailed, compact, etc.)
5. **Analytics**: Track email open rates and click-through rates
6. **Digest Summaries**: Include statistics (total listings, neighborhoods, price ranges)
7. **Filter Options**: Allow filtering by neighborhood, price range, etc.

### Known Limitations

1. **Image Generation**: Currently uses external API (HTML/CSS to Image) which requires paid subscription for production use
2. **Email Size**: Large number of listings (50+) may cause email size issues with some email clients
3. **Timezone**: Only supports Eastern Time currently
4. **Single Email Time**: All admins receive emails at the same time

## Support

For issues or questions:
1. Check Supabase edge function logs
2. Review cron job execution history
3. Verify all environment variables are set correctly
4. Check ZeptoMail dashboard for delivery status
5. Review database query results for pending listings
