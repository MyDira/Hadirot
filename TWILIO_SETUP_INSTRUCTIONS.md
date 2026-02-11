# Twilio SMS Contact Form Setup Instructions

## Overview
This guide will help you set up the Twilio SMS integration for the listing contact form feature.

## Prerequisites
- Active Twilio account (already created, awaiting verification)
- Access to your Supabase project dashboard

## Step 1: Get Your Twilio Credentials

Once your Twilio account is verified:

1. Log in to your [Twilio Console](https://console.twilio.com/)
2. On the dashboard, you'll find:
   - **Account SID** - A string starting with "AC..."
   - **Auth Token** - Click the "Show" button to reveal it
3. Navigate to **Phone Numbers** → **Manage** → **Active numbers**
4. Copy your **Twilio Phone Number** (format: +1234567890)

## Step 2: Configure Supabase Edge Function Secrets

1. Go to your Supabase project dashboard
2. Navigate to **Edge Functions** → **Manage secrets**
3. Add the following three secrets:

   | Secret Name | Value | Example |
   |------------|-------|---------|
   | `TWILIO_ACCOUNT_SID` | Your Account SID from Twilio | AC1234567890abcdef1234567890abcd |
   | `TWILIO_AUTH_TOKEN` | Your Auth Token from Twilio | 1234567890abcdef1234567890abcdef |
   | `TWILIO_PHONE_NUMBER` | Your Twilio phone number | +15551234567 |

4. Click **Save** after adding each secret

## Step 3: Deploy the Edge Function

The Edge Function has already been created at:
```
supabase/functions/send-listing-contact-sms/index.ts
```

To deploy it:

1. In your Supabase dashboard, go to **Edge Functions**
2. The function `send-listing-contact-sms` should appear
3. Click **Deploy** to make it live

**Note:** The function will be automatically deployed when you push your code changes.

## How It Works

### User Flow:
1. User visits a listing detail page
2. Fills out the contact form with their name and phone number
3. Optionally consents to WhatsApp follow-ups
4. Clicks "Request Callback"

### System Flow:
1. Form submission triggers the `send-listing-contact-sms` Edge Function
2. Function fetches listing details from the database
3. Sends SMS to the listing owner via Twilio with the format:
   ```
   Hadirot- [User Name] is interested in the [X] bd apartment by [Location] for $[Price], please call them @ [Phone Number]
   ```
4. Stores the submission in `listing_contact_submissions` table
5. Returns success response to user

### Analytics Tracking:
- All contact submissions are stored in the database
- Admin analytics dashboard shows:
  - Total submissions today
  - Submissions with WhatsApp consent
  - Unique listings contacted
  - Consent rate percentage
  - Detailed table of all submissions

## Testing the Integration

### Before Twilio Verification:
The contact form is ready but SMS won't send until Twilio credentials are configured.

### After Twilio Setup:
1. Visit any listing detail page
2. Fill out the contact form
3. Submit the form
4. Check that:
   - Success message appears
   - SMS is received by the listing owner's phone
   - Submission appears in Analytics → Contact Submissions tab

### Test with Your Own Number:
1. Create a test listing with your phone number as the contact
2. Submit the contact form
3. Verify you receive the SMS

## Troubleshooting

### SMS Not Sending:
1. Check Supabase Edge Function logs for errors
2. Verify all three Twilio secrets are correctly set
3. Ensure Twilio account is verified and has credits
4. Check that the Twilio phone number is active

### Form Validation Errors:
- Name must be at least 2 characters
- Phone number must be 10 digits (US format)

### Database Errors:
- Check that the migration was applied successfully
- Verify RLS policies are in place

## Important Notes

- **SMS Costs:** Each SMS sent costs money based on your Twilio plan
- **Rate Limiting:** Consider implementing rate limiting to prevent spam
- **Testing:** Use Twilio test credentials for development if available
- **Security:** Never expose Twilio credentials in client-side code - they're safely stored as Edge Function secrets

## Features Included

### Contact Form:
- Minimal, elegant design matching the site aesthetic
- Auto-formatting phone number input
- Real-time validation
- WhatsApp consent checkbox (checked by default)
- Loading states and success/error messages

### Phone Number Display:
- **Desktop:** Phone number displayed next to contact name (non-clickable)
- **Mobile:** Phone number is clickable to trigger phone dialer
- Removed old "Call Now" and "Send Message" CTAs

### Analytics Dashboard:
- New "Contact Submissions" tab
- Summary metrics cards
- Detailed submissions table with:
  - Date/time of submission
  - User name and phone
  - Associated listing details
  - Consent status
- Click any row to navigate to the listing

## Support

If you encounter any issues:
1. Check the browser console for client-side errors
2. Review Supabase Edge Function logs
3. Verify Twilio console for SMS delivery status
4. Check database for stored submissions

---

**Setup Complete!** Once you add the Twilio credentials to Supabase secrets, your contact form will be fully operational.
