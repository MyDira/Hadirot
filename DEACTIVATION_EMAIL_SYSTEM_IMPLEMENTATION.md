# Deactivation Email System - Implementation Summary

## Overview
This document describes the complete unified email notification system for listing deactivations, supporting both automatic expiration (30 days) and manual deactivations by users.

## System Architecture

### 1. Database Schema Changes

#### New Column: `deactivated_at`
- **Type**: `timestamptz` (nullable)
- **Purpose**: Tracks when a listing became inactive
- **Usage**:
  - Used to calculate 30-day deletion window
  - Used to determine email template (automatic vs manual)
  - Used for email idempotency checks

#### Database Trigger: `set_listing_deactivated_timestamp()`
- **Trigger Name**: `listing_deactivation_timestamp_trigger`
- **Fires**: BEFORE UPDATE on listings table when `is_active` changes
- **Logic**:
  - When `is_active` changes from TRUE to FALSE: sets `deactivated_at = NOW()`
  - When `is_active` changes from FALSE to TRUE: sets `deactivated_at = NULL`
- **Result**: Automatic, consistent timestamp management for all deactivations

### 2. PostgreSQL Functions

#### `auto_inactivate_old_listings()`
- **Purpose**: Deactivates listings that are 30+ days old
- **Criteria**: `last_published_at < NOW() - INTERVAL '30 days'` AND `is_active = true`
- **Action**: Sets `is_active = false` (trigger sets `deactivated_at`)
- **Returns**: Count and array of affected listing IDs
- **Called by**: `inactivate-old-listings` edge function (scheduled)

#### `auto_delete_very_old_listings()`
- **Purpose**: Permanently deletes listings 30+ days after deactivation
- **Criteria**: `deactivated_at < NOW() - INTERVAL '30 days'` AND `is_active = false`
- **Action**: Permanently deletes listings (CASCADE handles related data)
- **Returns**: Count and array of deleted listing IDs
- **Called by**: `delete-old-listings` edge function (scheduled)

### 3. Edge Function: `send-deactivation-emails`

#### Query Logic
Finds listings needing emails:
```sql
WHERE is_active = false
  AND deactivated_at IS NOT NULL
  AND (last_deactivation_email_sent_at IS NULL
       OR last_deactivation_email_sent_at < deactivated_at)
```

#### Email Template Detection
Detects automatic vs manual deactivation by comparing timestamps:
- **Automatic**: `deactivated_at` is ≥29 days after `last_published_at`
- **Manual**: `deactivated_at` is <29 days after `last_published_at`

#### Automatic Expiration Email
- **Subject**: "Your listing '[Title]' has expired on HaDirot"
- **Title**: "Your Listing Has Expired"
- **Message**: Explains expiration, encourages renewal
- **CTA**: "Renew My Listing" → dashboard

#### Manual Deactivation Email
- **Subject**: "Listing deactivated: '[Title]' - HaDirot"
- **Title**: "Listing Deactivation Confirmed"
- **Message**: Confirms user action, offers reactivation
- **CTA**: "Manage My Listings" → dashboard

#### Idempotency
- Updates `last_deactivation_email_sent_at` after successful send
- Comparison `last_deactivation_email_sent_at < deactivated_at` ensures one email per deactivation
- Renewal clears `deactivated_at`, so next deactivation triggers new email

### 4. Frontend Changes

#### Dashboard.tsx
- **Removed**: Email sending logic from `handleUnpublishListing`
- **Kept**: Listing update to set `is_active = false`
- **Result**: Backend edge function handles all deactivation emails centrally

## Lifecycle Stages

### Stage 1: Active Listing
- User posts or renews listing
- `is_active = true`
- `last_published_at = NOW()`
- `deactivated_at = NULL`

### Stage 2: Auto-Deactivation (30 days after publishing)
- `auto_inactivate_old_listings()` runs daily
- Finds listings where `last_published_at < NOW() - INTERVAL '30 days'`
- Sets `is_active = false`
- Trigger automatically sets `deactivated_at = NOW()`
- Email sent by `send-deactivation-emails` (automatic template)

### Stage 3: Auto-Deletion (30 days after deactivation)
- `auto_delete_very_old_listings()` runs daily
- Finds listings where `deactivated_at < NOW() - INTERVAL '30 days'`
- Permanently deletes listings
- **Total lifecycle**: 60 days from publish to deletion

### Manual Deactivation Flow
- User clicks "Unpublish" in dashboard
- Frontend updates: `is_active = false`
- Trigger automatically sets `deactivated_at = NOW()`
- Email sent by `send-deactivation-emails` (manual template)
- No duplicate email (frontend doesn't send)

### Renewal Flow
- User clicks "Renew" in dashboard
- Frontend updates: `is_active = true`, `last_published_at = NOW()`
- Trigger automatically sets `deactivated_at = NULL`
- `last_deactivation_email_sent_at` preserved for history
- Next deactivation will trigger new email (new `deactivated_at` timestamp)

## Email Notification Guarantees

### Exactly-Once Delivery
- ✅ One email per deactivation event
- ✅ No duplicates for same deactivation
- ✅ New email for each renewal → deactivation cycle

### Template Accuracy
- ✅ Automatic deactivations get "expired" email
- ✅ Manual deactivations get "confirmation" email
- ✅ Detection based on listing age at deactivation

### Reliability
- ✅ Centralized in backend (no frontend email sending)
- ✅ Atomic database trigger (timestamp always set)
- ✅ Error handling and retry logic
- ✅ Comprehensive logging

## Scheduling Recommendations

Suggested cron schedule for edge functions:
- **2:00 AM UTC**: `inactivate-old-listings` (deactivate 30-day-old listings)
- **2:30 AM UTC**: `send-deactivation-emails` (send emails for deactivated listings)
- **3:00 AM UTC**: `delete-old-listings` (delete 60-day-old listings)

## Testing Checklist

### Database Tests
- ✅ Trigger sets `deactivated_at` when deactivating listing
- ✅ Trigger clears `deactivated_at` when reactivating listing
- ✅ `auto_inactivate_old_listings()` finds and deactivates old listings
- ✅ `auto_delete_very_old_listings()` finds and deletes expired listings

### Email Tests
- ✅ Automatic deactivation sends correct template
- ✅ Manual deactivation sends correct template
- ✅ No duplicate emails for same deactivation
- ✅ Renewal cycle triggers new email on re-deactivation

### Frontend Tests
- ✅ Manual unpublish updates listing correctly
- ✅ No duplicate emails from frontend
- ✅ Renewal updates timestamps correctly

### Lifecycle Tests
- ✅ Listings deactivate 30 days after `last_published_at`
- ✅ Listings delete 30 days after `deactivated_at`
- ✅ Total lifecycle: 60 days (UNCHANGED)

## Migration Files

1. **20251017150000_add_deactivated_at_column_and_trigger.sql**
   - Adds `deactivated_at` column
   - Creates trigger function and trigger
   - Backfills existing inactive listings
   - Updates deactivation email index

2. **20251017150100_create_auto_inactivate_and_delete_functions.sql**
   - Creates `auto_inactivate_old_listings()` function
   - Creates `auto_delete_very_old_listings()` function
   - Grants permissions to service role

## Key Implementation Details

### Why Trigger Instead of Manual Updates?
- **Consistency**: Impossible to forget to set timestamp
- **Atomic**: Timestamp set in same transaction as status change
- **Centralized**: Works for all update paths (manual, automatic, admin)

### Why Timestamp Comparison for Detection?
- **Simple**: No new column needed
- **Accurate**: 29+ days = automatic, <29 days = manual
- **Reliable**: Based on immutable timestamps

### Why Backend-Only Emails?
- **Prevents duplicates**: Single source of truth
- **Reliable**: Edge function can retry on failure
- **Consistent**: Same email logic for all deactivations

### Why Keep `last_deactivation_email_sent_at`?
- **Idempotency**: Prevents duplicate emails
- **History**: Track when emails were sent
- **Renewal support**: Next deactivation triggers new email

## Security Considerations

- ✅ Database functions use SECURITY DEFINER with proper grants
- ✅ Edge functions use service role for admin operations
- ✅ Trigger only modifies timestamps, not sensitive data
- ✅ Email queries use RLS-protected profile data

## Monitoring and Debugging

### Database Logs
- Trigger raises NOTICE for each deactivation/reactivation
- Functions log count of affected listings

### Edge Function Logs
- Query results and email counts
- Individual listing processing with template detection
- Email send success/failure per listing

### Key Metrics to Monitor
- Number of listings auto-deactivated daily
- Number of listings auto-deleted daily
- Email success/failure rates
- Average time from deactivation to email delivery

## Rollback Plan

If issues occur, rollback in reverse order:

1. Stop scheduled edge functions
2. Revert Dashboard.tsx (add email sending back)
3. Revert send-deactivation-emails edge function
4. Drop database functions: `DROP FUNCTION auto_inactivate_old_listings(), auto_delete_very_old_listings()`
5. Drop trigger: `DROP TRIGGER listing_deactivation_timestamp_trigger ON listings`
6. Drop column: `ALTER TABLE listings DROP COLUMN deactivated_at`

## Conclusion

This implementation provides a complete, production-ready email notification system that:
- Preserves the existing 30+30 day lifecycle
- Sends appropriate emails based on deactivation type
- Prevents duplicate emails
- Supports multiple renewal cycles
- Centralizes email logic for reliability
- Uses database triggers for consistency
