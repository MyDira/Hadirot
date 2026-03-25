import * as Sentry from '@sentry/react';
import { supabase, CommercialListing, CommercialListingImage } from '../config/supabase';
import { capitalizeName } from '../utils/formatters';
import { getExpirationDate, getAdminActiveDays, MapBounds } from './listings';

export type CommercialSortOption = 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'sf_asc' | 'sf_desc';

export interface GetCommercialListingsFilters {
  commercial_space_types?: string[];
  min_price?: number;
  max_price?: number;
  min_sf?: number;
  max_sf?: number;
  neighborhoods?: string[];
  is_featured_only?: boolean;
  lease_type?: string;
  commercial_lease_types?: string[];
  commercial_conditions?: string[];
  building_classes?: string[];
  listing_type?: 'rental' | 'sale';
  sort?: CommercialSortOption;
  bounds?: MapBounds;
}

export type CommercialListingCreateInput = Omit<
  CommercialListing,
  'id' | 'created_at' | 'updated_at' | 'owner' | 'listing_images' | 'is_favorited'
>;

export type CommercialListingUpdateInput = Partial<CommercialListingCreateInput>;

function applyCommercialSort(query: any, sort?: CommercialSortOption): any {
  switch (sort) {
    case 'oldest':
      return query.order('created_at', { ascending: true });
    case 'price_asc':
      return query.order('price', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
    case 'price_desc':
      return query.order('price', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
    case 'sf_asc':
      return query.order('available_sf', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
    case 'sf_desc':
      return query.order('available_sf', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
    case 'newest':
    default:
      return query.order('created_at', { ascending: false });
  }
}

function applyCommercialFilters(query: any, filters: GetCommercialListingsFilters): any {
  if (filters.commercial_space_types && filters.commercial_space_types.length > 0) {
    query = query.in('commercial_space_type', filters.commercial_space_types);
  }
  if (filters.min_sf) {
    query = query.gte('available_sf', filters.min_sf);
  }
  if (filters.max_sf) {
    query = query.lte('available_sf', filters.max_sf);
  }
  if (filters.neighborhoods && filters.neighborhoods.length > 0) {
    query = query.in('neighborhood', filters.neighborhoods);
  }
  if (filters.commercial_lease_types && filters.commercial_lease_types.length > 0) {
    query = query.in('lease_type', filters.commercial_lease_types);
  } else if (filters.lease_type) {
    query = query.eq('lease_type', filters.lease_type);
  }
  if (filters.commercial_conditions && filters.commercial_conditions.length > 0) {
    query = query.in('build_out_condition', filters.commercial_conditions);
  }
  if (filters.building_classes && filters.building_classes.length > 0) {
    query = query.in('building_class', filters.building_classes);
  }
  if (filters.bounds) {
    query = query
      .gte('latitude', filters.bounds.south)
      .lte('latitude', filters.bounds.north)
      .gte('longitude', filters.bounds.west)
      .lte('longitude', filters.bounds.east);
  }
  return query;
}

export const commercialListingsService = {
  async getCommercialListings(
    filters: GetCommercialListingsFilters = {},
    limit?: number,
    userId?: string,
    offset = 0,
    applyPagination = true,
    is_featured_only?: boolean,
  ): Promise<{ data: CommercialListing[]; totalCount: number }> {
    let query = supabase
      .from('commercial_listings')
      .select('*,owner:profiles(id,full_name,role,agency),listing_images:commercial_listing_images(*)', { count: 'exact' })
      .eq('is_active', true)
      .eq('approved', true)
      .eq('listing_type', 'rental');

    if (filters.min_price) {
      query = query.gte('price', filters.min_price);
    }
    if (filters.max_price) {
      query = query.lte('price', filters.max_price);
    }

    query = applyCommercialFilters(query, filters);

    if (filters.is_featured_only || is_featured_only) {
      query = query.eq('is_featured', true).gt('featured_expires_at', new Date().toISOString());
    }

    query = applyCommercialSort(query, filters.sort);

    if (applyPagination && limit !== undefined) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error, count } = await query;

    if (data && typeof data === 'object' && 'code' in data && 'message' in data) {
      if ((data as any).code === 'PGRST103') {
        return { data: [], totalCount: count || 0 };
      }
      Sentry.captureException(new Error(`PostgREST error: ${(data as any).message}`));
      return { data: [], totalCount: 0 };
    }

    if (error) {
      console.error('Error fetching commercial listings:', error);
      Sentry.captureException(error);
      return { data: [], totalCount: 0 };
    }

    let listings = (data || []) as unknown as CommercialListing[];

    if (userId) {
      const { data: favData } = await supabase
        .from('commercial_favorites')
        .select('listing_id')
        .eq('user_id', userId);
      const favIds = new Set((favData || []).map((f: any) => f.listing_id));
      listings = listings.map(l => ({ ...l, is_favorited: favIds.has(l.id) }));
    }

    return { data: listings, totalCount: count || 0 };
  },

  async getCommercialSaleListings(
    filters: GetCommercialListingsFilters = {},
    limit?: number,
    userId?: string,
    offset = 0,
    applyPagination = true,
    is_featured_only?: boolean,
  ): Promise<{ data: CommercialListing[]; totalCount: number }> {
    let query = supabase
      .from('commercial_listings')
      .select('*,owner:profiles(id,full_name,role,agency),listing_images:commercial_listing_images(*)', { count: 'exact' })
      .eq('is_active', true)
      .eq('approved', true)
      .eq('listing_type', 'sale');

    if (filters.min_price) {
      query = query.gte('asking_price', filters.min_price);
    }
    if (filters.max_price) {
      query = query.lte('asking_price', filters.max_price);
    }

    query = applyCommercialFilters(query, filters);

    if (filters.is_featured_only || is_featured_only) {
      query = query.eq('is_featured', true).gt('featured_expires_at', new Date().toISOString());
    }

    query = applyCommercialSort(query, filters.sort);

    if (applyPagination && limit !== undefined) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error, count } = await query;

    if (data && typeof data === 'object' && 'code' in data && 'message' in data) {
      if ((data as any).code === 'PGRST103') {
        return { data: [], totalCount: count || 0 };
      }
      Sentry.captureException(new Error(`PostgREST error: ${(data as any).message}`));
      return { data: [], totalCount: 0 };
    }

    if (error) {
      console.error('Error fetching commercial sale listings:', error);
      Sentry.captureException(error);
      return { data: [], totalCount: 0 };
    }

    let listings = (data || []) as unknown as CommercialListing[];

    if (userId) {
      const { data: favData } = await supabase
        .from('commercial_favorites')
        .select('listing_id')
        .eq('user_id', userId);
      const favIds = new Set((favData || []).map((f: any) => f.listing_id));
      listings = listings.map(l => ({ ...l, is_favorited: favIds.has(l.id) }));
    }

    return { data: listings, totalCount: count || 0 };
  },

  async getCommercialListing(id: string, userId?: string, isAdmin = false): Promise<CommercialListing | null> {
    let query = supabase
      .from('commercial_listings')
      .select(`
        *,
        approved,
        is_active,
        listing_images:commercial_listing_images(*),
        owner:profiles(full_name, role, agency)
      `)
      .eq('id', id);

    if (userId) {
      if (!isAdmin) {
        query = query.or(`and(is_active.eq.true,approved.eq.true),user_id.eq.${userId}`);
      }
    } else {
      query = query.eq('approved', true).eq('is_active', true);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('Error loading commercial listing:', error);
      throw error;
    }

    if (!data) return null;

    let is_favorited = false;
    if (userId) {
      const { data: favoriteData } = await supabase
        .from('commercial_favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('listing_id', id)
        .maybeSingle();
      is_favorited = !!favoriteData;
    }

    return { ...data, is_favorited } as unknown as CommercialListing;
  },

  async getCommercialMapPins(
    bounds: MapBounds,
    listingType: 'rental' | 'sale' = 'rental',
  ) {
    const { data, error } = await supabase
      .from('commercial_listings')
      .select('id,latitude,longitude,price,asking_price,listing_type,commercial_space_type,neighborhood')
      .eq('is_active', true)
      .eq('approved', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('latitude', bounds.south)
      .lte('latitude', bounds.north)
      .gte('longitude', bounds.west)
      .lte('longitude', bounds.east)
      .eq('listing_type', listingType);

    if (error) {
      console.error('Error fetching commercial map pins:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      latitude: row.latitude,
      longitude: row.longitude,
      price: row.price,
      asking_price: row.asking_price,
      listing_type: row.listing_type,
      commercial_space_type: row.commercial_space_type,
      neighborhood: row.neighborhood,
    }));
  },

  async createCommercialListing(payload: CommercialListingCreateInput): Promise<CommercialListing> {
    if (payload.contact_name) {
      payload.contact_name = capitalizeName(payload.contact_name);
    }

    const data = {
      ...payload,
      call_for_price: !!payload.call_for_price,
      price: payload.call_for_price ? null : payload.price ?? null,
    };

    const { data: result, error } = await supabase
      .from('commercial_listings')
      .insert(data)
      .select()
      .single();

    if (error) {
      Sentry.captureException(error, {
        tags: {
          service: 'commercialListings',
          operation: 'create',
          error_type: 'database_error',
        },
        extra: {
          listing_data: {
            commercial_space_type: data.commercial_space_type,
            listing_type: data.listing_type,
            is_featured: data.is_featured,
          },
        },
      });
      throw error;
    }

    return result as unknown as CommercialListing;
  },

  async updateCommercialListing(id: string, payload: CommercialListingUpdateInput): Promise<CommercialListing> {
    if (payload.contact_name) {
      payload.contact_name = capitalizeName(payload.contact_name);
    }

    const data = {
      ...payload,
      ...(payload.call_for_price !== undefined
        ? {
            call_for_price: !!payload.call_for_price,
            price: payload.call_for_price ? null : payload.price ?? null,
          }
        : {}),
    };

    const { data: result, error } = await supabase
      .from('commercial_listings')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      Sentry.captureException(error, {
        tags: {
          service: 'commercialListings',
          operation: 'update',
          error_type: 'database_error',
          listing_id: id,
        },
        extra: {
          listing_id: id,
          update_data: {
            commercial_space_type: data.commercial_space_type,
            listing_type: data.listing_type,
            is_featured: data.is_featured,
          },
        },
      });
      throw error;
    }

    return result as unknown as CommercialListing;
  },

  async deleteCommercialListing(id: string): Promise<void> {
    const { error } = await supabase
      .from('commercial_listings')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getUserCommercialListings(userId: string): Promise<CommercialListing[]> {
    const { data, error } = await supabase
      .from('commercial_listings')
      .select(`
        *,
        approved,
        is_active,
        listing_images:commercial_listing_images(id,image_url,is_featured,sort_order)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as unknown as CommercialListing[];
  },

  async addCommercialToFavorites(userId: string, listingId: string): Promise<void> {
    const { error } = await supabase
      .from('commercial_favorites')
      .insert({ user_id: userId, listing_id: listingId });

    if (error) {
      if (error.code === '23505') return;
      console.error('Error adding commercial listing to favorites:', error);
      throw error;
    }
  },

  async removeCommercialFromFavorites(userId: string, listingId: string): Promise<void> {
    const { error } = await supabase
      .from('commercial_favorites')
      .delete()
      .eq('user_id', userId)
      .eq('listing_id', listingId);

    if (error) {
      console.error('Error removing commercial listing from favorites:', error);
      throw error;
    }
  },

  async getUserCommercialFavoriteIds(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('commercial_favorites')
      .select('listing_id')
      .eq('user_id', userId);

    if (error) {
      console.error('Error loading commercial favorite IDs:', error);
      return [];
    }

    return (data || []).map((fav: any) => fav.listing_id);
  },

  async getCommercialFavorites(userId: string): Promise<CommercialListing[]> {
    const { data, error } = await supabase
      .from('commercial_favorites')
      .select(`
        commercial_listings!inner(
          *,
          owner:profiles(full_name,role,agency),
          listing_images:commercial_listing_images(id,image_url,is_featured,sort_order)
        )
      `)
      .eq('user_id', userId)
      .eq('commercial_listings.is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading commercial favorites:', error);
      throw error;
    }

    return ((data || []) as any[]).map(item => ({
      ...(item as any).commercial_listings,
      is_favorited: true,
    })) as CommercialListing[];
  },

  async getAdminCommercialListings(
    approved?: boolean,
    sortField?: string,
    sortDirection?: 'asc' | 'desc',
  ): Promise<CommercialListing[]> {
    let query = supabase
      .from('commercial_listings')
      .select(`
        *,
        owner:profiles(full_name,role)
      `);

    if (approved !== undefined) {
      query = query.eq('approved', approved);
    }

    if (sortField && sortDirection) {
      if (sortField === 'owner') {
        query = query.order('full_name', { foreignTable: 'owner', ascending: sortDirection === 'asc' });
      } else {
        query = query.order(sortField, { ascending: sortDirection === 'asc' });
      }
    } else {
      query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error loading admin commercial listings:', error);
      throw error;
    }

    return (data || []) as unknown as CommercialListing[];
  },

  async uploadTempCommercialListingImage(
    file: File,
    userId: string,
  ): Promise<{ filePath: string; publicUrl: string }> {
    if (!userId) {
      throw new Error('User must be authenticated to upload images');
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `commercial/user_${userId}/temp/${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('listing-images')
      .upload(fileName, file);

    if (error) {
      console.error('Commercial temp image upload failed:', error);
      throw error;
    }

    console.log('Commercial temp image uploaded:', data);

    const { data: { publicUrl } } = supabase.storage
      .from('listing-images')
      .getPublicUrl(fileName);

    return { filePath: fileName, publicUrl };
  },

  async finalizeCommercialTempImages(
    listingId: string,
    userId: string,
    tempImages: { filePath: string; publicUrl: string; is_featured: boolean; originalName: string }[],
  ): Promise<void> {
    if (tempImages.length === 0) return;

    // TODO: Deploy move-temp-commercial-images edge function before using this method.
    // This function does NOT yet exist. It must write to commercial_listing_images,
    // not listing_images. The residential move-temp-images function cannot be reused here.
    const { error } = await supabase.functions.invoke('move-temp-commercial-images', {
      body: { listingId, userId, tempImages },
    });

    if (error) {
      throw new Error(error.message || 'Failed to finalize commercial images');
    }
  },

  async uploadCommercialListingImage(file: File, listingId: string): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `commercial/${listingId}/${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('listing-images')
      .upload(fileName, file);

    if (error) {
      console.error('Commercial image upload failed:', error);
      throw error;
    }

    console.log('Commercial image uploaded:', data);

    const { data: { publicUrl } } = supabase.storage
      .from('listing-images')
      .getPublicUrl(fileName);

    return publicUrl;
  },

  async addCommercialListingImage(
    listingId: string,
    imageUrl: string,
    isFeatured = false,
    sortOrder = 0,
  ): Promise<CommercialListingImage> {
    const { data, error } = await supabase
      .from('commercial_listing_images')
      .insert({
        listing_id: listingId,
        image_url: imageUrl,
        is_featured: isFeatured,
        sort_order: sortOrder,
      })
      .select()
      .single();

    if (error) throw error;
    return data as CommercialListingImage;
  },

  async deleteCommercialListingImage(imageId: string, imageUrl: string): Promise<void> {
    const { error: dbError } = await supabase
      .from('commercial_listing_images')
      .delete()
      .eq('id', imageId);

    if (dbError) throw dbError;

    try {
      const { error: storageError } = await supabase.storage
        .from('listing-images')
        .remove([imageUrl]);

      if (storageError) {
        console.error('Error deleting commercial image from storage:', storageError);
      }
    } catch (storageError) {
      console.error('Unexpected error deleting commercial image from storage:', storageError);
    }
  },

  async updateCommercialListingImage(
    imageId: string,
    updates: { is_featured?: boolean; sort_order?: number },
  ): Promise<CommercialListingImage> {
    const { data, error } = await supabase
      .from('commercial_listing_images')
      .update(updates)
      .eq('id', imageId)
      .select()
      .single();

    if (error) throw error;
    return data as CommercialListingImage;
  },

  async getActiveCommercialNeighborhoods(listingType?: 'rental' | 'sale'): Promise<string[]> {
    let query = supabase
      .from('commercial_listings')
      .select('neighborhood')
      .eq('is_active', true)
      .eq('approved', true);

    if (listingType) {
      query = query.eq('listing_type', listingType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching commercial neighborhoods:', error);
      return [];
    }

    return [
      ...new Set(
        (data || [])
          .map((item: any) => (item.neighborhood || '').trim())
          .filter((n: string) => n && n !== '-' && n.replace(/\s/g, '') !== ''),
      ),
    ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  },

  async getActiveCommercialAgencies(listingType?: 'rental' | 'sale'): Promise<string[]> {
    let query = supabase
      .from('commercial_listings')
      .select('owner:profiles!inner(role,agency)')
      .eq('is_active', true)
      .eq('approved', true)
      .or('role.eq.agent', { foreignTable: 'owner' });

    if (listingType) {
      query = query.eq('listing_type', listingType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching commercial agencies:', error);
      return [];
    }

    const names = ((data ?? []) as any[])
      .map((r: any) => r?.owner?.agency)
      .filter((x: any) => typeof x === 'string' && x.trim().length > 0);

    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  },

  async renewCommercialListing(
    listingId: string,
    listingType: 'rental' | 'sale',
    saleStatus?: string | null,
  ): Promise<CommercialListing> {
    const { rentalDays, saleDays } = await getAdminActiveDays();
    const newExpiresAt = getExpirationDate(
      listingType,
      saleStatus as any,
      listingType === 'sale' ? saleDays : rentalDays,
    );
    const now = new Date().toISOString();

    const { data: updatedListing, error } = await supabase
      .from('commercial_listings')
      .update({
        is_active: true,
        last_published_at: now,
        expires_at: newExpiresAt.toISOString(),
        deactivated_at: null,
        updated_at: now,
      })
      .eq('id', listingId)
      .select()
      .single();

    if (error) {
      console.error('Error renewing commercial listing:', error);
      throw error;
    }

    return updatedListing as unknown as CommercialListing;
  },

  async incrementCommercialListingView(id: string): Promise<void> {
    try {
      await supabase.rpc('increment_commercial_listing_views', { listing_id: id });
    } catch {
      try {
        const { data: current } = await supabase
          .from('commercial_listings')
          .select('views, direct_views')
          .eq('id', id)
          .maybeSingle();
        if (current) {
          await supabase
            .from('commercial_listings')
            .update({
              views: (current.views ?? 0) + 1,
              direct_views: (current.direct_views ?? 0) + 1,
            })
            .eq('id', id);
        }
      } catch (innerErr) {
        console.error('Error incrementing commercial listing view:', innerErr);
      }
    }
  },

  async getCommercialFeaturedListingsCount(): Promise<number> {
    const { count, error } = await supabase
      .from('commercial_listings')
      .select('*', { count: 'exact', head: true })
      .eq('is_featured', true)
      .gt('featured_expires_at', new Date().toISOString());

    if (error) {
      console.error('Error getting commercial featured listings count:', error);
      return 0;
    }

    return count || 0;
  },

  async getCommercialFeaturedListingsForSearch(
    filters: GetCommercialListingsFilters = {},
    listingType: 'rental' | 'sale' = 'rental',
    userId?: string,
  ): Promise<CommercialListing[]> {
    const now = new Date().toISOString();

    let query = supabase
      .from('commercial_listings')
      .select('*,owner:profiles(id,full_name,role,agency),listing_images:commercial_listing_images(*)')
      .eq('is_active', true)
      .eq('approved', true)
      .eq('is_featured', true)
      .gt('featured_expires_at', now)
      .eq('listing_type', listingType);

    if (filters.min_price && listingType === 'rental') {
      query = query.gte('price', filters.min_price);
    }
    if (filters.max_price && listingType === 'rental') {
      query = query.lte('price', filters.max_price);
    }
    if (filters.min_price && listingType === 'sale') {
      query = query.gte('asking_price', filters.min_price);
    }
    if (filters.max_price && listingType === 'sale') {
      query = query.lte('asking_price', filters.max_price);
    }

    query = applyCommercialFilters(query, filters);
    query = query.order('created_at', { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error('Error getting commercial featured listings for search:', error);
      return [];
    }

    let listings = (data || []) as unknown as CommercialListing[];

    if (userId) {
      const { data: favData } = await supabase
        .from('commercial_favorites')
        .select('listing_id')
        .eq('user_id', userId);
      const favIds = new Set((favData || []).map((f: any) => f.listing_id));
      listings = listings.map(l => ({ ...l, is_favorited: favIds.has(l.id) }));
    }

    return listings;
  },
};
