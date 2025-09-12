# Deactivation Email Notification System

## Overview
This system automatically sends email notifications to listing owners when their listings are auto-deactivated due to expiry. The system is designed to be idempotent, backend-driven, and does not modify existing deactivation or frontend code.

## Components

### 1. Database Changes
- **Table**: `listings`
- **New Column**: `last_deactivation_email_sent_at` (timestamptz, nullable)
- **Purpose**: Tracks when the last deactivation email was sent for a listing
- **Index**: Added for efficient querying of deactivated listings needing emails

### 2. Edge Function
- **Name**: `send-deactivation-emails`
- **Location**: `supabase/functions/send-deactivation-emails/index.ts`
- **Schedule**: Runs every 15 minutes via Supabase Cron
- **Purpose**: 
  - Finds recently deactivated listings that haven't been emailed
  - Sends branded notification emails via existing `send-email` function
  - Updates tracking timestamp to prevent duplicate emails

### 3. Email Template
- Uses existing branded email template from `_shared/zepto.ts`
- Subject: "Your listing '[Title]' has expired on HaDirot"
- CTA: Links to https://hadirot.com/dashboard
- Content: Explains expiry and provides renewal instructions

## Deployment Instructions

### 1. Apply Database Migration
```bash
# The migration will be applied automatically when deployed
# Or manually apply: supabase db push
```

### 2. Deploy Edge Function
```bash
supabase functions deploy send-deactivation-emails --no-verify-jwt
```

### 3. Set Up Cron Job
1. Go to Supabase Dashboard → Edge Functions → Cron Jobs
2. Click "New Job"
3. Select function: `send-deactivation-emails`
4. Set schedule: `*/15 * * * *` (every 15 minutes)
5. Save

## Testing Instructions

### 1. Simulate Expired Listing
```sql
-- Update a test listing to be deactivated
UPDATE listings 
SET 
  is_active = false,
  deactivated_at = NOW(),
  last_deactivation_email_sent_at = NULL
WHERE id = 'your-test-listing-id';
```

### 2. Trigger Function Manually
```bash
# Via Supabase CLI
supabase functions invoke send-deactivation-emails

# Or via Dashboard: Edge Functions → send-deactivation-emails → Invoke
```

### 3. Verify Results
- Check email inbox of listing owner
- Verify `last_deactivation_email_sent_at` is updated in database
- Run function again to confirm no duplicate email is sent

### 4. Test Renewal Cycle
```sql
-- Simulate renewal
UPDATE listings 
SET 
  is_active = true,
  deactivated_at = NULL
WHERE id = 'your-test-listing-id';

-- Then simulate another deactivation
UPDATE listings 
SET 
  is_active = false,
  deactivated_at = NOW()
WHERE id = 'your-test-listing-id';
```

Run the function again and verify a new email is sent.

## Monitoring

The function logs the following metrics:
- Number of listings evaluated
- Number of emails sent successfully
- Number of emails skipped (already sent)
- Number of email errors
- Timestamp of execution

Check logs in Supabase Dashboard → Edge Functions → send-deactivation-emails → Logs

## Rollback Instructions

### 1. Disable Cron Job
- Go to Supabase Dashboard → Edge Functions → Cron Jobs
- Delete the `send-deactivation-emails` job

### 2. Delete Edge Function
```bash
supabase functions delete send-deactivation-emails
```

### 3. Revert Database Changes (if needed)
```sql
-- Remove the column (optional - data will be preserved if kept)
ALTER TABLE listings DROP COLUMN IF EXISTS last_deactivation_email_sent_at;

-- Remove the index
DROP INDEX IF EXISTS listings_deactivation_email_idx;
```

## Security Notes
- Function runs with service role permissions (no JWT verification needed)
- Only processes listings that are actually deactivated
- Idempotent design prevents spam/duplicate emails
- Uses existing email infrastructure and security measures

## Maintenance
- Monitor logs for any email delivery failures
- Adjust cron frequency if needed (currently every 15 minutes)
- The system is self-healing - transient failures will retry on next run