# Sales Permission Request Email Fix

## Problem
The permission request email system was not sending emails to admins when users requested sales listing permissions, even though no error message was displayed.

## Root Causes

### 1. Variable Reference Bug (Line 105)
The code was referencing a non-existent variable `error` instead of `adminsError`, causing silent failures.

```typescript
// BEFORE (Incorrect)
if (adminsError) {
  console.error('Error fetching admins:', error);  // ❌ Wrong variable
  return;
}
```

### 2. Email Fetching Issue
The code was trying to fetch admin emails from the `profiles` table, but user emails are stored in the `auth.users` table. This caused the function to fail or send to incorrect addresses.

### 3. Missing Admin Notification Type
The edge function call wasn't using the `type: 'admin_notification'` parameter, which is specifically designed to fetch all admin emails from the auth system.

## Solution

### Updated `notifyAdminsOfNewRequest()`
- Removed manual admin email fetching from profiles table
- Added `type: 'admin_notification'` to the edge function call
- The edge function now handles fetching admin emails from `auth.users`
- Added proper error handling and logging
- Uses `window.location.origin` for dynamic site URL

### Updated `notifyUserOfApproval()` and `notifyUserOfDenial()`
- Fetch user emails from `auth.users` using `supabase.auth.admin.getUserById()`
- Improved error handling and logging
- Added result validation to catch edge function errors
- Uses dynamic site URL instead of hardcoded values

## Testing Steps

1. Sign in as a non-admin user
2. Navigate to Post Listing page
3. Click on "Sale Listing" option
4. Click "Request permission" when prompted
5. Fill in the permission request form with a message
6. Submit the request
7. Check that:
   - Success message appears: "Your request has been submitted. Admins will be notified via email."
   - Admin users receive an email with the permission request details
   - No errors appear in the browser console or edge function logs

## Files Modified
- `/src/services/sales.ts` - Fixed all three email notification functions

## Edge Function Configuration
The `send-email` edge function already had support for `admin_notification` type, which:
1. Fetches all admin profiles from the `profiles` table
2. Gets their email addresses from `auth.users`
3. Sends the email to all admin email addresses
4. Returns appropriate errors if no admins are found
