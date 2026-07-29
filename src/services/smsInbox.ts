import { supabase } from '@/config/supabase';

// Admin Messages inbox — reads sms_messages directly (admin RLS added in
// 20260729000000), sends manual replies through the send-admin-sms edge
// function, and tracks read receipts via read_by_admin_at.

export interface SmsThread {
  phone_number: string;
  last_message_at: string;
  last_message_body: string;
  last_direction: 'inbound' | 'outbound';
  unread_count: number;
  message_count: number;
  contact_name: string | null;
}

export interface SmsMessage {
  id: string;
  conversation_id: string | null;
  direction: 'inbound' | 'outbound';
  phone_number: string;
  message_body: string;
  message_sid: string | null;
  message_source: string | null;
  listing_id: string | null;
  status: string | null;
  created_at: string;
  read_by_admin_at: string | null;
}

/** Context chips shown at the top of a thread. */
export interface ThreadContext {
  /** Intake leads this thread's messages reference (outreach flow). */
  leads: Array<{
    id: string;
    title: string | null;
    outreach_status: string | null;
    published_listing_id: string | null;
  }>;
  /** Live listings this thread's messages reference (renewal/report flows). */
  listings: Array<{ id: string; title: string }>;
}

export function formatPhoneDisplay(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) return e164;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

export const smsInboxService = {
  async listThreads(search?: string): Promise<SmsThread[]> {
    const { data, error } = await supabase.rpc('admin_sms_threads', {
      p_search: search?.trim() || null,
      p_limit: 100,
      p_offset: 0,
    });
    if (error) throw error;
    return (data ?? []) as SmsThread[];
  },

  async getThread(phoneNumber: string): Promise<SmsMessage[]> {
    const { data, error } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('phone_number', phoneNumber)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as SmsMessage[];
  },

  /**
   * The message log stores whichever id the sending flow had on hand — a
   * scraped_listings id for outreach, a live listing id for renewals — so we
   * probe both tables with the whole id set and keep what resolves.
   */
  async getThreadContext(messages: SmsMessage[]): Promise<ThreadContext> {
    const ids = [...new Set(messages.map((m) => m.listing_id).filter((v): v is string => !!v))];
    if (ids.length === 0) return { leads: [], listings: [] };

    const [leadsRes, listingsRes] = await Promise.all([
      supabase
        .from('scraped_listings')
        .select('id, title, outreach_status, published_listing_id')
        .in('id', ids),
      supabase.from('listings').select('id, title').in('id', ids),
    ]);
    return {
      leads: leadsRes.data ?? [],
      listings: listingsRes.data ?? [],
    };
  },

  async markThreadRead(phoneNumber: string): Promise<void> {
    const { error } = await supabase
      .from('sms_messages')
      .update({ read_by_admin_at: new Date().toISOString() })
      .eq('phone_number', phoneNumber)
      .eq('direction', 'inbound')
      .is('read_by_admin_at', null);
    if (error) throw error;
  },

  /** Unread inbound messages across all threads — the sidebar badge. */
  async countUnread(): Promise<number> {
    const { count, error } = await supabase
      .from('sms_messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'inbound')
      .is('read_by_admin_at', null);
    if (error) throw error;
    return count ?? 0;
  },

  async sendMessage(phoneNumber: string, message: string): Promise<void> {
    const { data, error } = await supabase.functions.invoke('send-admin-sms', {
      body: { phoneNumber, message },
    });
    if (error) throw new Error(error.message || 'Failed to send SMS');
    if (data?.error) throw new Error(data.error);
  },
};
