# Weekly SMS Performance Reports System

## Overview

Automated weekly SMS reports that send listing performance metrics to listing owners every Thursday at 2 PM EST.

## What Gets Sent

Each listing owner receives an SMS with their weekly performance metrics:

```
Hadirot Update:
This week your 3 listings got on average
89.5 impressions each
14.2 clicks each
8 leads total (1 callbacks, 7 requests for your phone number)
```

**Dynamic Message Rules:**
- Only includes non-zero metrics
- Uses singular "listing" or plural "listings" correctly
- Skips entire leads section if no leads
- Only sends to contacts with ≥10 total impressions

## Schedule

- **When:** Every Thursday at 2:00 PM EST (19:00 UTC)
- **Frequency:** Weekly
- **Cron Expression:** `0 19 * * 4`

## Metrics Tracked (Last 7 Days)

1. **Impressions** - Times listing appeared in browse results (from `listing_impression_batch` events)
2. **Clicks** - Times listing detail page was viewed (from `listing_view` events)
3. **Leads** - Combined count of:
   - Phone reveals (from `phone_click` events)
   - Callback requests (from `listing_contact_submissions` table)

## Filtering Rules

### Who Gets Reports
- Active listings only (`is_active = true`)
- Approved listings only (`approved = true`)
- Must have contact phone number
- Must have at least 10 total impressions across all listings in past 7 days

### Metrics Display
- Averages are calculated per listing (total ÷ listing count)
- Rounded to 1 decimal place
- Zero-value metrics are excluded from message

## System Components

### 1. Edge Function
- **Name:** `send-weekly-performance-reports`
- **Location:** `/supabase/functions/send-weekly-performance-reports/index.ts`
- **Purpose:** Queries metrics, formats messages, sends SMS via Twilio
- **JWT Verification:** Disabled (called by cron)

### 2. Cron Job
- **Name:** `send-weekly-performance-reports`
- **Managed By:** pg_cron extension
- **Configuration:** Database migration `schedule_weekly_performance_reports.sql`

### 3. Dependencies
- **Twilio:** SMS delivery (credentials: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)
- **Supabase:** Database queries, edge function hosting
- **pg_cron:** Scheduled execution
- **pg_net:** HTTP calls from database

## Configuration Required

⚠️ **IMPORTANT:** After deployment, you must update the cron job URLs:

1. Go to **Supabase Dashboard** → **Database** → **Extensions** → **pg_cron**
2. Find job: `send-weekly-performance-reports`
3. Click **Edit** and replace:
   - `[PROJECT-REF]` with your Supabase project reference
   - `[SERVICE-ROLE-KEY]` with your service role key

## Testing

### Manual Test (Immediate Execution)

Test the function without waiting for Thursday:

```bash
curl -X POST https://[PROJECT-REF].supabase.co/functions/v1/send-weekly-performance-reports \
  -H "Authorization: Bearer [SERVICE-ROLE-KEY]" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "summary": {
    "totalContacts": 15,
    "smsSent": 15,
    "smsErrors": 0,
    "timestamp": "2026-01-21T19:00:00.000Z"
  }
}
```

### Test with Sample Data

Query to see what would be sent:

```sql
WITH listing_metrics AS (
  SELECT
    l.id as listing_id,
    l.contact_phone,
    (SELECT COUNT(*)
     FROM analytics_events ae
     WHERE ae.event_name = 'listing_impression_batch'
       AND ae.occurred_at >= NOW() - INTERVAL '7 days'
       AND l.id::text = ANY(
         SELECT jsonb_array_elements_text(ae.event_props->'listing_ids')
       )
    ) as impressions,
    (SELECT COUNT(*)
     FROM analytics_events ae
     WHERE ae.event_name = 'listing_view'
       AND ae.event_props->>'listing_id' = l.id::text
       AND ae.occurred_at >= NOW() - INTERVAL '7 days'
    ) as views,
    (SELECT COUNT(*)
     FROM analytics_events ae
     WHERE ae.event_name = 'phone_click'
       AND ae.event_props->>'listing_id' = l.id::text
       AND ae.occurred_at >= NOW() - INTERVAL '7 days'
    ) as phone_clicks,
    (SELECT COUNT(*)
     FROM listing_contact_submissions lcs
     WHERE lcs.listing_id = l.id
       AND lcs.created_at >= NOW() - INTERVAL '7 days'
    ) as callbacks
  FROM listings l
  WHERE l.is_active = true
    AND l.approved = true
    AND l.contact_phone IS NOT NULL
    AND l.user_id IS NOT NULL
)
SELECT
  contact_phone,
  COUNT(*) as listing_count,
  SUM(impressions) as total_impressions,
  ROUND(AVG(impressions), 1) as avg_impressions,
  SUM(views) as total_views,
  ROUND(AVG(views), 1) as avg_views,
  SUM(phone_clicks) as total_phone_clicks,
  SUM(callbacks) as total_callbacks,
  (SUM(phone_clicks) + SUM(callbacks)) as total_leads
FROM listing_metrics
GROUP BY contact_phone
HAVING SUM(impressions) >= 10
ORDER BY total_impressions DESC;
```

### Message Format Testing

Test different scenarios:

**Scenario 1: All Metrics Present**
- Input: 3 listings, 89.5 avg impressions, 14.2 avg views, 8 total leads (1 callback, 7 phone reveals)
- Output:
```
Hadirot Update:
This week your 3 listings got on average
89.5 impressions each
14.2 clicks each
8 leads total (1 callbacks, 7 requests for your phone number)
```

**Scenario 2: No Clicks**
- Input: 1 listing, 45.0 avg impressions, 0 avg views, 5 total leads
- Output:
```
Hadirot Update:
This week your 1 listing got on average
45.0 impressions each
5 leads total (2 callbacks, 3 requests for your phone number)
```

**Scenario 3: Only Impressions**
- Input: 10 listings, 31.4 avg impressions, 0 avg views, 0 total leads
- Output:
```
Hadirot Update:
This week your 10 listings got on average
31.4 impressions each
```

**Scenario 4: Below Threshold**
- Input: 5 listings, 8 total impressions
- Result: **No SMS sent** (below 10 impression threshold)

## Monitoring

### View Scheduled Job

```sql
SELECT * FROM cron.job
WHERE jobname = 'send-weekly-performance-reports';
```

### View Execution History

```sql
SELECT * FROM cron.job_run_details
WHERE jobname = 'send-weekly-performance-reports'
ORDER BY start_time DESC
LIMIT 10;
```

### Check Edge Function Logs

1. Go to **Supabase Dashboard** → **Edge Functions**
2. Select `send-weekly-performance-reports`
3. View **Logs** tab
4. Filter by timestamp (Thursdays at 2 PM EST)

### Twilio Delivery Status

1. Log into [Twilio Console](https://console.twilio.com/)
2. Navigate to **Monitor** → **Logs** → **Messaging**
3. Filter by date/time of execution
4. Verify delivery status for each SMS

## Troubleshooting

### No SMS Received

**Check 1: Verify Cron Configuration**
```sql
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname = 'send-weekly-performance-reports';
```
- Ensure `[PROJECT-REF]` and `[SERVICE-ROLE-KEY]` are replaced

**Check 2: Verify Twilio Credentials**
- Edge function logs will show "Missing Twilio configuration" if credentials are missing
- Ensure environment variables are set: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER

**Check 3: Check Impression Threshold**
```sql
-- Check if contact has enough impressions
WITH metrics AS (
  SELECT
    l.contact_phone,
    SUM((SELECT COUNT(*) FROM analytics_events ae
         WHERE ae.event_name = 'listing_impression_batch'
         AND l.id::text = ANY(SELECT jsonb_array_elements_text(ae.event_props->'listing_ids'))
         AND ae.occurred_at >= NOW() - INTERVAL '7 days')) as total_impressions
  FROM listings l
  WHERE l.contact_phone = 'YOUR_PHONE_NUMBER'
    AND l.is_active = true
    AND l.approved = true
  GROUP BY l.contact_phone
)
SELECT * FROM metrics WHERE total_impressions >= 10;
```

**Check 4: Verify Phone Number Format**
- Edge function logs show formatted phone numbers
- Must be valid US format (10 digits)

### SMS Delivery Failed

**Check Twilio Console:**
- Failed deliveries show error codes
- Common issues:
  - Invalid phone number
  - Carrier blocking
  - Insufficient Twilio balance

**Check Edge Function Logs:**
- Look for "Twilio error" messages
- Error details include Twilio error codes and messages

### Wrong Metrics

**Verify Event Tracking:**
```sql
-- Check recent events for a specific listing
SELECT
  event_name,
  occurred_at,
  event_props
FROM analytics_events
WHERE event_props->>'listing_id' = 'YOUR_LISTING_ID'
  AND occurred_at >= NOW() - INTERVAL '7 days'
ORDER BY occurred_at DESC;
```

**Verify Impressions (JSONB Array):**
```sql
-- Check listing_impression_batch events
SELECT
  occurred_at,
  jsonb_array_elements_text(event_props->'listing_ids') as listing_id
FROM analytics_events
WHERE event_name = 'listing_impression_batch'
  AND occurred_at >= NOW() - INTERVAL '7 days'
  AND event_props->'listing_ids' ? 'YOUR_LISTING_ID'
LIMIT 10;
```

## Modifying the System

### Change Schedule

Edit the cron expression in the database:

```sql
-- Change to Mondays at 10 AM EST (15:00 UTC)
SELECT cron.schedule(
  'send-weekly-performance-reports',
  '0 15 * * 1',
  $$
  SELECT net.http_post(
    url:='https://[PROJECT-REF].supabase.co/functions/v1/send-weekly-performance-reports',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer [SERVICE-ROLE-KEY]"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);
```

### Change Impression Threshold

Edit edge function code:
```typescript
// Change line with: HAVING SUM(impressions) >= 10
// To a different value, e.g., >= 5 or >= 20
```

### Add New Metrics

1. Update SQL query to include new metric calculations
2. Update `ContactMetrics` TypeScript interface
3. Update `buildPerformanceMessage()` to include new metric
4. Redeploy edge function

## Security Notes

- Edge function uses service role key (full database access)
- Called by pg_cron (server-side only, no user access)
- Phone numbers are formatted but not stored or logged permanently
- Twilio credentials stored as environment variables (never exposed to client)
- RLS policies don't apply (service role bypasses RLS)

## Cost Considerations

- **Twilio SMS:** ~$0.0079 per SMS (US)
- **Edge Function:** Minimal (short execution time)
- **Database:** Minimal (simple aggregation queries)

**Estimated Weekly Cost:**
- 50 contacts × $0.0079 = ~$0.40 per week
- 200 contacts × $0.0079 = ~$1.58 per week

## Support

For issues or questions:
1. Check edge function logs
2. Verify cron job configuration
3. Test manually with curl
4. Check Twilio delivery status
5. Review database queries for correct metrics

---

**System Status:** ✅ Deployed and Scheduled

**Next Thursday Execution:** Check logs at 2:00 PM EST for first automated run!
