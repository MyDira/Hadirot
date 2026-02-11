# Deploy Enhanced Digest Edge Function

## Status
The enhanced digest edge function is ready for deployment but requires manual deployment due to file size.

## Files Location
```
supabase/functions/send-enhanced-digest/
  ├── index.ts (consolidated, 1003 lines - READY TO DEPLOY)
  ├── index-modular.ts (alternative with imports)
  ├── types.ts
  ├── query-builder.ts
  ├── categorizer.ts
  └── email-templates.ts
```

## Deployment Options

### Option 1: Using Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to Edge Functions
3. Create a new function named `send-enhanced-digest`
4. Copy the contents of `supabase/functions/send-enhanced-digest/index.ts`
5. Paste into the editor
6. Click Deploy

### Option 2: Using Supabase CLI
```bash
# From project root
npx supabase functions deploy send-enhanced-digest

# Or if you have Supabase CLI installed
supabase functions deploy send-enhanced-digest
```

### Option 3: Using Git Push
If your project is linked to Supabase via Git:
```bash
git add supabase/functions/send-enhanced-digest/
git commit -m "Add enhanced digest edge function"
git push
```

## Environment Variables Required
Make sure these are set in your Supabase Edge Functions settings:
- `ZEPTO_TOKEN`
- `ZEPTO_FROM_ADDRESS`
- `ZEPTO_FROM_NAME`
- `PUBLIC_SITE_URL`
- `SUPABASE_URL` (auto-provided)
- `SUPABASE_SERVICE_ROLE_KEY` (auto-provided)

## Testing After Deployment

### Test with default template:
```bash
curl -X POST https://[your-project].supabase.co/functions/v1/send-enhanced-digest \
  -H "Authorization: Bearer [your-anon-key]" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```

### Test with specific template:
```bash
curl -X POST https://[your-project].supabase.co/functions/v1/send-enhanced-digest \
  -H "Authorization: Bearer [your-anon-key]" \
  -H "Content-Type: application/json" \
  -d '{
    "template_id": "[template-uuid]",
    "dry_run": true
  }'
```

### Test with inline config:
```bash
curl -X POST https://[your-project].supabase.co/functions/v1/send-enhanced-digest \
  -H "Authorization: Bearer [your-anon-key]" \
  -H "Content-Type": application/json" \
  -d '{
    "template_config": {
      "name": "Test Digest",
      "template_type": "recent_by_category",
      "filter_config": {"date_range_days": 7},
      "category_limits": {"studio": 3, "1bed": 5, "2bed": 5}
    },
    "dry_run": true
  }'
```

## Verification
After deployment, verify:
1. ✅ Function appears in Supabase dashboard
2. ✅ Dry run returns preview data without errors
3. ✅ Full send (without dry_run) sends email and records to digest_sends table
4. ✅ Listings tracked in digest_sent_listings table
5. ✅ Template usage_count increments

## Troubleshooting

### "Module not found" errors
- Use the consolidated `index.ts` file (not index-modular.ts)
- The consolidated version has all code in one file

### "Template not found" errors
- Check that default templates exist in digest_templates table
- Run: `SELECT * FROM digest_templates WHERE is_default = true;`

### "No admin email addresses found" errors
- Ensure at least one user has is_admin = true in profiles table
- Check that admin users have confirmed email addresses

### "ZeptoMail is not configured" errors
- Verify ZEPTO_TOKEN is set in Edge Functions environment variables
- Verify ZEPTO_FROM_ADDRESS and ZEPTO_FROM_NAME are set

## Next Steps After Deployment
1. Build admin UI components (in progress)
2. Test all digest types
3. Create saved templates via UI
4. Set up filter presets with short URLs
