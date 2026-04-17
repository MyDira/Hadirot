/*
  # Cache for geocode-cross-streets edge function

  ## Purpose
  The geocode-cross-streets edge function makes up to ~15 Mapbox API calls per
  invocation (variations × location suffixes + fuzzy fallbacks + reverse
  geocode). The same cross-street input gets re-geocoded from scratch every
  time. This table is a simple text-keyed cache keyed on the normalized input
  so repeat lookups return instantly.

  ## Schema
  - cache_key: lowercased, trimmed "crossStreets|neighborhood" string
  - result: full GeocodeResult JSON
  - hit_count: metric for observability
  - expires_at: 90-day TTL; stale rows can be periodically cleaned

  ## Security
  RLS enabled. No one but service_role can read or write. The edge function
  uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS.
*/

CREATE TABLE IF NOT EXISTS public.geocode_cache (
  cache_key text PRIMARY KEY,
  input_cross_streets text NOT NULL,
  input_neighborhood text,
  result jsonb NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

CREATE INDEX IF NOT EXISTS idx_geocode_cache_expires_at
  ON public.geocode_cache(expires_at);

ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.geocode_cache IS
  'Cache for geocode-cross-streets edge function. Service role only. 90-day TTL.';
