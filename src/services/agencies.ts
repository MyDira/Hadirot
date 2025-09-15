import { supabase } from '@/config/supabase';

export interface Agency {
  id: string;
  name: string;
  slug: string;
  tagline?: string;
  logo_url?: string;
  banner_url?: string;
  theme_primary_color?: string;
  theme_accent_color?: string;
  phone?: string;
  email?: string;
  website?: string;
  social_links?: Record<string, string>;
  about_content?: string;
  is_active: boolean;
  owner_user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface AgencyListingsResponse {
  listings: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

class AgenciesService {
  async getAgencyBySlug(slug: string): Promise<Agency | null> {
    try {
      const { data, error } = await supabase.functions.invoke('agencies', {
        method: 'GET',
        body: null,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching agency by slug:', error);
      return null;
    }
  }

  async getUserAgency(): Promise<Agency | null> {
    try {
      const { data, error } = await supabase.functions.invoke('agencies', {
        method: 'GET',
      });

      if (error) throw error;
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Error fetching user agency:', error);
      return null;
    }
  }

  async getAllAgencies(): Promise<Agency[]> {
    try {
      const { data, error } = await supabase.functions.invoke('agencies', {
        method: 'GET',
      });

      if (error) throw error;
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error fetching all agencies:', error);
      return [];
    }
  }

  async createAgency(agencyData: Omit<Agency, 'id' | 'created_at' | 'updated_at'>): Promise<Agency | null> {
    try {
      const { data, error } = await supabase.functions.invoke('agencies', {
        method: 'POST',
        body: agencyData,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating agency:', error);
      return null;
    }
  }

  async updateAgency(id: string, agencyData: Partial<Agency>): Promise<Agency | null> {
    try {
      const { data, error } = await supabase.functions.invoke(`agencies/${id}`, {
        method: 'PUT',
        body: agencyData,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating agency:', error);
      return null;
    }
  }

  async deleteAgency(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.functions.invoke(`agencies/${id}`, {
        method: 'DELETE',
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error deleting agency:', error);
      return false;
    }
  }

  async getAgencyListings(
    agencyIdOrSlug: string,
    filters: {
      bedrooms?: string;
      min_price?: number;
      max_price?: number;
      sort?: string;
      page?: number;
    } = {}
  ): Promise<AgencyListingsResponse | null> {
    try {
      const params = new URLSearchParams();
      params.set('agency_id', agencyIdOrSlug);
      
      if (filters.bedrooms) params.set('bedrooms', filters.bedrooms);
      if (filters.min_price) params.set('min_price', filters.min_price.toString());
      if (filters.max_price) params.set('max_price', filters.max_price.toString());
      if (filters.sort) params.set('sort', filters.sort);
      if (filters.page) params.set('page', filters.page.toString());

      const { data, error } = await supabase.functions.invoke(`agency-listings?${params.toString()}`, {
        method: 'GET',
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching agency listings:', error);
      return null;
    }
  }

  async updateUserAgencyAccess(
    userId: string,
    agencyId: string | null,
    canManageAgency: boolean
  ): Promise<boolean> {
    try {
      const { error } = await supabase.functions.invoke('update-user-agency-access', {
        method: 'POST',
        body: {
          user_id: userId,
          agency_id: agencyId,
          can_manage_agency: canManageAgency,
        },
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating user agency access:', error);
      return false;
    }
  }
}

export const agenciesService = new AgenciesService();