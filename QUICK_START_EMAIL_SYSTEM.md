# Quick Start Guide - Daily Approval Email System

## Deployment Checklist

### 1. Deploy Edge Functions
```bash
# Deploy the main daily email function
supabase functions deploy send-daily-approved-listings

# Deploy the manual send function
supabase functions deploy send-listing-email-manual

# Optional: Deploy image generation function for future use
supabase functions deploy generate-listing-image
```

### 2. Configure Environment Variables
In your Supabase Dashboard → Project Settings → Edge Functions, add:

```
ZEPTO_TOKEN=your-zepto-api-token
ZEPTO_FROM_ADDRESS=noreply@hadirot.com
ZEPTO_FROM_NAME=HaDirot
PUBLIC_SITE_URL=https://your-site.com
```

### 3. Configure Database for Cron Jobs
Run in Supabase SQL Editor:

```sql
-- Set your project URL
ALTER DATABASE postgres
SET app.supabase_url = 'https://your-project-ref.supabase.co';

-- Set your service role key
ALTER DATABASE postgres
SET app.supabase_service_role_key = 'your-service-role-key-here';
```

### 4. Apply Migrations
The migrations will apply automatically, or run:
```bash
supabase db push
```

## Quick Test

### Test Manual Send (Easiest First Test)
1. Log in as admin at your site
2. Go to Admin Panel → Listings tab
3. Find an approved listing
4. Click the purple Mail icon
5. Confirm the send
6. Check your admin email inbox

### Test Daily Email Function
```bash
# Replace with your actual values
curl -X POST https://your-project.supabase.co/functions/v1/send-daily-approved-listings \
  -H "Authorization: Bearer your-service-role-key" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "listingCount": 2,
  "adminCount": 1
}
```

### Verify Cron Job is Scheduled
Run in SQL Editor:
```sql
SELECT
  jobname,
  schedule,
  active,
  timezone
FROM cron.job
WHERE jobname = 'daily-approved-listings-email';
```

Expected result:
```
jobname: daily-approved-listings-email
schedule: 0 7 * * *
active: true
timezone: America/New_York
```

## Troubleshooting

### "No admin users found"
**Solution**: Make sure you have at least one user with `is_admin = true`:
```sql
UPDATE profiles
SET is_admin = true
WHERE email = 'your-email@example.com';
```

### "No new approved listings"
**Solution**: Create a test listing and approve it:
```sql
-- Force a listing to be included in next email
UPDATE listings
SET approval_email_sent_at = NULL
WHERE id = 'your-listing-id' AND approved = true;
```

### Cron job not running
**Solution**: Check job execution history:
```sql
SELECT
  start_time,
  status,
  return_message
FROM cron.job_run_details
WHERE jobid = (
  SELECT jobid FROM cron.job
  WHERE jobname = 'daily-approved-listings-email'
)
ORDER BY start_time DESC
LIMIT 5;
```

### Email not received
**Check**:
1. ZeptoMail credentials are correct
2. Admin email addresses are valid
3. Check ZeptoMail dashboard for delivery status
4. Check spam/junk folder
5. View edge function logs in Supabase

## Viewing Logs

### Edge Function Logs
Supabase Dashboard → Edge Functions → Select function → Logs

### Cron Job Logs
```sql
SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'daily-approved-listings-email')
ORDER BY start_time DESC;
```

## Manual Operations

### Disable Daily Emails Temporarily
```sql
UPDATE cron.job
SET active = false
WHERE jobname = 'daily-approved-listings-email';
```

### Re-enable Daily Emails
```sql
UPDATE cron.job
SET active = true
WHERE jobname = 'daily-approved-listings-email';
```

### Change Email Time (e.g., to 8 AM)
```sql
UPDATE cron.job
SET schedule = '0 8 * * *'
WHERE jobname = 'daily-approved-listings-email';
```

### Force Listing to be Included in Next Email
```sql
UPDATE listings
SET approval_email_sent_at = NULL
WHERE id = 'listing-id';
```

### View Listings Pending Email
```sql
SELECT
  id,
  title,
  approved,
  is_active,
  created_at,
  approval_email_sent_at
FROM listings
WHERE approved = true
  AND is_active = true
  AND (approval_email_sent_at IS NULL
       OR approval_email_sent_at < NOW() - interval '24 hours')
ORDER BY created_at DESC;
```

## Production Checklist

Before going live:
- [ ] All edge functions deployed successfully
- [ ] Environment variables configured
- [ ] Database cron settings configured
- [ ] Migrations applied
- [ ] At least one admin user exists
- [ ] Test email sent and received successfully
- [ ] Manual send button works in admin panel
- [ ] Cron job scheduled and active
- [ ] WhatsApp link works correctly
- [ ] Listing links work correctly
- [ ] Email renders well in Gmail, Outlook, Apple Mail
- [ ] Monitoring plan in place for first week

## Support

For detailed documentation, see:
- `DAILY_APPROVAL_EMAIL_SYSTEM.md` - Complete system documentation
- `IMPLEMENTATION_SUMMARY.md` - Implementation details
- Supabase Edge Functions logs
- ZeptoMail dashboard for email delivery status

## Quick Commands Reference

```bash
# Deploy functions
supabase functions deploy send-daily-approved-listings
supabase functions deploy send-listing-email-manual

# Test daily email
curl -X POST https://[PROJECT].supabase.co/functions/v1/send-daily-approved-listings \
  -H "Authorization: Bearer [SERVICE_ROLE_KEY]"

# Check cron status
SELECT * FROM cron.job WHERE jobname = 'daily-approved-listings-email';

# View recent executions
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

# List all admins
SELECT id, email, full_name FROM profiles WHERE is_admin = true;

# Count pending listings
SELECT COUNT(*) FROM listings
WHERE approved = true AND is_active = true
AND approval_email_sent_at IS NULL;
```
