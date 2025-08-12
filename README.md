Hadirot

## Setup Instructions

### Email Service Configuration

This application uses ZeptoMail for sending emails through a Supabase Edge Function. To enable email functionality:

1. **Get your ZeptoMail API token:**
   - Sign up at [ZeptoMail](https://www.zoho.com/zeptomail/)
   - Navigate to your account settings to get your API token

2. **Configure the Supabase Edge Function:**
   - Go to your Supabase project dashboard
   - Navigate to **Edge Functions**
   - Select the **send-email** function
   - Go to the **Environment Variables** tab
   - Add a new environment variable:
     - Key: `ZEPTO_TOKEN`
     - Value: Your ZeptoMail API token
   - Save and redeploy the function

3. **Test the configuration:**
   - Try using any email functionality in the application
   - Check the Edge Function logs if issues persist

**Note:** The `ZEPTO_TOKEN` must be set as a Supabase Edge Function secret, not as a local environment variable in your `.env` file.