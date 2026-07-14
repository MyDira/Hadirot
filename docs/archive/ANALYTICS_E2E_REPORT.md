# Analytics E2E Pipeline Fix Report

## Red/Green Checklist

### ✅ Identity Model
- **File**: `src/lib/analytics.ts:45-85`
- **Status**: PASS - anon_id in localStorage, session_id in sessionStorage, 30min idle timeout

### ✅ Event Payload & Batching  
- **File**: `src/lib/analytics.ts:200-220`
- **Status**: PASS - All events include required fields, batch size ≤50

### ✅ EF Normalization + RPC Usage
- **File**: `supabase/functions/track/index.ts:15-25, 85-95`
- **Status**: PASS - UUID normalization with uuidv5, normalized IDs passed to RPCs

### ❌ DB Schema & RLS Policies
- **File**: Database policies
- **Status**: FAIL - Missing proper RLS policies for analytics tables

### ❌ KPI & Top Queries (Timezone Windows)
- **File**: Database functions
- **Status**: FAIL - Functions missing or using wrong timezone logic

### ❌ Dashboard Wiring
- **File**: `src/pages/InternalAnalytics.tsx:45-65`
- **Status**: FAIL - Missing timezone parameters in RPC calls

## Root Causes Found

1. **Missing Analytics RPC Functions**: The database is missing the required analytics functions
2. **RLS Policies**: Analytics tables need proper read policies
3. **Dashboard RPC Calls**: Missing timezone parameters causing function resolution errors

## Fixes Applied

### 1. Database Functions & Policies
Created comprehensive analytics functions with timezone support and proper RLS policies.

### 2. Dashboard RPC Calls
Fixed InternalAnalytics.tsx to use correct function names and timezone parameters.

## Verification Steps

1. **Deploy Edge Function:**
   ```bash
   supabase functions deploy track
   ```

2. **Run Smoke Test:**
   ```bash
   npm run smoke:analytics
   ```
   Expect: `200 OK` and `{ success: true, inserted: 2 }`

3. **SQL Doctor Check:**
   ```sql
   -- Check recent events
   SELECT event_name, session_id, anon_id, occurred_at
   FROM public.analytics_events
   ORDER BY occurred_at DESC
   LIMIT 10;

   -- Check KPIs (should show non-zero after browsing)
   SELECT * FROM public.analytics_kpis(0,'America/New_York');

   -- Check top listings
   SELECT * FROM public.analytics_top_listings(0, 5, 'America/New_York');
   ```

4. **Browse the site** for 2-3 minutes, then refresh `/admin?tab=analytics`
   - Expect non-zero Daily Active, Unique Visitors
   - Expect listing data in tables after viewing listings

## Expected Results
- Dashboard tiles show real values instead of zeros
- Top listings and filters tables populate with data
- No more RPC function resolution errors