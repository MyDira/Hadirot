# Stripe Integration - Quick Start Guide

## ✅ What's Already Done

### Backend (100% Complete)
- ✅ Database schema deployed with 7 new tables
- ✅ 3 Supabase Edge Functions created (ready to deploy)
- ✅ Stripe service layer for payments
- ✅ Monetization admin service
- ✅ All RLS policies and security

### Admin UI (Complete)
- ✅ Monetization control panel in Admin Panel
- ✅ Feature toggle switches
- ✅ Pricing editor (update prices inline)
- ✅ Subscription plan manager
- ✅ Revenue dashboard
- ✅ Transaction log viewer

### Current Status
**Everything is FREE** - All monetization features are disabled. Users can use everything without payment.

## 🚀 How to Test Right Now

### 1. Access the Admin Monetization Panel

1. Log in as an admin user
2. Go to Admin Panel
3. Click the "Monetization" tab
4. You'll see:
   - Revenue stats (currently $0)
   - Feature controls with toggle switches
   - Pricing editor for one-time features
   - Subscription plan manager
   - Transaction history

### 2. Enable a Feature (Test Mode)

In the Monetization panel:

1. Find "Featured Listing" in Feature Controls
2. Click the toggle to enable it
3. The button changes from gray "Disabled" to green "Enabled"

**Note**: This only enables the feature in the database. Payment UI still needs to be built for users to actually pay.

### 3. Update Pricing

1. In the "One-Time Feature Pricing" table, click the edit icon (pencil)
2. Change the price (in cents, e.g., 2900 = $29)
3. Change duration (e.g., 30 days)
4. Add Stripe Price ID if you have one
5. Click save (checkmark icon)

### 4. Manage Subscription Plans

1. In the "Subscription Plans" table, click edit on any plan
2. Modify:
   - Plan name
   - Price (in cents)
   - Listings per month quota
   - Stripe Price ID
3. Click the status badge to toggle active/inactive
4. Click save

## 🔧 To Actually Charge Users

### Step 1: Set Up Stripe

1. Get your Stripe keys from [dashboard.stripe.com](https://dashboard.stripe.com)
2. Add to `.env`:
   ```
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```
3. Add to Supabase Edge Functions (Dashboard > Edge Functions > Settings):
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

### Step 2: Deploy Edge Functions

```bash
supabase functions deploy create-checkout-session
supabase functions deploy create-portal-session
supabase functions deploy stripe-webhook
```

### Step 3: Create Stripe Products

1. In Stripe Dashboard, create Products for:
   - Featured Listing ($29)
   - Agency subscriptions
   - Landlord subscriptions
2. Copy the Price IDs (start with `price_`)
3. Use the Monetization panel to add Price IDs to your pricing/plans

### Step 4: Enable Features

In the Monetization panel, toggle features to "Enabled"

### Step 5: Build Payment UI (Not Yet Done)

The remaining work:
- Payment checkout modals
- Subscription selection pages
- Billing management page
- Add payment checks to listing flows

## 📊 Monitor Everything

### View Revenue

The Monetization panel shows:
- Total revenue across all payments
- Active subscriptions count
- Total transactions
- Revenue by type (subscription vs one-time)

### View Transactions

Scroll to "Recent Transactions" table to see:
- Date of payment
- Type (subscription/one_time/refund)
- Feature purchased
- Amount
- Status (succeeded/failed/pending)

### Check Which Features Are Active

The "Feature Controls" section shows:
- Green "Enabled" = Feature is active and will require payment
- Gray "Disabled" = Feature is free for everyone

## 💡 Pro Tips

### Grant Free Access to Test Users

Run this SQL in Supabase SQL Editor:

```sql
-- Grant a user free access to featured listings forever
INSERT INTO feature_entitlements (
  profile_id,
  feature_key,
  entitlement_source,
  is_active,
  granted_by_admin_id,
  notes
) VALUES (
  'user-uuid-here',
  'featured_listing',
  'admin_grant',
  true,
  'your-admin-uuid',
  'Test user - free access'
);
```

### Grandfather All Existing Users

```sql
-- Give everyone who signed up before today free permanent access
INSERT INTO feature_entitlements (
  profile_id,
  feature_key,
  entitlement_source,
  is_active,
  notes
)
SELECT
  id,
  'featured_listing',
  'promotional',
  true,
  'Grandfathered - signed up before monetization'
FROM profiles
WHERE created_at < NOW();
```

### Check if User Has Access (in Code)

```typescript
import { stripeService } from '@/services/stripe';

const hasAccess = await stripeService.hasFeatureAccess(
  userId,
  'featured_listing'
);

if (!hasAccess) {
  // Show payment modal (when you build it)
}
```

### View User's Payment History

```typescript
import { monetizationService } from '@/services/monetization';

const transactions = await monetizationService.getUserTransactions(userId);
// Returns array of all payments made by this user
```

## 🎯 Recommended Workflow

### Phase 1: Current (Silent Testing)
- ✅ All infrastructure in place
- ✅ Admin panel working
- ⏹️ All features disabled
- Test by manually granting entitlements
- Verify access checks work

### Phase 2: Stripe Setup (1-2 hours)
- Add Stripe keys
- Deploy Edge Functions
- Create products in Stripe
- Update Price IDs in admin panel
- Test with Stripe test cards

### Phase 3: Build Payment UI (4-6 hours)
- Create checkout modals
- Add subscription selector
- Build billing page
- Integrate payment flows

### Phase 4: Soft Launch
- Enable one feature at a time
- Grandfather existing users
- Monitor for issues
- Offer promotional pricing

### Phase 5: Full Launch
- Enable all features
- Regular pricing
- Announce to users

## 📚 More Documentation

- **Full Setup Guide**: `STRIPE_INTEGRATION_GUIDE.md`
- **Implementation Status**: `STRIPE_IMPLEMENTATION_STATUS.md`
- **Database Schema**: `supabase/migrations/20251105000000_create_monetization_system.sql`

## 🆘 Troubleshooting

### "No data showing in Monetization panel"

The database migration should have seeded default data. If empty, run:

```sql
-- Check if features exist
SELECT * FROM monetization_features;

-- If empty, the migration didn't run. Check supabase migrations status
```

### "Can't enable features"

Make sure:
1. You're logged in as an admin (`is_admin = true` in profiles table)
2. RLS policies allow admin access
3. Check browser console for errors

### "Price changes not saving"

Verify:
- You clicked the save button (checkmark icon)
- No error messages in console
- You have admin privileges

## 🎉 What's Working Now

You can:
- ✅ View revenue stats (will be $0 until payments process)
- ✅ Toggle features on/off
- ✅ Edit pricing for all features
- ✅ Manage subscription plans
- ✅ View transaction history
- ✅ See active subscriptions
- ✅ Monitor system health

The infrastructure is complete and working. You just need to:
1. Add Stripe keys
2. Deploy functions
3. Build payment UI

Then you're ready to start charging!

---

**Current Build Status**: ✅ Builds successfully with no errors
**Database Status**: ✅ All tables created and seeded
**Admin UI Status**: ✅ Fully functional
**User Payment UI**: ⏹️ Not yet built (intentional - stealth mode)
