import { supabase } from "@/config/supabase";

export interface AgencyPageMetrics {
  viewsTotal: number;
  views30d: number;
}

const DEFAULT_METRICS: AgencyPageMetrics = {
  viewsTotal: 0,
  views30d: 0,
};

function parseMetric(value: number | string | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export const agencyService = {
  async getAgencyPageMetrics(agencyId: string): Promise<AgencyPageMetrics> {
    if (!agencyId) {
      return DEFAULT_METRICS;
    }

    try {
      const { data, error } = await supabase
        .from("agency_page_metrics_v1")
        .select("views_total, views_30d")
        .eq("agency_id", agencyId)
        .maybeSingle<{ views_total: number | string | null; views_30d: number | string | null }>();

      if (error) {
        console.error("[svc] getAgencyPageMetrics error", error);
        return DEFAULT_METRICS;
      }

      if (!data) {
        return DEFAULT_METRICS;
      }

      return {
        viewsTotal: parseMetric(data.views_total),
        views30d: parseMetric(data.views_30d),
      };
    } catch (error) {
      console.error("[svc] getAgencyPageMetrics unexpected error", error);
      return DEFAULT_METRICS;
    }
  },
};
