# Daily Email Systems Removal - Deployment Checklist

**Date:** October 28, 2025
**Status:** Ready for Deployment

---

## Pre-Deployment Steps

### 1. Database Backup
- [ ] Create complete database backup
- [ ] Verify backup is accessible and valid
- [ ] Document backup location and timestamp

### 2. Code Review
- [x] All code changes committed to version control
- [x] Project builds successfully without errors
- [x] No TypeScript compilation errors
- [x] All import statements validated

---

## Deployment Steps

### Step 1: Deploy Database Migration

**Action:** Run the migration to remove database objects

```bash
# The migration file is located at:
# supabase/migrations/20251028025459_remove_daily_email_systems.sql
```

**This migration will:**
- Unschedule the `daily-approved-listings-email` cron job
- Drop storage policies for daily-listing-cards bucket
- Remove the `daily-listing-cards` storage bucket
- Drop all RLS policies on daily_cards tables
- Drop indexes: `idx_daily_cards_logs_run_at`, `idx_daily_cards_logs_success`, `listings_approval_email_idx`
- Drop tables: `daily_cards_logs`, `daily_cards_config`
- Add deprecation comment to `approval_email_sent_at` column

**Verification:**
- [ ] Migration runs without errors
- [ ] Tables are dropped: `daily_cards_config`, `daily_cards_logs`
- [ ] Storage bucket removed: `daily-listing-cards`
- [ ] Cron job unscheduled successfully
- [ ] `approval_email_sent_at` column still exists in listings table

### Step 2: Delete Edge Functions from Supabase

**Action:** Manually delete Edge Functions from Supabase Dashboard

**Functions to Delete:**
1. [ ] `daily-listing-cards`
2. [ ] `send-daily-approved-listings`
3. [ ] `generate-listing-image`

**Navigate to:** Supabase Dashboard → Edge Functions → [Function Name] → Delete

**Important:** Do NOT delete `send-listing-email-manual` - this is preserved!

### Step 3: Deploy Updated Edge Function

**Action:** Deploy the updated `send-listing-email-manual` function

```bash
supabase functions deploy send-listing-email-manual
```

**Verification:**
- [ ] Function deploys successfully
- [ ] No import errors in logs
- [ ] Function uses new `manualEmailTemplate.ts`

### Step 4: Remove Environment Variables

**Action:** Remove unused environment variables from Supabase Dashboard

**Navigate to:** Supabase Dashboard → Settings → Edge Functions → Environment Variables

**Variables to Remove:**
- [ ] `HTMLCSSTOIMAGE_USER_ID`
- [ ] `HTMLCSSTOIMAGE_API_KEY`

**Variables to Keep:**
- `ZEPTO_TOKEN` ✓
- `ZEPTO_FROM_ADDRESS` ✓
- `ZEPTO_FROM_NAME` ✓
- `SUPABASE_URL` ✓
- `SUPABASE_SERVICE_ROLE_KEY` ✓
- `SUPABASE_ANON_KEY` ✓
- `PUBLIC_SITE_URL` ✓

### Step 5: Deploy Frontend Changes

**Action:** Deploy the updated frontend application

```bash
npm run build
# Deploy dist/ folder to your hosting service
```

**Changes Deployed:**
- Updated AdminPanel.tsx without daily-cards tab
- Removed DailyCardsSettings component
- Removed dailyCards service

**Verification:**
- [ ] Frontend deploys successfully
- [ ] No 404 errors for removed components
- [ ] Admin panel loads without errors
- [ ] All remaining tabs accessible

---

## Post-Deployment Verification

### Immediate Tests (Within 30 Minutes)

#### 1. Admin Panel Access
- [ ] Log in as admin user
- [ ] Navigate to Admin Panel
- [ ] Verify no daily-cards tab appears
- [ ] Test each remaining tab loads correctly:
  - [ ] Overview
  - [ ] Users
  - [ ] Listings
  - [ ] Pending
  - [ ] Settings
  - [ ] Analytics
  - [ ] Static Pages
  - [ ] Featured Settings
  - [ ] Modals
  - [ ] Help Center (Knowledge Base)

#### 2. Manual Email Functionality
- [ ] Navigate to Admin Panel → Listings tab
- [ ] Find an approved listing
- [ ] Click the Mail icon button
- [ ] Verify loading state appears
- [ ] Check email is received by admin users
- [ ] Verify email contains:
  - [ ] Listing image (embedded, not attachment)
  - [ ] Price and property details
  - [ ] Location information
  - [ ] WhatsApp community link
  - [ ] "View Listing" button

#### 3. Browser Console Check
- [ ] Open browser developer console
- [ ] Navigate through admin panel tabs
- [ ] Verify no JavaScript errors
- [ ] Check for any failed import statements
- [ ] Confirm no 404 requests for removed files

#### 4. Database Verification
- [ ] Connect to database
- [ ] Verify tables are dropped:
  ```sql
  SELECT * FROM daily_cards_config; -- Should error
  SELECT * FROM daily_cards_logs; -- Should error
  ```
- [ ] Verify column still exists:
  ```sql
  SELECT approval_email_sent_at FROM listings LIMIT 1; -- Should work
  ```
- [ ] Check cron jobs:
  ```sql
  SELECT * FROM cron.job WHERE jobname = 'daily-approved-listings-email';
  -- Should return no rows
  ```

#### 5. Edge Functions Check
- [ ] Navigate to Supabase Dashboard → Edge Functions
- [ ] Verify deleted functions don't appear:
  - daily-listing-cards ✗
  - send-daily-approved-listings ✗
  - generate-listing-image ✗
- [ ] Verify preserved function appears:
  - send-listing-email-manual ✓

### Extended Tests (Within 24 Hours)

#### Core Email Functionality
- [ ] Test user registration welcome email
- [ ] Test password reset email
- [ ] Test contact form submission email
- [ ] Test any other transactional emails

#### Listing Management
- [ ] Create new listing as user
- [ ] Edit existing listing
- [ ] Upload and manage images
- [ ] Approve listing as admin
- [ ] Reject listing as admin
- [ ] Delete listing

#### User Management
- [ ] Register new user account
- [ ] Edit user profile
- [ ] Change password
- [ ] Admin creates new user
- [ ] Admin modifies user roles

#### Public Site Features
- [ ] Browse listings on public site
- [ ] View individual listing details
- [ ] Use search and filters
- [ ] Test all navigation links
- [ ] Verify no broken pages

---

## Rollback Procedure

If critical issues occur, follow these steps:

### 1. Restore Database
```bash
# Restore from backup taken in Pre-Deployment Step 1
# This will restore:
# - daily_cards_config table
# - daily_cards_logs table
# - Storage bucket
# - Cron job
```

### 2. Revert Code Changes
```bash
git revert <commit-hash>
npm run build
# Deploy previous version
```

### 3. Restore Edge Functions
- Redeploy deleted Edge Functions from backup
- Restore environment variables
- Reconfigure cron job if needed

### 4. Verify Rollback
- [ ] Daily email systems functional
- [ ] Manual email still works
- [ ] Admin panel loads correctly
- [ ] All features operational

---

## Success Criteria

Deployment is considered successful when:

- ✅ Admin panel loads without errors
- ✅ All remaining tabs functional
- ✅ Manual email send button works
- ✅ Emails are received by admins
- ✅ No JavaScript console errors
- ✅ Database migration completed
- ✅ Edge Functions deleted
- ✅ No broken links or 404 errors
- ✅ Project builds successfully
- ✅ Core email features work (welcome, password reset)

---

## Support Contacts

**If issues occur:**
1. Check browser console for errors
2. Review Supabase Edge Function logs
3. Check database migration logs
4. Verify email delivery in ZeptoMail dashboard
5. Review this checklist for missed steps

---

## Notes

- The `approval_email_sent_at` column remains in the listings table but is no longer used
- Manual email send functionality is fully preserved and enhanced with simpler template
- All transactional emails (welcome, password reset, contact) remain functional
- No impact on user-facing features or listing management
- Image generation via htmlcsstoimage.com completely removed
- Daily automation systems completely removed
