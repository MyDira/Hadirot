# Admin Impersonation Debug Guide

## Overview

This document provides a comprehensive debugging guide for the admin impersonation feature. The system has been enhanced with detailed logging and error handling to help identify and resolve authentication-related issues.

## System Architecture

### Authentication Flow

The impersonation system uses a multi-step authentication process:

1. **Admin Verification** - Verify the admin's identity and permissions
2. **Session Creation** - Create an impersonation session record in the database
3. **Token Generation** - Generate authentication tokens for the impersonated user
4. **Session Switch** - Switch the browser session from admin to impersonated user
5. **State Management** - Maintain impersonation state across page reloads

### Components

#### Edge Functions

- **start-impersonation** - Validates admin and creates impersonation session
- **create-impersonation-auth-session** - Generates auth tokens using magic link
- **end-impersonation** - Ends the impersonation session
- **check-impersonation-status** - Health check endpoint for session validation

#### Frontend Hooks

- **useImpersonation** - React context for managing impersonation state
- **useAuth** - Authentication context that provides user and profile data

#### Database

- **impersonation_sessions** - Stores active and historical impersonation sessions
- **impersonation_audit_log** - Records all actions during impersonation

## Enhanced Logging System

All impersonation operations now include detailed logging with unique request IDs for tracing.

### Log Format

Each log entry includes:
- **Request ID**: Unique 8-character identifier for tracing a specific request
- **Component**: Which Edge Function or hook generated the log
- **Status Indicators**: ✓ (success), ✗ (error), ⚠ (warning)
- **Contextual Data**: Relevant IDs, timestamps, and operation details

### Example Log Sequence

```
[useImpersonation:a1b2c3d4] ====== START IMPERSONATION REQUEST ======
[useImpersonation:a1b2c3d4] Target user ID: user-123
[useImpersonation:a1b2c3d4] Current admin: admin-456 John Admin
[useImpersonation:a1b2c3d4] ✓ Current session retrieved
[useImpersonation:a1b2c3d4] Calling start-impersonation function...
[start-impersonation:e5f6g7h8] Request received: POST
[start-impersonation:e5f6g7h8] ✓ User verified: admin-456
[start-impersonation:e5f6g7h8] ✓ Admin verified: John Admin
[start-impersonation:e5f6g7h8] ✓ Session created: abcd1234...
[start-impersonation:e5f6g7h8] ✓ Target profile loaded: Jane User (tenant)
[start-impersonation:e5f6g7h8] ✅ SUCCESS - Returning session data
[useImpersonation:a1b2c3d4] Creating auth session for impersonated user...
[create-auth-session:i9j0k1l2] ✓ Session validated, expires: 2025-10-21T05:00:00Z
[create-auth-session:i9j0k1l2] ✓ Token extraction complete
[create-auth-session:i9j0k1l2] ✅ SUCCESS - Returning tokens
[useImpersonation:a1b2c3d4] ✓ Session activated for user: user-123
[useImpersonation:a1b2c3d4] ✓✓✓ IMPERSONATION SUCCESSFUL ✓✓✓
```

## Common Failure Scenarios

### 1. No Authorization Header

**Symptom**: Error message "No authorization header provided"

**Cause**: The admin's authentication token is missing from the request

**Debug Steps**:
1. Check browser console for the request ID
2. Verify user is logged in: `supabase.auth.getSession()`
3. Check if session has expired
4. Try refreshing the page and logging in again

**Solution**: Ensure the admin is logged in with a valid session before attempting impersonation.

### 2. Invalid Session Token

**Symptom**: Error message "Invalid or expired impersonation session"

**Cause**: The session token from step 1 is not valid when step 2 tries to use it

**Debug Steps**:
1. Look for the request ID in both function logs
2. Check if the session was created: Query `impersonation_sessions` table
3. Verify the session hasn't expired (check `expires_at` column)
4. Check if session was already ended (check `ended_at` column)

**Solution**: The system should automatically handle this. If it persists, clear browser storage and try again.

### 3. Token Generation Failure

**Symptom**: Error message "Failed to extract access token"

**Cause**: The magic link generation didn't return valid tokens

**Debug Steps**:
1. Find the `[create-auth-session:*]` logs in the console
2. Look for "Link data structure" and "Properties keys" logs
3. Check if `hashed_token` is present
4. Verify the action_link format

**Logs to check**:
```
[create-auth-session:xxxxx] Link data structure: [...]
[create-auth-session:xxxxx] Has hashed_token: true/false
[create-auth-session:xxxxx] Fragment tokens - access: true/false refresh: true/false
```

**Solution**: This indicates an issue with Supabase's `generateLink` API. Contact support or check Supabase status.

### 4. Session Switch Failure

**Symptom**: Error message "Failed to activate impersonated session"

**Cause**: The `setSession` call failed to apply the new tokens

**Debug Steps**:
1. Check for the setSession error in logs
2. Verify the access_token length (should be several hundred characters)
3. Check browser console for any CORS errors
4. Verify no browser extensions are blocking cookies

**Solution**: Try in an incognito/private window. If it works there, clear cookies and cache.

### 5. Session Storage Corruption

**Symptom**: Impersonation state lost after page reload

**Cause**: SessionStorage data was corrupted or cleared

**Debug Steps**:
1. Open browser DevTools > Application > Session Storage
2. Check for key `impersonation_session`
3. Verify the JSON is valid
4. Check the timestamp to ensure it's recent

**Solution**: Clear session storage and start a new impersonation session.

### 6. Admin Session Lost on Return

**Symptom**: After ending impersonation, admin must log in again

**Cause**: The admin's original session wasn't properly stored or restored

**Debug Steps**:
1. Check the `adminSession` property in sessionStorage before ending
2. Verify access_token and refresh_token are present
3. Check for "Restoring admin session" log entry
4. Look for any setSession errors during restoration

**Solution**: This shouldn't happen with the current implementation. If it does, file a bug report with the logs.

## Debugging Checklist

When investigating an impersonation failure, follow this checklist:

### Pre-Flight Checks
- [ ] Admin user has `is_admin = true` in profiles table
- [ ] Target user exists and is NOT an admin
- [ ] Admin has a valid active session
- [ ] Browser allows sessionStorage and cookies

### During Execution
- [ ] Check browser console for all log entries
- [ ] Note the request ID from the first log entry
- [ ] Follow the request ID through all subsequent logs
- [ ] Identify where the ✗ error indicator first appears

### Database Verification
- [ ] Query `impersonation_sessions` for recent entries
- [ ] Check if session has proper `expires_at` timestamp (2 hours from `started_at`)
- [ ] Verify `ended_at` is NULL for active sessions
- [ ] Check `impersonation_audit_log` for session_start entry

### Network Inspection
- [ ] Open DevTools > Network tab
- [ ] Look for calls to Edge Functions
- [ ] Check request/response headers
- [ ] Verify no 401/403/500 errors
- [ ] Confirm CORS headers are present

## Manual Testing Procedure

### Prerequisites
```sql
-- Verify you have an admin user
SELECT id, email, full_name, is_admin
FROM profiles
WHERE is_admin = true
LIMIT 1;

-- Verify you have a non-admin test user
SELECT id, email, full_name, is_admin
FROM profiles
WHERE is_admin = false
LIMIT 1;
```

### Step-by-Step Test

1. **Login as Admin**
   - Navigate to `/auth`
   - Login with admin credentials
   - Verify you see the Admin Panel link

2. **Access Admin Panel**
   - Click Admin Panel or navigate to `/admin?tab=users`
   - Verify the Users tab loads

3. **Find Target User**
   - Use the search or filter to find a non-admin user
   - Note their name and role

4. **Open Browser Console**
   - Press F12 or right-click > Inspect
   - Go to Console tab
   - Clear existing logs

5. **Initiate Impersonation**
   - Click the impersonation button (👤 icon) for the target user
   - Accept the confirmation dialog
   - **DO NOT CLOSE CONSOLE**

6. **Monitor Logs**
   - Watch for the `====== START IMPERSONATION REQUEST ======` log
   - Note the request ID
   - Follow each step until SUCCESS or FAILED
   - If successful, you'll be redirected to dashboard

7. **Verify Impersonation**
   - Check that the impersonation banner appears at top of page
   - Verify it shows the target user's name
   - Check the countdown timer is showing ~2 hours
   - Try navigating to different pages
   - Verify banner persists across page loads

8. **End Impersonation**
   - Click "Exit Impersonation" button in banner
   - Accept the confirmation
   - Verify redirect back to Admin Panel
   - Check you're logged in as admin again

## Health Check Endpoint

You can test session validity using the check-impersonation-status function:

```javascript
// Get current session token from sessionStorage
const data = JSON.parse(sessionStorage.getItem('impersonation_session'));
const sessionToken = data.session.session_token;

// Check status
const { data: statusData, error } = await supabase.functions.invoke(
  'check-impersonation-status',
  { body: { session_token: sessionToken } }
);

console.log('Session valid:', statusData.valid);
console.log('Time remaining:', statusData.time_remaining_seconds, 'seconds');
```

## Environment Variables

Verify these are set correctly:

```bash
# Frontend (.env)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Edge Functions (auto-populated)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Security Considerations

### What's Logged
- Request IDs (unique per request)
- User IDs (both admin and target)
- User names and roles
- Token lengths (NOT the actual tokens)
- Session token prefixes (first 8 characters only)
- Timestamps and expiration times

### What's NOT Logged
- Full access tokens or refresh tokens
- Passwords (never involved in this flow)
- Full session tokens
- IP addresses (stored in DB but not logged to console)

### Audit Trail

Every impersonation action is recorded:
```sql
-- View impersonation history
SELECT
  ias.started_at,
  ias.ended_at,
  admin.full_name as admin_name,
  target.full_name as target_name,
  COUNT(ial.id) as action_count
FROM impersonation_sessions ias
JOIN profiles admin ON ias.admin_user_id = admin.id
JOIN profiles target ON ias.impersonated_user_id = target.id
LEFT JOIN impersonation_audit_log ial ON ias.id = ial.session_id
GROUP BY ias.id, admin.full_name, target.full_name
ORDER BY ias.started_at DESC;
```

## Known Limitations

1. **Session Duration**: Fixed at 2 hours, cannot be extended
2. **Browser Storage**: Requires sessionStorage to be enabled
3. **Single Tab**: Impersonation state may not sync across tabs
4. **Admin-to-Admin**: Cannot impersonate another admin user
5. **Token Lifetime**: Magic link tokens have internal expiration (typically 1 hour)

## Support

When reporting an impersonation issue, include:

1. The request ID from the console logs
2. Full console log output from start to failure
3. Admin user ID and email
4. Target user ID and email
5. Timestamp when the issue occurred
6. Browser and version
7. Any network errors from DevTools

## Quick Reference

### Successful Impersonation Indicators
- ✓✓✓ IMPERSONATION SUCCESSFUL ✓✓✓ in console
- Redirect to dashboard
- Impersonation banner visible
- Session stored in sessionStorage
- Entry in impersonation_sessions table

### Failed Impersonation Indicators
- ✗✗✗ IMPERSONATION FAILED ✗✗✗ in console
- Error message displayed to user
- Remains on admin panel
- No entry in impersonation_sessions (or ended immediately)
- Error details in console with request ID

### Critical Database Queries

```sql
-- Active sessions
SELECT * FROM impersonation_sessions
WHERE ended_at IS NULL
AND expires_at > now();

-- Recent failures (sessions created and immediately ended)
SELECT * FROM impersonation_sessions
WHERE started_at > now() - interval '1 hour'
AND ended_at IS NOT NULL
AND (ended_at - started_at) < interval '1 minute';

-- Session with most actions
SELECT
  session_id,
  COUNT(*) as action_count
FROM impersonation_audit_log
GROUP BY session_id
ORDER BY action_count DESC
LIMIT 10;
```
