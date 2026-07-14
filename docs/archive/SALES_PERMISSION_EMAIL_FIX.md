# Sales Permission Request Email Fix

## Problem
The permission request email system was not sending emails to admins when users requested sales listing permissions. The system was returning a 404 error from the edge function.

## Root Causes

### 1. Incorrect Email Service Usage
The sales service was calling `supabase.functions.invoke('send-email')` directly instead of using the `emailService.sendEmail()` helper function that properly handles authentication and request formatting.

### 2. Edge Function JWT Verification
The `send-email` edge function initially had JWT verification enabled at the gateway level, which blocked requests before the function could handle the `admin_notification` type internally.

### 3. Missing Branded Email Templates
The emails weren't using the branded email templates that provide consistent formatting across all system emails.

## Solution

### 1. Fixed Edge Function JWT Verification
- Redeployed `send-email` edge function with `verifyJWT: false`
- This allows the function to handle authentication internally based on email type
- `admin_notification` type: No auth required, automatically fetches admin emails
- `password_reset` type: No auth required
- All other types: Requires authentication

### 2. Updated Sales Service to Use Email Service Helper
All three email notification functions now:
- Import and use `emailService.sendEmail()` instead of direct edge function calls
- Import and use `renderBrandEmail()` for consistent email formatting
- Format emails to match the "report rented" pattern that works correctly
- Use proper error handling with result validation

**Changes Made:**
- `notifyAdminsOfNewRequest()`: Uses `emailService.sendEmail()` with `type: 'admin_notification'`
- `notifyUserOfApproval()`: Uses `emailService.sendEmail()` with branded template
- `notifyUserOfDenial()`: Uses `emailService.sendEmail()` with branded template

### 3. Added Branded Email Templates
All emails now use styled HTML templates with:
- Consistent branding and colors
- Proper formatting for user details and messages
- Highlighted sections for important information (notes, reasons, etc.)
- Clear call-to-action buttons where appropriate

## Code Pattern (Correct Approach)

```typescript
// Import the email service helpers
import { emailService, renderBrandEmail } from './email';

// Use emailService.sendEmail() with branded template
const bodyHtml = `
  <p>Your message content here</p>
`;

const html = renderBrandEmail({
  title: 'Email Title',
  bodyHtml,
  ctaLabel: 'Button Text',  // Optional
  ctaHref: 'https://...',   // Optional
});

const result = await emailService.sendEmail({
  to: 'user@example.com',
  subject: 'Email Subject',
  html,
  type: 'admin_notification',  // Only for admin emails
});

if (!result.success) {
  throw new Error(result.error || 'Failed to send email');
}
```

## Testing Steps

1. Sign in as a non-admin user
2. Navigate to Post Listing page
3. Click on "Sale Listing" option
4. Click "Request permission" when prompted
5. Fill in the permission request form with a message
6. Submit the request
7. Check that:
   - Success message appears: "Your request has been submitted. Admins will be notified via email."
   - Admin users receive a branded email with the permission request details
   - No errors appear in the browser console or edge function logs
   - Email includes properly formatted user details and request message

## Files Modified
- `/src/services/sales.ts` - Fixed all three email notification functions to use emailService
- `/supabase/functions/send-email/index.ts` - Redeployed with verifyJWT: false

## Key Takeaway
Always use the `emailService.sendEmail()` helper function for sending emails instead of calling `supabase.functions.invoke()` directly. This ensures proper authentication handling and consistent formatting across all system emails.
