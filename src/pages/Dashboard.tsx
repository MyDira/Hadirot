import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Edit, Eye, Star, Trash2, RefreshCw, Plus, EyeOff, AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Listing } from '../config/supabase';
import { listingsService } from '../services/listings';
import { profilesService } from '../services/profiles';
import { emailService } from '../services/email';

export default function Dashboard() {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [adminSettings, setAdminSettings] = useState<{ max_featured_listings: number; max_featured_per_user: number } | null>(null);
  const [globalFeaturedCount, setGlobalFeaturedCount] = useState<number>(0);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (user && !authLoading) {
      loadUserListings();
      loadAdminSettings();
      loadCurrentUserProfile();
      loadGlobalFeaturedCount();
    }
  }, [user, authLoading]);

  const loadAdminSettings = async () => {
    try {
      const settings = await listingsService.getAdminSettings();
      setAdminSettings(settings);
    } catch (error) {
      console.error('Error loading admin settings:', error);
    }
  };

  const loadGlobalFeaturedCount = async () => {
    try {
      const count = await listingsService.getGlobalFeaturedCount();
      setGlobalFeaturedCount(count);
    } catch (error) {
      console.error('Error loading global featured count:', error);
    }
  };

  const loadCurrentUserProfile = async () => {
    if (!user) return;
    
    try {
      const profileData = await profilesService.getProfile(user.id);
      setCurrentUserProfile(profileData);
    } catch (error) {
      console.error('Error loading current user profile:', error);
    }
  };

  const loadUserListings = async () => {
    if (!user) return;
    
    try {
      const data = await listingsService.getUserListings(user.id);
      setListings(data);
    } catch (error) {
      console.error('Error loading user listings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFeature = async (listingId: string, isFeatured: boolean) => {
    setActionLoading(listingId);
    try {
      const updates: any = { is_featured: !isFeatured };
      
      // The service layer will handle setting featured_expires_at automatically

      await listingsService.updateListing(listingId, updates);
      
      // Send email notification for featured status change
      try {
        if (user?.email && profile?.full_name) {
          const listing = listings.find(l => l.id === listingId);
          if (listing) {
            await emailService.sendListingFeaturedEmail(
              user.email,
              profile.full_name,
              listing.title,
              !isFeatured // New featured status (opposite of current)
            );
            console.log('✅ Email sent: featured status change to', user.email);
          }
        }
      } catch (emailError) {
        console.error('❌ Email failed: featured status change -', emailError.message);
        // Don't block the user flow if email fails
      }
      
      await loadUserListings();
      // Refresh user profile to get updated permissions and limits
      await refreshProfile();
    } catch (error) {
      console.error('Error toggling featured status:', error);
      
      // Show specific error messages based on the error
      let errorMessage = 'Failed to update listing. Please try again.';
      if (error instanceof Error) {
        if (error.message.includes('permission')) {
          errorMessage = 'You do not have permission to feature listings. Please contact support to upgrade your account.';
        } else if (error.message.includes('sitewide maximum') || error.message.includes('platform only allows')) {
          errorMessage = 'The website limit for featured listings has been reached. Please try again later.';
        } else if (error.message.includes('You can only feature')) {
          errorMessage = error.message;
        }
      }
      
      alert(errorMessage);
    } finally {
      setActionLoading(null);
      // Refresh global state to update UI limits
      await loadAdminSettings();
      await loadGlobalFeaturedCount();
    }
  };

  const handleRenewListing = async (listingId: string) => {
    setActionLoading(listingId);
    try {
      await listingsService.updateListing(listingId, { 
        last_published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_active: true
      });
      
      // Send email notification for listing reactivation
      try {
        if (user?.email && profile?.full_name) {
          const listing = listings.find(l => l.id === listingId);
          if (listing) {
            await emailService.sendListingReactivationEmail(
              user.email,
              profile.full_name,
              listing.title
            );
            console.log('✅ Email sent: listing reactivation to', user.email);
          }
        }
      } catch (emailError) {
        console.error('❌ Email failed: listing reactivation -', emailError.message);
        // Don't block the user flow if email fails
      }
      
      await loadUserListings();
    } catch (error) {
      console.error('Error renewing listing:', error);
      alert('Failed to renew listing. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnpublishListing = async (listingId: string) => {
    if (!confirm('Are you sure you want to unpublish this listing? It will be hidden from public view but can be republished later.')) {
      return;
    }

    setActionLoading(listingId);
    try {
      await listingsService.updateListing(listingId, { 
        is_active: false,
        updated_at: new Date().toISOString()
      });
      await loadUserListings();
      
      // Send email notification
      try {
        if (user?.email && profile?.full_name) {
          const listing = listings.find(l => l.id === listingId);
          if (listing) {
            await emailService.sendListingDeactivationEmail(
              user.email,
              profile.full_name,
              listing.title
            );
            console.log('✅ Email sent: listing deactivation to', user.email);
          }
        }
      } catch (emailError) {
        console.error('❌ Email failed: listing deactivation -', emailError.message);
        // Don't block the user flow if email fails
      }
    } catch (error) {
      console.error('Error unpublishing listing:', error);
      alert('Failed to unpublish listing. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };
  const handleDeleteListing = async (listingId: string) => {
    if (!confirm('Are you sure you want to permanently delete this listing? This action cannot be undone.')) {
      return;
    }

    // Store listing data before deletion for email
    const listingToDelete = listings.find(l => l.id === listingId);

    setActionLoading(listingId);
    try {
      await listingsService.deleteListing(listingId);
      // Remove from UI immediately on success
      setListings(prev => prev.filter(listing => listing.id !== listingId));
      
      // Send email notification
      try {
        if (user?.email && profile?.full_name && listingToDelete) {
            await emailService.sendListingDeletedEmail(
              user.email,
              profile.full_name,
              listingToDelete.title
            );
            console.log('✅ Email sent: listing deletion to', user.email);
        }
      } catch (emailError) {
        console.error('❌ Email failed: listing deletion -', emailError.message);
        // Don't block the user flow if email fails
      }
      
      console.log('✅ Listing deleted successfully');
    } catch (error) {
      console.error('❌ Error deleting listing:', error);
      alert('Failed to delete listing. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  // Calculate user's effective featured limit and current count
  const effectiveUserFeaturedLimit = (currentUserProfile || profile)?.is_admin 
    ? Infinity 
    : ((currentUserProfile || profile)?.max_featured_listings_per_user ?? adminSettings?.max_featured_per_user ?? 0);
  
  const currentUserFeaturedCount = listings.filter(listing => 
    listing.is_featured && 
    (!listing.featured_expires_at || new Date(listing.featured_expires_at) > new Date())
  ).length;

  const globalLimitReached = adminSettings ? globalFeaturedCount >= adminSettings.max_featured_listings : false;
  const canFeatureMore = (currentUserProfile || profile)?.is_admin || currentUserFeaturedCount < effectiveUserFeaturedLimit;

  // Helper function to check if a listing is actually featured (not expired)
  const isListingCurrentlyFeatured = (listing: Listing) => {
    return listing.is_featured && 
           listing.featured_expires_at && 
           new Date(listing.featured_expires_at) > new Date();
  };
  if (authLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-10 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4E4B43] mx-auto"></div>
        <p className="text-gray-600 mt-4">Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Banned User Warning Banner */}
      {(currentUserProfile || profile)?.is_banned && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-3 flex-shrink-0" />
            <div className="text-red-800">
              <p className="font-medium">🚫 Your account has been banned. Your listings are hidden from public view.</p>
            </div>
          </div>
        </div>
      )}

      <h1 className="text-3xl font-bold text-[#273140] mb-4">
        Welcome back{(currentUserProfile || profile)?.full_name ? `, ${(currentUserProfile || profile).full_name}` : ''}!
      </h1>

      <div>
        <div className="flex items-center justify-between mb-6">
          <p className="text-gray-600">Manage your property listings</p>
          <Link
            to="/post"
            className="bg-[#C5594C] text-white px-4 py-2 rounded-md font-medium hover:bg-[#b04d42] transition-colors flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New Listing
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140] mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading your listings...</p>
          </div>
        ) : listings.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="text-gray-400 mb-4">
              <svg
                className="mx-auto h-12 w-12"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No listings yet</h3>
            <p className="text-gray-500 mb-4">Start by creating your first property listing.</p>
            <Link
              to="/post"
              className="inline-flex items-center bg-[#C5594C] text-white px-4 py-2 rounded-md font-medium hover:bg-[#b04d42] transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Listing
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto min-w-full">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-0 w-1/4">
                      Property
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                      Views
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {listings.map((listing) => {
                    const featuredImage = listing.listing_images?.find(img => img.is_featured) || listing.listing_images?.[0];
                    
                    return (
                      <tr key={listing.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            {featuredImage && (
                              <img
                                src={featuredImage.image_url}
                                alt={listing.title}
                                className="w-12 h-12 object-cover rounded-lg mr-4"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <Link
                                to={`/listing/${listing.id}`}
                                className="font-medium text-gray-900 hover:text-[#4E4B43] transition-colors block truncate"
                              >
                                {listing.title}
                              </Link>
                              <div className="text-sm text-gray-500 truncate">
                                {listing.bedrooms} bed, {listing.bathrooms} bath
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatPrice(listing.price)}/month
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="flex items-center text-sm text-gray-900">
                            <Eye className="w-4 h-4 mr-1 text-gray-400" />
                            {listing.views || 0}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              listing.is_active 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {listing.is_active ? 'Active' : 'Inactive'}
                            </span>
                            {!listing.approved && (
                              <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                               Pending Approval
                              </span>
                            )}
                            {isListingCurrentlyFeatured(listing) && (
                              <span className="px-2 py-1 text-xs bg-[#D29D86] text-white rounded-full flex items-center">
                                <Star className="w-3 h-3 mr-1" />
                                Featured
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <div className="whitespace-nowrap">Posted: {new Date(listing.created_at).toLocaleDateString()}</div>
                            {listing.last_published_at && (
                              <div className="text-xs text-gray-400 whitespace-nowrap">
                                Last Published: {new Date(listing.last_published_at).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center space-x-3">
                            <Link
                              to={`/listing/${listing.id}`}
                              title="View Listing"
                              className="text-[#273140] hover:text-[#1e252f] transition-colors flex-shrink-0"
                            >
                              <Eye className="w-5 h-5" />
                            </Link>
                            
                            <Link
                              to={`/edit/${listing.id}`}
                              className="flex items-center space-x-1 px-2 py-1 text-blue-600 hover:text-blue-800 transition-colors flex-shrink-0"
                              title="Edit Listing"
                            >
                              <Edit className="w-4 h-4" />
                              <span className="text-sm hidden sm:inline">Edit</span>
                            </Link>
                            
                            <button
                              type="button"
                              onClick={() => handleToggleFeature(listing.id, isListingCurrentlyFeatured(listing))}
                              disabled={actionLoading === listing.id || (!isListingCurrentlyFeatured(listing) && (!canFeatureMore || globalLimitReached))}
                              className={`transition-colors flex-shrink-0 ${
                                isListingCurrentlyFeatured(listing)
                                  ? 'text-[#C5594C] hover:text-[#b04d42]'
                                  : (!canFeatureMore || globalLimitReached) 
                                    ? 'text-gray-300 cursor-not-allowed' 
                                    : 'text-gray-400 hover:text-[#C5594C]'
                              }`}
                              title={
                                isListingCurrentlyFeatured(listing) 
                                  ? 'Remove Featured' 
                                  : globalLimitReached
                                    ? 'The sitewide maximum for featured listings has been reached'
                                    : (!canFeatureMore)
                                      ? `You have reached your featured listing limit (${currentUserFeaturedCount}/${effectiveUserFeaturedLimit})`
                                    : 'Make Featured'
                              }
                            >
                              <Star className={`w-5 h-5 ${isListingCurrentlyFeatured(listing) ? 'fill-current' : ''}`} />
                            </button>
                            
                            {listing.is_active ? (
                              <button
                                type="button"
                                onClick={() => handleUnpublishListing(listing.id)}
                                disabled={actionLoading === listing.id || !listing.approved}
                                className="text-orange-600 hover:text-orange-800 transition-colors flex-shrink-0"
                                title="Unpublish Listing"
                              >
                                <EyeOff className="w-5 h-5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRenewListing(listing.id)}
                                disabled={actionLoading === listing.id || !listing.approved}
                                className="text-blue-600 hover:text-blue-800 transition-colors flex-shrink-0"
                                title="Republish Listing"
                              >
                                <RefreshCw className="w-5 h-5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteListing(listing.id)}
                              disabled={actionLoading === listing.id}
                              className="text-red-600 hover:text-red-800 transition-colors flex-shrink-0"
                              title="Delete Listing"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { Dashboard };