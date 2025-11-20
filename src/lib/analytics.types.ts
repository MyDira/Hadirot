export type AnalyticsEventName =
  | 'session_start'
  | 'session_end'
  | 'page_view'
  | 'listing_view'
  | 'listing_impression_batch'
  | 'filter_apply'
  | 'search_query'
  | 'agency_page_view'
  | 'agency_filter_apply'
  | 'agency_share'
  | 'post_started'
  | 'post_submitted'
  | 'post_success'
  | 'post_abandoned'
  | 'post_error';

export interface AnalyticsEventPayload {
  session_id: string;
  anon_id: string;
  user_id: string | null;
  event_name: AnalyticsEventName;
  event_props: Record<string, unknown>;
  occurred_at: string;
}
