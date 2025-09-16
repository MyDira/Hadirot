import { supabase, Agency } from "../config/supabase";
import { agencyNameToSlug } from "../utils/agency";
import { sanitizeHtml } from "../utils/sanitize";

export interface AgencyCreateInput {
  name: string;
  slug: string;
  logo_url?: string | null;
  banner_url?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  about_html?: string | null;
}

export interface AgencyUpdateInput {
  name?: string;
  logo_url?: string | null;
  banner_url?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  about_html?: string | null;
}

function normalizeOptionalString(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function prepareAboutHtml(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  const textContent = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();

  if (!textContent) {
    return null;
  }

  return sanitizeHtml(value);
}

function mapAgencyRow(row: Agency | null): Agency | null {
  if (!row) {
    return null;
  }

  const sanitizedAbout = prepareAboutHtml(row.about_html ?? undefined);

  return {
    ...row,
    about_html: sanitizedAbout === undefined ? row.about_html ?? null : sanitizedAbout,
  };
}

export const agenciesService = {
  async getAgencyBySlug(slug: string): Promise<Agency | null> {
    const normalizedSlug = agencyNameToSlug(slug);

    if (!normalizedSlug) {
      return null;
    }

    const { data, error } = await supabase
      .from("agencies")
      .select("*")
      .eq("slug", normalizedSlug)
      .maybeSingle<Agency>();

    if (error) {
      console.error("[svc] getAgencyBySlug error", error);
      throw error;
    }

    return mapAgencyRow(data);
  },

  async createAgency(payload: AgencyCreateInput): Promise<Agency | null> {
    const normalizedName = payload.name?.trim();
    const normalizedSlug = agencyNameToSlug(payload.slug || payload.name);

    if (!normalizedName || !normalizedSlug) {
      throw new Error("Agency name and slug are required");
    }

    const insertPayload = {
      name: normalizedName,
      slug: normalizedSlug,
      logo_url: normalizeOptionalString(payload.logo_url),
      banner_url: normalizeOptionalString(payload.banner_url),
      phone: normalizeOptionalString(payload.phone),
      email: normalizeOptionalString(payload.email),
      website: normalizeOptionalString(payload.website),
      about_html: prepareAboutHtml(payload.about_html) ?? null,
    };

    const { data, error } = await supabase
      .from("agencies")
      .insert(insertPayload)
      .select("*")
      .maybeSingle<Agency>();

    if (error) {
      console.error("[svc] createAgency error", error);
      throw error;
    }

    return mapAgencyRow(data ?? null);
  },

  async updateAgencyById(id: string, payload: AgencyUpdateInput): Promise<Agency | null> {
    const updates: Record<string, any> = {};

    if (payload.name !== undefined) {
      const normalizedName = payload.name.trim();
      if (!normalizedName) {
        throw new Error("Agency name cannot be empty");
      }
      updates.name = normalizedName;
    }

    const normalizedLogo = normalizeOptionalString(payload.logo_url);
    if (normalizedLogo !== undefined) {
      updates.logo_url = normalizedLogo;
    }

    const normalizedBanner = normalizeOptionalString(payload.banner_url);
    if (normalizedBanner !== undefined) {
      updates.banner_url = normalizedBanner;
    }

    const normalizedPhone = normalizeOptionalString(payload.phone);
    if (normalizedPhone !== undefined) {
      updates.phone = normalizedPhone;
    }

    const normalizedEmail = normalizeOptionalString(payload.email);
    if (normalizedEmail !== undefined) {
      updates.email = normalizedEmail;
    }

    const normalizedWebsite = normalizeOptionalString(payload.website);
    if (normalizedWebsite !== undefined) {
      updates.website = normalizedWebsite;
    }

    const aboutHtml = prepareAboutHtml(payload.about_html);
    if (aboutHtml !== undefined) {
      updates.about_html = aboutHtml;
    }

    if (Object.keys(updates).length === 0) {
      const { data, error } = await supabase
        .from("agencies")
        .select("*")
        .eq("id", id)
        .maybeSingle<Agency>();

      if (error) {
        console.error("[svc] updateAgencyById fetch error", error);
        throw error;
      }

      return mapAgencyRow(data ?? null);
    }

    const { data, error } = await supabase
      .from("agencies")
      .update(updates)
      .eq("id", id)
      .select("*")
      .maybeSingle<Agency>();

    if (error) {
      console.error("[svc] updateAgencyById error", error);
      throw error;
    }

    return mapAgencyRow(data ?? null);
  },
};
