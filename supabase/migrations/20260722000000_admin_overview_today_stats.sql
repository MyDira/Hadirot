/*
  # Admin overview "today" stats (M11)

  Powers the admin dashboard's Overview tab: unique visitors today, inquiries
  generated today (phone reveals + contact form submissions, residential +
  commercial), and new listings created today broken out by
  residential/commercial x rental/sale.

  One RPC, one round trip — mirrors the day-boundary + admin-gating pattern
  used throughout analytics_session_quality / analytics_inquiry_overview_dual
  (see 20260417050000 and 20260316182004), just narrowed to a single day and
  the four listing buckets the Overview card needs.
*/

CREATE OR REPLACE FUNCTION admin_overview_today_stats(
  tz text DEFAULT 'America/New_York'
)
RETURNS TABLE (
  unique_visitors_today integer,
  inquiries_today integer,
  new_residential_rentals integer,
  new_residential_sales integer,
  new_commercial_rentals integer,
  new_commercial_sales integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts timestamptz;
  end_ts timestamptz;
BEGIN
  PERFORM require_admin();

  end_ts := timezone(tz, (timezone(tz, now())::date + 1)::timestamp);
  start_ts := end_ts - interval '1 day';

  RETURN QUERY
  SELECT
    (SELECT COUNT(DISTINCT ae.anon_id)
     FROM analytics_events ae
     WHERE COALESCE(ae.occurred_at, ae.ts) >= start_ts
       AND COALESCE(ae.occurred_at, ae.ts) < end_ts)::integer,

    (
      (SELECT COUNT(*) FROM analytics_events ae
       WHERE ae.event_name = 'phone_reveal'
         AND COALESCE(ae.occurred_at, ae.ts) >= start_ts
         AND COALESCE(ae.occurred_at, ae.ts) < end_ts
         AND COALESCE(ae.event_props->>'listing_id', ae.props->>'listing_id') IS NOT NULL)
      +
      (SELECT COUNT(*) FROM listing_contact_submissions lcs
       WHERE lcs.created_at >= start_ts AND lcs.created_at < end_ts)
    )::integer,

    (SELECT COUNT(*) FROM listings l
     WHERE l.created_at >= start_ts AND l.created_at < end_ts
       AND l.listing_type = 'rental')::integer,

    (SELECT COUNT(*) FROM listings l
     WHERE l.created_at >= start_ts AND l.created_at < end_ts
       AND l.listing_type = 'sale')::integer,

    (SELECT COUNT(*) FROM commercial_listings cl
     WHERE cl.created_at >= start_ts AND cl.created_at < end_ts
       AND cl.listing_type = 'rental')::integer,

    (SELECT COUNT(*) FROM commercial_listings cl
     WHERE cl.created_at >= start_ts AND cl.created_at < end_ts
       AND cl.listing_type = 'sale')::integer;
END;
$$;

GRANT EXECUTE ON FUNCTION admin_overview_today_stats(text) TO authenticated;
