# ZeptoMail Migration Audit

## Summary
| Function | Status | Notes |
|---|---|---|
| send-email | ✅ |  |
| delete-user | ✅ |  |
| send-password-reset | ✅ |  |

## Pattern counts
- TEMP_ZEPTO_TOKEN: 0
- Zoho-enczapikey: 1 (files: supabase/functions/_shared/zepto.ts)
- RESEND_: 0
- resend.com: 0
- functions/v1/: 0

## Files needing fixes
None

### Secrets vs Vault
Edge Function environment variables are not read from database vault secrets. Use the Dashboard or CLI to set them.

### Edge Function Secrets to set
- ZEPTO_TOKEN
- ZEPTO_FROM_ADDRESS
- ZEPTO_FROM_NAME
- ZEPTO_REPLY_TO (optional)
- EMAIL_PROVIDER=zepto (optional)

Migration files using `vault.create_secret` detected:
- supabase/migrations/20250812215631_floating_prism.sql

Remember to replicate these secrets in Edge Function settings.

### curl tests
```bash
# Replace with your values
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_ANON_KEY="<anon>"

# send-email test
curl -s -X POST "$SUPABASE_URL/functions/v1/send-email" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{"to":"you@example.com","subject":"Zepto audit test","html":"<p>hello from Zepto</p>"}' | jq

# delete-user test
curl -s -X POST "$SUPABASE_URL/functions/v1/delete-user" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{"userId":"00000000-0000-0000-0000-000000000000","reason":"audit"}' | jq

# send-password-reset test
curl -s -X POST "$SUPABASE_URL/functions/v1/send-password-reset" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -d '{"to":"you@example.com"}' | jq
```
