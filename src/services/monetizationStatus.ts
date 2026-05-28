// Read + write the monetization master switch.
// See supabase/migrations/20260527150800_monetization_feature_flag.sql.
//
// When `enabled` is false, the wizard, dashboard, and cron all behave as
// pre-monetization. When true, the full residential-rental monetization
// system is active.

import { supabase } from '../config/supabase';

export interface MonetizationStatus {
  enabled: boolean;
  enabledAt: string | null;
}

export const monetizationStatusService = {
  /** Read the flag + activation timestamp. Safe to call as authenticated user (admin_settings has read RLS). */
  async get(): Promise<MonetizationStatus> {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('monetization_enabled, monetization_enabled_at')
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const row = (data ?? {}) as { monetization_enabled?: boolean; monetization_enabled_at?: string | null };
    return {
      enabled: row.monetization_enabled === true,
      enabledAt: row.monetization_enabled_at ?? null,
    };
  },

  /**
   * Admin-only. Calls the enable_monetization RPC which atomically flips the
   * flag AND grandfathers existing residential rentals (active→trial,
   * inactive→legacy_free). Idempotent.
   */
  async activate(): Promise<{ trialedCount: number; legacyCount: number; enabledAt: string }> {
    const { data, error } = await supabase.rpc('enable_monetization');
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      trialedCount: (row?.trialed_count as number) ?? 0,
      legacyCount: (row?.legacy_count as number) ?? 0,
      enabledAt: (row?.enabled_at as string) ?? new Date().toISOString(),
    };
  },

  /** Admin-only emergency switch. Sets the flag back to false; existing tags stay. */
  async deactivate(): Promise<void> {
    const { error } = await supabase.rpc('disable_monetization');
    if (error) throw error;
  },
};
