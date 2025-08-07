import { supabase } from '../config/supabase';
import type { Profile } from '../config/supabase';

export const profilesService = {
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, phone, agency, is_admin, created_at, updated_at, is_banned, email, can_feature_listings, max_featured_listings_per_user')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return null;
    }

    return data;
  },

  async updateProfile(userId: string, updates: Partial<Profile>): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select('id, full_name, role, phone, agency, is_admin, created_at, updated_at, is_banned, email, can_feature_listings, max_featured_listings_per_user')
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      throw error;
    }

    return data;
  },

  async getAllProfiles(): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, phone, agency, is_admin, created_at, updated_at, is_banned, email, can_feature_listings, max_featured_listings_per_user')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching all profiles:', error);
      throw error;
    }

    return data || [];
  },

  async getProfilesWithListingCounts() {
    // First get all profiles
    const profiles = await this.getAllProfiles();
    
    // Then get listing counts for each profile
    const profilesWithCounts = await Promise.all(
      profiles.map(async (profile) => {
        // Get total listing count
        const { count: listing_count, error: listingsError } = await supabase
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', profile.id);
        
        const totalListingCount = listingsError ? 0 : (listing_count || 0);
        
        // Get featured listing count directly
        const { count: featured_count, error: featuredError } = await supabase
          .from('listings')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', profile.id)
          .eq('is_featured', true)
          .gt('featured_expires_at', new Date().toISOString());
        
        const totalFeaturedCount = featuredError ? 0 : (featured_count || 0);
        
        return {
          ...profile,
          listing_count: totalListingCount,
          featured_count: totalFeaturedCount
        };
      })
    );
    
    return profilesWithCounts;
  },

  async bulkUpdateFeaturedPermissions(userIds: string[], maxFeaturedListingsPerUser: number | null, canFeature: boolean): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .update({ 
        max_featured_listings_per_user: maxFeaturedListingsPerUser,
        can_feature_listings: canFeature
      })
      .in('id', userIds);

    if (error) {
      console.error('Error bulk updating featured permissions:', error);
      throw error;
    }
  },

  async deleteProfile(userId: string): Promise<void> {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) {
      console.error('Error deleting profile:', error);
      throw error;
    }
  }
};