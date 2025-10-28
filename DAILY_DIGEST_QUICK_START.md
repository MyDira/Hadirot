# Daily Digest System - Quick Start Guide

**Status:** ✅ Ready to Deploy

---

## What Was Built

A daily automated email system that:
- ✅ Sends digest at **5:00 PM EST/EDT** every day
- ✅ Includes all new listings from last 24 hours
- ✅ Never sends same listing twice (smart deduplication)
- ✅ Copy button for quick sharing of individual listings

---

## 5-Minute Deployment

### Step 1: Database (30 seconds)
Run these migrations in Supabase:
```sql
-- Migration 1: Creates tables
supabase/migrations/20251028133244_create_daily_digest_system.sql

-- Migration 2: Sets up daily cron job
supabase/migrations/20251028133433_setup_daily_digest_cron.sql
```

### Step 2: Deploy Edge Function (1 minute)
```bash
supabase functions deploy send-daily-digest
```

### Step 3: Deploy Frontend (1 minute)
```bash
npm run build
# Deploy dist/ folder to your hosting
```

### Step 4: Test (2 minutes)
```bash
# Check system status
npm run test:digest

# Test manually (sends real email!)
supabase functions invoke send-daily-digest
```

**Done!** System is live and will run automatically at 5 PM daily.

---

## What Admins See

### In Admin Panel (Listings Tab)
Each approved listing has two buttons:
1. **📧 Mail icon** - Send manual email to all admins
2. **📋 Copy icon** - Copy listing details to clipboard

### In Their Inbox (Daily at 5 PM)
```
Subject: Hadirot Daily Digest - 3 New Listings

Today's new Hadirot listings 👇

$2,500
🛏️ 2 bedrooms, 🛁 1 bathroom, 🅿️ Parking included, No Fee
📍 Williamsburg, Brooklyn
XYZ Realty
Click here to view the apartment: https://hadirot.com/listing/123

[More listings...]

Click the link to join the Hadirot community
https://chat.whatsapp.com/C3qmgo7DNOI63OE0RAZRgt
```

---

## How It Works

### Daily Digest (Automated)
1. **5:00 PM** - System automatically triggers
2. Finds listings posted in last 24 hours
3. Skips any listings already sent before
4. Formats email with all new listings
5. Sends to all admin users
6. Records what was sent (prevents duplicates tomorrow)

### Copy Feature (Manual)
1. Admin clicks copy icon on any listing
2. System formats listing details
3. Copies to clipboard
4. Shows success message
5. Admin can paste anywhere (WhatsApp, email, etc.)

---

## Verify It's Working

### Check Cron Job is Scheduled
```sql
SELECT * FROM cron.job WHERE jobname = 'daily-digest-email';
```
Should show one row with schedule `'0 22 * * *'`

### Check Latest Digest Runs
```sql
SELECT run_at, listings_count, recipients_count, success
FROM daily_digest_logs
ORDER BY run_at DESC
LIMIT 5;
```

### Check Sent Listings
```sql
SELECT COUNT(*) as total_sent
FROM daily_digest_sent_listings;
```

### Test Copy Button
1. Go to Admin Panel → Listings tab
2. Find an approved listing
3. Click copy icon (📋)
4. Should see "Listing details copied to clipboard!" message
5. Paste somewhere to verify format

---

## Files Created

### Database
- `daily_digest_sent_listings` table (tracks sent listings)
- `daily_digest_logs` table (execution history)
- Cron job scheduled for 5 PM daily

### Backend
- `supabase/functions/send-daily-digest/` - Email automation
- `supabase/functions/_shared/dailyDigestTemplate.ts` - Email formatting

### Frontend
- Copy button in AdminPanel.tsx (📋 icon)
- Toast notifications for feedback

### Testing
- `scripts/test-daily-digest.ts` - System validation
- `npm run test:digest` command

---

## Common Commands

```bash
# Test the system
npm run test:digest

# Send digest now (manual trigger)
supabase functions invoke send-daily-digest

# Check logs
supabase functions logs send-daily-digest

# Build frontend
npm run build
```

---

## Troubleshooting

### Not receiving emails?
1. Check `daily_digest_logs` table for errors
2. Verify ZEPTO_TOKEN environment variable is set
3. Test manually: `supabase functions invoke send-daily-digest`
4. Check Supabase function logs

### Copy button not working?
1. Must use HTTPS (clipboard API requirement)
2. Check browser console for errors
3. Verify toast notification appears

### Same listings repeating?
1. Check `daily_digest_sent_listings` has records
2. Verify listings have correct IDs
3. Review Edge Function logs for errors

### Wrong time?
Current schedule: 22:00 UTC = 5 PM EST (6 PM EDT)
To change:
```sql
SELECT cron.unschedule('daily-digest-email');
-- Then run migration again with new time
```

---

## Key Features

✅ **Zero Manual Work** - Runs automatically every day
✅ **No Duplicates** - Each listing sent exactly once
✅ **Professional Format** - Clean, branded emails
✅ **Copy Feature** - Quick sharing for individual listings
✅ **Full Logging** - Track every execution
✅ **Error Handling** - Graceful failures with notifications

---

## Support

**Documentation:**
- Full details: `DAILY_DIGEST_IMPLEMENTATION.md`
- This quick start: `DAILY_DIGEST_QUICK_START.md`

**Testing:**
- Run: `npm run test:digest`
- Manual send: `supabase functions invoke send-daily-digest`

**Monitoring:**
- Check `daily_digest_logs` table
- Review Supabase function logs
- Monitor ZeptoMail dashboard

---

**Everything Working?** ✅ You're done! System runs automatically at 5 PM daily.

**Having Issues?** See `DAILY_DIGEST_IMPLEMENTATION.md` for detailed troubleshooting.
