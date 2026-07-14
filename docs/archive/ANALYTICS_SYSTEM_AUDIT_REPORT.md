# Internal Analytics System - Comprehensive Audit Report

**Project:** Hadirot
**Audit Date:** October 30, 2025
**Auditor:** System Analysis
**Report Version:** 1.0

---

## Executive Summary

This audit examines the Hadirot internal analytics system, a comprehensive first-party analytics solution built on Supabase infrastructure. The system tracks user behavior, listing performance, and posting funnel conversion across a real estate listing platform.

**Key Findings:**
- **Architecture:** Three-layer system with client-side tracking, serverless edge function processing, and PostgreSQL database storage
- **Data Volume:** 70+ database migrations showing active development and continuous refinement
- **Tracked Events:** 15 distinct event types covering user engagement, listing interactions, and conversion funnel
- **Business Focus:** Real-time dashboard for administrators with daily active users, listing performance metrics, and posting funnel analysis
- **Privacy-Compliant:** IP hashing, anonymous user tracking, and configurable data retention policies

---

## 1. System Architecture & Infrastructure

### 1.1 Overall Architecture

The analytics system follows a three-tier architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT-SIDE LAYER                            │
│  - React Application (Vite)                                      │
│  - Analytics Library (/src/lib/analytics.ts)                     │
│  - Event Tracking Hooks (useAnalyticsInit, usePageTracking, etc)│
│  - Local Storage (Session & Anonymous IDs)                       │
│  - Event Queue with Batch Processing                             │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTPS POST (batched events)
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│                   EDGE FUNCTION LAYER                            │
│  - Supabase Edge Function: "track"                               │
│  - Deno Runtime Environment                                      │
│  - ID Normalization (String → UUID v5)                          │
│  - IP Hashing (SHA-256)                                          │
│  - Event Validation & Sanitization                               │
│  - Session Management (touch_session, close_session)             │
└────────────────────┬────────────────────────────────────────────┘
                     │ PostgreSQL RPC calls
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE LAYER                                │
│  - Supabase PostgreSQL Database                                  │
│  - Raw Events Table (analytics_events)                           │
│  - Sessions Table (analytics_sessions)                           │
│  - Daily Rollup Tables (daily_analytics, daily_top_listings)     │
│  - RPC Functions (10+ analytics queries)                         │
│  - Scheduled Jobs (daily rollup & cleanup)                       │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend Framework | React 18.3.1 + TypeScript | Client-side tracking |
| Build Tool | Vite 5.4.2 | Development & production builds |
| Backend | Supabase (PostgreSQL + Edge Functions) | Data storage & processing |
| Edge Runtime | Deno | Serverless function execution |
| Database | PostgreSQL 15+ | Event storage & aggregation |
| Scheduling | pg_cron | Daily rollup jobs |

### 1.3 Infrastructure Components

**Supabase Edge Functions:**
- `track/index.ts` - Primary event ingestion endpoint (247 lines)
- Handles up to 50 events per batch
- CORS-enabled for cross-origin requests
- Service role authentication for database writes

**Database Tables:**
- `analytics_events` - Raw event storage (unbounded)
- `analytics_sessions` - Session lifecycle tracking
- `daily_analytics` - Aggregated daily KPIs
- `daily_top_listings` - Daily listing performance rankings
- `daily_top_filters` - Daily filter usage statistics

**Client Libraries:**
- `/src/lib/analytics.ts` (552 lines) - Core tracking library
- `/src/lib/analytics.types.ts` - TypeScript type definitions
- `/src/lib/ga.ts` - Google Analytics integration (secondary)

### 1.4 Deployment & Hosting

- **Hosting:** Netlify (inferred from `_redirects` file)
- **Database:** Supabase managed PostgreSQL
- **Edge Functions:** Supabase Edge Network (global distribution)
- **CDN:** Supabase CDN for function distribution

---

## 2. Data Collection & Tracking Mechanisms

### 2.1 Tracked Event Types

The system tracks 15 distinct event types:

| Event Name | Purpose | Frequency | Props Captured |
|-----------|---------|-----------|----------------|
| `session_start` | User session begins | Per session | session_id, anon_id |
| `session_end` | User session ends | Per session | session_id, timestamp |
| `page_view` | Page navigation | Per route change | path |
| `listing_view` | User views listing detail | Once per session/listing | listing_id |
| `listing_impression_batch` | Listings visible in viewport | Per scroll batch | listing_ids[] |
| `filter_apply` | User applies search filters | Per filter change | filters{} |
| `search_query` | User performs search | Per search | q |
| `agency_page_view` | Agency profile viewed | Once per session/agency | agency_id, agency_slug |
| `agency_filter_apply` | Filters on agency page | Per filter change | filters{} |
| `agency_share` | Agency page shared | Per share action | agency_id |
| `post_started` | User begins posting listing | Per attempt | attempt_id |
| `post_submitted` | Form submitted | Per attempt | attempt_id |
| `post_success` | Listing created successfully | Per success | listing_id, attempt_id |
| `post_abandoned` | User leaves without completing | Per abandonment | attempt_id |

### 2.2 Client-Side Tracking Implementation

**Analytics Library Architecture:**

```javascript
// Key Constants (analytics.ts)
ANON_ID_KEY = 'ha_anon_id'                  // LocalStorage
SESSION_ID_KEY = 'ha_session_id'            // SessionStorage
LAST_ACTIVITY_KEY = 'ha_session_last_activity'
IDLE_TIMEOUT_MS = 30 * 60 * 1000           // 30 minutes
FLUSH_INTERVAL_MS = 3000                     // 3 seconds
FLUSH_BATCH_SIZE = 20                        // Events per batch
```

**Initialization Flow:**

1. `initAnalytics(supabaseClient)` called on app mount
2. Anonymous ID generated/retrieved from localStorage
3. Session ID created (UUID v4) or restored from sessionStorage
4. Activity listeners bound to DOM events (click, keydown, scroll, visibilitychange)
5. Periodic flush timer started (3-second interval)
6. beforeunload/pagehide handlers registered for final flush

**Event Queue System:**

```typescript
const eventQueue: PendingEvent[] = [];

function enqueueEvent(sessionId, eventName, props, occurredAt) {
  eventQueue.push({
    session_id: sessionId,
    anon_id: getAnonId(),
    user_id: currentUserId,
    event_name: eventName,
    event_props: props,
    occurred_at: occurredAt || new Date().toISOString()
  });

  if (eventQueue.length >= FLUSH_BATCH_SIZE) {
    flushEvents();
  }
}
```

**Flush Mechanisms:**
- Timer-based: Every 3 seconds
- Threshold-based: When queue reaches 20 events
- Page unload: Using `navigator.sendBeacon` with keepalive
- Visibility change: When tab becomes hidden

### 2.3 Session Management

**Session Lifecycle:**

```
┌──────────────┐
│  New Visit   │
└──────┬───────┘
       │ Generate session_id (UUID)
       │ Store in sessionStorage
       ↓
┌──────────────┐
│   Active     │ ← Activity detected (click, scroll, etc.)
│   Session    │   Update last_activity timestamp
└──────┬───────┘
       │ 30 min idle timeout
       ↓
┌──────────────┐
│ Session End  │ → Emit session_end event
│   Event      │   Clear session data
└──────────────┘
```

**Session Boundary Detection:**
- 30-minute idle timeout between activities
- Tab close/page unload triggers session_end
- Browser refresh creates new session
- Multiple tabs share same session (via sessionStorage)

**Activity Detection Events:**
- `click` - User interaction
- `keydown` - Keyboard input
- `scroll` - Page scrolling
- `visibilitychange` - Tab focus changes

### 2.4 Deduplication Mechanisms

The system implements sophisticated deduplication to prevent double-counting:

**Session-Scoped Flags:**

```typescript
SESSION_FLAG_PREFIX = 'ha_flag:'

// Listing view deduplication
const flagKey = `ha_flag:listing_view:${sessionId}:${listingId}`;
if (getFlag(flagKey)) return; // Already tracked
setFlag(flagKey);
track('listing_view', { listing_id: listingId });
```

**Deduplication by Event Type:**

| Event | Deduplication Method | Scope |
|-------|---------------------|-------|
| listing_view | Session + Listing ID flag | Per session |
| agency_page_view | Session + Agency ID flag | Per session |
| listing_impression_batch | Session + Listing ID flags (array) | Per session |
| post_started | Attempt ID flag | Per attempt |
| post_submitted | Attempt ID flag | Per attempt |
| post_success | Attempt ID flag | Per attempt |

**Attempt ID Management:**

```typescript
// Posting attempt tracking
POST_ATTEMPT_KEY = 'ha_post_attempt'
POST_ATTEMPT_SESSION_KEY = 'ha_post_attempt_session'

function getPostingSession() {
  let attemptId = safeSessionGet(POST_ATTEMPT_KEY);
  const attemptSession = safeSessionGet(POST_ATTEMPT_SESSION_KEY);

  // New attempt if session changed or no attempt ID
  if (!attemptId || attemptSession !== currentSessionId) {
    attemptId = crypto.randomUUID();
    clearPreviousAttemptFlags(attemptId);
  }

  return { attemptId, sessionId: currentSessionId };
}
```

### 2.5 Listing Impression Tracking

**Intersection Observer Implementation:**

File: `/src/hooks/useListingImpressions.ts` (79 lines)

```typescript
const observer = new IntersectionObserver(handleIntersection, {
  threshold: 0.5,        // 50% visibility required
  rootMargin: '0px'      // No margin around viewport
});

function handleIntersection(entries) {
  const newlyVisible = entries
    .filter(entry => entry.isIntersecting)
    .map(entry => entry.target.getAttribute('data-listing-id'))
    .filter(id => !trackedListingsRef.current.has(id));

  if (newlyVisible.length > 0) {
    trackListingImpressionBatch(newlyVisible);
    newlyVisible.forEach(id => trackedListingsRef.current.add(id));
  }
}
```

**Usage in BrowseListings:**

```typescript
const { observeElement, unobserveElement } = useListingImpressions({
  listingIds: listings.map(l => l.id),
  threshold: 0.5
});

// Applied to each listing card
<div ref={el => el && observeElement(el, listing.id)}>
  <ListingCard listing={listing} />
</div>
```

---

## 3. Data Pipeline & Processing Flow

### 3.1 Complete Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Event Generation (Client)                           │
│ - User action triggers track() call                         │
│ - Event added to in-memory queue                            │
│ - Session ensured (create or touch)                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Batching & Flush (Client)                           │
│ - Queue accumulates events                                   │
│ - Flush triggered by: timer (3s), size (20), unload         │
│ - POST to /functions/v1/track                               │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS POST (JSON payload)
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Edge Function Processing (track/index.ts)           │
│ - CORS validation                                            │
│ - Batch size validation (max 50)                            │
│ - Parse JSON payload                                         │
│ - Extract client IP & User-Agent                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Event Normalization (track/index.ts)                │
│ - session_id: string → UUID (v5 hash if not UUID)          │
│ - anon_id: string → UUID (v5 hash if not UUID)             │
│ - user_id: string → UUID (if present)                      │
│ - client_ip → SHA-256 hash (ip_hash)                       │
│ - Validate event_name & required fields                     │
│ - Sanitize event_props (ensure object, remove undefined)    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 5: Database Insert (PostgreSQL)                        │
│ - Bulk insert to analytics_events table                     │
│ - Extract session touches (last seen timestamp)             │
│ - Extract session_end events                                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 6: Session Management (RPC)                            │
│ - Call touch_session(session_id, anon_id, user_id, ts)     │
│ - Call close_session(session_id, ts) for session_end       │
│ - Updates analytics_sessions table                          │
└────────────────────┬────────────────────────────────────────┘
                     │ Daily at 06:10 UTC
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 7: Daily Rollup (Scheduled Job)                        │
│ - rollup_analytics_events() function                        │
│ - Aggregate to daily_analytics                              │
│ - Calculate daily_top_listings                              │
│ - Calculate daily_top_filters                               │
│ - Session duration calculation (30-min gap capping)         │
└────────────────────┬────────────────────────────────────────┘
                     │ Daily at 06:20 UTC
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ STEP 8: Cleanup (Scheduled Job)                             │
│ - Delete impression events > 30 days                        │
│ - Delete other events > 90 days                             │
│ - Maintain retention policies                               │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 ID Normalization Process

**Purpose:** Convert any string-based IDs to proper UUIDs for database consistency.

File: `/supabase/functions/track/index.ts` (lines 8-12)

```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NS = "00000000-0000-0000-0000-000000000000";

function normalizeId(s: unknown): string {
  const str = String(s ?? "");
  if (!str) return crypto.randomUUID();
  return UUID_RE.test(str) ? str : uuidv5(str, NS);
}
```

**Examples:**
- `"smoke-session-1698765432"` → `"a1b2c3d4-e5f6-5789-abcd-ef0123456789"` (deterministic)
- `"550e8400-e29b-41d4-a716-446655440000"` → `"550e8400-e29b-41d4-a716-446655440000"` (unchanged)
- `null` or `""` → `crypto.randomUUID()` (new UUID)

**Benefits:**
- Deterministic hashing ensures same input → same UUID
- Allows client to send any identifier format
- Database constraints satisfied (UUID columns)
- Consistent lookups across sessions

### 3.3 IP Hashing for Privacy

File: `/supabase/functions/track/index.ts` (lines 88-94)

```typescript
async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

const clientIp = getClientIP(req);
const ipHash = clientIp ? await sha256Hex(clientIp) : null;
```

**IP Extraction Headers (in priority order):**
1. `x-forwarded-for`
2. `x-real-ip`
3. `cf-connecting-ip` (Cloudflare)
4. `x-client-ip`
5. `x-forwarded`
6. `forwarded-for`
7. `forwarded`

**Privacy Compliance:**
- Raw IP never stored in database
- SHA-256 hash is one-way (cannot reverse)
- Enables abuse detection without PII storage
- GDPR/CCPA compliant approach

### 3.4 Session Touch and Close Functions

**Purpose:** Update session lifecycle records in `analytics_sessions` table.

**touch_session RPC:**
```sql
-- Called on every batch of events
FUNCTION touch_session(
  p_session uuid,
  p_anon uuid,
  p_user uuid,
  p_ts timestamptz
)
-- Upserts session record with latest timestamp
-- Updates last_seen_at
-- Calculates duration_seconds
```

**close_session RPC:**
```sql
-- Called when session_end event detected
FUNCTION close_session(
  p_session uuid,
  p_ts timestamptz
)
-- Sets ended_at timestamp
-- Marks session as completed
```

**Session Duration Calculation:**
```
duration_seconds = ended_at - started_at
OR
duration_seconds = last_seen_at - started_at (if not ended)
```

---

## 4. Database Schema & Data Model

### 4.1 Core Tables

**analytics_events** (Primary event storage)

File: `/supabase/migrations/20250901001838_floating_cherry.sql`

```sql
CREATE TABLE analytics_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts            timestamptz DEFAULT now() NOT NULL,
  session_id    text NOT NULL,
  user_id       uuid,
  event_name    text NOT NULL,
  page          text,
  referrer      text,
  user_agent    text,
  ip            text,  -- Deprecated (now ip_hash)
  props         jsonb DEFAULT '{}' NOT NULL
);
```

Later evolved to (from track function usage):
```sql
CREATE TABLE analytics_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid NOT NULL,              -- Normalized to UUID
  anon_id       uuid NOT NULL,              -- Anonymous user identifier
  user_id       uuid,                       -- Authenticated user (optional)
  event_name    text NOT NULL,
  event_props   jsonb DEFAULT '{}' NOT NULL,
  occurred_at   timestamptz NOT NULL,       -- Renamed from ts
  ua            text,                       -- User agent
  ip_hash       text                        -- SHA-256 hashed IP
);
```

**Indexes:**
```sql
CREATE INDEX analytics_events_ts_desc_idx
  ON analytics_events (ts DESC);

CREATE INDEX analytics_events_event_name_ts_idx
  ON analytics_events (event_name, ts DESC);

CREATE INDEX analytics_events_session_id_idx
  ON analytics_events (session_id);

CREATE INDEX analytics_events_user_id_idx
  ON analytics_events (user_id);

CREATE INDEX analytics_events_props_gin_idx
  ON analytics_events USING GIN (props);

CREATE INDEX analytics_events_listing_id_idx
  ON analytics_events ((event_props->>'listing_id'))
  WHERE event_props->>'listing_id' IS NOT NULL;

CREATE INDEX analytics_events_attempt_id_idx
  ON analytics_events ((event_props->>'attempt_id'))
  WHERE event_props->>'attempt_id' IS NOT NULL;
```

**analytics_sessions** (Session lifecycle tracking)

Inferred from RPC function usage:
```sql
CREATE TABLE analytics_sessions (
  session_id      uuid PRIMARY KEY,
  anon_id         uuid NOT NULL,
  user_id         uuid,
  started_at      timestamptz NOT NULL,
  last_seen_at    timestamptz NOT NULL,
  ended_at        timestamptz,
  duration_seconds integer
);
```

### 4.2 Daily Rollup Tables

**daily_analytics** (Aggregated KPIs)

File: `/supabase/migrations/20250902184214_navy_math.sql`

```sql
CREATE TABLE daily_analytics (
  date                  date PRIMARY KEY,
  dau                   integer DEFAULT 0,
  visitors              integer DEFAULT 0,
  returners             integer DEFAULT 0,
  avg_session_minutes   numeric(10,2) DEFAULT 0,
  listing_views         integer DEFAULT 0,
  post_starts           integer DEFAULT 0,
  post_submits          integer DEFAULT 0,
  post_success          integer DEFAULT 0,
  post_abandoned        integer DEFAULT 0,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX daily_analytics_date_idx
  ON daily_analytics(date DESC);
```

**daily_top_listings** (Daily ranking)

```sql
CREATE TABLE daily_top_listings (
  date          date NOT NULL,
  listing_id    uuid NOT NULL,
  views         integer DEFAULT 0,
  impressions   integer DEFAULT 0,
  ctr           numeric(5,2) DEFAULT 0,
  rank          integer NOT NULL,
  created_at    timestamptz DEFAULT now(),
  PRIMARY KEY (date, listing_id)
);

CREATE INDEX daily_top_listings_date_rank_idx
  ON daily_top_listings(date DESC, rank ASC);
```

**daily_top_filters** (Filter usage stats)

```sql
CREATE TABLE daily_top_filters (
  date          date NOT NULL,
  filter_key    text NOT NULL,
  filter_value  text NOT NULL,
  uses          integer DEFAULT 0,
  rank          integer NOT NULL,
  created_at    timestamptz DEFAULT now(),
  PRIMARY KEY (date, filter_key, filter_value)
);

CREATE INDEX daily_top_filters_date_rank_idx
  ON daily_top_filters(date DESC, rank ASC);
```

### 4.3 Row-Level Security (RLS)

**analytics_events policies:**

```sql
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own events"
  ON analytics_events
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT policy for public/authenticated
-- Only service role (Edge Function) can insert
```

**daily_* tables policies:**

```sql
ALTER TABLE daily_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_top_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_top_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read daily analytics"
  ON daily_analytics FOR SELECT TO public USING (true);

CREATE POLICY "Public can read daily top listings"
  ON daily_top_listings FOR SELECT TO public USING (true);

CREATE POLICY "Public can read daily top filters"
  ON daily_top_filters FOR SELECT TO public USING (true);
```

### 4.4 Foreign Key Relationships

```sql
ALTER TABLE analytics_events
ADD CONSTRAINT analytics_events_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES profiles(id)
ON DELETE SET NULL;

-- analytics_sessions likely has similar FK
ALTER TABLE analytics_sessions
ADD CONSTRAINT analytics_sessions_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES profiles(id)
ON DELETE SET NULL;
```

---

## 5. Business Metrics & KPI Calculations

### 5.1 Daily Active Users (DAU)

**Definition:** Unique users (by anon_id) who had at least one event in a given day.

**Calculation Method:**

```sql
-- From analytics_kpis_with_sparkline function
SELECT COUNT(DISTINCT s.anon_id)::integer
FROM analytics_sessions s
WHERE (s.started_at AT TIME ZONE tz)::date = target_date;
```

**Business Logic:**
- Counts unique anonymous IDs, not sessions
- Same user across multiple sessions = 1 DAU
- Authenticated and anonymous users both counted
- Timezone-aware (America/New_York)

**7-Day Sparkline:**
```sql
SELECT array_agg(daily_count ORDER BY day_date)
FROM (
  SELECT
    d.day_date,
    COALESCE(COUNT(DISTINCT s.anon_id), 0)::integer as daily_count
  FROM generate_series(
    target_date - interval '6 days',
    target_date,
    interval '1 day'
  )::date as day_date
  LEFT JOIN analytics_sessions s
    ON (s.started_at AT TIME ZONE tz)::date = d.day_date
  GROUP BY d.day_date
  ORDER BY d.day_date
) daily_counts;
```

### 5.2 Unique Visitors

**Definition:** Unique anonymous users (anon_id) who are NOT authenticated.

**Calculation:**

```sql
SELECT COUNT(DISTINCT s.anon_id)::integer
FROM analytics_sessions s
WHERE (s.started_at AT TIME ZONE tz)::date = target_date
  AND s.user_id IS NULL;
```

**Business Context:**
- Tracks truly anonymous traffic
- Excludes authenticated users from this metric
- Useful for understanding anonymous vs logged-in traffic split
- Combined with DAU gives authentication rate: `(DAU - Unique Visitors) / DAU`

### 5.3 Average Session Duration

**Definition:** Mean time users spend actively engaged, with intelligent gap handling.

**Calculation with 30-Minute Gap Capping:**

```sql
-- From rollup_analytics_events function
WITH session_events AS (
  SELECT
    session_id,
    ts,
    LAG(ts) OVER (PARTITION BY session_id ORDER BY ts) as prev_ts
  FROM analytics_events
  WHERE ts::date = target_date
),
session_gaps AS (
  SELECT
    session_id,
    CASE
      WHEN prev_ts IS NULL THEN 0
      ELSE LEAST(
        EXTRACT(EPOCH FROM (ts - prev_ts)) / 60.0,
        30.0  -- Cap individual gaps at 30 minutes
      )
    END as gap_minutes
  FROM session_events
),
session_durations AS (
  SELECT
    session_id,
    SUM(gap_minutes) as total_minutes
  FROM session_gaps
  GROUP BY session_id
)
SELECT COALESCE(AVG(total_minutes), 0)
FROM session_durations;
```

**Why Gap Capping?**
- Users who leave tab open for hours shouldn't inflate averages
- 30-minute cap represents realistic "maximum attention span"
- Prevents outliers from skewing mean
- More accurate representation of actual engagement

**Alternative Simple Method:**
```sql
-- Used in simpler contexts
SELECT ROUND(AVG(s.duration_seconds / 60.0))::integer
FROM analytics_sessions s
WHERE (s.started_at AT TIME ZONE tz)::date = target_date
  AND s.duration_seconds IS NOT NULL
  AND s.duration_seconds > 0;
```

### 5.4 Listing Views

**Definition:** Number of times users viewed listing detail pages.

**Calculation:**

```sql
SELECT COUNT(*)::integer
FROM analytics_events e
WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
  AND e.event_name = 'listing_view';
```

**Deduplication:** One view per session per listing (enforced client-side).

**Related Metric - Listing Impressions:**
```sql
-- Count individual listings from batched impressions
SELECT COUNT(*)
FROM analytics_events ae,
     LATERAL (
       SELECT jsonb_array_elements_text(
         COALESCE(ae.event_props->'listing_ids',
                  ae.event_props->'ids',
                  '[]'::jsonb)
       ) as listing_id
     ) expanded
WHERE ae.event_name = 'listing_impression_batch'
  AND (ae.occurred_at AT TIME ZONE tz)::date = target_date;
```

### 5.5 Click-Through Rate (CTR)

**Definition:** Percentage of listing impressions that result in detail page views.

**Calculation:**

```sql
-- Per listing CTR
WITH listing_views AS (
  SELECT
    (event_props->>'listing_id')::uuid as listing_id,
    COUNT(*) as views
  FROM analytics_events
  WHERE event_name = 'listing_view'
    AND (occurred_at AT TIME ZONE tz)::date = target_date
  GROUP BY 1
),
listing_impressions AS (
  SELECT
    listing_id::uuid,
    COUNT(*) as impressions
  FROM analytics_events ae,
       LATERAL (
         SELECT jsonb_array_elements_text(
           COALESCE(ae.event_props->'listing_ids',
                    ae.event_props->'ids',
                    '[]'::jsonb)
         ) as listing_id
       ) expanded
  WHERE ae.event_name = 'listing_impression_batch'
    AND (ae.occurred_at AT TIME ZONE tz)::date = target_date
  GROUP BY 1
)
SELECT
  v.listing_id,
  v.views,
  i.impressions,
  CASE
    WHEN i.impressions > 0
    THEN ROUND((v.views::numeric / i.impressions) * 100, 2)
    ELSE 0
  END as ctr
FROM listing_views v
FULL OUTER JOIN listing_impressions i USING (listing_id);
```

**Interpretation:**
- CTR > 5%: Excellent performance
- CTR 2-5%: Good performance
- CTR < 2%: Needs optimization
- CTR = 0: Impressions but no clicks (red flag)

### 5.6 Posting Funnel Metrics

**Funnel Stages:**

1. **Started:** User lands on posting page (`post_started`)
2. **Submitted:** User submits form (`post_submitted`)
3. **Success:** Listing created successfully (`post_success`)
4. **Abandoned:** User left without completing (`post_abandoned`)

**Calculations:**

```sql
-- From analytics_summary function
SELECT
  COALESCE((
    SELECT COUNT(*)::integer
    FROM analytics_events e
    WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
      AND e.event_name = 'post_started'
  ), 0) as post_starts,

  COALESCE((
    SELECT COUNT(*)::integer
    FROM analytics_events e
    WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
      AND e.event_name = 'post_submitted'
  ), 0) as post_submits,

  COALESCE((
    SELECT COUNT(*)::integer
    FROM analytics_events e
    WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
      AND e.event_name = 'post_success'
  ), 0) as post_successes,

  COALESCE((
    SELECT COUNT(*)::integer
    FROM analytics_events e
    WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
      AND e.event_name = 'post_abandoned'
  ), 0) as post_abandoned;
```

**Derived Metrics:**

```typescript
// Frontend calculation (InternalAnalytics.tsx)
const successRate = funnel.starts > 0
  ? Math.round((funnel.successes / funnel.starts) * 100)
  : 0;

const abandonRate = funnel.starts > 0
  ? Math.round((funnel.abandoned / funnel.starts) * 100)
  : 0;
```

**Funnel Analysis:**
```
100 Started
 ↓ (80%) Submit Rate
 80 Submitted
 ↓ (90%) Success Rate
 72 Success

Overall Conversion: 72%
Abandonment: 28%
```

### 5.7 Agency Performance Metrics

**Agency Page Views:**
```sql
SELECT COUNT(*)::integer
FROM analytics_events e
WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
  AND e.event_name = 'agency_page_view';
```

**Agency Filter Applies:**
```sql
SELECT COUNT(*)::integer
FROM analytics_events e
WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
  AND e.event_name = 'agency_filter_apply';
```

**Agency Shares:**
```sql
SELECT COUNT(*)::integer
FROM analytics_events e
WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
  AND e.event_name = 'agency_share';
```

---

## 6. Analytics RPC Functions

### 6.1 Function Inventory

| Function Name | Purpose | Parameters | Return Type |
|--------------|---------|------------|-------------|
| `analytics_kpis_with_sparkline` | Dashboard KPIs + 7-day trend | `tz` | TABLE (4 metrics + array) |
| `analytics_summary` | Posting funnel stats | `days_back`, `tz` | TABLE (4 counters) |
| `analytics_top_listings` | Top listings by views | `days_back`, `limit`, `tz` | TABLE (id, views, impr, ctr) |
| `analytics_top_listings_detailed` | Top listings with details | `days_back`, `limit`, `tz` | TABLE (8 columns) |
| `analytics_top_filters` | Most used filters | `days_back`, `limit`, `tz` | TABLE (key, value, count) |
| `analytics_agency_metrics` | Agency performance | `days_back`, `tz` | TABLE (3 counters) |
| `analytics_page_impressions` | Page view counts | `days_back`, `limit`, `tz` | TABLE (path, count) |
| `rollup_analytics_events` | Daily aggregation job | none | void |
| `cleanup_analytics_events` | Data retention cleanup | none | void |
| `touch_session` | Update session timestamp | session_id, anon_id, user_id, ts | void |
| `close_session` | Mark session ended | session_id, ts | void |

### 6.2 Timezone Handling

**Critical Fix Applied:** Migration `20251005011538_fix_analytics_timezone_comparison.sql`

**Problem Identified:**
```sql
-- WRONG: Compares UTC date against NY-calculated target_date
WHERE occurred_at::date = target_date

-- Example Bug:
-- Current time: 2025-10-05 01:14 UTC (9:14 PM Oct 4 in NY)
-- target_date: 2025-10-04 (from NY timezone)
-- occurred_at::date: 2025-10-05 (UTC cast)
-- Result: No match! ❌
```

**Solution:**
```sql
-- CORRECT: Convert to target timezone before date cast
WHERE (occurred_at AT TIME ZONE tz)::date = target_date

-- Same example:
-- (occurred_at AT TIME ZONE 'America/New_York')::date = 2025-10-04
-- Result: Match! ✓
```

**Applied to All Functions:**
- analytics_kpis_with_sparkline
- analytics_summary
- analytics_agency_metrics
- analytics_page_impressions
- analytics_top_listings
- analytics_top_filters
- analytics_top_listings_detailed

### 6.3 Example Function: analytics_top_listings_detailed

File: `/supabase/migrations/20251005011538_fix_analytics_timezone_comparison.sql`

**Purpose:** Provide rich context for top-performing listings in admin dashboard.

**Function Signature:**
```sql
CREATE OR REPLACE FUNCTION analytics_top_listings_detailed(
  days_back integer DEFAULT 0,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id uuid,
  property_location text,
  bedrooms integer,
  monthly_rent text,
  posted_by text,
  views integer,
  impressions integer,
  ctr numeric,
  is_featured boolean
)
```

**Implementation Logic:**

```sql
WITH listing_stats AS (
  -- Aggregate views and impressions per listing
  SELECT
    (e.event_props->>'listing_id')::uuid as lid,
    COUNT(CASE WHEN e.event_name = 'listing_view' THEN 1 END)::integer as view_count,
    COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END)::integer as impression_count,
    CASE
      WHEN COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END) > 0
      THEN ROUND(
        (COUNT(CASE WHEN e.event_name = 'listing_view' THEN 1 END)::numeric /
         COUNT(CASE WHEN e.event_name = 'listing_impression_batch' THEN 1 END)::numeric) * 100,
        2
      )
      ELSE 0
    END as click_through_rate
  FROM analytics_events e
  WHERE (e.occurred_at AT TIME ZONE tz)::date = target_date
    AND e.event_name IN ('listing_view', 'listing_impression_batch')
    AND (e.event_props->>'listing_id') IS NOT NULL
  GROUP BY (e.event_props->>'listing_id')
)
SELECT
  l.id,
  -- Format location with neighborhood
  COALESCE(
    CASE
      WHEN l.neighborhood IS NOT NULL AND l.neighborhood != ''
      THEN l.neighborhood || ' - ' || l.location
      ELSE l.location
    END,
    'Unknown Location'
  ) as property_location,
  l.bedrooms,
  -- Format price display
  CASE
    WHEN l.call_for_price = true THEN 'Call for Price'
    WHEN l.price IS NULL THEN 'Not specified'
    ELSE '$' || l.price::text || '/mo'
  END as monthly_rent,
  COALESCE(p.full_name, 'Unknown') as posted_by,
  ls.view_count,
  ls.impression_count,
  ls.click_through_rate,
  COALESCE(l.is_featured, false) as is_featured
FROM listing_stats ls
INNER JOIN listings l ON l.id = ls.lid
LEFT JOIN profiles p ON p.id = l.user_id
WHERE l.is_active = true
ORDER BY ls.view_count DESC, ls.impression_count DESC
LIMIT limit_count;
```

**Key Features:**
1. Joins raw analytics with listing details
2. Formats rental price with business logic
3. Combines neighborhood + location for context
4. Includes poster name for accountability
5. Shows featured status for analysis
6. Filters inactive listings
7. Timezone-aware date comparison

### 6.4 Security Model

**All analytics functions use:**
```sql
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
```

**Admin Check Pattern:**
```sql
-- No explicit admin check in most functions
-- Security handled at application layer (React)
-- InternalAnalytics page checks:
IF NOT EXISTS (
  SELECT 1 FROM profiles
  WHERE id = auth.uid() AND is_admin = true
) THEN
  RAISE EXCEPTION 'Access denied. Admin privileges required.';
END IF;
```

**Note:** Some functions include admin checks, others rely on frontend route protection. Recommendation: Standardize with backend checks in all functions.

---

## 7. Dashboard & Reporting

### 7.1 Internal Analytics Dashboard

File: `/src/pages/InternalAnalytics.tsx` (522 lines)

**Access Control:**
```typescript
const { user, profile, loading } = useAuth();
const isAdmin = profile?.is_admin === true;

useEffect(() => {
  if (loading || (user && profile === undefined)) return;
  if (!user || !profile || !isAdmin) {
    navigate('/', { replace: true });
  }
}, [loading, user, profile, isAdmin, navigate]);
```

**Data Loading:**
```typescript
const loadAnalyticsData = async () => {
  const [kpisResult, summaryResult, listingsResult,
         detailedListingsResult, filtersResult, agencyResult]
    = await Promise.all([
      supabase.rpc('analytics_kpis_with_sparkline',
        { tz: 'America/New_York' }),
      supabase.rpc('analytics_summary',
        { days_back: 0, tz: 'America/New_York' }),
      supabase.rpc('analytics_top_listings',
        { days_back: 0, limit_count: 10, tz: 'America/New_York' }),
      supabase.rpc('analytics_top_listings_detailed',
        { days_back: 0, limit_count: 10, tz: 'America/New_York' }),
      supabase.rpc('analytics_top_filters',
        { days_back: 0, limit_count: 10, tz: 'America/New_York' }),
      supabase.rpc('analytics_agency_metrics',
        { days_back: 0, tz: 'America/New_York' })
    ]);
};
```

### 7.2 Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Analytics Dashboard                                          │
│ Today • MM/DD/YYYY                                          │
├──────────────┬──────────────┬──────────────┬───────────────┤
│ Daily Active │ Unique       │ Avg Session  │ Listing Views │
│      42      │ Visitors     │    12m       │      156      │
│ [sparkline] │     38       │              │               │
├──────────────┴──────────────┴──────────────┴───────────────┤
│ Posting Funnel                                              │
│ ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐                │
│ │  15  │→  │  12  │→  │  10  │   │   2  │                │
│ │Start │   │Submit│   │Success│   │Abandon│               │
│ └──────┘   └──────┘   └──────┘   └──────┘                │
│ Success: 67% • Abandon: 13%                                │
├─────────────────────────────────────────────────────────────┤
│ Agency Performance                                          │
│ ┌──────────┬──────────────┬──────────┐                    │
│ │Page Views│Filter Applies│  Shares  │                    │
│ │    24    │      18      │     3    │                    │
│ └──────────┴──────────────┴──────────┘                    │
├─────────────────────────┬───────────────────────────────────┤
│ Top Listings by Views   │ Most Used Filters                │
│ (scrollable)            │ (scrollable)                      │
│ ┌─────────────────────┐ │ ┌───────────────────────────┐   │
│ │ 3 BR                │ │ │ Filter    │Value│Uses│     │   │
│ │ West Village - NYC  │ │ ├───────────┼─────┼────┤     │   │
│ │ $3,500/mo          │ │ │ bedrooms  │  2  │ 45 │     │   │
│ │ by John Smith      │ │ │ max_price │ 3000│ 38 │     │   │
│ │ Views: 45          │ │ │ min_price │ 2000│ 35 │     │   │
│ │ Impressions: 120   │ │ │ parking   │ true│ 28 │     │   │
│ │ CTR: 37.5%         │ │ │ no_fee    │ true│ 22 │     │   │
│ │ [Featured]         │ │ └───────────────────────────┘   │
│ └─────────────────────┘ │                                 │
│ │ (9 more...)         │ │ (5 more...)                     │
└─────────────────────────┴───────────────────────────────────┘
```

### 7.3 Sparkline Visualization

**Component:** Custom SVG Sparkline

```typescript
function Sparkline({ data, className = '' }: {
  data: number[];
  className?: string
}) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className={`h-8 w-full ${className}`}
         viewBox="0 0 100 100"
         preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
}
```

**Usage:**
```typescript
<Sparkline data={dauSparkline} className="text-blue-600" />
// dauSparkline: [35, 38, 42, 45, 40, 43, 42] (7 days)
```

### 7.4 Top Listings Panel

**Features:**
- Scrollable container (600px height)
- Fixed header
- Clickable cards (navigate to listing detail)
- Color-coded CTR indicators:
  - Green: CTR ≥ 5%
  - Blue: CTR 2-5%
  - Gray: CTR < 2%
- Featured badge for promoted listings
- Poster name attribution

**Card Click Handler:**
```typescript
onClick={() => navigate(`/listing/${listing.listing_id}`)}
```

### 7.5 Error States & Loading

**Loading State:**
```typescript
if (dataLoading) {
  return (
    <div className="text-center py-12">
      <div className="animate-spin rounded-full h-8 w-8
                      border-b-2 border-[#273140] mx-auto"></div>
      <p className="text-gray-600 mt-4">Loading analytics data...</p>
    </div>
  );
}
```

**Error State:**
```typescript
if (error) {
  return (
    <div className="text-center py-12">
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <p className="text-red-800">{error}</p>
      </div>
    </div>
  );
}
```

**Empty State:**
```typescript
if (detailedTopListings.length === 0) {
  return (
    <div className="text-center py-8">
      <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <p className="text-gray-500">No listing data yet</p>
    </div>
  );
}
```

---

## 8. Data Quality & Validation

### 8.1 Client-Side Validation

**Event Validation Before Queueing:**

```typescript
function track(eventName: AnalyticsEventName, props: Record<string, unknown> = {}) {
  // Validate event name is allowed
  if (!VALID_EVENT_NAMES.includes(eventName)) {
    console.warn('[analytics] Invalid event name:', eventName);
    return;
  }

  // Ensure session exists
  const sessionId = ensureSession(Date.now());

  // Sanitize props
  const sanitizedProps = Object.entries(props).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== null) {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, unknown>);

  enqueueEvent(sessionId, eventName, sanitizedProps);
}
```

**Session Validation:**
```typescript
function ensureSession(nowMs: number = Date.now()): string {
  // Check for expired session (30-minute timeout)
  if (currentSessionId && lastActivityMs &&
      nowMs - lastActivityMs >= IDLE_TIMEOUT_MS) {
    emitSessionBoundary('session_end', currentSessionId, lastActivityMs);
    clearSessionState();
  }

  // Create new session if needed
  if (!currentSessionId) {
    const newId = crypto.randomUUID();
    setSessionId(newId);
    lastActivityMs = nowMs;
    persistLastActivity(nowMs);
    emitSessionBoundary('session_start', newId, nowMs);
    return newId;
  }

  // Update activity timestamp
  lastActivityMs = nowMs;
  persistLastActivity(nowMs);
  return currentSessionId;
}
```

### 8.2 Server-Side Validation

**Edge Function Validation** (track/index.ts):

```typescript
// Batch size validation
if (events.length > MAX_BATCH_SIZE) {
  return jsonResponse(400, {
    error: `Too many events (max ${MAX_BATCH_SIZE})`
  });
}

// Required fields validation
for (const event of events) {
  const rawSessionId = typeof event.session_id === 'string'
    ? event.session_id : null;
  const rawAnonId = typeof event.anon_id === 'string'
    ? event.anon_id : null;
  const eventName = typeof event.event_name === 'string'
    ? event.event_name : null;

  if (!rawSessionId || !rawAnonId || !eventName) {
    return jsonResponse(400, {
      error: 'Event missing required fields'
    });
  }
}

// Event props sanitization
function sanitizeEventProps(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  return raw as Record<string, unknown>;
}
```

### 8.3 Data Deduplication

**Client-Side Deduplication:**

| Mechanism | Scope | Purpose |
|-----------|-------|---------|
| Session Flags | Per session | Prevent double-tracking same event in session |
| Attempt IDs | Per posting attempt | Link funnel events, prevent duplicates |
| Impression Tracking | Per element | Only track first time element becomes visible |

**Server-Side Deduplication:**

None implemented at database level. All deduplication handled client-side through flags.

**Risk:** Client-side deduplication can be bypassed if:
- User clears session storage
- User uses incognito/private browsing
- User switches devices

**Mitigation:** Session-scoped flags are acceptable for engagement metrics. For critical business metrics (payments, conversions), use server-side idempotency keys.

### 8.4 Smoke Tests

File: `/scripts/analytics-smoke.ts` (133 lines)

**Purpose:** Validate end-to-end analytics pipeline.

**Test Flow:**

```typescript
async function smokeTestAnalytics() {
  // 1. Generate test events
  const testEvents = [
    {
      session_id: "smoke-session-" + Date.now(),
      anon_id: "smoke-anon-" + Date.now(),
      event_name: "page_view",
      event_props: { source: "smoke_test", test_id: 1 },
      occurred_at: new Date().toISOString()
    },
    {
      session_id: "smoke-session-" + Date.now(),
      anon_id: "smoke-anon-" + Date.now(),
      event_name: "listing_view",
      event_props: { source: "smoke_test", test_id: 2 },
      occurred_at: new Date().toISOString()
    }
  ];

  // 2. Send to track function
  const { data, error } = await supabase.functions.invoke('track', {
    body: { events: testEvents }
  });

  // 3. Wait for processing
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 4. Query database to verify insertion
  const { data: recentEvents } = await supabaseAdmin
    .from('analytics_events')
    .select('*')
    .contains('event_props', { source: 'smoke_test' })
    .order('occurred_at', { ascending: false })
    .limit(5);

  // 5. Test analytics functions
  const { data: kpis } = await supabaseAdmin
    .rpc('analytics_kpis', { days_back: 0, tz: 'America/New_York' });

  // 6. Verify sessions created
  const { data: sessions } = await supabaseAdmin
    .from('analytics_sessions')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(2);

  return recentEvents.length >= 2 && kpis && sessions;
}
```

**Run Command:**
```bash
npm run smoke:analytics
```

### 8.5 Debug Tools

File: `/scripts/analytics-debug.ts` (190 lines)

**Diagnostic Checks:**

1. **Function Existence Check:**
```typescript
const { data: functions } = await supabaseAdmin
  .from('pg_proc')
  .select('proname')
  .like('proname', 'analytics_%');

const requiredFunctions = [
  'analytics_kpis',
  'analytics_summary',
  'analytics_top_listings',
  'analytics_top_filters'
];
const missingFunctions = requiredFunctions
  .filter(f => !functions.includes(f));
```

2. **Raw Event Data Check:**
```typescript
const { data: events } = await supabaseAdmin
  .from('analytics_events')
  .select('event_name, occurred_at, session_id, anon_id')
  .order('occurred_at', { ascending: false })
  .limit(5);
```

3. **Session Data Check:**
```typescript
const { data: sessions } = await supabaseAdmin
  .from('analytics_sessions')
  .select('session_id, anon_id, started_at, last_seen_at')
  .order('started_at', { ascending: false })
  .limit(5);
```

4. **Function Execution Test:**
```typescript
const { data: kpis, error } = await supabaseAdmin
  .rpc('analytics_kpis', { days_back: 0, tz: 'America/New_York' });
```

5. **Timezone Handling Test:**
```typescript
// Events today (UTC)
const { data: tzTest } = await supabaseAdmin
  .from('analytics_events')
  .select('occurred_at')
  .gte('occurred_at', new Date().toISOString().split('T')[0] + 'T00:00:00Z')
  .limit(1);

// Events today (NY)
const nyDate = new Date()
  .toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const { data: nyTest } = await supabaseAdmin
  .from('analytics_events')
  .select('occurred_at')
  .gte('occurred_at', nyDate + 'T00:00:00-05:00')
  .limit(1);
```

6. **Test Event Generation:**
```typescript
const testEvents = [
  {
    session_id: crypto.randomUUID(),
    anon_id: crypto.randomUUID(),
    event_name: 'page_view',
    event_props: { path: '/debug' },
    occurred_at: new Date().toISOString()
  }
];

await supabase.functions.invoke('track', { body: { events: testEvents } });
```

**Run Command:**
```bash
npm run debug:analytics
```

---

## 9. Data Retention & Cleanup

### 9.1 Retention Policies

**Policy Definition:**

| Data Type | Retention Period | Reason |
|-----------|-----------------|---------|
| Impression Events | 30 days | High volume, low long-term value |
| Other Events | 90 days | Balance storage vs historical analysis |
| Daily Rollups | Indefinite | Pre-aggregated, low storage impact |
| Sessions | 90 days (inferred) | Tied to event retention |

### 9.2 Cleanup Function

File: `/supabase/migrations/20250902184214_navy_math.sql` (lines 566-599)

```sql
CREATE OR REPLACE FUNCTION cleanup_analytics_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  impression_cutoff timestamptz;
  other_cutoff timestamptz;
  deleted_impressions integer;
  deleted_others integer;
BEGIN
  -- Calculate cutoff dates
  impression_cutoff := (now() at time zone 'utc') - interval '30 days';
  other_cutoff := (now() at time zone 'utc') - interval '90 days';

  -- Delete old impression events (30 days)
  DELETE FROM analytics_events
  WHERE event_name = 'listing_impression_batch'
    AND ts < impression_cutoff;

  GET DIAGNOSTICS deleted_impressions = ROW_COUNT;

  -- Delete other old events (90 days)
  DELETE FROM analytics_events
  WHERE event_name != 'listing_impression_batch'
    AND ts < other_cutoff;

  GET DIAGNOSTICS deleted_others = ROW_COUNT;

  RAISE NOTICE 'Cleanup completed: % impression events, % other events deleted',
    deleted_impressions, deleted_others;
END $$;
```

### 9.3 Scheduled Jobs

**Cron Schedule:**

```sql
-- Daily rollup: 06:10 UTC (01:10 AM EST / 02:10 AM EDT)
SELECT cron.schedule(
  'analytics-rollup',
  '10 6 * * *',
  'SELECT public.rollup_analytics_events();'
);

-- Daily cleanup: 06:20 UTC (01:20 AM EST / 02:20 AM EDT)
SELECT cron.schedule(
  'analytics-cleanup',
  '20 6 * * *',
  'SELECT public.cleanup_analytics_events();'
);
```

**Job Timing Rationale:**
- Run during lowest traffic period (early morning US time)
- Rollup before cleanup to preserve aggregates
- 10-minute gap between jobs to prevent conflicts

### 9.4 Rollup Function

File: `/supabase/migrations/20250902184214_navy_math.sql` (lines 118-269)

**Purpose:** Aggregate raw events into daily summary tables for faster queries.

**Target:** Yesterday's data (UTC)

```sql
target_date := (now() at time zone 'utc')::date - interval '1 day';
```

**Aggregations Performed:**

1. **Daily Analytics:**
```sql
INSERT INTO daily_analytics (
  date, dau, visitors, returners, avg_session_minutes,
  listing_views, post_starts, post_submits, post_success, post_abandoned
)
SELECT
  target_date,
  COUNT(DISTINCT CASE WHEN event_name = 'page_view' AND user_id IS NOT NULL THEN user_id END),
  COUNT(DISTINCT session_id),
  COUNT(DISTINCT CASE WHEN event_name = 'page_view' AND user_id IS NOT NULL THEN user_id END),
  session_avg,  -- Calculated with 30-min gap capping
  COUNT(CASE WHEN event_name = 'listing_view' THEN 1 END),
  COUNT(CASE WHEN event_name IN ('listing_post_start', 'post_start') THEN 1 END),
  COUNT(CASE WHEN event_name IN ('listing_post_submit', 'post_submit') THEN 1 END),
  COUNT(CASE WHEN event_name IN (...) THEN 1 END),
  COUNT(CASE WHEN event_name IN (...) THEN 1 END)
FROM analytics_events
WHERE ts::date = target_date;
```

2. **Top Listings:**
```sql
WITH listing_views AS (
  SELECT (props->>'listing_id')::uuid as listing_id, COUNT(*) as views
  FROM analytics_events
  WHERE event_name = 'listing_view' AND ts::date = target_date
  GROUP BY 1
),
listing_impressions AS (
  SELECT listing_id::uuid, COUNT(*) as impressions
  FROM analytics_events ae,
       LATERAL jsonb_array_elements_text(
         COALESCE(ae.props->'listing_ids', ae.props->'ids', '[]'::jsonb)
       ) as listing_id
  WHERE ae.event_name = 'listing_impression_batch' AND ae.ts::date = target_date
  GROUP BY 1
)
INSERT INTO daily_top_listings (date, listing_id, views, impressions, ctr, rank)
SELECT
  target_date,
  listing_id,
  views,
  impressions,
  CASE WHEN impressions > 0
    THEN ROUND((views::numeric / impressions) * 100, 2)
    ELSE 0
  END,
  ROW_NUMBER() OVER (ORDER BY views DESC, impressions DESC)
FROM combined_stats
LIMIT 50;
```

3. **Top Filters:**
```sql
WITH filter_usage AS (
  SELECT
    jsonb_object_keys(props->'filters') as key,
    (props->'filters'->>jsonb_object_keys(props->'filters')) as val,
    COUNT(*) as uses
  FROM analytics_events
  WHERE event_name = 'filter_apply' AND ts::date = target_date
  GROUP BY 1, 2
)
INSERT INTO daily_top_filters (date, filter_key, filter_value, uses, rank)
SELECT
  target_date,
  filter_key,
  filter_value,
  uses,
  ROW_NUMBER() OVER (ORDER BY uses DESC)
FROM filter_usage
LIMIT 50;
```

**Backfill Support:**

The rollup function supports historical backfills:

```sql
-- Backfill last 7 days on migration
FOR i IN 1..7 LOOP
  backfill_date := today_date - i;
  -- ... run rollup for backfill_date
END LOOP;
```

---

## 10. Issues, Gaps & Recommendations

### 10.1 Identified Issues

**1. Timezone Handling Complexity**

**Issue:** Multiple migrations addressing timezone bugs indicate ongoing challenges.

**Migrations:**
- `20251005011538_fix_analytics_timezone_comparison.sql` - Fixed UTC vs NY date comparison
- Earlier migrations had similar timezone issues

**Root Cause:** Mixing UTC storage with timezone-aware queries without consistent conversion.

**Impact:**
- Undercounting events near day boundaries
- Dashboard showing incorrect data for certain times
- Inconsistent reporting across different times of day

**Status:** Fixed in latest migration (20251005)

**Recommendation:**
- Add integration tests for timezone edge cases
- Document timezone handling patterns in code comments
- Consider storing events with timezone included (`timestamptz` already used correctly)

---

**2. Missing Session Management Documentation**

**Issue:** `touch_session` and `close_session` functions referenced but not defined in migrations.

**Evidence:**
- Called in track/index.ts (lines 216, 231)
- Referenced in analytics functions
- No CREATE FUNCTION statement found in migrations

**Possible Causes:**
- Functions created manually in database
- Migration file not committed
- Functions part of Supabase extensions

**Impact:**
- Incomplete system documentation
- Cannot recreate database from migrations alone
- Team uncertainty about session lifecycle

**Recommendation:**
- Create migration to define these functions
- Add function definitions to version control
- Document session lifecycle completely

---

**3. Inconsistent Impression Tracking**

**Issue:** Multiple event formats for impressions cause confusion.

**Formats Found:**
```javascript
// Format 1: listing_ids (current)
{ listing_ids: ["uuid1", "uuid2", "uuid3"] }

// Format 2: ids (legacy)
{ ids: ["uuid1", "uuid2", "uuid3"] }

// Format 3: Single listing_id (incorrect usage)
{ listing_id: "uuid1" }
```

**Migrations Addressing This:**
- `20250902185422_late_prism.sql` - Handles both listing_ids and ids
- `20251019195729_fix_listing_metrics_view_use_event_props.sql`
- `20251019195800_fix_listing_metrics_handle_both_formats.sql`

**Root Cause:** Evolution of tracking implementation without migration plan.

**Impact:**
- Undercounting impressions from legacy format
- Complex queries with multiple COALESCE branches
- Potential data quality issues

**Recommendation:**
- Standardize on single format (listing_ids)
- Add migration to reprocess old events
- Update client tracking code
- Add validation in track function

---

**4. Type Mismatch Issues**

**Issue:** Multiple migrations fixing bigint vs integer type mismatches.

**Affected Migrations:**
- `20250926142809_misty_leaf.sql`
- `20250929235004_pink_bread.sql`
- `20250929235201_misty_fog.sql`
- `20250929235355_turquoise_butterfly.sql`

**Pattern:**
```sql
-- Problem: PostgreSQL COUNT returns bigint
SELECT COUNT(*) FROM table;  -- Returns bigint

-- Solution: Explicit casting
SELECT COUNT(*)::integer FROM table;
```

**Root Cause:** PostgreSQL defaults to bigint for aggregates, TypeScript expects integer.

**Impact:**
- Dashboard errors ("structure of query does not match function result type")
- Multiple iterations to fix all functions
- Technical debt from repeated fixes

**Recommendation:**
- Establish type casting standards in SQL style guide
- Use TypeScript codegen from database schema
- Add CI tests to catch type mismatches

---

**5. Lack of Automated Testing**

**Issue:** Only manual smoke tests exist, no automated test suite.

**Current Testing:**
- `scripts/analytics-smoke.ts` - Manual smoke test
- `scripts/analytics-debug.ts` - Manual debugging script
- No CI/CD integration
- No regression tests

**Impact:**
- Timezone bugs not caught before deployment
- Type mismatches discovered in production
- No confidence in refactoring
- Slow feedback loop

**Recommendation:**
- Implement Jest/Vitest test suite
- Add database function unit tests
- Create E2E tests for critical flows
- Integrate with CI/CD pipeline
- Test timezone edge cases automatically

---

**6. No Authentication at Function Level**

**Issue:** Most analytics RPC functions lack admin checks.

**Example:**
```sql
-- Some functions have this:
IF NOT EXISTS (
  SELECT 1 FROM profiles
  WHERE id = auth.uid() AND is_admin = true
) THEN
  RAISE EXCEPTION 'Access denied';
END IF;

-- Others rely on frontend route protection only
```

**Vulnerability:**
- Direct RPC calls could bypass frontend auth
- API clients could access analytics without admin role
- Security relies on frontend, not backend

**Impact:** Medium security risk

**Recommendation:**
- Add admin check to ALL analytics functions
- Use helper function for consistency:
```sql
CREATE FUNCTION require_admin() RETURNS void AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

**7. Event Queue Memory Concerns**

**Issue:** Unbounded event queue in client could grow large.

**Current Implementation:**
```typescript
const eventQueue: PendingEvent[] = [];  // No size limit

function enqueueEvent(...) {
  eventQueue.push(payload);

  if (eventQueue.length >= FLUSH_BATCH_SIZE) {
    flushEvents();
  }
}
```

**Scenarios:**
- User loses network connection
- Track function returns errors
- Queue grows indefinitely
- Memory leak in long-running sessions

**Impact:**
- Potential browser memory issues
- Lost events if queue too large
- Performance degradation

**Recommendation:**
```typescript
const MAX_QUEUE_SIZE = 200;

function enqueueEvent(...) {
  if (eventQueue.length >= MAX_QUEUE_SIZE) {
    console.warn('[analytics] Queue full, dropping oldest events');
    eventQueue.splice(0, FLUSH_BATCH_SIZE);  // Drop oldest batch
  }

  eventQueue.push(payload);

  if (eventQueue.length >= FLUSH_BATCH_SIZE) {
    flushEvents();
  }
}
```

---

**8. No Data Quality Monitoring**

**Issue:** No alerting or monitoring for data quality issues.

**Missing:**
- Anomaly detection (sudden drops in DAU)
- Data freshness monitoring (is rollup running?)
- Event validation metrics (% rejected events)
- Session quality metrics (% with duration < 1s)
- CTR reasonableness checks (CTR > 100%)

**Impact:**
- Issues discovered late by users
- No proactive problem detection
- Difficult to diagnose issues

**Recommendation:**
- Add monitoring view in dashboard:
```sql
CREATE VIEW analytics_health AS
SELECT
  CURRENT_DATE as check_date,
  COUNT(*) as events_today,
  COUNT(DISTINCT session_id) as sessions_today,
  AVG(EXTRACT(EPOCH FROM (occurred_at - LAG(occurred_at)
    OVER (ORDER BY occurred_at)))) as avg_event_gap_seconds,
  COUNT(*) FILTER (WHERE event_props IS NULL) as null_props_count
FROM analytics_events
WHERE occurred_at >= CURRENT_DATE;
```

- Add alerting for:
  - DAU drops > 50% day-over-day
  - No events received in 1 hour
  - Rollup job failures
  - CTR > 80% (likely tracking bug)

---

### 10.2 Architecture Gaps

**1. No User Journey Mapping**

**Gap:** System tracks individual events but doesn't connect them into journeys.

**Missing Capabilities:**
- Path analysis (common navigation flows)
- Funnel visualization beyond posting
- Drop-off analysis
- Session replay
- Cohort analysis

**Business Value:**
- Understand user behavior patterns
- Identify UX issues
- Optimize conversion funnels
- Personalization opportunities

**Recommendation:**
```sql
-- Add journey tracking
CREATE TABLE user_journeys (
  journey_id uuid PRIMARY KEY,
  anon_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  events jsonb[],  -- Ordered array of events
  outcome text  -- 'converted', 'abandoned', 'ongoing'
);
```

---

**2. No Attribution Tracking**

**Gap:** No source/medium/campaign tracking for marketing analytics.

**Missing Data:**
- Traffic source (organic, paid, referral)
- Campaign identifiers
- UTM parameters
- Conversion attribution

**Business Value:**
- Marketing ROI measurement
- Channel performance comparison
- Budget allocation decisions

**Recommendation:**
```typescript
// Capture on session start
function captureAttribution() {
  const params = new URLSearchParams(window.location.search);
  return {
    source: params.get('utm_source') || document.referrer || 'direct',
    medium: params.get('utm_medium') || 'none',
    campaign: params.get('utm_campaign') || '',
    term: params.get('utm_term') || '',
    content: params.get('utm_content') || ''
  };
}

// Store in session
track('session_start', {
  ...captureAttribution()
});
```

---

**3. No A/B Testing Support**

**Gap:** Cannot run experiments or measure variant performance.

**Missing:**
- Variant assignment
- Exposure tracking
- Statistical significance calculation
- Experiment reporting

**Business Value:**
- Data-driven product decisions
- Risk mitigation
- Continuous improvement

**Recommendation:**
```typescript
// Add experiment context to all events
interface AnalyticsEventPayload {
  // ... existing fields
  experiments?: {
    experiment_id: string;
    variant_id: string;
  }[];
}
```

---

**4. No Real-Time Alerting**

**Gap:** All reporting is batch/daily, no real-time monitoring.

**Missing:**
- Live dashboard
- Real-time alerts
- Streaming analytics
- Operational monitoring

**Business Value:**
- Immediate issue detection
- Faster incident response
- Live campaign monitoring

**Recommendation:**
- Add WebSocket connection for live updates
- Implement server-sent events (SSE)
- Use Supabase Realtime subscriptions:
```typescript
supabase
  .channel('analytics_events')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'analytics_events' },
    (payload) => {
      // Update live dashboard
    }
  )
  .subscribe();
```

---

**5. Limited Performance at Scale**

**Gap:** No sharding, partitioning, or optimization for high volume.

**Current State:**
- Single analytics_events table
- No partitioning by date
- JSONB queries can be slow
- No read replicas

**Scaling Concerns:**
- Table size grows unbounded (until cleanup)
- Query performance degrades with volume
- Daily rollup becomes slower
- Locking issues during cleanup

**Recommendation:**
```sql
-- Partition by month
CREATE TABLE analytics_events (
  -- ... columns
) PARTITION BY RANGE (occurred_at);

CREATE TABLE analytics_events_2025_10
  PARTITION OF analytics_events
  FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

-- Automate partition creation
CREATE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
  partition_date date;
  partition_name text;
BEGIN
  partition_date := date_trunc('month', CURRENT_DATE + interval '1 month');
  partition_name := 'analytics_events_' || to_char(partition_date, 'YYYY_MM');

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF analytics_events
     FOR VALUES FROM (%L) TO (%L)',
    partition_name,
    partition_date,
    partition_date + interval '1 month'
  );
END;
$$ LANGUAGE plpgsql;
```

---

### 10.3 Recommendations Summary

**High Priority:**

1. **Add Missing Function Migrations**
   - Document touch_session and close_session
   - Ensure database can be recreated from migrations
   - **Effort:** 4 hours
   - **Impact:** High (completeness)

2. **Implement Automated Testing**
   - Unit tests for all analytics functions
   - E2E tests for tracking pipeline
   - Timezone edge case coverage
   - **Effort:** 2 weeks
   - **Impact:** High (stability)

3. **Standardize Impression Tracking**
   - Single event format
   - Migrate legacy data
   - Update documentation
   - **Effort:** 1 week
   - **Impact:** Medium (data quality)

4. **Add Admin Checks to All Functions**
   - Create require_admin() helper
   - Apply to all analytics RPCs
   - Test unauthorized access
   - **Effort:** 4 hours
   - **Impact:** Medium (security)

**Medium Priority:**

5. **Implement Data Quality Monitoring**
   - Health check view
   - Anomaly detection
   - Alerting system
   - **Effort:** 1 week
   - **Impact:** Medium (reliability)

6. **Add Event Queue Size Limits**
   - Prevent memory leaks
   - Handle offline scenarios
   - Improve error handling
   - **Effort:** 4 hours
   - **Impact:** Low (edge cases)

7. **Create Performance Documentation**
   - Document all metrics
   - Add calculation examples
   - Create onboarding guide
   - **Effort:** 1 week
   - **Impact:** Medium (usability)

**Low Priority:**

8. **Implement Attribution Tracking**
   - UTM parameter capture
   - Source/medium analysis
   - Campaign ROI reporting
   - **Effort:** 2 weeks
   - **Impact:** High (business value)

9. **Add A/B Testing Support**
   - Experiment framework
   - Variant assignment
   - Statistical analysis
   - **Effort:** 3 weeks
   - **Impact:** High (product development)

10. **Optimize for Scale**
    - Table partitioning
    - Index optimization
    - Query performance tuning
    - **Effort:** 2 weeks
    - **Impact:** Medium (future-proofing)

---

## 11. Conclusion

### 11.1 System Strengths

1. **Comprehensive Tracking:** 15 event types cover user engagement, listing performance, and conversion funnel
2. **Privacy-Compliant:** IP hashing, anonymous tracking, configurable retention
3. **Business-Focused:** Dashboard provides actionable insights for platform growth
4. **Well-Architected:** Three-tier design with clear separation of concerns
5. **Scalable Foundation:** Supabase infrastructure supports growth
6. **Real-Time Capable:** Client-side batching enables near-real-time tracking

### 11.2 Areas for Improvement

1. **Testing:** Lack of automated tests creates stability risks
2. **Documentation:** Missing function definitions and incomplete documentation
3. **Monitoring:** No proactive data quality or system health monitoring
4. **Security:** Inconsistent admin checks across RPC functions
5. **Scalability:** No partitioning or optimization for high-volume scenarios

### 11.3 Overall Assessment

**Maturity Level:** **Developing** (Level 2 of 5)

The Hadirot analytics system demonstrates solid architectural decisions and comprehensive event tracking. The three-tier design is appropriate for the scale, and the use of Supabase provides a strong foundation for growth.

However, the system exhibits characteristics of rapid development without sufficient testing and documentation practices. Multiple migrations fixing the same categories of issues (timezone handling, type mismatches) indicate a need for stronger development processes.

**Key Metrics:**
- **Code Quality:** 7/10 (well-structured but needs tests)
- **Documentation:** 5/10 (missing critical pieces)
- **Reliability:** 6/10 (works but has had production issues)
- **Security:** 7/10 (good practices but gaps exist)
- **Scalability:** 6/10 (adequate now, needs optimization soon)
- **Business Value:** 8/10 (provides actionable insights)

**Overall Score:** **6.5/10**

### 11.4 Next Steps

**Immediate (Next 2 Weeks):**
1. Create missing function migrations
2. Add admin checks to all RPC functions
3. Implement basic smoke test automation
4. Document timezone handling patterns

**Short-Term (Next Quarter):**
1. Build comprehensive test suite
2. Standardize impression tracking format
3. Implement data quality monitoring
4. Create team documentation

**Long-Term (Next 6 Months):**
1. Add attribution tracking
2. Implement A/B testing framework
3. Optimize for scale with partitioning
4. Build real-time monitoring dashboard

---

## Appendix A: Migration History

**Total Migrations:** 70

**Analytics-Specific Migrations:** 19

**Key Milestones:**
- `20250901001838` - Initial analytics_events table
- `20250901003738` - First analytics dashboard RPCs
- `20250902184214` - Daily rollup system
- `20250930174454` - Major analytics system fix
- `20251005011538` - Timezone comparison fix
- `20251019195729` - Listing metrics format handling

**Evolution Pattern:**
1. Initial implementation (Aug 2025)
2. Dashboard RPCs (Sep 2025)
3. Type mismatch fixes (Sep 2025)
4. Timezone fixes (Oct 2025)
5. Impression format fixes (Oct 2025)

---

## Appendix B: Event Catalog

**Complete Event Inventory:**

```typescript
type AnalyticsEventName =
  | 'session_start'              // Session lifecycle
  | 'session_end'
  | 'page_view'                  // Navigation
  | 'listing_view'               // Listing engagement
  | 'listing_impression_batch'
  | 'filter_apply'               // Search & discovery
  | 'search_query'
  | 'agency_page_view'           // Agency features
  | 'agency_filter_apply'
  | 'agency_share'
  | 'post_started'               // Posting funnel
  | 'post_submitted'
  | 'post_success'
  | 'post_abandoned';
```

---

## Appendix C: Database Schema ERD

```
┌─────────────────────┐
│  analytics_events   │
├─────────────────────┤
│ id (PK)            │
│ session_id (FK) ────┼───┐
│ anon_id            │   │
│ user_id (FK)       │   │
│ event_name         │   │
│ event_props (jsonb)│   │
│ occurred_at        │   │
│ ua                 │   │
│ ip_hash            │   │
└────────┬────────────┘   │
         │                │
         │                │
         │    ┌───────────┴─────────┐
         │    │ analytics_sessions  │
         │    ├─────────────────────┤
         │    │ session_id (PK)     │
         └────┤ anon_id             │
              │ user_id (FK)        │
              │ started_at          │
              │ last_seen_at        │
              │ ended_at            │
              │ duration_seconds    │
              └──────────┬──────────┘
                         │
                         │
         ┌───────────────┴────────────────┐
         │                                 │
┌────────┴──────────┐           ┌─────────┴────────┐
│ daily_analytics   │           │ daily_top_       │
├───────────────────┤           │ listings         │
│ date (PK)         │           ├──────────────────┤
│ dau               │           │ date (PK)        │
│ visitors          │           │ listing_id (PK)  │
│ returners         │           │ views            │
│ avg_session_min   │           │ impressions      │
│ listing_views     │           │ ctr              │
│ post_starts       │           │ rank             │
│ post_submits      │           └──────────────────┘
│ post_success      │
│ post_abandoned    │           ┌──────────────────┐
└───────────────────┘           │ daily_top_       │
                                │ filters          │
                                ├──────────────────┤
                                │ date (PK)        │
                                │ filter_key (PK)  │
                                │ filter_value (PK)│
                                │ uses             │
                                │ rank             │
                                └──────────────────┘
```

---

**End of Audit Report**

*For questions or clarifications, please refer to the codebase or contact the development team.*
