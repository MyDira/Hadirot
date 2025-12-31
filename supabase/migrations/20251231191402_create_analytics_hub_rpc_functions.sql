/*
  # Analytics Hub RPC Functions
  
  ## Overview
  This migration creates 11 new RPC functions to support the Analytics Hub reorganization,
  providing comprehensive traffic, engagement, listings, and inquiry analytics.
  
  ## New Functions
  
  ### Traffic & Session Quality
  - `analytics_session_quality`: Returns pages per session, bounce rate, avg duration
  
  ### Engagement
  - `analytics_engagement_funnel`: Session to contact conversion funnel
  
  ### Listings / Supply
  - `analytics_supply_stats`: New listings trend, active/inactive counts
  - `analytics_listings_performance`: Detailed listing metrics with views, inquiries, phone clicks
  - `analytics_zero_inquiry_listings`: Listings with views but no contact submissions
  
  ### Inquiries / Demand
  - `analytics_inquiry_quality`: Total inquiries, unique phones, repeat rate
  - `analytics_inquiry_trend`: Daily inquiry and phone click counts
  - `analytics_inquiry_velocity`: Time-to-first-inquiry distribution
  - `analytics_top_inquired_listings`: Top listings by inquiry count
  - `analytics_inquiry_demand`: Breakdown by price, bedrooms, neighborhood
  - `analytics_inquiry_timing`: Day/hour heatmap data
  - `analytics_abuse_signals`: Detect high-frequency inquirers
  
  ## Security
  - All functions use SECURITY DEFINER with search_path = public
  - Admin-only access enforced via frontend auth checks
*/

-- 1. Session Quality Metrics
CREATE OR REPLACE FUNCTION analytics_session_quality(
  days_back integer DEFAULT 7,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  pages_per_session numeric,
  bounce_rate numeric,
  avg_duration_minutes numeric,
  total_sessions integer,
  returning_visitor_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';
  
  RETURN QUERY
  WITH session_stats AS (
    SELECT 
      s.id as session_id,
      s.anon_id,
      s.started_at,
      s.duration_seconds,
      COUNT(e.id) as page_count
    FROM analytics_sessions s
    LEFT JOIN analytics_events e ON e.session_id = s.id AND e.event_name = 'page_view'
    WHERE (s.started_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    GROUP BY s.id, s.anon_id, s.started_at, s.duration_seconds
  ),
  visitor_history AS (
    SELECT 
      anon_id,
      COUNT(*) as visit_count
    FROM analytics_sessions
    WHERE (started_at AT TIME ZONE tz)::date <= end_date
    GROUP BY anon_id
  )
  SELECT 
    ROUND(COALESCE(AVG(ss.page_count), 0), 2)::numeric as pages_per_session,
    ROUND(COALESCE(
      (COUNT(CASE WHEN ss.page_count <= 1 THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100,
      0
    ), 1)::numeric as bounce_rate,
    ROUND(COALESCE(AVG(ss.duration_seconds) / 60.0, 0), 1)::numeric as avg_duration_minutes,
    COUNT(*)::integer as total_sessions,
    ROUND(COALESCE(
      (COUNT(CASE WHEN vh.visit_count > 1 THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100,
      0
    ), 1)::numeric as returning_visitor_rate
  FROM session_stats ss
  LEFT JOIN visitor_history vh ON vh.anon_id = ss.anon_id;
END;
$$;

-- 2. Engagement Funnel
CREATE OR REPLACE FUNCTION analytics_engagement_funnel(
  days_back integer DEFAULT 7,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  sessions integer,
  impressions integer,
  listing_views integer,
  contact_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';
  
  RETURN QUERY
  SELECT 
    COALESCE((
      SELECT COUNT(DISTINCT id)::integer
      FROM analytics_sessions
      WHERE (started_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    ), 0) as sessions,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events
      WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
        AND event_name = 'listing_impression_batch'
    ), 0) as impressions,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM analytics_events
      WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
        AND event_name = 'listing_view'
    ), 0) as listing_views,
    
    COALESCE((
      SELECT COUNT(*)::integer
      FROM listing_contact_submissions
      WHERE (created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    ), 0) as contact_attempts;
END;
$$;

-- 3. Supply Stats
CREATE OR REPLACE FUNCTION analytics_supply_stats(
  days_back integer DEFAULT 7,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  new_listings_by_day jsonb,
  active_count integer,
  inactive_count integer,
  total_new_listings integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';
  
  RETURN QUERY
  WITH daily_new AS (
    SELECT 
      (created_at AT TIME ZONE tz)::date as day_date,
      COUNT(*)::integer as count
    FROM listings
    WHERE (created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    GROUP BY (created_at AT TIME ZONE tz)::date
    ORDER BY day_date
  )
  SELECT 
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('date', day_date, 'count', count) ORDER BY day_date)
       FROM daily_new),
      '[]'::jsonb
    ) as new_listings_by_day,
    
    COALESCE((
      SELECT COUNT(*)::integer FROM listings WHERE is_active = true
    ), 0) as active_count,
    
    COALESCE((
      SELECT COUNT(*)::integer FROM listings WHERE is_active = false
    ), 0) as inactive_count,
    
    COALESCE((
      SELECT COUNT(*)::integer FROM listings
      WHERE (created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    ), 0) as total_new_listings;
END;
$$;

-- 4. Listings Performance (extended with phone clicks and inquiries)
CREATE OR REPLACE FUNCTION analytics_listings_performance(
  days_back integer DEFAULT 7,
  limit_count integer DEFAULT 20,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id uuid,
  title text,
  location text,
  neighborhood text,
  bedrooms integer,
  price integer,
  views integer,
  impressions integer,
  ctr numeric,
  inquiry_count integer,
  phone_click_count integer,
  hours_to_first_inquiry numeric,
  is_featured boolean,
  posted_by text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';
  
  RETURN QUERY
  WITH listing_views AS (
    SELECT 
      (event_props->>'listing_id')::uuid as lid,
      COUNT(*)::integer as view_count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'listing_view'
      AND event_props->>'listing_id' IS NOT NULL
    GROUP BY (event_props->>'listing_id')::uuid
  ),
  listing_impressions AS (
    SELECT 
      unnest(
        ARRAY(SELECT jsonb_array_elements_text(event_props->'listing_ids'))
      )::uuid as lid,
      1 as imp_count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'listing_impression_batch'
      AND event_props->'listing_ids' IS NOT NULL
  ),
  impression_totals AS (
    SELECT lid, SUM(imp_count)::integer as impression_count
    FROM listing_impressions
    GROUP BY lid
  ),
  listing_phone_clicks AS (
    SELECT 
      (event_props->>'listing_id')::uuid as lid,
      COUNT(*)::integer as click_count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'phone_click'
      AND event_props->>'listing_id' IS NOT NULL
    GROUP BY (event_props->>'listing_id')::uuid
  ),
  listing_inquiries AS (
    SELECT 
      listing_id as lid,
      COUNT(*)::integer as inq_count,
      MIN(created_at) as first_inquiry
    FROM listing_contact_submissions
    WHERE (created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    GROUP BY listing_id
  )
  SELECT 
    l.id as listing_id,
    l.title,
    l.location,
    l.neighborhood,
    l.bedrooms,
    l.price::integer,
    COALESCE(lv.view_count, 0) as views,
    COALESCE(it.impression_count, 0) as impressions,
    CASE 
      WHEN COALESCE(it.impression_count, 0) > 0 
      THEN ROUND((COALESCE(lv.view_count, 0)::numeric / it.impression_count) * 100, 2)
      ELSE 0 
    END as ctr,
    COALESCE(li.inq_count, 0) as inquiry_count,
    COALESCE(lpc.click_count, 0) as phone_click_count,
    CASE 
      WHEN li.first_inquiry IS NOT NULL 
      THEN ROUND(EXTRACT(EPOCH FROM (li.first_inquiry - l.created_at)) / 3600, 1)
      ELSE NULL 
    END as hours_to_first_inquiry,
    l.is_featured,
    COALESCE(p.full_name, 'Unknown') as posted_by,
    l.created_at
  FROM listings l
  LEFT JOIN listing_views lv ON lv.lid = l.id
  LEFT JOIN impression_totals it ON it.lid = l.id
  LEFT JOIN listing_phone_clicks lpc ON lpc.lid = l.id
  LEFT JOIN listing_inquiries li ON li.lid = l.id
  LEFT JOIN profiles p ON p.id = l.owner_id
  WHERE l.is_active = true
  ORDER BY COALESCE(lv.view_count, 0) DESC, COALESCE(li.inq_count, 0) DESC
  LIMIT limit_count;
END;
$$;

-- 5. Zero Inquiry Listings
CREATE OR REPLACE FUNCTION analytics_zero_inquiry_listings(
  days_back integer DEFAULT 7,
  min_views integer DEFAULT 10,
  limit_count integer DEFAULT 20,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id uuid,
  title text,
  location text,
  neighborhood text,
  bedrooms integer,
  price integer,
  views integer,
  days_since_posted integer,
  is_featured boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';
  
  RETURN QUERY
  WITH listing_views AS (
    SELECT 
      (event_props->>'listing_id')::uuid as lid,
      COUNT(*)::integer as view_count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'listing_view'
      AND event_props->>'listing_id' IS NOT NULL
    GROUP BY (event_props->>'listing_id')::uuid
    HAVING COUNT(*) >= min_views
  ),
  listing_inquiries AS (
    SELECT DISTINCT listing_id as lid
    FROM listing_contact_submissions
    WHERE (created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
  )
  SELECT 
    l.id as listing_id,
    l.title,
    l.location,
    l.neighborhood,
    l.bedrooms,
    l.price::integer,
    lv.view_count as views,
    (end_date - l.created_at::date)::integer as days_since_posted,
    l.is_featured
  FROM listings l
  INNER JOIN listing_views lv ON lv.lid = l.id
  LEFT JOIN listing_inquiries li ON li.lid = l.id
  WHERE li.lid IS NULL
    AND l.is_active = true
  ORDER BY lv.view_count DESC
  LIMIT limit_count;
END;
$$;

-- 6. Inquiry Quality Metrics
CREATE OR REPLACE FUNCTION analytics_inquiry_quality(
  days_back integer DEFAULT 7,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  total_inquiries integer,
  unique_phones integer,
  repeat_rate numeric,
  avg_listings_per_inquirer numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';
  
  RETURN QUERY
  WITH inquiry_stats AS (
    SELECT 
      phone,
      COUNT(*) as inquiry_count,
      COUNT(DISTINCT listing_id) as listings_contacted
    FROM listing_contact_submissions
    WHERE (created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    GROUP BY phone
  )
  SELECT 
    COALESCE(SUM(inquiry_count), 0)::integer as total_inquiries,
    COUNT(*)::integer as unique_phones,
    ROUND(COALESCE(
      (COUNT(CASE WHEN inquiry_count > 1 THEN 1 END)::numeric / NULLIF(COUNT(*), 0)) * 100,
      0
    ), 1)::numeric as repeat_rate,
    ROUND(COALESCE(AVG(listings_contacted), 0), 2)::numeric as avg_listings_per_inquirer
  FROM inquiry_stats;
END;
$$;

-- 7. Inquiry Trend (daily counts)
CREATE OR REPLACE FUNCTION analytics_inquiry_trend(
  days_back integer DEFAULT 7,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  date date,
  inquiry_count integer,
  phone_click_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';
  
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(start_date, end_date, '1 day'::interval)::date as day_date
  ),
  daily_inquiries AS (
    SELECT 
      (created_at AT TIME ZONE tz)::date as day_date,
      COUNT(*)::integer as count
    FROM listing_contact_submissions
    WHERE (created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    GROUP BY (created_at AT TIME ZONE tz)::date
  ),
  daily_phone_clicks AS (
    SELECT 
      (occurred_at AT TIME ZONE tz)::date as day_date,
      COUNT(*)::integer as count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'phone_click'
    GROUP BY (occurred_at AT TIME ZONE tz)::date
  )
  SELECT 
    ds.day_date as date,
    COALESCE(di.count, 0) as inquiry_count,
    COALESCE(dpc.count, 0) as phone_click_count
  FROM date_series ds
  LEFT JOIN daily_inquiries di ON di.day_date = ds.day_date
  LEFT JOIN daily_phone_clicks dpc ON dpc.day_date = ds.day_date
  ORDER BY ds.day_date;
END;
$$;

-- 8. Inquiry Velocity (time to first inquiry distribution)
CREATE OR REPLACE FUNCTION analytics_inquiry_velocity(
  days_back integer DEFAULT 7,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  bucket text,
  count integer,
  percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
  total_count integer;
BEGIN
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';
  
  WITH first_inquiries AS (
    SELECT 
      lcs.listing_id,
      MIN(lcs.created_at) as first_inquiry_at,
      l.created_at as listing_created_at,
      EXTRACT(EPOCH FROM (MIN(lcs.created_at) - l.created_at)) / 3600 as hours_to_inquiry
    FROM listing_contact_submissions lcs
    INNER JOIN listings l ON l.id = lcs.listing_id
    WHERE (lcs.created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    GROUP BY lcs.listing_id, l.created_at
  ),
  bucketed AS (
    SELECT 
      CASE 
        WHEN hours_to_inquiry < 24 THEN 'Under 24 hours'
        WHEN hours_to_inquiry < 72 THEN '1-3 days'
        WHEN hours_to_inquiry < 168 THEN '3-7 days'
        ELSE 'Over 7 days'
      END as bucket,
      CASE 
        WHEN hours_to_inquiry < 24 THEN 1
        WHEN hours_to_inquiry < 72 THEN 2
        WHEN hours_to_inquiry < 168 THEN 3
        ELSE 4
      END as sort_order
    FROM first_inquiries
  )
  SELECT INTO total_count COUNT(*)::integer FROM bucketed;
  
  RETURN QUERY
  WITH first_inquiries AS (
    SELECT 
      lcs.listing_id,
      MIN(lcs.created_at) as first_inquiry_at,
      l.created_at as listing_created_at,
      EXTRACT(EPOCH FROM (MIN(lcs.created_at) - l.created_at)) / 3600 as hours_to_inquiry
    FROM listing_contact_submissions lcs
    INNER JOIN listings l ON l.id = lcs.listing_id
    WHERE (lcs.created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    GROUP BY lcs.listing_id, l.created_at
  ),
  bucketed AS (
    SELECT 
      CASE 
        WHEN hours_to_inquiry < 24 THEN 'Under 24 hours'
        WHEN hours_to_inquiry < 72 THEN '1-3 days'
        WHEN hours_to_inquiry < 168 THEN '3-7 days'
        ELSE 'Over 7 days'
      END as bucket,
      CASE 
        WHEN hours_to_inquiry < 24 THEN 1
        WHEN hours_to_inquiry < 72 THEN 2
        WHEN hours_to_inquiry < 168 THEN 3
        ELSE 4
      END as sort_order
    FROM first_inquiries
  )
  SELECT 
    b.bucket,
    COUNT(*)::integer as count,
    ROUND((COUNT(*)::numeric / NULLIF(total_count, 0)) * 100, 1)::numeric as percentage
  FROM bucketed b
  GROUP BY b.bucket, b.sort_order
  ORDER BY b.sort_order;
END;
$$;

-- 9. Top Inquired Listings
CREATE OR REPLACE FUNCTION analytics_top_inquired_listings(
  days_back integer DEFAULT 7,
  limit_count integer DEFAULT 10,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id uuid,
  title text,
  location text,
  neighborhood text,
  bedrooms integer,
  price integer,
  inquiry_count integer,
  is_featured boolean,
  posted_by text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';
  
  RETURN QUERY
  WITH listing_inquiries AS (
    SELECT 
      listing_id as lid,
      COUNT(*)::integer as inq_count
    FROM listing_contact_submissions
    WHERE (created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    GROUP BY listing_id
    ORDER BY COUNT(*) DESC
    LIMIT limit_count
  )
  SELECT 
    l.id as listing_id,
    l.title,
    l.location,
    l.neighborhood,
    l.bedrooms,
    l.price::integer,
    li.inq_count as inquiry_count,
    l.is_featured,
    COALESCE(p.full_name, 'Unknown') as posted_by
  FROM listing_inquiries li
  INNER JOIN listings l ON l.id = li.lid
  LEFT JOIN profiles p ON p.id = l.owner_id
  ORDER BY li.inq_count DESC;
END;
$$;

-- 10. Inquiry Demand Breakdown
CREATE OR REPLACE FUNCTION analytics_inquiry_demand(
  days_back integer DEFAULT 7,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  by_price_band jsonb,
  by_bedrooms jsonb,
  by_neighborhood jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';
  
  RETURN QUERY
  WITH inquiry_listings AS (
    SELECT 
      lcs.id,
      l.price,
      l.bedrooms,
      l.neighborhood
    FROM listing_contact_submissions lcs
    INNER JOIN listings l ON l.id = lcs.listing_id
    WHERE (lcs.created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
  ),
  price_bands AS (
    SELECT 
      CASE 
        WHEN price IS NULL THEN 'Call for Price'
        WHEN price < 2000 THEN 'Under $2,000'
        WHEN price < 3000 THEN '$2,000-$3,000'
        WHEN price < 4000 THEN '$3,000-$4,000'
        ELSE '$4,000+'
      END as band,
      CASE 
        WHEN price IS NULL THEN 5
        WHEN price < 2000 THEN 1
        WHEN price < 3000 THEN 2
        WHEN price < 4000 THEN 3
        ELSE 4
      END as sort_order,
      COUNT(*)::integer as count
    FROM inquiry_listings
    GROUP BY 
      CASE 
        WHEN price IS NULL THEN 'Call for Price'
        WHEN price < 2000 THEN 'Under $2,000'
        WHEN price < 3000 THEN '$2,000-$3,000'
        WHEN price < 4000 THEN '$3,000-$4,000'
        ELSE '$4,000+'
      END,
      CASE 
        WHEN price IS NULL THEN 5
        WHEN price < 2000 THEN 1
        WHEN price < 3000 THEN 2
        WHEN price < 4000 THEN 3
        ELSE 4
      END
    ORDER BY sort_order
  ),
  bedroom_counts AS (
    SELECT 
      CASE 
        WHEN bedrooms = 0 THEN 'Studio'
        WHEN bedrooms = 1 THEN '1 BR'
        WHEN bedrooms = 2 THEN '2 BR'
        WHEN bedrooms = 3 THEN '3 BR'
        ELSE '4+ BR'
      END as label,
      bedrooms as sort_order,
      COUNT(*)::integer as count
    FROM inquiry_listings
    GROUP BY 
      CASE 
        WHEN bedrooms = 0 THEN 'Studio'
        WHEN bedrooms = 1 THEN '1 BR'
        WHEN bedrooms = 2 THEN '2 BR'
        WHEN bedrooms = 3 THEN '3 BR'
        ELSE '4+ BR'
      END,
      bedrooms
    ORDER BY bedrooms
  ),
  neighborhood_counts AS (
    SELECT 
      COALESCE(neighborhood, 'Unknown') as label,
      COUNT(*)::integer as count
    FROM inquiry_listings
    GROUP BY neighborhood
    ORDER BY COUNT(*) DESC
    LIMIT 5
  )
  SELECT 
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('label', band, 'count', count) ORDER BY sort_order) FROM price_bands),
      '[]'::jsonb
    ) as by_price_band,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count) ORDER BY sort_order) FROM bedroom_counts),
      '[]'::jsonb
    ) as by_bedrooms,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('label', label, 'count', count)) FROM neighborhood_counts),
      '[]'::jsonb
    ) as by_neighborhood;
END;
$$;

-- 11. Inquiry Timing Heatmap
CREATE OR REPLACE FUNCTION analytics_inquiry_timing(
  days_back integer DEFAULT 7,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  day_of_week integer,
  hour_of_day integer,
  count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';
  
  RETURN QUERY
  SELECT 
    EXTRACT(DOW FROM (created_at AT TIME ZONE tz))::integer as day_of_week,
    EXTRACT(HOUR FROM (created_at AT TIME ZONE tz))::integer as hour_of_day,
    COUNT(*)::integer as count
  FROM listing_contact_submissions
  WHERE (created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
  GROUP BY 
    EXTRACT(DOW FROM (created_at AT TIME ZONE tz)),
    EXTRACT(HOUR FROM (created_at AT TIME ZONE tz))
  ORDER BY day_of_week, hour_of_day;
END;
$$;

-- 12. Abuse Signals Detection
CREATE OR REPLACE FUNCTION analytics_abuse_signals(
  days_back integer DEFAULT 7,
  mild_threshold integer DEFAULT 6,
  extreme_threshold integer DEFAULT 15,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  phone_masked text,
  inquiry_count integer,
  severity text,
  first_inquiry timestamptz,
  last_inquiry timestamptz,
  listings_contacted integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';
  
  RETURN QUERY
  WITH phone_activity AS (
    SELECT 
      phone,
      COUNT(*) as inq_count,
      COUNT(DISTINCT listing_id) as listings_count,
      MIN(created_at) as first_inq,
      MAX(created_at) as last_inq
    FROM listing_contact_submissions
    WHERE (created_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
    GROUP BY phone
    HAVING COUNT(*) >= mild_threshold
  )
  SELECT 
    CONCAT('***-***-', RIGHT(pa.phone, 4)) as phone_masked,
    pa.inq_count::integer as inquiry_count,
    CASE 
      WHEN pa.inq_count >= extreme_threshold THEN 'extreme'
      ELSE 'mild'
    END as severity,
    pa.first_inq as first_inquiry,
    pa.last_inq as last_inquiry,
    pa.listings_count::integer as listings_contacted
  FROM phone_activity pa
  ORDER BY pa.inq_count DESC;
END;
$$;

-- 13. Listing Drilldown Details (for the drawer)
CREATE OR REPLACE FUNCTION analytics_listing_drilldown(
  p_listing_id uuid,
  days_back integer DEFAULT 14,
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  listing_id uuid,
  title text,
  location text,
  neighborhood text,
  bedrooms integer,
  price integer,
  is_featured boolean,
  created_at timestamptz,
  views integer,
  impressions integer,
  ctr numeric,
  phone_clicks integer,
  inquiry_count integer,
  hours_to_first_inquiry numeric,
  views_by_day jsonb,
  inquiries jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_date date;
  end_date date;
BEGIN
  end_date := (now() AT TIME ZONE tz)::date;
  start_date := end_date - (days_back - 1) * interval '1 day';
  
  RETURN QUERY
  WITH daily_views AS (
    SELECT 
      (occurred_at AT TIME ZONE tz)::date as day_date,
      COUNT(*)::integer as view_count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'listing_view'
      AND (event_props->>'listing_id')::uuid = p_listing_id
    GROUP BY (occurred_at AT TIME ZONE tz)::date
  ),
  date_series AS (
    SELECT generate_series(start_date, end_date, '1 day'::interval)::date as day_date
  ),
  views_filled AS (
    SELECT 
      ds.day_date,
      COALESCE(dv.view_count, 0) as view_count
    FROM date_series ds
    LEFT JOIN daily_views dv ON dv.day_date = ds.day_date
    ORDER BY ds.day_date
  ),
  total_views AS (
    SELECT COUNT(*)::integer as count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'listing_view'
      AND (event_props->>'listing_id')::uuid = p_listing_id
  ),
  total_impressions AS (
    SELECT COUNT(*)::integer as count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'listing_impression_batch'
      AND event_props->'listing_ids' ? p_listing_id::text
  ),
  total_phone_clicks AS (
    SELECT COUNT(*)::integer as count
    FROM analytics_events
    WHERE (occurred_at AT TIME ZONE tz)::date BETWEEN start_date AND end_date
      AND event_name = 'phone_click'
      AND (event_props->>'listing_id')::uuid = p_listing_id
  ),
  inquiry_details AS (
    SELECT 
      lcs.id,
      lcs.name,
      lcs.phone,
      lcs.created_at
    FROM listing_contact_submissions lcs
    WHERE lcs.listing_id = p_listing_id
    ORDER BY lcs.created_at DESC
    LIMIT 50
  ),
  first_inquiry AS (
    SELECT MIN(created_at) as first_inq
    FROM listing_contact_submissions
    WHERE listing_id = p_listing_id
  )
  SELECT 
    l.id as listing_id,
    l.title,
    l.location,
    l.neighborhood,
    l.bedrooms,
    l.price::integer,
    l.is_featured,
    l.created_at,
    (SELECT count FROM total_views) as views,
    (SELECT count FROM total_impressions) as impressions,
    CASE 
      WHEN (SELECT count FROM total_impressions) > 0 
      THEN ROUND(((SELECT count FROM total_views)::numeric / (SELECT count FROM total_impressions)) * 100, 2)
      ELSE 0 
    END as ctr,
    (SELECT count FROM total_phone_clicks) as phone_clicks,
    (SELECT COUNT(*)::integer FROM inquiry_details) as inquiry_count,
    CASE 
      WHEN (SELECT first_inq FROM first_inquiry) IS NOT NULL 
      THEN ROUND(EXTRACT(EPOCH FROM ((SELECT first_inq FROM first_inquiry) - l.created_at)) / 3600, 1)
      ELSE NULL 
    END as hours_to_first_inquiry,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('date', day_date, 'views', view_count) ORDER BY day_date) FROM views_filled),
      '[]'::jsonb
    ) as views_by_day,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'phone', phone, 'created_at', created_at) ORDER BY created_at DESC) FROM inquiry_details),
      '[]'::jsonb
    ) as inquiries
  FROM listings l
  WHERE l.id = p_listing_id;
END;
$$;