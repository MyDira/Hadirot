import { supabase, ConciergeSubscription, ConciergeSubmission, ConciergeTier } from '../config/supabase';

export function generateEmailHandle(fullName: string): string {
  const parts = fullName.trim().toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'user';
  let firstName = parts[0];
  if (firstName.length > 10) firstName = firstName.slice(0, 10);
  if (parts.length === 1) return firstName;
  const lastInitial = parts[parts.length - 1][0];
  return `${firstName}${lastInitial}`;
}

export const conciergeService = {
  async getUserActiveSubscription(): Promise<ConciergeSubscription | null> {
    const { data, error } = await supabase
      .from('concierge_subscriptions')
      .select('*')
      .in('status', ['active', 'pending'])
      .in('tier', ['tier2_forward', 'tier3_vip'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getUserSubmissions(): Promise<ConciergeSubmission[]> {
    const { data, error } = await supabase
      .from('concierge_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async createCheckoutSession(params: {
    tier: ConciergeTier;
    blurb?: string;
    sources?: { name: string; link: string }[];
  }) {
    const { data, error } = await supabase.functions.invoke('create-concierge-checkout', {
      body: params,
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as { url: string; session_id: string; email_handle?: string };
  },

  async getAllSubscriptions(): Promise<ConciergeSubscription[]> {
    const { data, error } = await supabase
      .from('concierge_subscriptions')
      .select('*, user:profiles(id, full_name, email, phone, agency)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getAllSubmissions(): Promise<ConciergeSubmission[]> {
    const { data, error } = await supabase
      .from('concierge_submissions')
      .select('*, user:profiles(id, full_name, email, phone)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async updateSubmissionStatus(id: string, status: string, adminNotes?: string, listingId?: string) {
    const update: Record<string, unknown> = { status };
    if (adminNotes !== undefined) update.admin_notes = adminNotes;
    if (listingId !== undefined) update.listing_id = listingId;

    const { error } = await supabase
      .from('concierge_submissions')
      .update(update)
      .eq('id', id);

    if (error) throw error;
  },

  async updateSubscriptionNotes(id: string, notes: string) {
    const { error } = await supabase
      .from('concierge_subscriptions')
      .update({ admin_notes: notes })
      .eq('id', id);

    if (error) throw error;
  },

  async markVIPChecked(id: string) {
    const { error } = await supabase
      .from('concierge_subscriptions')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  },
};
