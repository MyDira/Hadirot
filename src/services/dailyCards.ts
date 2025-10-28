/**
 * Daily Cards Service
 *
 * Manages configuration and execution of daily listing cards email system
 */

import { supabase } from '../config/supabase';

export interface DailyCardsConfig {
  id: string;
  enabled: boolean;
  delivery_time: string;
  recipient_emails: string[];
  max_listings: number;
  include_featured_only: boolean;
  days_to_include: number;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface DailyCardsLog {
  id: string;
  run_at: string;
  success: boolean;
  listings_count: number;
  images_generated: number;
  email_sent: boolean;
  error_message: string | null;
  execution_time_ms: number;
  triggered_by: string;
}

/**
 * Fetch current configuration
 */
export async function getDailyCardsConfig(): Promise<DailyCardsConfig | null> {
  const { data, error } = await supabase
    .from('daily_cards_config')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching daily cards config:', error);
    throw error;
  }

  return data as DailyCardsConfig | null;
}

/**
 * Update configuration
 */
export async function updateDailyCardsConfig(
  updates: Partial<Omit<DailyCardsConfig, 'id' | 'created_at' | 'updated_at'>>
): Promise<DailyCardsConfig> {
  // First, get the existing config to get its ID
  const { data: existing } = await supabase
    .from('daily_cards_config')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (!existing) {
    throw new Error('Configuration not found');
  }

  const { data, error } = await supabase
    .from('daily_cards_config')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select()
    .single();

  if (error) {
    console.error('Error updating daily cards config:', error);
    throw error;
  }

  return data as DailyCardsConfig;
}

/**
 * Fetch execution logs
 */
export async function getDailyCardsLogs(limit = 10): Promise<DailyCardsLog[]> {
  const { data, error } = await supabase
    .from('daily_cards_logs')
    .select('*')
    .order('run_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching daily cards logs:', error);
    throw error;
  }

  return (data as DailyCardsLog[]) || [];
}

/**
 * Trigger manual execution
 */
export async function triggerManualExecution(): Promise<{
  success: boolean;
  listingsCount?: number;
  imagesGenerated?: number;
  emailSent?: boolean;
  executionTimeMs?: number;
  error?: string;
}> {
  try {
    const { data: session } = await supabase.auth.getSession();

    if (!session.session) {
      throw new Error('Not authenticated');
    }

    const response = await supabase.functions.invoke('daily-listing-cards', {
      body: {},
      headers: {
        Authorization: `Bearer ${session.session.access_token}`,
      },
    });

    if (response.error) {
      throw new Error(response.error.message || 'Failed to trigger execution');
    }

    return response.data;
  } catch (error) {
    console.error('Error triggering manual execution:', error);
    throw error;
  }
}

/**
 * Get execution statistics
 */
export async function getDailyCardsStats(): Promise<{
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  successRate: number;
  lastSuccessfulRun: string | null;
  averageExecutionTime: number;
}> {
  const { data: logs, error } = await supabase
    .from('daily_cards_logs')
    .select('*')
    .order('run_at', { ascending: false })
    .limit(30);

  if (error) {
    console.error('Error fetching stats:', error);
    throw error;
  }

  const typedLogs = (logs || []) as DailyCardsLog[];

  const totalRuns = typedLogs.length;
  const successfulRuns = typedLogs.filter((log) => log.success).length;
  const failedRuns = totalRuns - successfulRuns;
  const successRate = totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0;

  const lastSuccess = typedLogs.find((log) => log.success);
  const lastSuccessfulRun = lastSuccess ? lastSuccess.run_at : null;

  const executionTimes = typedLogs
    .filter((log) => log.execution_time_ms > 0)
    .map((log) => log.execution_time_ms);

  const averageExecutionTime =
    executionTimes.length > 0
      ? executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length
      : 0;

  return {
    totalRuns,
    successfulRuns,
    failedRuns,
    successRate,
    lastSuccessfulRun,
    averageExecutionTime,
  };
}
