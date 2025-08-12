/*
  # Configure ZeptoMail Environment Variables

  1. Environment Variables
    - Sets EMAIL_PROVIDER to 'zepto' for send-email function
    - Sets ZEPTO_FROM_ADDRESS to 'noreply@hadirot.com' for all email functions
    - Sets ZEPTO_FROM_NAME to 'HaDirot' for all email functions
    - Sets ZEPTO_REPLY_TO for reply handling (optional)

  2. Edge Functions Configured
    - send-email: Complete ZeptoMail configuration
    - delete-user: ZeptoMail configuration for account deletion emails
    - send-password-reset: ZeptoMail configuration for password reset emails

  Note: This configures the environment variables that the Edge Functions will use
  to send emails via ZeptoMail instead of Resend.
*/

-- Configure environment variables for send-email function
SELECT vault.create_secret('EMAIL_PROVIDER', 'zepto', 'Environment variable for send-email function');
SELECT vault.create_secret('ZEPTO_FROM_ADDRESS', 'noreply@hadirot.com', 'ZeptoMail sender address for all email functions');
SELECT vault.create_secret('ZEPTO_FROM_NAME', 'HaDirot', 'ZeptoMail sender name for all email functions');
SELECT vault.create_secret('ZEPTO_REPLY_TO', 'support@hadirot.com', 'ZeptoMail reply-to address (optional)');

-- Note: ZEPTO_TOKEN should already be configured as mentioned by the user
-- The Edge Functions will automatically use these environment variables
-- once they are deployed with the updated code