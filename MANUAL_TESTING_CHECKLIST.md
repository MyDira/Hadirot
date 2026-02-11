# Manual Testing Checklist - Deactivation Email System

This document provides a step-by-step checklist for manually testing the deactivation email system. Print this document and check off items as you complete them.

---

## Pre-Testing Setup

- [ ] Verify migrations have been applied to database
- [ ] Confirm edge functions are deployed:
  - [ ] `send-deactivation-emails`
  - [ ] `inactivate-old-listings`
  - [ ] `delete-old-listings`
- [ ] Verify environment variables are configured
- [ ] Have access to test user accounts with valid email addresses
- [ ] Have access to database admin panel (Supabase dashboard)
- [ ] Can receive emails at test email addresses

---

## Test Suite 1: Database Triggers

### Test 1.1: Deactivation Sets Timestamp
**Objective:** Verify trigger automatically sets `deactivated_at` when listing becomes inactive

**Steps:**
1. [ ] Log into Supabase dashboard
2. [ ] Navigate to Table Editor → `listings` table
3. [ ] Find an active listing (`is_active = true`, `deactivated_at = null`)
4. [ ] Note the listing ID: `________________`
5. [ ] Update the listing: Set `is_active` to `false`
6. [ ] Refresh the table view
7. [ ] Verify `deactivated_at` now contains a timestamp
8. [ ] Verify timestamp is approximately current time

**Expected Result:** ✅ `deactivated_at` automatically populated with current timestamp

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

### Test 1.2: Reactivation Clears Timestamp
**Objective:** Verify trigger clears `deactivated_at` when listing becomes active

**Steps:**
1. [ ] Find an inactive listing (`is_active = false`, `deactivated_at` has value)
2. [ ] Note the listing ID: `________________`
3. [ ] Update the listing: Set `is_active` to `true`
4. [ ] Also set `last_published_at` to current timestamp
5. [ ] Refresh the table view
6. [ ] Verify `deactivated_at` is now `NULL`

**Expected Result:** ✅ `deactivated_at` automatically cleared to NULL

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

## Test Suite 2: PostgreSQL Functions

### Test 2.1: Auto-Inactivation Function
**Objective:** Verify `auto_inactivate_old_listings()` correctly deactivates 30+ day old listings

**Steps:**
1. [ ] Create a test listing or update existing one
2. [ ] Set `last_published_at` to 31 days ago
3. [ ] Set `is_active` to `true`
4. [ ] Note the listing ID: `________________`
5. [ ] Open SQL Editor in Supabase
6. [ ] Run: `SELECT * FROM auto_inactivate_old_listings();`
7. [ ] Check the returned count and IDs
8. [ ] Verify your test listing is in the results
9. [ ] Query the listing: `SELECT is_active, deactivated_at FROM listings WHERE id = 'YOUR_ID'`
10. [ ] Verify `is_active = false` and `deactivated_at` is set

**Expected Result:** ✅ Function returns count ≥ 1, test listing is deactivated

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

### Test 2.2: Auto-Deletion Function
**Objective:** Verify `auto_delete_very_old_listings()` deletes listings 30+ days after deactivation

**Steps:**
1. [ ] Create a test listing or update existing one
2. [ ] Set `is_active` to `false`
3. [ ] Set `deactivated_at` to 31 days ago
4. [ ] Note the listing ID: `________________`
5. [ ] Open SQL Editor
6. [ ] Run: `SELECT * FROM auto_delete_very_old_listings();`
7. [ ] Check the returned count and IDs
8. [ ] Verify your test listing is in the results
9. [ ] Try to query the listing: `SELECT * FROM listings WHERE id = 'YOUR_ID'`
10. [ ] Verify listing no longer exists (query returns no rows)

**Expected Result:** ✅ Function returns count ≥ 1, test listing is permanently deleted

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

## Test Suite 3: Email Query Logic

### Test 3.1: Query Identifies Listings Needing Emails
**Objective:** Verify the email query correctly identifies which listings need notification emails

**Steps:**
1. [ ] Create three test listings with different email states:
   - **Listing A:** `is_active = false`, `deactivated_at = NOW()`, `last_deactivation_email_sent_at = NULL`
   - **Listing B:** `is_active = false`, `deactivated_at = NOW()`, `last_deactivation_email_sent_at = 1 hour ago`
   - **Listing C:** `is_active = false`, `deactivated_at = NOW()`, `last_deactivation_email_sent_at = NOW()`
2. [ ] Note listing IDs:
   - Listing A: `________________`
   - Listing B: `________________`
   - Listing C: `________________`
3. [ ] Run query in SQL Editor:
```sql
SELECT id, title, deactivated_at, last_deactivation_email_sent_at
FROM listings
WHERE is_active = false
  AND deactivated_at IS NOT NULL
  AND (last_deactivation_email_sent_at IS NULL
       OR last_deactivation_email_sent_at < deactivated_at);
```
4. [ ] Verify Listing A is in results (NULL email timestamp)
5. [ ] Verify Listing B is in results (email timestamp before deactivation)
6. [ ] Verify Listing C is NOT in results (email timestamp after deactivation)

**Expected Result:** ✅ Query returns A and B, excludes C

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

## Test Suite 4: Email Template Detection

### Test 4.1: Automatic Deactivation Email (30-day expiration)
**Objective:** Verify automatic deactivation sends correct email template

**Steps:**
1. [ ] Create or update a listing:
   - Set `last_published_at` to 30 days ago
   - Set `is_active` to `false`
   - Set `deactivated_at` to current timestamp
   - Set `last_deactivation_email_sent_at` to `NULL`
   - Ensure owner has valid email
2. [ ] Note listing details:
   - Listing ID: `________________`
   - Listing Title: `________________`
   - Owner Email: `________________`
3. [ ] Invoke edge function manually or wait for scheduled run
4. [ ] Check Supabase Functions logs for processing
5. [ ] Verify logs show "Automatic deactivation detected (30 days old)"
6. [ ] Check email inbox

**Email Verification Checklist:**
- [ ] Email received at correct address
- [ ] Subject: "Your listing '[Title]' has expired on HaDirot"
- [ ] Email title: "Your Listing Has Expired"
- [ ] Body mentions expiration and renewal
- [ ] CTA button labeled "Renew My Listing"
- [ ] CTA links to https://hadirot.com/dashboard
- [ ] Branding looks correct (Hadirot header, colors)
- [ ] No formatting issues

**Expected Result:** ✅ Automatic expiration email with renewal CTA

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

### Test 4.2: Manual Deactivation Email
**Objective:** Verify manual deactivation sends correct email template

**Steps:**
1. [ ] Create or update a listing:
   - Set `last_published_at` to 5 days ago
   - Set `is_active` to `false`
   - Set `deactivated_at` to current timestamp
   - Set `last_deactivation_email_sent_at` to `NULL`
   - Ensure owner has valid email
2. [ ] Note listing details:
   - Listing ID: `________________`
   - Listing Title: `________________`
   - Owner Email: `________________`
3. [ ] Invoke edge function
4. [ ] Check logs for "Manual deactivation detected (5 days old)"
5. [ ] Check email inbox

**Email Verification Checklist:**
- [ ] Email received at correct address
- [ ] Subject: "Listing deactivated: '[Title]' - HaDirot"
- [ ] Email title: "Listing Deactivation Confirmed"
- [ ] Body mentions user action and reactivation
- [ ] CTA button labeled "Manage My Listings"
- [ ] CTA links to https://hadirot.com/dashboard
- [ ] Professional tone and formatting

**Expected Result:** ✅ Manual deactivation confirmation email

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

### Test 4.3: Boundary Condition (29 days)
**Objective:** Verify template detection at 29-day threshold

**Steps:**
1. [ ] Create listing with `last_published_at` exactly 29 days ago
2. [ ] Deactivate the listing
3. [ ] Trigger email function
4. [ ] Verify it's detected as "Automatic deactivation"
5. [ ] Check email uses expiration template

**Expected Result:** ✅ Detected as automatic (≥29 days)

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

## Test Suite 5: Email Idempotency

### Test 5.1: No Duplicate Emails
**Objective:** Verify system doesn't send duplicate emails for same deactivation

**Steps:**
1. [ ] Create inactive listing with email already sent:
   - `is_active = false`
   - `deactivated_at = 1 hour ago`
   - `last_deactivation_email_sent_at = 30 minutes ago`
2. [ ] Note listing ID: `________________`
3. [ ] Invoke edge function
4. [ ] Check function logs
5. [ ] Verify listing was NOT included in email batch
6. [ ] Verify no new email received

**Expected Result:** ✅ No duplicate email sent

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

### Test 5.2: Renewal Allows New Email
**Objective:** Verify renewal cycle allows fresh email on re-deactivation

**Steps:**
1. [ ] Start with inactive listing that received email:
   - `is_active = false`
   - `deactivated_at = [timestamp1]`
   - `last_deactivation_email_sent_at = [timestamp1]`
2. [ ] Reactivate: Set `is_active = true`, update `last_published_at`
3. [ ] Verify `deactivated_at` cleared to NULL
4. [ ] Deactivate again: Set `is_active = false`
5. [ ] Verify new `deactivated_at = [timestamp2]`
6. [ ] Invoke email function
7. [ ] Verify new email sent
8. [ ] Check inbox for second email

**Expected Result:** ✅ New email sent for second deactivation

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

## Test Suite 6: Frontend Integration

### Test 6.1: Manual Unpublish via Dashboard
**Objective:** Verify frontend unpublish correctly updates database

**Steps:**
1. [ ] Log in to website as user with active listing
2. [ ] Navigate to `/dashboard`
3. [ ] Locate an active listing
4. [ ] Click "Unpublish" button
5. [ ] Confirm the dialog
6. [ ] Wait for operation to complete
7. [ ] Verify UI shows "Inactive" status
8. [ ] Check database (Supabase dashboard):
   - [ ] `is_active = false`
   - [ ] `deactivated_at` has timestamp
9. [ ] Wait for next scheduled edge function run (or trigger manually)
10. [ ] Check email inbox
11. [ ] Verify email received with manual deactivation template

**Expected Result:** ✅ Listing deactivated, single email with correct template

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

### Test 6.2: Renewal via Dashboard
**Objective:** Verify frontend renewal correctly updates database

**Steps:**
1. [ ] Log in as user with inactive listing
2. [ ] Navigate to `/dashboard`
3. [ ] Find an inactive listing
4. [ ] Click "Renew" or "Reactivate" button
5. [ ] Confirm action
6. [ ] Verify UI shows "Active" status
7. [ ] Check database:
   - [ ] `is_active = true`
   - [ ] `deactivated_at = NULL`
   - [ ] `last_published_at` updated to current time

**Expected Result:** ✅ Listing reactivated, deactivated_at cleared

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

## Test Suite 7: Edge Cases

### Test 7.1: Invalid Email Address
**Objective:** Verify system handles invalid email gracefully

**Steps:**
1. [ ] Update a user profile to have invalid email: `invalid-email`
2. [ ] Deactivate one of their listings
3. [ ] Trigger email function
4. [ ] Check function logs
5. [ ] Verify error logged for that listing
6. [ ] Verify other listings still processed
7. [ ] Verify `last_deactivation_email_sent_at` NOT updated for failed listing

**Expected Result:** ✅ Error logged, other listings unaffected

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

### Test 7.2: Missing Profile Data
**Objective:** Verify system handles missing profile gracefully

**Steps:**
1. [ ] Create listing with user_id that has no profile
2. [ ] Deactivate the listing
3. [ ] Trigger email function
4. [ ] Verify query doesn't return listing (inner join excludes it)
5. [ ] Verify no error thrown

**Expected Result:** ✅ Listing excluded from query, no crash

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

### Test 7.3: Concurrent Deactivations
**Objective:** Verify system handles multiple simultaneous deactivations

**Steps:**
1. [ ] Create 5 test listings, all active
2. [ ] Deactivate all 5 simultaneously (or within 1 minute)
3. [ ] Trigger email function
4. [ ] Verify all 5 listings processed
5. [ ] Check all 5 emails received
6. [ ] Verify no data corruption or race conditions

**Expected Result:** ✅ All listings processed correctly

**Actual Result:** _______________________________________________

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

## Test Suite 8: Email Client Compatibility

### Test 8.1: Cross-Client Rendering
**Objective:** Verify emails display correctly across different email clients

**Test Email Clients:**
- [ ] Gmail Web
- [ ] Gmail Mobile App
- [ ] Apple Mail (macOS)
- [ ] Apple Mail (iOS)
- [ ] Outlook Desktop
- [ ] Outlook Web
- [ ] Yahoo Mail

**For Each Client, Verify:**
- [ ] Header displays correctly
- [ ] Colors render properly (#1E4A74 header, #7CB342 button)
- [ ] CTA button is visible and clickable
- [ ] Text is readable (no color contrast issues)
- [ ] Layout not broken
- [ ] No excessive spacing
- [ ] Footer displays correctly

**Overall Pass/Fail:** ⬜ Pass  ⬜ Fail

**Issues Found:** _______________________________________________

---

## Test Suite 9: Performance Testing

### Test 9.1: Email Delivery Timing
**Objective:** Measure time from deactivation to email delivery

**Steps:**
1. [ ] Note timestamp when deactivating listing: `________________`
2. [ ] Note timestamp when edge function runs: `________________`
3. [ ] Note timestamp when email received: `________________`
4. [ ] Calculate time differences:
   - Deactivation to function run: `______` minutes
   - Function run to email delivery: `______` minutes
   - Total time: `______` minutes

**Acceptance Criteria:**
- Email delivered within 5 minutes of function execution
- Total time < 35 minutes (with 30-min cron schedule)

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

### Test 9.2: Bulk Processing
**Objective:** Verify system handles large batches efficiently

**Steps:**
1. [ ] Create 20+ test listings needing emails
2. [ ] Trigger email function
3. [ ] Monitor function logs
4. [ ] Note execution time: `________________`
5. [ ] Verify all emails sent successfully
6. [ ] Check for timeouts or errors

**Acceptance Criteria:** Completes in < 2 minutes, all emails sent

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

## Test Suite 10: Security Testing

### Test 10.1: SQL Injection in Listing Title
**Objective:** Verify title field is properly sanitized

**Steps:**
1. [ ] Create listing with SQL injection attempt in title:
   - Title: `'; DROP TABLE listings; -- Test Listing`
2. [ ] Deactivate listing
3. [ ] Trigger email function
4. [ ] Verify email displays literal string (no SQL executed)
5. [ ] Verify database tables still exist

**Expected Result:** ✅ Title safely escaped, no SQL execution

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

### Test 10.2: XSS in Email Content
**Objective:** Verify email content is properly sanitized

**Steps:**
1. [ ] Create listing with XSS attempt in title:
   - Title: `<script>alert('xss')</script>Test Listing`
2. [ ] Deactivate and receive email
3. [ ] Open email in web browser
4. [ ] Verify no JavaScript executes
5. [ ] Verify title displayed as plain text

**Expected Result:** ✅ Script tags escaped, no JS execution

**Pass/Fail:** ⬜ Pass  ⬜ Fail

**Notes:** _______________________________________________

---

## Final Summary

**Date Tested:** `________________`

**Tester Name:** `________________`

**Environment:** ⬜ Development  ⬜ Staging  ⬜ Production

**Total Tests Executed:** `______`

**Tests Passed:** `______`

**Tests Failed:** `______`

**Pass Rate:** `______%`

**Critical Issues Found:**
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

**Recommendations:**
_______________________________________________
_______________________________________________
_______________________________________________

**Sign-off:**
- [ ] All critical tests passed
- [ ] System ready for production deployment
- [ ] Rollback plan in place

**Tester Signature:** _______________________________________________

**Date:** _______________________________________________
