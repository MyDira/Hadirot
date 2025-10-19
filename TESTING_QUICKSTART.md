# Deactivation Email System - Testing Quickstart Guide

This is your quick reference for testing the deactivation email system. Follow these steps in order.

---

## Prerequisites ✅

Before testing, ensure:

- [ ] Database migrations applied
- [ ] Edge functions deployed (`send-deactivation-emails`, `inactivate-old-listings`, `delete-old-listings`)
- [ ] Environment variables configured (`.env` file)
- [ ] ZeptoMail credentials set up
- [ ] Test user account with valid email

---

## Step 1: Seed Test Data 🌱

Create test scenarios in your database:

```bash
npm run seed:deactivation-tests
```

This will create:
- 15 test listings with different scenarios
- Listings at various lifecycle stages
- Edge cases and boundary conditions

**Expected Output:**
```
✨ Test data seeding complete!
Total Test Listings: 15
  • Active: 2
  • Inactive: 13
  • Needing Email: 8
  • Ready for Deletion: 1
```

---

## Step 2: Run Automated Tests 🤖

Execute the comprehensive test suite:

```bash
npm run test:deactivation
```

**Tests Performed:**
1. Database schema validation
2. Trigger sets deactivated_at timestamp
3. Trigger clears timestamp on reactivation
4. Auto-inactivation function
5. Auto-deletion function
6. Email query logic
7. Template detection (29-day threshold)
8. Edge function connectivity

**Expected Output:**
```
✨ Testing complete!

Total Tests: 8
✅ Passed: 8
❌ Failed: 0
Pass Rate: 100.0%
```

**If tests fail:** Check the detailed error messages and verify prerequisites.

---

## Step 3: Manual Testing (Optional) 📋

For comprehensive validation, use the manual testing checklist:

```bash
# Open the checklist
open MANUAL_TESTING_CHECKLIST.md
```

**Key Manual Tests:**
- Frontend unpublish button
- Email template verification
- Cross-email client compatibility
- Performance testing
- Security testing

**Time Required:** 4-6 hours for complete manual testing

---

## Step 4: Test Email Notifications 📧

### Method A: Trigger Edge Function Manually

```bash
# Using Supabase CLI
supabase functions invoke send-deactivation-emails

# Or using curl (replace with your Supabase URL and key)
curl -X POST \
  https://YOUR_PROJECT.supabase.co/functions/v1/send-deactivation-emails \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

**Expected Result:**
- Function executes successfully
- Emails sent to test user accounts
- Check your email inbox

### Method B: Wait for Scheduled Run

If cron jobs are configured, wait for the next scheduled execution (usually 2:30 AM UTC).

---

## Step 5: Verify Email Templates 📬

Check your email inbox for:

### Automatic Deactivation Email
- **Subject:** "Your listing '[Title]' has expired on HaDirot"
- **Title:** "Your Listing Has Expired"
- **CTA:** "Renew My Listing"
- **Scenario:** Listings 30+ days old

### Manual Deactivation Email
- **Subject:** "Listing deactivated: '[Title]' - HaDirot"
- **Title:** "Listing Deactivation Confirmed"
- **CTA:** "Manage My Listings"
- **Scenario:** Recently deactivated listings (<29 days old)

**Verify:**
- [ ] Correct template received
- [ ] Listing title appears correctly
- [ ] CTA button links to dashboard
- [ ] Branding looks professional
- [ ] No formatting issues

---

## Step 6: Test Database Functions 🗄️

### Test Auto-Inactivation

```sql
-- Run the function
SELECT * FROM auto_inactivate_old_listings();

-- Expected output: count and array of listing IDs
-- inactivated_count | listing_ids
-- ------------------+-------------
--                 1 | {uuid-here}

-- Verify listings were deactivated
SELECT id, title, is_active, deactivated_at
FROM listings
WHERE title ILIKE '%[TEST]%'
  AND is_active = false
  AND deactivated_at IS NOT NULL;
```

### Test Auto-Deletion

```sql
-- Run the function
SELECT * FROM auto_delete_very_old_listings();

-- Expected output: count and array of deleted listing IDs
-- deleted_count | listing_ids
-- --------------+-------------
--             1 | {uuid-here}

-- Verify listings were deleted
SELECT COUNT(*)
FROM listings
WHERE title ILIKE '%[TEST] Scenario 5%';
-- Should return 0
```

---

## Step 7: Test Frontend Integration 🖥️

### Unpublish Test

1. Log in to the website
2. Navigate to `/dashboard`
3. Find an active test listing
4. Click "Unpublish" button
5. Confirm the action
6. Verify:
   - [ ] Listing status changes to "Inactive"
   - [ ] UI updates immediately
   - [ ] No JavaScript errors in console

### Database Verification

```sql
-- Check that deactivated_at was set automatically
SELECT id, title, is_active, deactivated_at
FROM listings
WHERE id = 'YOUR_LISTING_ID';

-- Should show:
-- is_active = false
-- deactivated_at = recent timestamp
```

### Email Verification

Wait for next scheduled edge function run (or trigger manually), then check email inbox.

---

## Step 8: Test Idempotency 🔁

Ensure no duplicate emails are sent:

### Test Case: Email Already Sent

```sql
-- Find a listing that already received an email
SELECT id, title, deactivated_at, last_deactivation_email_sent_at
FROM listings
WHERE title ILIKE '%[TEST] Scenario 4%';

-- Trigger email function again
-- (via Supabase CLI or scheduled run)

-- Verify:
-- 1. Check function logs - listing should be SKIPPED
-- 2. Check email inbox - NO new email received
-- 3. Verify timestamp unchanged in database
```

### Test Case: Renewal Cycle

```sql
-- 1. Start with inactive listing that received email
UPDATE listings
SET is_active = true,
    last_published_at = NOW(),
    deactivated_at = NULL  -- Trigger clears this automatically
WHERE title ILIKE '%[TEST] Scenario 8%';

-- 2. Deactivate again
UPDATE listings
SET is_active = false  -- Trigger sets new deactivated_at
WHERE title ILIKE '%[TEST] Scenario 8%';

-- 3. Trigger email function

-- 4. Verify NEW email received (second deactivation = new email)
```

---

## Step 9: Check Logs 📜

Review edge function logs for issues:

```bash
# Supabase CLI
supabase functions logs send-deactivation-emails --limit 50

# Or check in Supabase Dashboard:
# Project → Edge Functions → send-deactivation-emails → Logs
```

**Look For:**
- ✅ Successful email sends
- 📊 Listing counts
- 🎯 Template detection (automatic vs manual)
- ❌ Any errors or warnings

---

## Step 10: Cleanup 🧹

After testing, clean up test data:

```sql
-- Remove all test listings
DELETE FROM listings
WHERE title ILIKE '%[TEST]%';

-- Verify cleanup
SELECT COUNT(*) FROM listings WHERE title ILIKE '%[TEST]%';
-- Should return 0
```

---

## Troubleshooting 🔧

### Issue: Tests Fail to Run

```bash
# Check environment variables
cat .env | grep SUPABASE

# Ensure dependencies installed
npm install
```

### Issue: No Emails Received

**Checklist:**
1. Check ZeptoMail credentials: `echo $ZEPTO_TOKEN`
2. Verify test user has valid email
3. Check spam folder
4. Review edge function logs for errors
5. Verify email query returns listings:

```sql
SELECT COUNT(*)
FROM listings
WHERE is_active = false
  AND deactivated_at IS NOT NULL
  AND (last_deactivation_email_sent_at IS NULL
       OR last_deactivation_email_sent_at < deactivated_at);
```

### Issue: Wrong Email Template

**Debug:**
```sql
-- Check listing age
SELECT
  title,
  last_published_at,
  deactivated_at,
  EXTRACT(DAY FROM (deactivated_at - last_published_at)) as days_between
FROM listings
WHERE title ILIKE '%[TEST]%'
  AND is_active = false;

-- If days_between >= 29, should get "automatic" template
-- If days_between < 29, should get "manual" template
```

### Issue: Duplicate Emails

**Debug:**
```sql
-- Check timestamp logic
SELECT
  title,
  deactivated_at,
  last_deactivation_email_sent_at,
  CASE
    WHEN last_deactivation_email_sent_at IS NULL THEN 'Should send'
    WHEN last_deactivation_email_sent_at < deactivated_at THEN 'Should send'
    ELSE 'Should NOT send'
  END as email_status
FROM listings
WHERE is_active = false;
```

---

## Performance Testing (Advanced) 📊

### Test Bulk Email Processing

```bash
# Create 100 test listings
for i in {1..100}; do
  npm run seed:deactivation-tests
done

# Trigger email function and measure time
time supabase functions invoke send-deactivation-emails

# Check logs for processing stats
```

**Acceptance Criteria:**
- 100 listings processed in < 2 minutes
- All emails sent successfully
- No timeouts or errors

---

## Success Criteria ✅

Your system passes testing if:

- [ ] All automated tests pass (8/8)
- [ ] Both email templates received correctly
- [ ] No duplicate emails for same deactivation
- [ ] Renewal cycle allows new emails
- [ ] Database functions work correctly
- [ ] Frontend integration works smoothly
- [ ] No security vulnerabilities found
- [ ] Performance acceptable for your load

---

## Next Steps After Testing

1. **If All Tests Pass:**
   - Document results in `DEACTIVATION_EMAIL_TESTING_REPORT.md`
   - Get stakeholder sign-off
   - Deploy to production
   - Set up monitoring alerts

2. **If Issues Found:**
   - Document issues with screenshots/logs
   - Prioritize fixes (critical vs nice-to-have)
   - Implement fixes
   - Re-test
   - Repeat until all tests pass

3. **Production Deployment:**
   - Schedule cron jobs (2:00 AM, 2:30 AM, 3:00 AM UTC)
   - Monitor edge function logs for 48 hours
   - Track email delivery rates
   - Set up alerts for failures

---

## Resources 📚

- **Full Testing Report:** `DEACTIVATION_EMAIL_TESTING_REPORT.md`
- **Manual Checklist:** `MANUAL_TESTING_CHECKLIST.md`
- **Implementation Docs:** `DEACTIVATION_EMAIL_SYSTEM_IMPLEMENTATION.md`
- **Test Scripts:** `scripts/test-deactivation-system.ts`
- **Seed Data:** `scripts/seed-deactivation-test-data.ts`

---

## Support 💬

If you encounter issues not covered in this guide:

1. Check edge function logs
2. Review `DEACTIVATION_EMAIL_TESTING_REPORT.md` troubleshooting section
3. Verify all prerequisites met
4. Check Supabase dashboard for database errors
5. Test with fresh test data (cleanup and re-seed)

---

**Happy Testing! 🎉**
