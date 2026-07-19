import { supabase, Listing, Profile } from '../config/supabase';

/**
 * Data access for the admin dashboard (/admin/*). Each section fetches only
 * what it needs through this service — nothing here is reachable by
 * non-admins (RLS on direct queries, SECURITY DEFINER admin gate on RPCs).
 */

export interface AdminListingRow extends Listing {
  thumbnail_url?: string | null;
  // Per-listing inquiry count (residential; commercial defaults to 0). Surfaced
  // as the 5th card stat alongside the metrics carried on `Listing`.
  inquiries?: number;
  // Commercial listings are unioned into the same table and tagged so row
  // actions route to commercial_listings and the correct detail/edit routes.
  __commercial?: boolean;
}

// Multi-select listing status values used by the redesigned dashboard.
export type AdminListingStatus = 'active' | 'deactivated' | 'pending' | 'featured';

export interface AdminListingsQuery {
  search: string;
  ownerRole: string;
  listingType: string;
  statuses: AdminListingStatus[];
  ownerId: string;
  minBedrooms: string;
  contactPhone: string;
  dateFrom: string;
  dateTo: string;
  sort: 'title' | 'owner' | 'price' | 'created_at' | 'is_active' | 'featured' | 'bedrooms';
  dir: 'asc' | 'desc';
  page: number;
  perPage: number;
}

export interface AdminUsersQuery {
  search: string;
  role: string;
  agency: string;
  sort: 'full_name' | 'role' | 'agency' | 'status' | 'created_at' | 'phone';
  dir: 'asc' | 'desc';
  page: number;
  perPage: number;
}

export interface AdminStats {
  totalUsers: number;
  totalListings: number;
  featuredListings: number;
  activeUsers: number;
}

export interface LifecycleSettings {
  id: string;
  rental_active_days: number;
  sale_active_days: number;
}

const USER_COLUMNS =
  'id, full_name, email, role, phone, agency, is_admin, is_banned, created_at, can_manage_agency, can_post_sales, free_posting_agent';

// PostgREST .or() treats commas/parens as syntax — strip them from user input.
const sanitizeOrTerm = (term: string) => term.replace(/[,()]/g, ' ').trim();

const isMissingFunctionError = (error: { code?: string; message?: string } | null) =>
  !!error &&
  (error.code === 'PGRST202' ||
    error.code === '42883' ||
    /function .* does not exist|Could not find the function/i.test(error.message || ''));

export const adminPanelService = {
  async getStats(): Promise<AdminStats> {
    const nowIso = new Date().toISOString();
    // "Active Listings" must mean active — count is_active rows across both
    // residential and commercial. "Featured" counts non-expired featured rows
    // across both types.
    const [usersRes, activeRes, commercialActiveRes, featuredRes, commercialFeaturedRes] =
      await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        supabase
          .from('commercial_listings')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true),
        supabase
          .from('listings')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('is_featured', true)
          .gt('featured_expires_at', nowIso),
        supabase
          .from('commercial_listings')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('is_featured', true)
          .gt('featured_expires_at', nowIso),
      ]);

    return {
      totalUsers: usersRes.count || 0,
      totalListings: (activeRes.count || 0) + (commercialActiveRes.count || 0),
      featuredListings: (featuredRes.count || 0) + (commercialFeaturedRes.count || 0),
      // Parity with the old panel: "active users" is intentionally simplified.
      activeUsers: usersRes.count || 0,
    };
  },

  async getLifecycleSettings(): Promise<LifecycleSettings | null> {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('id, rental_active_days, sale_active_days')
      .single();

    if (error) {
      console.error('[adminPanel] getLifecycleSettings error', error);
      return null;
    }
    return {
      id: data.id,
      rental_active_days: data.rental_active_days ?? 30,
      sale_active_days: data.sale_active_days ?? 30,
    };
  },

  async saveLifecycleSettings(id: string, rentalDays: number, saleDays: number): Promise<void> {
    const { error } = await supabase
      .from('admin_settings')
      .update({ rental_active_days: rentalDays, sale_active_days: saleDays })
      .eq('id', id);
    if (error) throw error;
  },

  async searchListings(
    q: AdminListingsQuery,
  ): Promise<{ rows: AdminListingRow[]; total: number; rpcMissing?: boolean }> {
    const { data, error } = await supabase.rpc('admin_search_listings', {
      p_search: q.search.trim() || undefined,
      p_owner_role: q.ownerRole || undefined,
      p_listing_type: q.listingType || undefined,
      p_statuses: q.statuses.length > 0 ? q.statuses : undefined,
      p_date_from: q.dateFrom || undefined,
      p_date_to: q.dateTo || undefined,
      p_owner_id: q.ownerId || undefined,
      p_min_bedrooms: q.minBedrooms ? Number(q.minBedrooms) : undefined,
      p_contact_phone: q.contactPhone.trim() || undefined,
      p_sort: q.sort,
      p_dir: q.dir,
      p_limit: q.perPage,
      p_offset: (q.page - 1) * q.perPage,
    });

    if (error) {
      if (isMissingFunctionError(error)) {
        return { rows: [], total: 0, rpcMissing: true };
      }
      console.error('[adminPanel] searchListings error', error);
      throw error;
    }

    const rows = (data || []).map((r) => r.listing as unknown as AdminListingRow);
    const total = data && data.length > 0 ? Number(data[0].total_count) : 0;
    return { rows, total };
  },

  async listAgencies(): Promise<string[]> {
    const { data, error } = await supabase.rpc('admin_list_agencies');
    if (error) {
      console.error('[adminPanel] listAgencies error', error);
      return [];
    }
    return (data || []).map((r) => r.agency);
  },

  async searchUsers(q: AdminUsersQuery): Promise<{ rows: Profile[]; total: number }> {
    let query = supabase.from('profiles').select(USER_COLUMNS, { count: 'exact' });

    if (q.role) query = query.eq('role', q.role);
    if (q.agency) query = query.eq('agency', q.agency);

    const term = sanitizeOrTerm(q.search);
    if (term) {
      query = query.or(
        `full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,agency.ilike.%${term}%`,
      );
    }

    const ascending = q.dir === 'asc';
    if (q.sort === 'status') {
      // "Status" groups admins, then banned, then regular users.
      query = query
        .order('is_admin', { ascending: !ascending })
        .order('is_banned', { ascending: !ascending })
        .order('created_at', { ascending: false });
    } else {
      query = query.order(q.sort, { ascending, nullsFirst: ascending });
    }

    const from = (q.page - 1) * q.perPage;
    const { data, error, count } = await query.range(from, from + q.perPage - 1);

    if (error) {
      console.error('[adminPanel] searchUsers error', error);
      throw error;
    }
    return { rows: (data || []) as Profile[], total: count || 0 };
  },

  async getPendingCount(): Promise<number> {
    const [residential, commercial] = await Promise.all([
      supabase.from('listings').select('id', { count: 'exact', head: true }).eq('approved', false),
      supabase
        .from('commercial_listings')
        .select('id', { count: 'exact', head: true })
        .eq('approved', false),
    ]);
    return (residential.count || 0) + (commercial.count || 0);
  },

  // Bulk ops run against both tables by id. Ids are UUIDs unique to one table,
  // so the non-matching table simply updates/deletes 0 rows — this lets a mixed
  // residential + commercial selection be actioned in one shot.
  async bulkSetListingsActive(ids: string[], active: boolean): Promise<void> {
    if (ids.length === 0) return;
    const [res, comm] = await Promise.all([
      supabase.from('listings').update({ is_active: active }).in('id', ids),
      supabase.from('commercial_listings').update({ is_active: active }).in('id', ids),
    ]);
    if (res.error) throw res.error;
    if (comm.error) throw comm.error;
  },

  async bulkDeleteListings(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const [res, comm] = await Promise.all([
      supabase.from('listings').delete().in('id', ids),
      supabase.from('commercial_listings').delete().in('id', ids),
    ]);
    if (res.error) throw res.error;
    if (comm.error) throw comm.error;
  },
};
