@@ .. @@
 CREATE OR REPLACE FUNCTION analytics_summary(days_back INTEGER DEFAULT 1)
 RETURNS TABLE(
   dau INTEGER,
   visitors INTEGER,
   returners INTEGER,
   avg_session_minutes NUMERIC(10,2),
   listing_views INTEGER,
   post_starts INTEGER,
   post_submits INTEGER,
   post_success INTEGER,
   post_abandoned INTEGER
 ) AS $$
-DECLARE
-  start_date DATE;
-  end_date DATE;
 BEGIN
-  -- Calculate date range (America/New_York timezone)
-  SELECT 
-    date(timezone('America/New_York', now())) - (days_back - 1),
-    date(timezone('America/New_York', now()))
-  INTO start_date, end_date;
-  
-  -- Return aggregated analytics data
-  SELECT 
+  RETURN QUERY
+  WITH date_range AS (
+    SELECT 
+      date(timezone('America/New_York', now())) - (days_back - 1) as start_date,
+      date(timezone('America/New_York', now())) as end_date
+  ),
+  events_filtered AS (
+    SELECT DISTINCT
+      e.id,
+      e.session_id,
+      e.user_id,
+      e.event_name,
+      e.ts,
+      e.props
+    FROM analytics_events e
+    CROSS JOIN date_range dr
+    WHERE timezone('America/New_York', e.ts)::date BETWEEN dr.start_date AND dr.end_date
+  ),
+  daily_users AS (
+    SELECT 
+      COUNT(DISTINCT ef.user_id) FILTER (WHERE ef.user_id IS NOT NULL) as dau_count,
+      COUNT(DISTINCT ef.session_id) as visitor_count
+    FROM events_filtered ef
+  ),
+  returning_users AS (
+    SELECT COUNT(DISTINCT ef.session_id) as returner_count
+    FROM events_filtered ef
+    WHERE ef.user_id IS NOT NULL 
+    AND EXISTS (
+      SELECT 1 FROM analytics_events ae 
+      WHERE ae.user_id = ef.user_id 
+      AND timezone('America/New_York', ae.ts)::date < (
+        SELECT start_date FROM date_range
+      )
+    )
+  ),
+  session_durations AS (
+    SELECT 
+      ef.session_id,
+      EXTRACT(EPOCH FROM (MAX(ef.ts) - MIN(ef.ts))) / 60.0 as duration_minutes
+    FROM events_filtered ef
+    GROUP BY ef.session_id
+    HAVING COUNT(*) > 1
+  ),
+  funnel_metrics AS (
+    SELECT
+      COUNT(DISTINCT ef.session_id) FILTER (WHERE ef.event_name = 'listing_view') as listing_view_count,
+      COUNT(DISTINCT ef.session_id) FILTER (WHERE ef.event_name = 'listing_post_start') as post_start_count,
+      COUNT(DISTINCT ef.session_id) FILTER (WHERE ef.event_name = 'listing_post_submit') as post_submit_count,
+      COUNT(DISTINCT ef.session_id) FILTER (WHERE ef.event_name = 'listing_post_success') as post_success_count,
+      COUNT(DISTINCT ef.session_id) FILTER (WHERE ef.event_name = 'listing_post_abandoned') as post_abandoned_count
+    FROM events_filtered ef
+  )
+  SELECT 
     COALESCE(du.dau_count, 0)::INTEGER,
     COALESCE(du.visitor_count, 0)::INTEGER,
     COALESCE(ru.returner_count, 0)::INTEGER,
     COALESCE(AVG(sd.duration_minutes), 0)::NUMERIC(10,2),
     COALESCE(fm.listing_view_count, 0)::INTEGER,
     COALESCE(fm.post_start_count, 0)::INTEGER,
     COALESCE(fm.post_submit_count, 0)::INTEGER,
     COALESCE(fm.post_success_count, 0)::INTEGER,
     COALESCE(fm.post_abandoned_count, 0)::INTEGER
-  FROM (
-    WITH events_today AS (
-      SELECT DISTINCT
-        e.id,
-        e.session_id,
-        e.user_id,
-        e.event_name,
-        e.ts,
-        e.props
-      FROM analytics_events e
-      WHERE timezone('America/New_York', e.ts)::date BETWEEN start_date AND end_date
-    ),
-    daily_users AS (
-      SELECT 
-        COUNT(DISTINCT et.user_id) FILTER (WHERE et.user_id IS NOT NULL) as dau_count,
-        COUNT(DISTINCT et.session_id) as visitor_count
-      FROM events_today et
-    ),
-    returning_users AS (
-      SELECT COUNT(DISTINCT et.session_id) as returner_count
-      FROM events_today et
-      WHERE et.user_id IS NOT NULL 
-      AND EXISTS (
-        SELECT 1 FROM analytics_events ae 
-        WHERE ae.user_id = et.user_id 
-        AND timezone('America/New_York', ae.ts)::date < start_date
-      )
-    ),
-    session_durations AS (
-      SELECT 
-        et.session_id,
-        EXTRACT(EPOCH FROM (MAX(et.ts) - MIN(et.ts))) / 60.0 as duration_minutes
-      FROM events_today et
-      GROUP BY et.session_id
-      HAVING COUNT(*) > 1
-    ),
-    funnel_metrics AS (
-      SELECT
-        COUNT(DISTINCT et.session_id) FILTER (WHERE et.event_name = 'listing_view') as listing_view_count,
-        COUNT(DISTINCT et.session_id) FILTER (WHERE et.event_name = 'listing_post_start') as post_start_count,
-        COUNT(DISTINCT et.session_id) FILTER (WHERE et.event_name = 'listing_post_submit') as post_submit_count,
-        COUNT(DISTINCT et.session_id) FILTER (WHERE et.event_name = 'listing_post_success') as post_success_count,
-        COUNT(DISTINCT et.session_id) FILTER (WHERE et.event_name = 'listing_post_abandoned') as post_abandoned_count
-      FROM events_today et
-    )
-    SELECT 
-      COALESCE(du.dau_count, 0)::INTEGER,
-      COALESCE(du.visitor_count, 0)::INTEGER,
-      COALESCE(ru.returner_count, 0)::INTEGER,
-      COALESCE(AVG(sd.duration_minutes), 0)::NUMERIC(10,2),
-      COALESCE(fm.listing_view_count, 0)::INTEGER,
-      COALESCE(fm.post_start_count, 0)::INTEGER,
-      COALESCE(fm.post_submit_count, 0)::INTEGER,
-      COALESCE(fm.post_success_count, 0)::INTEGER,
-      COALESCE(fm.post_abandoned_count, 0)::INTEGER
-    FROM daily_users du
-    CROSS JOIN returning_users ru
-    CROSS JOIN funnel_metrics fm
-    LEFT JOIN session_durations sd ON true
-    GROUP BY du.dau_count, du.visitor_count, ru.returner_count, 
-             fm.listing_view_count, fm.post_start_count, fm.post_submit_count, 
-             fm.post_success_count, fm.post_abandoned_count
-  ) analytics_data;
+  FROM daily_users du
+  CROSS JOIN returning_users ru
+  CROSS JOIN funnel_metrics fm
+  LEFT JOIN session_durations sd ON true
+  GROUP BY du.dau_count, du.visitor_count, ru.returner_count, 
+           fm.listing_view_count, fm.post_start_count, fm.post_submit_count, 
+           fm.post_success_count, fm.post_abandoned_count;
 END;
 $$ LANGUAGE plpgsql;