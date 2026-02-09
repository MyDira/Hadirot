import * as Sentry from '@sentry/react';
import { supabase, Listing, SaleStatus } from '../config/supabase';
import { capitalizeName } from '../utils/formatters';

export const LISTING_DURATION_DAYS = {
  RENTAL: 30,
  SALE_AVAILABLE: 30,
  SALE_PENDING: 30,
  SALE_IN_CONTRACT: 42,
  SALE_SOLD: 30,
} as const;

export const EXTENSION_WINDOW_DAYS = 7;

export function getExpirationDate(listingType: 'rental' | 'sale', saleStatus?: SaleStatus | null): Date {
  const now = new Date();
  let days: number;

  if (listingType === 'rental' || !listingType) {
    days = LISTING_DURATION_DAYS.RENTAL;
  } else {
    switch (saleStatus) {
      case 'pending':
        days = LISTING_DURATION_DAYS.SALE_PENDING;
        break;
      case 'in_contract':
        days = LISTING_DURATION_DAYS.SALE_IN_CONTRACT;
        break;
      case 'sold':
        days = LISTING_DURATION_DAYS.SALE_SOLD;
        break;
      case 'available':
      default:
        days = LISTING_DURATION_DAYS.SALE_AVAILABLE;
        break;
    }
  }

  now.setDate(now.getDate() + days);
  return now;
}

export function canExtendListing(listing: Listing): { canExtend: boolean; reason?: string } {
  if (listing.listing_type !== 'sale') {
    return { canExtend: false, reason: 'Only sale listings can be extended' };
  }
  if (!listing.is_active) {
    return { canExtend: false, reason: 'Inactive listings cannot be extended' };
  }
  if (listing.sale_status === 'sold') {
    return { canExtend: false, reason: 'Sold listings cannot be extended' };
  }
  if (!listing.expires_at) {
    return { canExtend: true };
  }

  const expiresAt = new Date(listing.expires_at);
  const now = new Date();
  const daysUntilExpiration = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntilExpiration > EXTENSION_WINDOW_DAYS) {
    return { canExtend: false, reason: `Extension available ${daysUntilExpiration - EXTENSION_WINDOW_DAYS} days before expiration` };
  }

  return { canExtend: true };
}

export function getDaysUntilExpiration(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const expires = new Date(expiresAt);
  const now = new Date();
  return Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export type SortOption = 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'bedrooms_asc' | 'bedrooms_desc' | 'bathrooms_asc' | 'bathrooms_desc';

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface GetListingsFilters {
  bedrooms?: number[];
  min_bathrooms?: number;
  property_type?: string;
  property_types?: string[];
  building_types?: string[];
  min_price?: number;
  max_price?: number;
  parking_included?: boolean;
  neighborhoods?: string[];
  is_featured_only?: boolean;
  noFeeOnly?: boolean;
  poster_type?: string;
  agency_name?: string;
  sort?: SortOption;
  bounds?: MapBounds;
}

export type ListingCreateInput = Omit<Listing, 'id' | 'created_at' | 'updated_at'> & {
  price: number | null;
  call_for_price?: boolean;
  broker_fee?: boolean;
};

export type ListingUpdateInput = Partial<ListingCreateInput> & {
  id: string;
};

interface AgencyListingsQueryOptions {
  beds?: number | '4+';
  priceMin?: number;
  priceMax?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc';
  limit?: number;
  offset?: number;
  listingType?: 'rental' | 'sale';
}

export const listingsService = {
  async getActiveAgencies(): Promise<string[]> {
    const { data, error } = await supabase
      .from('listings')
      .select('owner:profiles!inner(role,agency)')
      .eq('is_active', true)
      .eq('approved', true)
      .or('role.eq.agent', { foreignTable: 'owner' });

    if (error) {
      console.error('[svc] getActiveAgencies error', error);
      return [];
    }

    const names = (data ?? [])
      .map((r: any) => r?.owner?.agency)
      .filter((x: any) => typeof x === 'string' && x.trim().length > 0);

    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  },

  async getListings(
    filters: GetListingsFilters = {},
    limit?: number,
    userId?: string,
    offset = 0,
    applyPagination: boolean = true,
    is_featured_only?: boolean,
  ) {
    const posterType = filters?.poster_type as 'owner' | 'agent' | undefined;
    const agencyName = (filters as any)?.agency_name || undefined;

    const ownerSelect =
      posterType === 'owner' || posterType === 'agent' || !!agencyName
        ? 'owner:profiles!inner(id,full_name,role,agency)'
        : 'owner:profiles(id,full_name,role,agency)';

    const selectStr = `*,${ownerSelect},listing_images(*)`;

    let query = supabase
      .from('listings')
      .select(selectStr, { count: 'exact' })
      .eq('is_active', true)
      .eq('approved', true)
      .or('listing_type.eq.rental,listing_type.is.null');

    if (filters.bedrooms !== undefined && filters.bedrooms.length > 0) {
      query = query.in('bedrooms', filters.bedrooms);
    }
    if (filters.min_bathrooms && filters.min_bathrooms > 0) {
      query = query.gte('bathrooms', filters.min_bathrooms);
    }
    if (filters.property_types && filters.property_types.length > 0) {
      query = query.in('property_type', filters.property_types);
    } else if (filters.property_type) {
      query = query.eq('property_type', filters.property_type);
    }
    if (filters.min_price) {
      query = query.gte('price', filters.min_price);
    }
    if (filters.max_price) {
      query = query.lte('price', filters.max_price);
    }
    if (filters.parking_included) {
      query = query.in('parking', ['yes', 'included']);
    }
    if (filters.neighborhoods && filters.neighborhoods.length > 0) {
      query = query.in('neighborhood', filters.neighborhoods);
    }
    if (filters.noFeeOnly) {
      query = query.eq('broker_fee', false);
    }

    if (filters.bounds) {
      query = query
        .gte('latitude', filters.bounds.south)
        .lte('latitude', filters.bounds.north)
        .gte('longitude', filters.bounds.west)
        .lte('longitude', filters.bounds.east);
    }

    // Filter for featured-only listings if requested via filters
    if (filters.is_featured_only || is_featured_only) {
      query = query
        .eq('is_featured', true)
        .gt('featured_expires_at', new Date().toISOString());
    }

    // Apply poster predicates
    if (posterType === 'owner') {
      query = query.or('role.eq.landlord,role.eq.tenant', { foreignTable: 'owner' });
    } else if (posterType === 'agent') {
      query = query.or('role.eq.agent', { foreignTable: 'owner' });
      if (agencyName) {
        query = query.eq('owner.agency', agencyName);
      }
    }

    // Apply sorting
    switch (filters.sort) {
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'price_asc':
        query = query.order('price', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
        break;
      case 'price_desc':
        query = query.order('price', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
        break;
      case 'bedrooms_asc':
        query = query.order('bedrooms', { ascending: true }).order('created_at', { ascending: false });
        break;
      case 'bedrooms_desc':
        query = query.order('bedrooms', { ascending: false }).order('created_at', { ascending: false });
        break;
      case 'bathrooms_asc':
        query = query.order('bathrooms', { ascending: true }).order('created_at', { ascending: false });
        break;
      case 'bathrooms_desc':
        query = query.order('bathrooms', { ascending: false }).order('created_at', { ascending: false });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    // Only apply pagination if requested
    if (applyPagination) {
      if (limit !== undefined) {
        query = query.range(offset, offset + (limit || 20) - 1);
      }
    }


    const { data, error, count } = await query;

    if (error) {
      console.error("Error loading listings:", error);
      return { data: [], totalCount: 0 };
    }

    return { data: data || [], totalCount: count || 0 };
  },

  async getActiveListingsByAgencyId(
    agencyId: string,
    options: AgencyListingsQueryOptions = {},
  ): Promise<{ data: Listing[]; count: number }> {
    if (!agencyId) {
      return { data: [], count: 0 };
    }

    const { beds, priceMin, priceMax, sort = 'newest', listingType = 'rental' } = options;
    const limit = Number.isFinite(options.limit) && (options.limit ?? 0) > 0 ? Number(options.limit) : 20;
    const offset = Number.isFinite(options.offset) && (options.offset ?? 0) > 0 ? Number(options.offset) : 0;

    let listingsQuery = supabase
      .from('listings')
      .select(
        `
          *,
          owner:profiles(id, full_name, role, agency),
          listing_images(*)
        `,
        { count: 'exact' },
      )
      .eq('is_active', true)
      .eq('approved', true)
      .eq('agency_id', agencyId)
      .eq('listing_type', listingType);

    const normalizedBeds = typeof beds === 'string' ? parseInt(beds, 10) : beds;

    if (typeof normalizedBeds === 'number' && !Number.isNaN(normalizedBeds)) {
      if (normalizedBeds >= 4) {
        listingsQuery = listingsQuery.gte('bedrooms', normalizedBeds);
      } else {
        listingsQuery = listingsQuery.eq('bedrooms', normalizedBeds);
      }
    }

    if (typeof priceMin === 'number') {
      listingsQuery = listingsQuery.gte('price', priceMin);
    }

    if (typeof priceMax === 'number') {
      listingsQuery = listingsQuery.lte('price', priceMax);
    }

    switch (sort) {
      case 'price_asc':
        listingsQuery = listingsQuery.order('price', { ascending: true }).order('created_at', { ascending: false });
        break;
      case 'price_desc':
        listingsQuery = listingsQuery.order('price', { ascending: false }).order('created_at', { ascending: false });
        break;
      case 'newest':
      default:
        listingsQuery = listingsQuery.order('created_at', { ascending: false });
        break;
    }

    listingsQuery = listingsQuery.range(offset, offset + limit - 1);

    const { data, error, count } = await listingsQuery;

    if (error) {
      console.error('[svc] getActiveListingsByAgencyId error', error);
      throw error;
    }

    return { data: data ?? [], count: count ?? 0 };
  },

  async getListing(id: string, userId?: string, isAdmin: boolean = false) {
    let query = supabase
      .from('listings')
      .select(`
        *,
        approved,
        is_active,
        listing_images(*),
        owner:profiles!listings_user_id_fkey(full_name, role, agency)
      `)
      .eq('id', id);

    // Apply access conditions based on authentication
    if (userId) {
      if (isAdmin) {
        // Admins can see ALL listings (no access filter applied)
        // Don't add any approved/is_active filters
      } else {
        // For regular authenticated users: show approved+active listings OR their own listings
        query = query.or(`and(is_active.eq.true,approved.eq.true),user_id.eq.${userId}`);
      }
    } else {
      // For unauthenticated users: only show approved+active listings
      query = query.eq('approved', true).eq('is_active', true);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error("❌ Error loading listing:", error);
      throw error;
    }
    
    if (!data) {
      console.log("ℹ️ Listing not found or not accessible");
      return null;
    }

    // Check if the listing is favorited by the current user
    let is_favorited = false;
    if (userId) {
      const { data: favoriteData } = await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('listing_id', id)
        .maybeSingle();
      
      is_favorited = !!favoriteData;
    }

    return { ...data, is_favorited };
  },

  async createListing(payload: ListingCreateInput) {
    if (payload.broker_fee === true) {
      return {
        data: null,
        error: { message: "Broker fees are not permitted on HaDirot." },
      } as any;
    }

    // If trying to feature a listing on creation, check permissions and limits
    if (payload.is_featured) {
      // Get user profile to check permissions
      const { data: userProfile, error: profileError } = await supabase // Fetch user profile
        .from('profiles')
        .select('is_admin, max_featured_listings_per_user, can_feature_listings')
        .eq('id', payload.user_id)
        .single();

      if (profileError || !userProfile) {
        throw new Error('Unable to verify user permissions');
      }
      
      // Check if user has general permission to feature listings
      if (!userProfile.is_admin && !userProfile.can_feature_listings) {
        throw new Error('You do not have permission to feature listings. Please contact support to upgrade your account.');
      }


      // Get admin settings for limits
      const settings = await this.getAdminSettings();
      
      // Determine the effective per-user limit
      const effectiveUserLimit = userProfile?.max_featured_listings_per_user ?? settings.max_featured_per_user ?? 0;
      
      // Check if user has permission to feature listings based on their effective limit
      if (!userProfile.is_admin && effectiveUserLimit <= 0) {
        throw new Error('You do not have permission to feature listings. Please contact support to upgrade your account.');
      }

      // Check global featured listings limit
      const globalCount = await this.getFeaturedListingsCount();
      if (globalCount >= settings.max_featured_listings) {
        throw new Error('The sitewide maximum for featured listings has been reached. Please check back later or contact support.');
      }

      // Check per-user limit (unless user is admin)
      if (!userProfile.is_admin) {
      const userCount = await this.getFeaturedListingsCountByUser(payload.user_id);
        if (userCount >= effectiveUserLimit) {
          throw new Error(`You can only feature up to ${effectiveUserLimit} listing${effectiveUserLimit === 1 ? '' : 's'} at a time.`);
        }
      }

      // Set expiration date to 1 week from now
      const oneWeekFromNow = new Date();
      oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
      payload.featured_expires_at = oneWeekFromNow.toISOString();
    }

    // Capitalize the contact name
    if (payload.contact_name) {
      payload.contact_name = capitalizeName(payload.contact_name);
    }

    payload.broker_fee = false;

    const data = {
      ...payload,
      call_for_price: !!payload.call_for_price,
      price: payload.call_for_price ? null : payload.price ?? null,
    };

    const { data: result, error } = await supabase
      .from('listings')
      .insert(data)
      .select()
      .single();

    if (error) {
      // Capture database errors in Sentry
      Sentry.captureException(error, {
        tags: {
          service: 'listings',
          operation: 'create',
          error_type: 'database_error',
        },
        extra: {
          listing_data: {
            bedrooms: data.bedrooms,
            property_type: data.property_type,
            is_featured: data.is_featured,
          },
        },
      });
      throw error;
    }
    return result;
  },

  async updateListing(id: string, payload: Partial<ListingCreateInput>) {
    if (payload.broker_fee === true) {
      return {
        data: null,
        error: { message: "Broker fees are not permitted on HaDirot." },
      } as any;
    }

    if (payload.broker_fee !== undefined) {
      payload.broker_fee = false;
    }

    console.log('[WEB] updateListing called', { id, updates: payload });
    // Get the current listing to check for approval status change
    const { data: currentListing } = await supabase
      .from('listings')
      .select('approved, title, user_id, is_featured, call_for_price, profiles!listings_user_id_fkey(full_name, email, is_admin, can_feature_listings)')
      .eq('id', id)
      .single();

    // If trying to feature a listing, check permissions and limits
    if (payload.is_featured === true && currentListing && !currentListing.is_featured) {
      // Get fresh user profile data to ensure we have the latest limits
      const { data: userProfile, error: profileError } = await supabase // Fetch user profile
        .from('profiles')
        .select('id, is_admin, max_featured_listings_per_user, can_feature_listings')
        .eq('id', currentListing.user_id)
        .single();

      if (profileError || !userProfile) {
        throw new Error('Unable to verify user permissions');
      }
      
      console.log('🔍 User profile for featuring check (update):', {
        userId: currentListing.user_id,
        is_admin: userProfile.is_admin,
        can_feature_listings: userProfile.can_feature_listings,
        max_featured_listings_per_user: userProfile.max_featured_listings_per_user
      });
      
      // Check if user has general permission to feature listings
      if (!userProfile.is_admin && !userProfile.can_feature_listings) {
        throw new Error('You do not have permission to feature listings. Please contact support to upgrade your account.');
      }
      // Get admin settings for limits
      const settings = await this.getAdminSettings();
      
      // Determine the effective per-user limit
      const effectiveUserLimit = userProfile.max_featured_listings_per_user ?? settings.max_featured_per_user ?? 0;
      
      // Check if user has permission to feature listings based on their effective limit
      if (!userProfile.is_admin && effectiveUserLimit <= 0) {
        throw new Error('You do not have permission to feature listings. Please contact support to upgrade your account.');
      }

      // Check global featured listings limit
      const globalCount = await this.getFeaturedListingsCount();
      if (globalCount >= settings.max_featured_listings) {
        throw new Error('The sitewide maximum for featured listings has been reached. Please check back later or contact support.');
      }

      // Check per-user limit (unless user is admin)
      if (!userProfile.is_admin) {
        const userCount = await this.getFeaturedListingsCountByUser(currentListing.user_id);
        if (userCount >= effectiveUserLimit) {
          throw new Error(`You can only feature up to ${effectiveUserLimit} listing${effectiveUserLimit === 1 ? '' : 's'} at a time.`);
        }
      }

      const oneWeekFromNow = new Date();
      oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
      payload.featured_expires_at = oneWeekFromNow.toISOString();
      payload.featured_started_at = new Date().toISOString();
    }

    if (payload.is_featured === false) {
      payload.featured_expires_at = null;
    }

    if (payload.is_active === false && currentListing?.is_featured) {
      payload.is_featured = false;
      payload.featured_expires_at = null;
    }

    // Capitalize the contact name if it's being updated
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
      .from('listings')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      // Capture database errors in Sentry
      Sentry.captureException(error, {
        tags: {
          service: 'listings',
          operation: 'update',
          error_type: 'database_error',
          listing_id: id,
        },
        extra: {
          listing_id: id,
          update_data: {
            bedrooms: data.bedrooms,
            property_type: data.property_type,
            is_featured: data.is_featured,
          },
        },
      });
      throw error;
    }

    console.log('[WEB] approval flip check', { wasApproved: currentListing?.approved, nowApproved: payload?.approved });
    const justApproved =
      !!currentListing &&
      currentListing.approved === false &&
      payload?.approved === true;
    console.log('[WEB] approval flip check passed?', justApproved);
    if (justApproved) {
      const owner = (currentListing as unknown as { owner?: { email?: string; full_name?: string; id?: string } })?.owner;
      const ownerEmail = currentListing?.profiles?.email ?? owner?.email ?? null;
      const ownerName = currentListing?.profiles?.full_name ?? owner?.full_name ?? null;
      const ownerId = currentListing?.profiles?.id ?? owner?.id ?? null;
      const listingOwnerFields = currentListing as unknown as { owner_id?: unknown; ownerId?: unknown };
      console.log('[WEB] owner check', {
        ownerId,
        ownerEmail,
        ownerName,
        ownerLoaded: !!currentListing?.profiles || !!owner,
        listingHasOwnerId: !!listingOwnerFields.owner_id || !!listingOwnerFields.ownerId,
      });
      if (!ownerEmail || !ownerName) {
        console.warn('[WEB] skipping approval email: missing owner email', { listingId: id, owner: { ownerId, ownerName } });
      } else {
        try {
          console.log('[WEB] sending approval email', { listingId: id, to: ownerEmail });
          await emailService.sendListingApprovalEmail(
            ownerEmail,
            ownerName,
            currentListing.title,
            id
          );
          console.log('✅ Listing approval email sent successfully');
        } catch (err) {
          console.error('[WEB] approval email error', err instanceof Error ? err.message : err);
          // Don't throw error - approval should still succeed even if email fails
        }
      }
    }
    
    return result;
  },

  async deleteListing(id: string) {
    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getSimilarListings(listing: Listing, limit = 3, offset = 0) {
    // Build a more intelligent similar listings query with multiple matching criteria

    // Calculate price range (within 25% of listing price)
    const priceBuffer = listing.price ? listing.price * 0.25 : null;
    const minPrice = priceBuffer ? listing.price! - priceBuffer : null;
    const maxPrice = priceBuffer ? listing.price! + priceBuffer : null;

    // Try to find similar listings with prioritized matching:
    // 1st priority: Same bedrooms, neighborhood, and property type
    // 2nd priority: Same bedrooms and neighborhood
    // 3rd priority: Same bedrooms and price range
    // 4th priority: Similar bedrooms (±1) and neighborhood
    // 5th priority: Same bedrooms only
    // 6th priority: Any active listings

    let query = supabase
      .from('listings')
      .select(`
        *,
        owner:public_profiles!listings_user_id_fkey(full_name, role, agency),
        listing_images(id, image_url, is_featured, sort_order)
      `)
      .eq('is_active', true)
      .eq('approved', true)
      .neq('id', listing.id);

    // Apply filters in order of priority
    // Start with exact bedroom match
    let { data, error } = await query
      .eq('bedrooms', listing.bedrooms)
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // If we got enough results, return them
    if (data && data.length >= limit) {
      return data as Listing[];
    }

    // Not enough results - try nearby bedroom counts (±1)
    const nearbyBedrooms = [listing.bedrooms - 1, listing.bedrooms, listing.bedrooms + 1]
      .filter(b => b >= 0); // Don't go below 0 bedrooms

    const { data: moreData, error: moreError } = await supabase
      .from('listings')
      .select(`
        *,
        owner:public_profiles!listings_user_id_fkey(full_name, role, agency),
        listing_images(id, image_url, is_featured, sort_order)
      `)
      .eq('is_active', true)
      .eq('approved', true)
      .neq('id', listing.id)
      .in('bedrooms', nearbyBedrooms)
      .range(offset, offset + limit - 1);

    if (moreError) throw moreError;

    // Combine and deduplicate results
    const combined = [...(data || []), ...(moreData || [])];
    const uniqueListings = Array.from(
      new Map(combined.map(item => [item.id, item])).values()
    );

    // Sort by similarity score
    const scored = uniqueListings.map(item => {
      let score = 0;

      // Exact bedroom match: +10 points
      if (item.bedrooms === listing.bedrooms) score += 10;

      // Same neighborhood: +8 points
      if (item.neighborhood && listing.neighborhood &&
          item.neighborhood.toLowerCase() === listing.neighborhood.toLowerCase()) {
        score += 8;
      }

      // Same property type: +5 points
      if (item.property_type === listing.property_type) score += 5;

      // Within price range: +3 points
      if (minPrice && maxPrice && item.price &&
          item.price >= minPrice && item.price <= maxPrice) {
        score += 3;
      }

      // Featured listings: +2 points
      if (item.is_featured) score += 2;

      return { ...item, similarityScore: score };
    });

    // Sort by score (highest first), then by created_at (newest first)
    scored.sort((a, b) => {
      if (b.similarityScore !== a.similarityScore) {
        return b.similarityScore - a.similarityScore;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    // Return the requested slice
    return scored.slice(0, limit) as Listing[];
  },

  async getFeaturedListingsCount(): Promise<number> {
    const { count, error } = await supabase
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('is_featured', true)
      .gt('featured_expires_at', new Date().toISOString());

    if (error) {
      console.error('Error getting featured listings count:', error);
      return 0;
    }

    return count || 0;
  },

  async getFeaturedListingsCountByUser(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_featured', true)
      .gt('featured_expires_at', new Date().toISOString());

    if (error) {
      console.error('Error getting featured listings count by user:', error);
      return 0;
    }

    return count || 0;
  },

  async getActiveFeaturedListings(userId?: string): Promise<Listing[]> {
    const now = new Date().toISOString();
    let query = supabase
      .from('listings')
      .select('*,owner:profiles(id,full_name,role,agency),listing_images(*)')
      .eq('is_active', true)
      .eq('approved', true)
      .eq('is_featured', true)
      .gt('featured_expires_at', now)
      .order('featured_started_at', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Error getting active featured listings:', error);
      return [];
    }

    let listings = (data || []) as unknown as Listing[];

    if (userId) {
      const { data: favData } = await supabase
        .from('favorites')
        .select('listing_id')
        .eq('user_id', userId);
      const favIds = new Set((favData || []).map((f: any) => f.listing_id));
      listings = listings.map(l => ({ ...l, is_favorited: favIds.has(l.id) }));
    }

    return listings;
  },

  async getFeaturedListingsForSearch(
    filters: GetListingsFilters = {},
    listingType: 'rental' | 'sale' = 'rental',
    userId?: string,
  ): Promise<Listing[]> {
    const now = new Date().toISOString();
    const posterType = filters?.poster_type as 'owner' | 'agent' | undefined;
    const agencyName = (filters as any)?.agency_name || undefined;

    const ownerSelect =
      posterType === 'owner' || posterType === 'agent' || !!agencyName
        ? 'owner:profiles!inner(id,full_name,role,agency)'
        : 'owner:profiles(id,full_name,role,agency)';

    let query = supabase
      .from('listings')
      .select(`*,${ownerSelect},listing_images(*)`)
      .eq('is_active', true)
      .eq('approved', true)
      .eq('is_featured', true)
      .gt('featured_expires_at', now);

    if (listingType === 'sale') {
      query = query.eq('listing_type', 'sale');
    } else {
      query = query.or('listing_type.eq.rental,listing_type.is.null');
    }

    if (filters.bedrooms !== undefined && filters.bedrooms.length > 0) {
      query = query.in('bedrooms', filters.bedrooms);
    }
    if (filters.min_bathrooms && filters.min_bathrooms > 0) {
      query = query.gte('bathrooms', filters.min_bathrooms);
    }
    if (filters.property_types && filters.property_types.length > 0) {
      query = query.in('property_type', filters.property_types);
    } else if (filters.property_type) {
      query = query.eq('property_type', filters.property_type);
    }
    if (listingType === 'sale') {
      if (filters.building_types && filters.building_types.length > 0) {
        query = query.in('building_type', filters.building_types);
      }
      if (filters.min_price) query = query.gte('asking_price', filters.min_price);
      if (filters.max_price) query = query.lte('asking_price', filters.max_price);
    } else {
      if (filters.min_price) query = query.gte('price', filters.min_price);
      if (filters.max_price) query = query.lte('price', filters.max_price);
    }
    if (filters.parking_included) {
      query = query.in('parking', ['yes', 'included']);
    }
    if (filters.neighborhoods && filters.neighborhoods.length > 0) {
      query = query.in('neighborhood', filters.neighborhoods);
    }
    if (filters.noFeeOnly) {
      query = query.eq('broker_fee', false);
    }
    if (filters.bounds) {
      query = query
        .gte('latitude', filters.bounds.south)
        .lte('latitude', filters.bounds.north)
        .gte('longitude', filters.bounds.west)
        .lte('longitude', filters.bounds.east);
    }

    if (posterType === 'owner') {
      query = query.or('role.eq.landlord,role.eq.tenant', { foreignTable: 'owner' });
    } else if (posterType === 'agent') {
      query = query.or('role.eq.agent', { foreignTable: 'owner' });
      if (agencyName) {
        query = query.eq('owner.agency', agencyName);
      }
    }

    query = query.order('featured_started_at', { ascending: true });

    const { data, error } = await query;

    if (error) {
      console.error('Error getting featured listings for search:', error);
      return [];
    }

    let listings = (data || []) as unknown as Listing[];

    if (userId) {
      const { data: favData } = await supabase
        .from('favorites')
        .select('listing_id')
        .eq('user_id', userId);
      const favIds = new Set((favData || []).map((f: any) => f.listing_id));
      listings = listings.map(l => ({ ...l, is_favorited: favIds.has(l.id) }));
    }

    return listings;
  },

  async getAdminSettings() {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('max_featured_listings, max_featured_per_user, max_featured_boost_positions')
      .single();

    if (error) {
      console.error('Error getting admin settings:', error);
      return { max_featured_listings: 8, max_featured_per_user: 0, max_featured_boost_positions: 4 };
    }

    return {
      max_featured_listings: data.max_featured_listings || 8,
      max_featured_per_user: data.max_featured_per_user || 0,
      max_featured_boost_positions: data.max_featured_boost_positions || 4,
    };
  },

  async updateAdminSettings(updates: { max_featured_listings?: number; max_featured_per_user?: number }) {
    // First, check if admin settings record exists
    const { data: existingSettings, error: fetchError } = await supabase
      .from('admin_settings')
      .select('id')
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 is "not found" error, which is expected if no settings exist yet
      console.error('Error fetching admin settings:', fetchError);
      throw fetchError;
    }

    if (existingSettings) {
      // Update existing record
      const { data, error } = await supabase
        .from('admin_settings')
        .update(updates)
        .eq('id', existingSettings.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating admin settings:', error);
        throw error;
      }

      return data;
    } else {
      // Create new record with defaults
      const { data, error } = await supabase
        .from('admin_settings')
        .insert({
          max_featured_listings: updates.max_featured_listings || 8,
          max_featured_per_user: updates.max_featured_per_user || 2,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating admin settings:', error);
        throw error;
      }

      return data;
    }
  },

  async addToFavorites(userId: string, listingId: string) {
    console.log('🔄 Adding to favorites:', { userId, listingId });
    
    const { error } = await supabase
      .from('favorites')
      .insert({ user_id: userId, listing_id: listingId });

    if (error) {
      if (error.code === '23505') {
        console.log('⚠️ Favorite already exists, ignoring duplicate');
        return;
      }
      console.error('❌ Error adding to favorites:', error);
      throw error;
    }
    
    console.log('✅ Successfully added to favorites');
  },

  async removeFromFavorites(userId: string, listingId: string) {
    console.log('🔄 Removing from favorites:', { userId, listingId });
    
    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('listing_id', listingId);

    if (error) {
      console.error('❌ Error removing from favorites:', error);
      throw error;
    }
    
    console.log('✅ Successfully removed from favorites');
  },

  async getUserFavoriteIds(userId: string) {
    const { data, error } = await supabase
      .from('favorites')
      .select('listing_id')
      .eq('user_id', userId);

    if (error) {
      console.error('Error loading user favorite IDs:', error);
      return [];
    }

    return data.map(fav => fav.listing_id);
  },

  async getFavorites(userId: string) {
    const { data, error } = await supabase
      .from('favorites')
      .select(`
        listings!inner(
          *,
          owner:profiles!listings_user_id_fkey(full_name, role, agency),
          listing_images(id, image_url, is_featured, sort_order)
        )
      `)
      .eq('user_id', userId)
      .eq('listings.is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading favorites:', error);
      throw error;
    }

    // Return just the listings with is_favorited set to true
    return (data || []).map(item => ({
      ...item.listings,
      is_favorited: true
    }));
  },

  async getAdminListings(approved?: boolean, sortField?: string, sortDirection?: 'asc' | 'desc') {
    let query = supabase
      .from('listings')
      .select(`
        *,
        owner:profiles!listings_user_id_fkey(full_name, role)
      `);

    if (approved !== undefined) {
      query = query.eq('approved', approved);
    }

    // Handle sorting
    if (sortField && sortDirection) {
      if (sortField === 'owner') {
        // Sort by owner's full_name using foreignTable syntax
        query = query.order('full_name', { 
          foreignTable: 'owner', 
          ascending: sortDirection === 'asc' 
        });
      } else {
        // Sort by direct listing fields
        query = query.order(sortField, { ascending: sortDirection === 'asc' });
      }
    } else {
      // Default sorting
      query = query.order('created_at', { ascending: false });
    }

    const { data, error, count } = await query;

    if (error) {
      console.error("Error loading admin listings:", error);
      throw error;
    }

    return data || [];
  },

  async uploadTempListingImage(file: File, userId: string): Promise<{ filePath: string; publicUrl: string }> {
    if (!userId) {
      throw new Error('User must be authenticated to upload images');
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `user_${userId}/temp/${Date.now()}.${fileExt}`;
    
    console.log('📤 Uploading temp image:', {
      fileName,
      fileSize: file.size,
      fileType: file.type,
      userId
    });

    const { data, error } = await supabase.storage
      .from('listing-images')
      .upload(fileName, file);

    if (error) {
      console.error('❌ Temp image upload failed:', error);
      throw error;
    }
    
    console.log('✅ Temp image uploaded successfully:', data);

    const { data: { publicUrl } } = supabase.storage
      .from('listing-images')
      .getPublicUrl(fileName);

    console.log('🔗 Generated public URL:', publicUrl);
    return { filePath: fileName, publicUrl };
  },

  async finalizeTempListingImages(listingId: string, userId: string, tempImages: { filePath: string; publicUrl: string; is_featured: boolean; originalName: string }[]): Promise<void> {
    if (tempImages.length === 0) return;

    const { error } = await supabase.functions.invoke('move-temp-images', {
      body: { listingId, userId, tempImages },
    });

    if (error) {
      throw new Error(error.message || 'Failed to finalize images');
    }
  },

  async uploadListingImage(file: File, listingId: string) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${listingId}/${Date.now()}.${fileExt}`;
    
    console.log('📤 Uploading image:', {
      fileName,
      fileSize: file.size,
      fileType: file.type,
      listingId
    });

    const { data, error } = await supabase.storage
      .from('listing-images')
      .upload(fileName, file);

    if (error) {
      console.error('❌ Image upload failed:', error);
      throw error;
    }
    
    console.log('✅ Image uploaded successfully:', data);

    const { data: { publicUrl } } = supabase.storage
      .from('listing-images')
      .getPublicUrl(fileName);

    console.log('🔗 Generated public URL:', publicUrl);
    return publicUrl;
  },

  async addListingImage(listingId: string, imageUrl: string, isFeatured = false, sortOrder = 0) {
    const { data, error } = await supabase
      .from('listing_images')
      .insert({
        listing_id: listingId,
        image_url: imageUrl,
        is_featured: isFeatured,
        sort_order: sortOrder
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async uploadListingVideo(file: File, listingId: string): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${listingId}/video_${Date.now()}.${fileExt}`;

    console.log('📤 Uploading video:', {
      fileName,
      fileSize: file.size,
      fileType: file.type,
      listingId
    });

    const { data, error } = await supabase.storage
      .from('listing-videos')
      .upload(fileName, file);

    if (error) {
      console.error('❌ Video upload failed:', error);
      throw error;
    }

    console.log('✅ Video uploaded successfully:', data);

    const { data: { publicUrl } } = supabase.storage
      .from('listing-videos')
      .getPublicUrl(fileName);

    console.log('🔗 Generated video public URL:', publicUrl);
    return publicUrl;
  },

  async uploadVideoThumbnail(file: File, listingId: string): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${listingId}/video_thumb_${Date.now()}.${fileExt}`;

    console.log('📤 Uploading video thumbnail:', {
      fileName,
      fileSize: file.size,
      fileType: file.type,
      listingId
    });

    const { data, error } = await supabase.storage
      .from('listing-images')
      .upload(fileName, file);

    if (error) {
      console.error('❌ Video thumbnail upload failed:', error);
      throw error;
    }

    console.log('✅ Video thumbnail uploaded successfully:', data);

    const { data: { publicUrl } } = supabase.storage
      .from('listing-images')
      .getPublicUrl(fileName);

    console.log('🔗 Generated thumbnail public URL:', publicUrl);
    return publicUrl;
  },

  async getUserListings(userId: string) {
    const { data, error } = await supabase
      .from('listings')
      .select(`
        *,
        approved,
        is_active,
        owner:profiles!listings_user_id_fkey(full_name, role, agency),
        listing_images(id, image_url, is_featured, sort_order)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const listings = (data ?? []).map((listing) => ({
      ...listing,
      impressions: Number(listing?.impressions ?? 0) || 0,
      direct_views: Number(listing?.direct_views ?? 0) || 0,
    }));

    const listingIds = listings
      .map((listing) => (typeof listing?.id === 'string' ? listing.id : null))
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    if (listingIds.length === 0) {
      return listings;
    }

    const metricsById = new Map<
      string,
      { impressions: number; direct_views: number }
    >();

    const chunkSize = 900;
    let metricsError: Error | null = null;

    for (let index = 0; index < listingIds.length; index += chunkSize) {
      const chunk = listingIds.slice(index, index + chunkSize);
      try {
        const { data: metricsRows, error: chunkError } = await supabase
          .from('listing_metrics_v1')
          .select('listing_id, impressions, direct_views')
          .in('listing_id', chunk);

        if (chunkError) {
          metricsError = chunkError;
          break;
        }

        (metricsRows ?? []).forEach((row: any) => {
          const listingId = typeof row?.listing_id === 'string' ? row.listing_id : null;
          if (!listingId) {
            return;
          }

          const impressions = Number(row?.impressions ?? 0);
          const directViews = Number(row?.direct_views ?? 0);

          metricsById.set(listingId, {
            impressions: Number.isFinite(impressions) ? impressions : 0,
            direct_views: Number.isFinite(directViews) ? directViews : 0,
          });
        });
      } catch (err) {
        metricsError = err as Error;
        break;
      }
    }

    if (metricsError) {
      console.warn('[svc] getUserListings metrics query failed', metricsError);
      return listings;
    }

    const mergedListings = listings.map((listing) => {
      const metrics = metricsById.get(listing.id);
      return {
        ...listing,
        impressions: metrics?.impressions ?? listing.impressions ?? 0,
        direct_views: metrics?.direct_views ?? listing.direct_views ?? 0,
      };
    });

    console.debug(
      '[svc] getUserListings metrics merged',
      mergedListings.map((listing) => ({
        id: listing.id,
        impressions: listing.impressions ?? 0,
        direct_views: listing.direct_views ?? 0,
      })),
    );

    return mergedListings;
  },

  async incrementListingView(listingId: string) {
    const { data: listing, error } = await supabase
      .from('listings')
      .select('views')
      .eq('id', listingId)
      .maybeSingle();

    if (error || !listing) {
      console.error("❌ Error fetching listing to increment view:", error);
      return;
    }

    const newViews = listing.views + 1;

    await supabase
      .from('listings')
      .update({ views: newViews })
      .eq('id', listingId);
  },

  async deleteListingImage(imageId: string, imageUrl: string) {
    // Delete from database
    const { error: dbError } = await supabase
      .from('listing_images')
      .delete()
      .eq('id', imageId);

    if (dbError) throw dbError;

    // Delete from storage
    try {
      // The imageUrl stored in the database is already the file path (e.g., "listingId/timestamp.jpg")
      // We just need to use it directly for storage removal
      const { error: storageError } = await supabase.storage
        .from('listing-images')
        .remove([imageUrl]);

      if (storageError) {
        console.error('Error deleting image from storage:', storageError);
        // Don't throw here - we've already deleted from database successfully
      } else {
        console.log('✅ Successfully deleted image from storage:', imageUrl);
      }
    } catch (storageError) {
      console.error('Unexpected error deleting image from storage:', storageError);
      // Don't throw here - we've already deleted from database successfully
    }
  },

 async updateListingImage(imageId: string, updates: { is_featured?: boolean; sort_order?: number }) {
   const { data, error } = await supabase
     .from('listing_images')
     .update(updates)
     .eq('id', imageId)
     .select()
     .single();

   if (error) throw error;
   return data;
 },

async getActiveNeighborhoods(): Promise<string[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('neighborhood')
    .eq('is_active', true)
    .eq('approved', true);

  if (error) {
    console.error('Error fetching neighborhoods:', error);
    return [];
  }

  const neighborhoods = [...new Set(
    (data || [])
      .map((item) => (item.neighborhood || '').trim())
      .filter(
        (n) =>
          n &&
          n !== '-' &&
          n.replace(/\s/g, '') !== '' &&
          n.length > 0,
      ),
  )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  return neighborhoods;
},

async getUniqueNeighborhoods(): Promise<string[]> {
  return this.getActiveNeighborhoods();
},

async getActiveSalesNeighborhoods(): Promise<string[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('neighborhood')
    .eq('is_active', true)
    .eq('approved', true)
    .eq('listing_type', 'sale');

  if (error) {
    console.error('Error fetching sales neighborhoods:', error);
    return [];
  }

  const neighborhoods = [...new Set(
    (data || [])
      .map((item) => (item.neighborhood || '').trim())
      .filter(
        (n) =>
          n &&
          n !== '-' &&
          n.replace(/\s/g, '') !== '' &&
          n.length > 0,
      ),
  )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  return neighborhoods;
},

async getActiveSalesAgencies(): Promise<string[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('owner:profiles!inner(role,agency)')
    .eq('is_active', true)
    .eq('approved', true)
    .eq('listing_type', 'sale')
    .eq('owner.role', 'agent');

  if (error) {
    console.error('[svc] getActiveSalesAgencies error', error);
    return [];
  }

  const names = (data ?? [])
    .map((r: any) => r?.owner?.agency)
    .filter((x: any) => typeof x === 'string' && x.trim().length > 0);

  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
},

async getActiveRentalNeighborhoods(): Promise<string[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('neighborhood')
    .eq('is_active', true)
    .eq('approved', true)
    .or('listing_type.eq.rental,listing_type.is.null');

  if (error) {
    console.error('Error fetching rental neighborhoods:', error);
    return [];
  }

  const neighborhoods = [...new Set(
    (data || [])
      .map((item) => (item.neighborhood || '').trim())
      .filter(
        (n) =>
          n &&
          n !== '-' &&
          n.replace(/\s/g, '') !== '' &&
          n.length > 0,
      ),
  )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  return neighborhoods;
},

async getActiveRentalAgencies(): Promise<string[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('owner:profiles!inner(role,agency)')
    .eq('is_active', true)
    .eq('approved', true)
    .or('listing_type.eq.rental,listing_type.is.null')
    .eq('owner.role', 'agent');

  if (error) {
    console.error('[svc] getActiveRentalAgencies error', error);
    return [];
  }

  const names = (data ?? [])
    .map((r: any) => r?.owner?.agency)
    .filter((x: any) => typeof x === 'string' && x.trim().length > 0);

  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
},

async getInquiryCountsForUser(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('get_owner_listing_inquiry_counts');

  if (error) {
    console.error('[svc] getInquiryCountsForUser RPC error:', error.message, error);
    return {};
  }

  const counts: Record<string, number> = {};
  (data ?? []).forEach((row: { listing_id: string; inquiry_count: number }) => {
    counts[row.listing_id] = row.inquiry_count ?? 0;
  });

  return counts;
},

async getInquiriesForListing(listingId: string): Promise<{ user_name: string; user_phone: string; created_at: string }[]> {
  const { data, error } = await supabase.rpc('get_listing_inquiries', { p_listing_id: listingId });

  if (error) {
    console.error('[svc] getInquiriesForListing RPC error:', error.message, error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    user_name: row.user_name ?? '',
    user_phone: row.user_phone ?? '',
    created_at: row.created_at ?? '',
  }));
},

  async getGlobalFeaturedCount(): Promise<number> {
    const { count, error } = await supabase
      .from('listings')
      .select('*', { count: 'exact', head: true })
      .eq('is_featured', true)
      .gt('featured_expires_at', new Date().toISOString());

    if (error) {
      console.error('Error fetching global featured count:', error);
      throw error;
    }

    return count || 0;
  },

  async getAvailableBedroomCounts(filters: Omit<GetListingsFilters, 'bedrooms' | 'sort'> = {}): Promise<{ bedrooms: number; count: number }[]> {
    const posterType = filters?.poster_type as 'owner' | 'agent' | undefined;
    const agencyName = (filters as any)?.agency_name || undefined;

    const ownerSelect = posterType === 'owner' || posterType === 'agent' || !!agencyName
      ? 'bedrooms,owner:profiles!inner(id,role,agency)'
      : 'bedrooms';

    let query = supabase
      .from('listings')
      .select(ownerSelect, { count: 'exact' })
      .eq('is_active', true)
      .eq('approved', true);

    if (filters.property_type) {
      query = query.eq('property_type', filters.property_type);
    }
    if (filters.min_price) {
      query = query.gte('price', filters.min_price);
    }
    if (filters.max_price) {
      query = query.lte('price', filters.max_price);
    }
    if (filters.parking_included) {
      query = query.in('parking', ['yes', 'included']);
    }
    if (filters.neighborhoods && filters.neighborhoods.length > 0) {
      query = query.in('neighborhood', filters.neighborhoods);
    }
    if (filters.noFeeOnly) {
      query = query.eq('broker_fee', false);
    }

    if (posterType === 'owner') {
      query = query.or('role.eq.landlord,role.eq.tenant', { foreignTable: 'owner' });
    } else if (posterType === 'agent') {
      query = query.or('role.eq.agent', { foreignTable: 'owner' });
      if (agencyName) {
        query = query.eq('owner.agency', agencyName);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching available bedroom counts:', error);
      return [];
    }

    const bedroomCounts = new Map<number, number>();
    (data || []).forEach((listing: any) => {
      const bedrooms = listing.bedrooms;
      bedroomCounts.set(bedrooms, (bedroomCounts.get(bedrooms) || 0) + 1);
    });

    return Array.from(bedroomCounts.entries())
      .map(([bedrooms, count]) => ({ bedrooms, count }))
      .sort((a, b) => a.bedrooms - b.bedrooms);
  },

  async getSaleListings(
    filters: GetListingsFilters = {},
    limit?: number,
    userId?: string,
    offset = 0,
    applyPagination: boolean = true,
    is_featured_only?: boolean,
  ) {
    const posterType = filters?.poster_type as 'owner' | 'agent' | undefined;
    const agencyName = (filters as any)?.agency_name || undefined;

    const ownerSelect =
      posterType === 'owner' || posterType === 'agent' || !!agencyName
        ? 'owner:profiles!inner(id,full_name,role,agency)'
        : 'owner:profiles(id,full_name,role,agency)';

    const selectStr = `*,${ownerSelect},listing_images(*)`;

    let query = supabase
      .from('listings')
      .select(selectStr, { count: 'exact' })
      .eq('is_active', true)
      .eq('approved', true)
      .eq('listing_type', 'sale');

    if (filters.bedrooms !== undefined && filters.bedrooms.length > 0) {
      query = query.in('bedrooms', filters.bedrooms);
    }
    if (filters.min_bathrooms && filters.min_bathrooms > 0) {
      query = query.gte('bathrooms', filters.min_bathrooms);
    }
    if (filters.property_types && filters.property_types.length > 0) {
      query = query.in('property_type', filters.property_types);
    } else if (filters.property_type) {
      query = query.eq('property_type', filters.property_type);
    }
    if (filters.building_types && filters.building_types.length > 0) {
      query = query.in('building_type', filters.building_types);
    }
    if (filters.min_price) {
      query = query.gte('asking_price', filters.min_price);
    }
    if (filters.max_price) {
      query = query.lte('asking_price', filters.max_price);
    }
    if (filters.parking_included) {
      query = query.in('parking', ['yes', 'included']);
    }
    if (filters.neighborhoods && filters.neighborhoods.length > 0) {
      query = query.in('neighborhood', filters.neighborhoods);
    }

    if (filters.bounds) {
      query = query
        .gte('latitude', filters.bounds.south)
        .lte('latitude', filters.bounds.north)
        .gte('longitude', filters.bounds.west)
        .lte('longitude', filters.bounds.east);
    }

    if (filters.is_featured_only || is_featured_only) {
      query = query
        .eq('is_featured', true)
        .gt('featured_expires_at', new Date().toISOString());
    }

    if (posterType === 'owner') {
      query = query.or('role.eq.landlord,role.eq.tenant', { foreignTable: 'owner' });
    } else if (posterType === 'agent') {
      query = query.or('role.eq.agent', { foreignTable: 'owner' });
      if (agencyName) {
        query = query.eq('owner.agency', agencyName);
      }
    }

    switch (filters.sort) {
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'price_asc':
        query = query.order('asking_price', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
        break;
      case 'price_desc':
        query = query.order('asking_price', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
        break;
      case 'bedrooms_asc':
        query = query.order('bedrooms', { ascending: true }).order('created_at', { ascending: false });
        break;
      case 'bedrooms_desc':
        query = query.order('bedrooms', { ascending: false }).order('created_at', { ascending: false });
        break;
      case 'bathrooms_asc':
        query = query.order('bathrooms', { ascending: true }).order('created_at', { ascending: false });
        break;
      case 'bathrooms_desc':
        query = query.order('bathrooms', { ascending: false }).order('created_at', { ascending: false });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
    }

    if (applyPagination) {
      if (limit !== undefined) {
        query = query.range(offset, offset + (limit || 20) - 1);
      }
    }

    const { data, error, count } = await query;

    // Check if the response is a PostgREST error object (happens with 416 Range Not Satisfiable)
    if (data && typeof data === 'object' && 'code' in data && 'message' in data) {
      // This is actually an error response, not data
      console.warn('PostgREST error in getSaleListings:', data);

      // For PGRST103 (416 Range Not Satisfiable), return empty data with total count
      if ((data as any).code === 'PGRST103') {
        return { data: [], totalCount: count || 0 };
      }

      // For other PostgREST errors, treat as error
      Sentry.captureException(new Error(`PostgREST error: ${(data as any).message}`));
      return { data: [], totalCount: 0 };
    }

    if (error) {
      console.error('Error fetching sale listings:', error);
      Sentry.captureException(error);
      return { data: [], totalCount: 0 };
    }

    return { data: data || [], totalCount: count || 0 };
  },

  calculateLotSize(length?: number | null, width?: number | null): number | null {
    if (!length || !width || length <= 0 || width <= 0) {
      return null;
    }
    return Math.round(length * width);
  },

  calculateBuildingSize(length?: number | null, width?: number | null): number | null {
    if (!length || !width || length <= 0 || width <= 0) {
      return null;
    }
    return Math.round(length * width);
  },

  validateYearBuilt(year?: number | null): boolean {
    if (!year) return true;
    const currentYear = new Date().getFullYear();
    return year >= 1800 && year <= currentYear + 5;
  },

  validateDimensions(length?: number | null, width?: number | null): boolean {
    if (!length && !width) return true;
    if (length && (length <= 0 || length > 10000)) return false;
    if (width && (width <= 0 || width > 10000)) return false;
    return true;
  },

  async getMapPins(bounds: { north: number; south: number; east: number; west: number }, listingType: 'rental' | 'sale' = 'rental') {
    const selectStr = `
      id,
      latitude,
      longitude,
      price,
      asking_price,
      listing_type,
      bedrooms,
      bathrooms,
      property_type,
      broker_fee,
      parking,
      neighborhood,
      owner:profiles!listings_user_id_fkey(role, agency)
    `;

    let query = supabase
      .from('listings')
      .select(selectStr)
      .eq('is_active', true)
      .eq('approved', true)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .gte('latitude', bounds.south)
      .lte('latitude', bounds.north)
      .gte('longitude', bounds.west)
      .lte('longitude', bounds.east);

    if (listingType === 'rental') {
      query = query.or('listing_type.eq.rental,listing_type.is.null');
    } else {
      query = query.eq('listing_type', 'sale');
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching map pins:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      latitude: row.latitude,
      longitude: row.longitude,
      price: row.price,
      asking_price: row.asking_price,
      listing_type: row.listing_type,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      property_type: row.property_type,
      broker_fee: row.broker_fee,
      parking: row.parking,
      neighborhood: row.neighborhood,
      owner: row.owner ? { role: row.owner.role, agency: row.owner.agency } : null,
    }));
  },

  async extendSalesListing(listingId: string): Promise<Listing> {
    const { data: listing, error: fetchError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .maybeSingle();

    if (fetchError || !listing) {
      throw new Error('Listing not found');
    }

    if (listing.listing_type !== 'sale') {
      throw new Error('Only sale listings can be extended');
    }

    if (!listing.is_active) {
      throw new Error('Inactive listings cannot be extended');
    }

    if (listing.sale_status === 'sold') {
      throw new Error('Sold listings cannot be extended');
    }

    const newExpiresAt = getExpirationDate('sale', listing.sale_status as SaleStatus);

    const { data: updatedListing, error: updateError } = await supabase
      .from('listings')
      .update({
        expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', listingId)
      .select()
      .single();

    if (updateError) {
      console.error('Error extending listing:', updateError);
      throw updateError;
    }

    return updatedListing;
  },

  async updateSaleStatus(listingId: string, newStatus: SaleStatus): Promise<Listing> {
    const { data: listing, error: fetchError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .maybeSingle();

    if (fetchError || !listing) {
      throw new Error('Listing not found');
    }

    if (listing.listing_type !== 'sale') {
      throw new Error('Only sale listings can have a sale status');
    }

    if (!listing.is_active) {
      throw new Error('Cannot change status on inactive listings');
    }

    const newExpiresAt = getExpirationDate('sale', newStatus);

    const { data: updatedListing, error: updateError } = await supabase
      .from('listings')
      .update({
        sale_status: newStatus,
        expires_at: newExpiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', listingId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating sale status:', updateError);
      throw updateError;
    }

    return updatedListing;
  },

  async renewListing(listingId: string, listingType: 'rental' | 'sale', saleStatus?: SaleStatus | null): Promise<Listing> {
    const newExpiresAt = getExpirationDate(listingType, saleStatus);
    const now = new Date().toISOString();

    const { data: updatedListing, error } = await supabase
      .from('listings')
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
      console.error('Error renewing listing:', error);
      throw error;
    }

    return updatedListing;
  },
};

export const SMS_RENEWAL_DAYS = 14;

export function getSMSRenewalExpirationDate(): Date {
  const now = new Date();
  now.setDate(now.getDate() + SMS_RENEWAL_DAYS);
  return now;
}

export function formatListingIdentifier(listing: Listing): string {
  let priceStr: string;
  if (!listing.price) {
    priceStr = 'Call for price';
  } else if (listing.listing_type === 'sale') {
    if (listing.price >= 1000000) {
      priceStr = `$${(listing.price / 1000000).toFixed(1)}M`;
    } else {
      priceStr = `$${Math.round(listing.price / 1000)}K`;
    }
  } else {
    priceStr = `$${listing.price.toLocaleString()}`;
  }

  let locationStr: string;
  if (listing.listing_type === 'sale' && listing.full_address) {
    locationStr = listing.full_address;
  } else {
    locationStr = listing.location || listing.neighborhood || 'your listing';
  }

  return `${locationStr} for ${priceStr}`;
}

export async function renewListingViaSMS(listingId: string): Promise<Listing> {
  const { data: listing, error: fetchError } = await supabase
    .from('listings')
    .select('*')
    .eq('id', listingId)
    .maybeSingle();

  if (fetchError || !listing) {
    throw new Error('Listing not found');
  }

  const currentExpiresAt = listing.expires_at ? new Date(listing.expires_at) : new Date();
  const newExpiresAt = new Date(currentExpiresAt);
  newExpiresAt.setDate(newExpiresAt.getDate() + SMS_RENEWAL_DAYS);
  const now = new Date().toISOString();

  const { data: updatedListing, error: updateError } = await supabase
    .from('listings')
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

  if (updateError || !updatedListing) {
    throw new Error('Failed to renew listing via SMS');
  }

  return updatedListing;
}