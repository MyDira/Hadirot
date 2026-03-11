import { supabase, CallStatus, ScrapedListing, ScrapeRun } from '@/config/supabase';

export interface PipelineFilters {
  callStatus: CallStatus | 'all';
  matchStatus: 'all' | 'no_match' | 'matched' | 'partial_match';
  lowConfidenceOnly: boolean;
}

const VALID_TRANSITIONS: Record<CallStatus, CallStatus[]> = {
  pending_call: ['called_no_answer', 'called_declined', 'approved', 'suppressed'],
  called_no_answer: ['called_declined', 'approved', 'suppressed'],
  called_declined: ['pending_call'],
  approved: ['published', 'suppressed'],
  published: [],
  suppressed: ['pending_call'],
};

export function getValidTransitions(currentStatus: CallStatus): CallStatus[] {
  return VALID_TRANSITIONS[currentStatus] ?? [];
}

export const CALL_STATUS_LABELS: Record<CallStatus, string> = {
  pending_call: 'Pending Call',
  called_no_answer: 'No Answer',
  called_declined: 'Declined',
  approved: 'Approved',
  published: 'Published',
  suppressed: 'Suppressed',
};

export const pipelineService = {
  async getLatestScrapeRun(): Promise<ScrapeRun | null> {
    const { data, error } = await supabase
      .from('scrape_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getScrapedListings(
    filters: PipelineFilters,
    page: number,
    pageSize: number = 25,
  ): Promise<{ data: ScrapedListing[]; count: number }> {
    let query = supabase
      .from('scraped_listings')
      .select('*', { count: 'exact' });

    if (filters.callStatus !== 'all') {
      query = query.eq('call_status', filters.callStatus);
    }

    if (filters.matchStatus !== 'all') {
      query = query.eq('match_status', filters.matchStatus);
    }

    if (filters.lowConfidenceOnly) {
      query = query.lt('parse_confidence', 0.5);
    }

    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query
      .order('date_last_seen', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return { data: data ?? [], count: count ?? 0 };
  },

  async updateCallStatus(id: string, newStatus: CallStatus): Promise<void> {
    const { error } = await supabase
      .from('scraped_listings')
      .update({ call_status: newStatus })
      .eq('id', id);

    if (error) throw error;
  },

  async updateCallNotes(id: string, notes: string): Promise<void> {
    const { error } = await supabase
      .from('scraped_listings')
      .update({ call_notes: notes })
      .eq('id', id);

    if (error) throw error;
  },

  async publishToListings(
    scraped: ScrapedListing,
    formData: Record<string, any>,
    userId: string,
  ): Promise<string> {
    const { data: listing, error: insertError } = await supabase
      .from('listings')
      .insert({
        ...formData,
        user_id: userId,
        approved: false,
        is_active: false,
        broker_fee: false,
        listing_type: 'rental',
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    const { error: updateError } = await supabase
      .from('scraped_listings')
      .update({
        call_status: 'published' as CallStatus,
        published_listing_id: listing.id,
      })
      .eq('id', scraped.id);

    if (updateError) throw updateError;

    return listing.id;
  },
};
