import type { PostgrestError } from "@supabase/supabase-js";
import { supabase, Agency } from "../config/supabase";
import { agencyNameToSlug } from "../utils/agency";
import { sanitizeHtml } from "../utils/sanitize";

export const AGENCY_NAME_TAKEN_CODE = "AGENCY_NAME_TAKEN" as const;

type AgencyNameTakenError = { code: typeof AGENCY_NAME_TAKEN_CODE };

export interface AgencyNameAvailabilityResult {
  available: boolean;
}

function createAgencyNameTakenError(): AgencyNameTakenError {
  return { code: AGENCY_NAME_TAKEN_CODE };
}

function isPostgrestError(error: unknown): error is PostgrestError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as PostgrestError).code === "string"
  );
}

function isUniqueViolation(error: unknown): error is PostgrestError {
  return isPostgrestError(error) && error.code === "23505";
}

async function checkAgencyNameAvailability(
  name: string,
  excludeId?: string,
): Promise<AgencyNameAvailabilityResult> {
  const normalizedName = name.trim();
  const normalizedSlug = agencyNameToSlug(normalizedName);

  if (!normalizedName || !normalizedSlug) {
    return { available: false };
  }

  const orFilter = [
    `name.eq.${encodeURIComponent(normalizedName)}`,
    `slug.eq.${encodeURIComponent(normalizedSlug)}`,
  ].join(",");

  let query = supabase.from("agencies").select("id");

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query.or(orFilter).limit(1);

  if (error) {
    console.error("[svc] checkAgencyNameAvailable error", error);
    throw error;
  }

  return { available: !data || data.length === 0 };
}

export interface AgencyOwnerCreateInput {
  owner_profile_id: string;
  name: string;
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
  checkAgencyNameAvailable(
    name: string,
    excludeId?: string,
  ): Promise<AgencyNameAvailabilityResult> {
    return checkAgencyNameAvailability(name, excludeId);
  },

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

  async getAgencyOwnedByProfile(profileId: string): Promise<Agency | null> {
    if (!profileId) {
      return null;
    }

    const { data, error } = await supabase
      .from("agencies")
      .select("*")
      .eq("owner_profile_id", profileId)
      .maybeSingle<Agency>();

    if (error) {
      console.error("[svc] getAgencyOwnedByProfile error", error);
      throw error;
    }

    return mapAgencyRow(data ?? null);
  },

  async ensureAgencyForOwner(profileId: string): Promise<Agency | null> {
    if (!profileId) {
      return null;
    }

    const { data, error } = await supabase.rpc<Agency>(
      "ensure_agency_for_owner",
      {
        p_owner: profileId,
      },
    );

    if (error) {
      console.error("[svc] ensureAgencyForOwner error", error);
      throw error;
    }

    return mapAgencyRow(data ?? null);
  },

  async createAgencyForOwner(
    payload: AgencyOwnerCreateInput,
  ): Promise<Agency | null> {
    const normalizedName = payload.name?.trim();

    if (!payload.owner_profile_id) {
      throw new Error("Agency owner is required");
    }

    if (!normalizedName) {
      throw new Error("Agency name is required");
    }

    const normalizedSlug = agencyNameToSlug(normalizedName);

    if (!normalizedSlug) {
      throw new Error("Agency name must contain letters or numbers");
    }

    const { available } = await checkAgencyNameAvailability(normalizedName);

    if (!available) {
      throw createAgencyNameTakenError();
    }

    const insertPayload = {
      owner_profile_id: payload.owner_profile_id,
      name: normalizedName,
      slug: normalizedSlug,
    };

    const { data, error } = await supabase
      .from("agencies")
      .insert(insertPayload)
      .select("*")
      .maybeSingle<Agency>();

    if (error) {
      console.error("[svc] createAgencyForOwner error", error);
      if (isUniqueViolation(error)) {
        throw createAgencyNameTakenError();
      }
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

      const { available } = await checkAgencyNameAvailability(
        normalizedName,
        id,
      );

      if (!available) {
        throw createAgencyNameTakenError();
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
      if (isUniqueViolation(error)) {
        throw createAgencyNameTakenError();
      }
      throw error;
    }

    return mapAgencyRow(data ?? null);
  },
};
