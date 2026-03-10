/*
  # Drop Unused Indexes

  Removes indexes that have never been used according to pg_stat_user_indexes.
  These indexes consume storage and slow down write operations without providing
  any query performance benefit.

  Tables affected:
  - chat_messages
  - feature_entitlements
  - digest_sent_listings
  - favorites
  - filter_presets
  - sales_permission_requests
  - digest_templates
  - listings (several)
  - featured_purchases
  - concierge_subscriptions
  - concierge_submissions
  - digest_global_settings
  - digest_sends
  - scraped_listings
  - location_search_index
  - analytics_validation_log
  - listing_renewal_conversations
  - sms_messages
*/

DROP INDEX IF EXISTS public.idx_chat_messages_chat_id;
DROP INDEX IF EXISTS public.idx_feature_entitlements_agency_id;
DROP INDEX IF EXISTS public.idx_digest_sent_listings_template_id_fk;
DROP INDEX IF EXISTS public.idx_favorites_listing_id;
DROP INDEX IF EXISTS public.idx_filter_presets_created_by_fk;
DROP INDEX IF EXISTS public.idx_filter_presets_collections;
DROP INDEX IF EXISTS public.idx_sales_requests_status;
DROP INDEX IF EXISTS public.idx_digest_templates_category;
DROP INDEX IF EXISTS public.idx_digest_templates_header_footer_flags;
DROP INDEX IF EXISTS public.idx_listings_zip_code;
DROP INDEX IF EXISTS public.idx_featured_purchases_user;
DROP INDEX IF EXISTS public.idx_concierge_subscriptions_user_id;
DROP INDEX IF EXISTS public.idx_concierge_submissions_user_id;
DROP INDEX IF EXISTS public.idx_concierge_submissions_status;
DROP INDEX IF EXISTS public.idx_listings_year_built;
DROP INDEX IF EXISTS public.idx_listings_driveway_status;
DROP INDEX IF EXISTS public.idx_listings_multi_family;
DROP INDEX IF EXISTS public.idx_listings_building_size;
DROP INDEX IF EXISTS public.idx_sales_permission_requests_responded_by_admin_id;
DROP INDEX IF EXISTS public.idx_digest_global_settings_updated_by;
DROP INDEX IF EXISTS public.idx_listings_property_condition;
DROP INDEX IF EXISTS public.idx_listings_occupancy_status;
DROP INDEX IF EXISTS public.idx_listings_laundry_type;
DROP INDEX IF EXISTS public.idx_listings_basement_type;
DROP INDEX IF EXISTS public.idx_digest_sends_sent_by;
DROP INDEX IF EXISTS public.idx_digest_sends_template_id;
DROP INDEX IF EXISTS public.idx_digest_sent_listings_digest_send_id;
DROP INDEX IF EXISTS public.idx_digest_templates_created_by;
DROP INDEX IF EXISTS public.idx_scraped_listings_active;
DROP INDEX IF EXISTS public.idx_scraped_listings_neighborhood;
DROP INDEX IF EXISTS public.idx_scraped_listings_bedrooms;
DROP INDEX IF EXISTS public.idx_scraped_listings_price;
DROP INDEX IF EXISTS public.idx_scraped_listings_dates;
DROP INDEX IF EXISTS public.idx_scraped_listings_location;
DROP INDEX IF EXISTS public.idx_location_search_name;
DROP INDEX IF EXISTS public.idx_location_search_type;
DROP INDEX IF EXISTS public.idx_location_search_aliases;
DROP INDEX IF EXISTS public.idx_validation_log_date;
DROP INDEX IF EXISTS public.idx_validation_log_status;
DROP INDEX IF EXISTS public.idx_renewal_conv_metadata;
DROP INDEX IF EXISTS public.idx_sms_messages_direction;
DROP INDEX IF EXISTS public.idx_scraped_listings_match_status;
DROP INDEX IF EXISTS public.idx_scraped_listings_existing_id;
