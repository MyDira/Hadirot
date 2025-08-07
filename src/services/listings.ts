import { supabase, Listing } from '../config/supabase';
import { capitalizeName } from '../utils/formatters';

export const listingsService = {
  async getListings(filters = {}, limit?: number, userId?: string, offset = 0, applyPagination: boolean = true, is_featured_only?: boolean) {
    let query = supabase
      .from('listings')
      .select(`
        *,
        owner:profiles!listings_user_id_fkey(
          id,
          full_name,
          role,
          agency
        ),
        listing_images(*)
      `, { count: 'exact' });

    if (filters.bedrooms !== undefined) {
      query = query.eq('bedrooms', filters.bedrooms);
    }
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

    // Filter for featured-only listings if requested via filters
    if (filters.is_featured_only || is_featured_only) {
      query = query.eq('is_featured', true).gt('featured_expires_at', new Date().toISOString());
    }

    // Apply access conditions based on authentication
    if (userId) {
      // For authenticated users: show approved+active listings OR their own listings
      query = query.or(`and(is_active.eq.true,approved.eq.true),user_id.eq.${userId}`);
    } else {
      // For unauthenticated users: only show approved+active listings
      query = query.eq('is_active', true).eq('approved', true);
    }
    
    query = query.order('created_at', { ascending: false });

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

  async getListing(id: string, userId?: string) {
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
      // For authenticated users: show approved+active listings OR their own listings
      query = query.or(`and(is_active.eq.true,approved.eq.true),user_id.eq.${userId}`);
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

  async createListing(listingData: Omit<Listing, 'id' | 'created_at' | 'updated_at'>) {
    // If trying to feature a listing on creation, check permissions and limits
    if (listingData.is_featured) {
      // Get user profile to check permissions
      const { data: userProfile, error: profileError } = await supabase // Fetch user profile
        .from('profiles')
        .select('is_admin, max_featured_listings_per_user, can_feature_listings')
        .eq('id', listingData.user_id)
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
        const userCount = await this.getFeaturedListingsCountByUser(listingData.user_id);
        if (userCount >= effectiveUserLimit) {
          throw new Error(`You can only feature up to ${effectiveUserLimit} listing${effectiveUserLimit === 1 ? '' : 's'} at a time.`);
        }
      }

      // Set expiration date to 1 week from now
      const oneWeekFromNow = new Date();
      oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
      listingData.featured_expires_at = oneWeekFromNow.toISOString();
    }

    // Capitalize the contact name
    if (listingData.contact_name) {
      listingData.contact_name = capitalizeName(listingData.contact_name);
    }

    const { data, error } = await supabase // Ensure neighborhood and washer_dryer_hookup are handled
      .from('listings')
      .insert(listingData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateListing(id: string, listingData: Partial<Listing>) {
    // Get the current listing to check for approval status change
    const { data: currentListing } = await supabase
      .from('listings')
      .select('approved, title, user_id, is_featured, profiles!listings_user_id_fkey(full_name, email, is_admin, can_feature_listings)')
      .eq('id', id)
      .single();

    // If trying to feature a listing, check permissions and limits
    if (listingData.is_featured === true && currentListing && !currentListing.is_featured) {
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

      // Set expiration date to 1 week from now
      const oneWeekFromNow = new Date();
      oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
      listingData.featured_expires_at = oneWeekFromNow.toISOString();
    }

    // If unfeaturing a listing, clear the expiration date
    if (listingData.is_featured === false) {
      listingData.featured_expires_at = null;
    }

    // Capitalize the contact name if it's being updated
    if (listingData.contact_name) {
      listingData.contact_name = capitalizeName(listingData.contact_name);
    }

    const { data, error } = await supabase // Ensure neighborhood and washer_dryer_hookup are handled
      .from('listings')
      .update(listingData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    
    // Check if listing was just approved (changed from false to true)
    if (currentListing && 
        currentListing.approved === false && 
        listingData.approved === true &&
        currentListing.profiles?.email &&
        currentListing.profiles?.full_name) {
      
      try {
        await emailService.sendListingApprovalEmail(
          currentListing.profiles.email,
          currentListing.profiles.full_name,
          currentListing.title,
          id
        );
        console.log('✅ Listing approval email sent successfully');
      } catch (emailError) {
        console.error('⚠️ Failed to send listing approval email:', emailError);
        // Don't throw error - approval should still succeed even if email fails
      }
    }
    
    return data;
  },

  async deleteListing(id: string) {
    const { error } = await supabase
      .from('listings')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  async getSimilarListings(listing: Listing, limit = 3, offset = 0) {
    const { data, error } = await supabase
      .from('listings')
      .select(`
        *,
        owner:public_profiles!listings_user_id_fkey(full_name, role, agency),
        listing_images(id, image_url, is_featured, sort_order) // Ensure neighborhood is selected
      `)
      .eq('is_active', true)
      .eq('approved', true)
      .neq('id', listing.id)
      .eq('bedrooms', listing.bedrooms)
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return data as Listing[];
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

  async getAdminSettings() {
    const { data, error } = await supabase
      .from('admin_settings')
      .select('max_featured_listings, max_featured_per_user')
      .single();

    if (error) {
      console.error('Error getting admin settings:', error);
      return { max_featured_listings: 8, max_featured_per_user: 0 }; // defaults
    }

    return {
      max_featured_listings: data.max_featured_listings || 8,
      max_featured_per_user: data.max_featured_per_user || 0
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

    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/move-temp-images`;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Authentication required');
    }

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        listingId,
        userId,
        tempImages
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to finalize images');
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
    return data as Listing[];
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

async getUniqueNeighborhoods(): Promise<string[]> {
  const { data, error } = await supabase
    .from('listings')
    .select('neighborhood')
    .eq('is_active', true)
    .eq('approved', true)
    .not('neighborhood', 'is', null)
    .neq('neighborhood', '');

  if (error) {
    console.error('Error fetching neighborhoods:', error);
    return [];
  }

  // Extract unique neighborhoods and sort them
  const neighborhoods = [...new Set(data.map(item => item.neighborhood))];
  return neighborhoods.sort();
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
};