// Agent-free posting: decides whether a residential-rental poster qualifies as
// an "agent" who posts for free (legacy behavior, normal admin-controlled
// expiration) instead of going through the landlord paywall.
//
// Gated by admin_settings.charge_agents. While that is false (default), a user
// is a free agent if ANY of:
//   - profiles.free_posting_agent === true (admin manual override), OR
//   - lifetime listing count (all types) >= AGENT_LIFETIME_LISTING_THRESHOLD.
// When charge_agents is true, NOBODY is treated as a free agent here — agents
// fall back into the existing subscription/trial/pay flow, which stays intact.
//
// SECURITY (billing audit P1): the self-declared profiles.role='agent' is NO
// LONGER a free-posting signal. role is chosen at signup and is not protected by
// any privileged-column guard, so trusting it let a landlord self-select "agent"
// to bypass the paywall. Eligibility is now the admin-set flag or the
// lifetime-count rule only. This MUST stay in sync with the server-side
// is_user_free_agent(uid) helper in
// 20260708100100_agent_free_legacy_free_guard.sql, which the
// monetization_payment_guard trigger uses as the source of truth.
//
// Schema: supabase/migrations/20260622000000_agent_free_posting.sql.
// The Supabase client is typed against the pre-migration schema until
// `npm run db:types` runs, so the new columns/RPC use a targeted cast.

import { supabase } from '../config/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as unknown as SupabaseClient<any, 'public', any>;

/** Lifetime listing count at or above which a user is auto-treated as an agent. */
export const AGENT_LIFETIME_LISTING_THRESHOLD = 3;

export const agentFreePostingService = {
  /** Read the "charge agents" master switch. False (default) = agents post free. */
  async getChargeAgents(): Promise<boolean> {
    const { data, error } = await sb
      .from('admin_settings')
      .select('charge_agents')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data as { charge_agents?: boolean } | null)?.charge_agents === true;
  },

  /** Admin-only (enforced by admin_settings RLS). Flip the "charge agents" switch. */
  async setChargeAgents(value: boolean): Promise<void> {
    const { data: row, error: selErr } = await sb
      .from('admin_settings')
      .select('id')
      .limit(1)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row?.id) throw new Error('Admin settings not found');

    const { error } = await sb
      .from('admin_settings')
      .update({ charge_agents: value })
      .eq('id', row.id);
    if (error) throw error;
  },

  /**
   * Whether the given user qualifies as a free-posting agent UNDER CURRENT
   * SETTINGS. Returns false unconditionally when charge_agents is on.
   *
   * Caller may pass a known charge_agents value to avoid a redundant read
   * (the gate already fetches it).
   */
  async isUserFreeAgent(
    userId: string,
    opts?: { chargeAgents?: boolean },
  ): Promise<boolean> {
    const chargeAgents =
      opts?.chargeAgents ?? (await this.getChargeAgents());
    if (chargeAgents) return false;

    const [{ data: profile, error: profErr }, { data: count, error: cntErr }] =
      await Promise.all([
        sb
          .from('profiles')
          .select('free_posting_agent')
          .eq('id', userId)
          .maybeSingle(),
        sb.rpc('get_user_lifetime_listing_count', { p_user_id: userId }),
      ]);

    if (profErr) throw profErr;
    if (cntErr) throw cntErr;

    // NOTE: profiles.role is intentionally NOT consulted here — see the header.
    const flagged =
      (profile as { free_posting_agent?: boolean } | null)?.free_posting_agent === true;
    const lifetimeCount = typeof count === 'number' ? count : 0;

    return flagged || lifetimeCount >= AGENT_LIFETIME_LISTING_THRESHOLD;
  },
};
