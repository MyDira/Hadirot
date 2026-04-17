-- Drop unused tables, views, and orphan function.
--
-- Confirmed safe by diagnostic queries against live DB:
--   * No foreign keys from other tables (except chat_messages -> chat_transcripts,
--     which drops together via CASCADE since both are in the drop list).
--   * No DB functions reference these tables.
--   * No views outside this drop list reference them.
--   * No pg_cron jobs reference them.
--
-- Confirmed safe by code audit (src, supabase/functions):
--   * Zero client or edge-function references to any table below.
--
-- Tables dropped (all 0 rows or orphaned rollup data with no consumer):
--   stripe_customers, stripe_orders, stripe_subscriptions
--     (left behind after payment-system removal in 20251105042037 and 20251105042223)
--   feature_entitlements
--     (orphan - the old monetization cleanup dropped feature_entitlement singular
--      but missed the plural one)
--   chat_messages, chat_transcripts (feature never shipped)
--   analytics_validation_log (validation system never got real use)
--   daily_cards_config, daily_cards_logs
--     (cleanup migration 20251029000001 was supposed to drop these but never ran)
--
-- Views (drop automatically with base tables via CASCADE; explicit for clarity):
--   stripe_user_orders, stripe_user_subscriptions, chat_analytics
--
-- Function: has_feature_access(...) - nothing references it; drop defensively.

DROP FUNCTION IF EXISTS public.has_feature_access(uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.has_feature_access(text, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.has_feature_access(uuid, text, uuid) CASCADE;

DROP VIEW IF EXISTS public.stripe_user_orders;
DROP VIEW IF EXISTS public.stripe_user_subscriptions;
DROP VIEW IF EXISTS public.chat_analytics;

DROP TABLE IF EXISTS public.stripe_orders CASCADE;
DROP TABLE IF EXISTS public.stripe_subscriptions CASCADE;
DROP TABLE IF EXISTS public.stripe_customers CASCADE;
DROP TABLE IF EXISTS public.feature_entitlements CASCADE;
DROP TABLE IF EXISTS public.chat_messages CASCADE;
DROP TABLE IF EXISTS public.chat_transcripts CASCADE;
DROP TABLE IF EXISTS public.analytics_validation_log CASCADE;
DROP TABLE IF EXISTS public.daily_cards_config CASCADE;
DROP TABLE IF EXISTS public.daily_cards_logs CASCADE;
