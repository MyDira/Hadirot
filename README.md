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

## Operational runbook

This project runs with no dedicated ops/SRE staff, so backup and recovery
posture lives entirely in Supabase's own project settings — nothing in this
repo enforces or verifies it. Periodically (and before any risky bulk
migration or admin bulk-update), the project owner should confirm the
following directly in the Supabase dashboard and keep this checklist current:

- **Point-in-Time Recovery (PITR):** Dashboard → Database → Backups. Confirm
  whether PITR is enabled and note the retention window (some tiers default
  to as little as 24 hours, or no PITR at all). If a bad migration or a
  mistyped bulk `UPDATE`/`DELETE` corrupts data, this window is the actual
  recovery time / data-loss exposure.
- **Backup retention:** Same page — confirm a recent automated backup exists,
  or take a manual one before a risky deploy.
- **Billing spend cap:** Dashboard → Settings → Billing. Confirm whether a
  spend cap is set. An unlimited cap means a runaway query, a cron loop, or a
  usage spike can produce a surprise bill with no ceiling.
- **Independent backup copy:** Confirm at least one export/`pg_dump` of the
  database exists outside of Supabase's own infrastructure (e.g. an
  occasional manual export to the owner's own storage), so recovery doesn't
  depend entirely on Supabase's backup system being available.

None of the above is verifiable from the codebase — it must be checked live
in the Supabase dashboard by whoever has account access.