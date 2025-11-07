CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('daily-admin-digest-email');
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

CREATE OR REPLACE FUNCTION trigger_daily_digest_if_time()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  config_time time;
  config_enabled boolean;
  current_hour integer;
  config_hour integer;
  supabase_url text;
  service_key text;
BEGIN
  SELECT delivery_time, enabled INTO config_time, config_enabled
  FROM daily_admin_digest_config LIMIT 1;

  IF NOT config_enabled THEN RETURN; END IF;

  current_hour := EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/New_York'));
  config_hour := EXTRACT(HOUR FROM config_time);

  IF current_hour = config_hour THEN
    supabase_url := current_setting('SUPABASE_URL', true);
    service_key := current_setting('SUPABASE_SERVICE_ROLE_KEY', true);

    IF supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/send-daily-admin-digest',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || service_key),
        body := '{}'::jsonb
      );
    END IF;
  END IF;
END;
$$;

SELECT cron.schedule('daily-admin-digest-email', '0 * * * *', 'SELECT trigger_daily_digest_if_time();');