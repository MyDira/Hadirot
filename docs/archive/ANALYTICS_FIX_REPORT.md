# Analytics Pipeline Fix Report

## Root Cause Analysis

The analytics dashboard shows zeros because of a **schema mismatch** between the Edge Function and database:

1. **Column Mismatch**: Edge Function inserts `occurred_at`, `event_props`, `ua`, `ip_hash` but database expects `ts`, `props`, `user_agent`, `ip`
2. **Missing Session RPCs**: `touch_session` and `close_session` functions don't exist, causing session tracking to fail
3. **Impression Shape Mismatch**: Client emits `event_props.ids: string[]` but SQL expects scalar `event_props->>'listing_id'`

## Changes Made

### 1. Database Schema Alignment
**File**: `supabase/migrations/fix_analytics_schema_alignment.sql`
- Aligned `analytics_events` columns to match Edge Function payload
- Created missing session management functions
- Fixed analytics functions to use correct column names and timezone windows
- Added proper RLS policies and indexes

### 2. Edge Function Fixes  
**File**: `supabase/functions/track/index.ts:85-95`
- Updated to use aligned column names (`occurred_at` instead of `ts`)
- Fixed RPC calls to use normalized UUIDs
- Maintained UUID normalization behavior

### 3. Client Impression Tracking
**File**: `src/lib/analytics.ts:200-220`
- Updated `trackListingImpressionBatch` to emit individual events per listing
- Each event now has `event_props.listing_id` (scalar) instead of `event_props.ids` (array)

## Verification Steps

1. **Browse the app** for 2-3 minutes (navigate, view listings, apply filters)

2. **Check raw data**:
   ```sql
   SELECT event_name, occurred_at, session_id, anon_id
   FROM public.analytics_events
   ORDER BY occurred_at DESC
   LIMIT 10;
   ```

3. **Test analytics functions**:
   ```sql
   SELECT * FROM public.analytics_kpis(0,'America/New_York');
   SELECT * FROM public.analytics_top_listings(0,10,'America/New_York');
   SELECT * FROM public.analytics_top_filters(0,10,'America/New_York');
   ```

4. **Check dashboard**: Visit `/admin?tab=analytics` - tiles should show non-zero values

5. **Verify Edge Function logs**: No UUID/insert/RPC errors in Supabase Dashboard

## Expected Results
- Dashboard tiles show real values instead of zeros
- Top listings and filters tables populate with data
- No console errors in browser or Edge Function logs