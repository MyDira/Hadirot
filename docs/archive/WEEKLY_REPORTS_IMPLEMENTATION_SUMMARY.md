# Weekly SMS Performance Reports - Implementation Summary

## ✅ Implementation Complete

The weekly SMS performance report system has been successfully implemented and deployed.

## 🎯 What Was Built

### 1. Edge Function: `send-weekly-performance-reports`
- **Status:** ✅ Deployed
- **Location:** `/supabase/functions/send-weekly-performance-reports/index.ts`
- **Purpose:** Aggregates listing metrics and sends SMS reports to listing owners

### 2. Cron Job Schedule
- **Status:** ✅ Scheduled
- **Job Name:** `send-weekly-performance-reports`
- **Schedule:** Every Thursday at 2:00 PM EST (19:00 UTC)
- **Cron Expression:** `0 19 * * 4`

### 3. Database Migration
- **Status:** ✅ Applied
- **Migration:** `schedule_weekly_performance_reports.sql`
- **Changes:** Created pg_cron job for weekly execution

## 📊 How It Works

### Data Aggregation (Last 7 Days)
```
For each active, approved listing:
  ├─ Count impressions (listing_impression_batch events)
  ├─ Count clicks (listing_view events)
  ├─ Count phone reveals (phone_click events)
  └─ Count callbacks (listing_contact_submissions)

Group by contact_phone:
  ├─ Calculate total and average per listing
  ├─ Filter: Only send if ≥10 total impressions
  └─ Format dynamic message (exclude zero metrics)
```

### Message Format
```
Hadirot Update:
This week your [X] listing[s] got on average
[Y] impressions each          ← Only if > 0
[Z] clicks each              ← Only if > 0
[W] leads total (... details) ← Only if > 0
```

### Filtering Rules
- ✅ Only active listings (`is_active = true`)
- ✅ Only approved listings (`approved = true`)
- ✅ Must have contact phone number
- ✅ Minimum 10 total impressions across all listings
- ✅ Zero-value metrics excluded from message

## 📁 Files Created

1. **Edge Function**
   - `/supabase/functions/send-weekly-performance-reports/index.ts`
   - Full implementation with Twilio integration
   - Dynamic message builder
   - Error handling and logging

2. **Documentation**
   - `WEEKLY_PERFORMANCE_REPORTS.md` - Complete system documentation
   - `WEEKLY_REPORTS_IMPLEMENTATION_SUMMARY.md` - This summary
   - `test-weekly-reports.sh` - Testing script

3. **Database Migration**
   - Applied via `mcp__supabase__apply_migration`
   - Creates cron schedule
   - Includes setup instructions

## ⚙️ Configuration Required

⚠️ **IMPORTANT:** Update the cron job with your project details:

1. Go to **Supabase Dashboard** → **Database** → **Extensions** → **pg_cron**
2. Find job: `send-weekly-performance-reports`
3. Click **Edit** on the job command
4. Replace:
   - `[PROJECT-REF]` with your Supabase project reference
   - `[SERVICE-ROLE-KEY]` with your service role key

### Verification Query
```sql
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname = 'send-weekly-performance-reports';
```

## 🧪 Testing

### Option 1: Use Test Script
```bash
SUPABASE_PROJECT_REF=your-ref \
SUPABASE_SERVICE_KEY=your-key \
./test-weekly-reports.sh
```

### Option 2: Manual curl Test
```bash
curl -X POST https://[PROJECT-REF].supabase.co/functions/v1/send-weekly-performance-reports \
  -H "Authorization: Bearer [SERVICE-ROLE-KEY]" \
  -H "Content-Type: application/json"
```

### Expected Response
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

### Verify Recipients Receive SMS
After testing, check:
1. ✅ SMS delivered to listing owner's phone
2. ✅ Message format is correct
3. ✅ Metrics appear accurate
4. ✅ No zero-value metrics shown
5. ✅ Correct singular/plural for "listing(s)"

## 📅 Automatic Execution

The system will automatically run:
- **Every Thursday at 2:00 PM EST**
- No manual intervention required
- Processes all qualifying contacts
- Sends SMS via Twilio
- Logs execution results

### Monitor Execution
```sql
-- View execution history
SELECT *
FROM cron.job_run_details
WHERE jobname = 'send-weekly-performance-reports'
ORDER BY start_time DESC
LIMIT 10;
```

## 🔍 Monitoring & Logs

### Edge Function Logs
1. Supabase Dashboard → Edge Functions
2. Select `send-weekly-performance-reports`
3. View Logs tab

### Twilio Delivery Status
1. Twilio Console → Monitor → Logs → Messaging
2. Filter by date/time
3. Check delivery status

### Database Queries
See `WEEKLY_PERFORMANCE_REPORTS.md` for detailed monitoring queries

## 🎨 Example Messages

### All Metrics (3 listings)
```
Hadirot Update:
This week your 3 listings got on average
89.5 impressions each
14.2 clicks each
8 leads total (1 callbacks, 7 requests for your phone number)
```

### No Clicks (1 listing)
```
Hadirot Update:
This week your 1 listing got on average
45.0 impressions each
5 leads total (2 callbacks, 3 requests for your phone number)
```

### Only Impressions (10 listings)
```
Hadirot Update:
This week your 10 listings got on average
31.4 impressions each
```

## 💰 Cost Estimate

**Per SMS:** ~$0.0079 (US)

**Weekly Estimates:**
- 50 contacts: ~$0.40/week (~$1.60/month)
- 100 contacts: ~$0.79/week (~$3.16/month)
- 200 contacts: ~$1.58/week (~$6.32/month)

## 🔧 Troubleshooting

### No SMS Received?
1. Check cron configuration (PROJECT-REF and SERVICE-ROLE-KEY replaced?)
2. Verify Twilio credentials in environment variables
3. Check if contact has ≥10 impressions
4. Review edge function logs for errors

### Wrong Metrics?
1. Verify analytics_events tracking
2. Check JSONB array handling for impressions
3. Run test query to verify calculations

### Delivery Failed?
1. Check Twilio console for error codes
2. Verify phone number format (US 10-digit)
3. Check Twilio account balance

See `WEEKLY_PERFORMANCE_REPORTS.md` for detailed troubleshooting guides.

## 📚 Documentation

- **Full Documentation:** `WEEKLY_PERFORMANCE_REPORTS.md`
- **Test Script:** `test-weekly-reports.sh`
- **Edge Function Code:** `/supabase/functions/send-weekly-performance-reports/index.ts`

## ✅ Deployment Checklist

- [x] Edge function created and deployed
- [x] Cron job scheduled in database
- [x] Migration applied successfully
- [x] Build passes without errors
- [x] Documentation created
- [x] Test script provided
- [ ] **TODO:** Update cron job with PROJECT-REF and SERVICE-ROLE-KEY
- [ ] **TODO:** Run manual test to verify SMS delivery
- [ ] **TODO:** Wait for Thursday 2 PM EST for first automatic execution

## 🚀 Next Steps

1. **Update cron job configuration** (replace placeholders)
2. **Run manual test** using curl or test script
3. **Verify SMS delivery** to a test recipient
4. **Monitor first automatic execution** next Thursday
5. **Review edge function logs** for any issues

---

**Implementation Date:** January 21, 2026
**Status:** ✅ Deployed and Ready
**Next Execution:** Thursday at 2:00 PM EST
