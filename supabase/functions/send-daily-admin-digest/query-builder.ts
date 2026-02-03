// Query builder for fetching listings based on digest configuration
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { FilterConfig, DigestSortOption, Listing } from "./types.ts";

export async function buildListingsQuery(
  supabase: SupabaseClient,
  filterConfig: FilterConfig,
  sortPreference: DigestSortOption = 'newest_first'
): Promise<Listing[]> {

  let query = supabase
    .from('listings')
    .select(`
      id,
      title,
      price,
      call_for_price,
      bedrooms,
      bathrooms,
      parking,
      broker_fee,
      location,
      neighborhood,
      property_type,
      lease_length,
      is_featured,
      additional_rooms,
      created_at,
      updated_at,
      owner:profiles!listings_user_id_fkey(full_name, role, agency)
    `)
    .eq('approved', true)
    .eq('is_active', true);

  // Apply date range filter
  if (filterConfig.date_range_days) {
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - filterConfig.date_range_days);
    query = query.gte('updated_at', dateThreshold.toISOString());
  }

  // Apply bedroom filter
  if (filterConfig.bedrooms && filterConfig.bedrooms.length > 0) {
    query = query.in('bedrooms', filterConfig.bedrooms);
  }

  // Apply price filters
  if (filterConfig.price_min !== undefined) {
    query = query.gte('price', filterConfig.price_min);
  }
  if (filterConfig.price_max !== undefined) {
    query = query.lte('price', filterConfig.price_max);
  }

  // Apply location filter
  if (filterConfig.locations && filterConfig.locations.length > 0) {
    query = query.in('location', filterConfig.locations);
  }

  // Apply property type filter
  if (filterConfig.property_types && filterConfig.property_types.length > 0) {
    query = query.in('property_type', filterConfig.property_types);
  }

  // Apply broker fee filter
  if (filterConfig.broker_fee !== undefined) {
    query = query.eq('broker_fee', filterConfig.broker_fee);
  }

  // Apply parking filter
  if (filterConfig.parking) {
    query = query.eq('parking', filterConfig.parking);
  }

  // Apply lease length filter
  if (filterConfig.lease_length) {
    query = query.eq('lease_length', filterConfig.lease_length);
  }

  // Apply sorting
  switch (sortPreference) {
    case 'newest_first':
      query = query.order('created_at', { ascending: false });
      break;
    case 'price_asc':
      query = query.order('price', { ascending: true, nullsFirst: false });
      break;
    case 'price_desc':
      query = query.order('price', { ascending: false, nullsFirst: false });
      break;
    case 'featured_first':
      query = query.order('is_featured', { ascending: false })
                   .order('created_at', { ascending: false });
      break;
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch listings: ${error.message}`);
  }

  return (data || []) as Listing[];
}

export async function getListingCount(
  supabase: SupabaseClient,
  filterParams: Record<string, any>
): Promise<number> {
  let query = supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('approved', true)
    .eq('is_active', true);

  // Apply filters from filter params
  if (filterParams.bedrooms !== undefined) {
    query = query.eq('bedrooms', filterParams.bedrooms);
  }

  if (filterParams.price_min !== undefined) {
    query = query.gte('price', filterParams.price_min);
  }

  if (filterParams.price_max !== undefined) {
    query = query.lte('price', filterParams.price_max);
  }

  if (filterParams.location) {
    query = query.eq('location', filterParams.location);
  }

  if (filterParams.neighborhood) {
    query = query.eq('neighborhood', filterParams.neighborhood);
  }

  if (filterParams.property_type) {
    query = query.eq('property_type', filterParams.property_type);
  }

  if (filterParams.broker_fee !== undefined) {
    query = query.eq('broker_fee', filterParams.broker_fee);
  }

  if (filterParams.parking) {
    query = query.eq('parking', filterParams.parking);
  }

  if (filterParams.lease_length) {
    query = query.eq('lease_length', filterParams.lease_length);
  }

  const { count, error } = await query;

  if (error) {
    console.error('Error counting listings:', error);
    return 0;
  }

  return count || 0;
}

export function buildFilterUrl(filterParams: Record<string, any>): string {
  const params = new URLSearchParams();

  if (filterParams.bedrooms !== undefined) {
    params.set('bedrooms', filterParams.bedrooms.toString());
  }

  if (filterParams.price_min !== undefined) {
    params.set('minPrice', filterParams.price_min.toString());
  }

  if (filterParams.price_max !== undefined) {
    params.set('maxPrice', filterParams.price_max.toString());
  }

  if (filterParams.location) {
    params.set('location', filterParams.location);
  }

  if (filterParams.neighborhood) {
    params.set('neighborhood', filterParams.neighborhood);
  }

  if (filterParams.property_type) {
    params.set('propertyType', filterParams.property_type);
  }

  if (filterParams.broker_fee !== undefined) {
    params.set('brokerFee', filterParams.broker_fee.toString());
  }

  if (filterParams.parking) {
    params.set('parking', filterParams.parking);
  }

  if (filterParams.lease_length) {
    params.set('leaseLength', filterParams.lease_length);
  }

  if (filterParams.listing_type === 'sale') {
    return `/browse-sales?${params.toString()}`;
  }

  return `/browse?${params.toString()}`;
}
