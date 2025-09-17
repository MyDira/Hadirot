import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../config/supabase';
import type { Profile } from '../config/supabase';

const EMAIL_UNIQUE_MESSAGE = 'That email is already registered.';
const USERNAME_UNIQUE_MESSAGE = 'That username is taken.';

function isPostgrestError(error: unknown): error is PostgrestError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as PostgrestError).code === 'string'
  );
}

function mapProfileUniqueViolationError(error: PostgrestError): Error {
  const detailText = `${error.details ?? ''} ${error.message ?? ''}`.toLowerCase();

  if (detailText.includes('email')) {
    const friendlyError = new Error(EMAIL_UNIQUE_MESSAGE);
    (friendlyError as any).code = 'PROFILE_EMAIL_TAKEN';
    return friendlyError;
  }

  if (detailText.includes('username')) {
    const friendlyError = new Error(USERNAME_UNIQUE_MESSAGE);
    (friendlyError as any).code = 'PROFILE_USERNAME_TAKEN';
    return friendlyError;
  }

  return error;
}

export const profilesService = {
  async getProfile(userId: string): Promise<Profile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, phone, agency, is_admin, created_at, updated_at, is_banned, email, can_feature_listings, max_featured_listings_per_user, can_manage_agency')
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
      .select('id, full_name, role, phone, agency, is_admin, created_at, updated_at, is_banned, email, can_feature_listings, max_featured_listings_per_user, can_manage_agency')
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      if (isPostgrestError(error) && error.code === '23505') {
        throw mapProfileUniqueViolationError(error);
      }
      throw error;
    }

    return data;
  },

  async getAllProfiles(): Promise<Profile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, phone, agency, is_admin, created_at, updated_at, is_banned, email, can_feature_listings, max_featured_listings_per_user, can_manage_agency')
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