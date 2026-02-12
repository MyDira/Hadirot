import React, { useState, useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Edit,
  Eye,
  MousePointerClick,
  MessageSquare,
  Star,
  Trash2,
  Zap,
  RefreshCw,
  Plus,
  EyeOff,
  AlertTriangle,
  Clock,
  Home,
  DollarSign,
  Info,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Listing, SaleStatus, supabase } from "../config/supabase";
import {
  listingsService,
  canExtendListing,
  getDaysUntilExpiration,
  LISTING_DURATION_DAYS,
} from "../services/listings";
import { profilesService } from "../services/profiles";
import { emailService } from "../services/email";
import { InquiriesModal, Inquiry } from "../components/listing/InquiriesModal";
import { SaleStatusBadge } from "../components/listings/SaleStatusBadge";
import { SaleStatusSelector } from "../components/listings/SaleStatusSelector";
import { FeatureListingModal } from "../components/listings/FeatureListingModal";
import { stripeService, FeaturedPurchase } from "../services/stripe";

type DashboardTab = 'rentals' | 'sales';

export default function Dashboard() {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = useState<Listing[]>([]);
  const [adminSettings, setAdminSettings] = useState<{
    max_featured_listings: number;
    max_featured_per_user: number;
  } | null>(null);
  const [globalFeaturedCount, setGlobalFeaturedCount] = useState<number>(0);
  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [inquiryCounts, setInquiryCounts] = useState<Record<string, number>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [modalListingId, setModalListingId] = useState<string | null>(null);
  const [modalListingTitle, setModalListingTitle] = useState<string>('');
  const [modalInquiries, setModalInquiries] = useState<Inquiry[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [featureModalListing, setFeatureModalListing] = useState<Listing | null>(null);
  const [featuredPurchases, setFeaturedPurchases] = useState<Record<string, FeaturedPurchase>>({});
  const [featureBanner, setFeatureBanner] = useState<{ type: 'success' | 'cancelled'; message: string } | null>(null);
  const [newListingBanner, setNewListingBanner] = useState<{ listingId: string; title: string } | null>(null);

  const rentalListings = useMemo(
    () => listings.filter((l) => l.listing_type !== 'sale'),
    [listings]
  );
  const salesListings = useMemo(
    () => listings.filter((l) => l.listing_type === 'sale'),
    [listings]
  );

  const getDefaultTab = (): DashboardTab => {
    const urlTab = searchParams.get('tab');
    if (urlTab === 'rentals' || urlTab === 'sales') return urlTab;
    if (salesListings.length > 0 && rentalListings.length === 0) return 'sales';
    return 'rentals';
  };

  const [activeTab, setActiveTab] = useState<DashboardTab>(getDefaultTab);

  useEffect(() => {
    if (!loading) {
      const urlTab = searchParams.get('tab');
      if (!urlTab) {
        const defaultTab = getDefaultTab();
        setActiveTab(defaultTab);
      }
    }
  }, [loading, salesListings.length, rentalListings.length]);

  const handleTabChange = (tab: DashboardTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const filteredListings = activeTab === 'sales' ? salesListings : rentalListings;

  useEffect(() => {
    if (user && !authLoading) {
      loadUserListings();
      loadAdminSettings();
      loadCurrentUserProfile();
      loadGlobalFeaturedCount();
      loadFeaturedPurchases();
    }
  }, [user, authLoading]);

  useEffect(() => {
    const featuredParam = searchParams.get('featured');
    const newListingParam = searchParams.get('new_listing');
    const listingIdParam = searchParams.get('listing_id');

    if (featuredParam === 'success') {
      setFeatureBanner({ type: 'success', message: 'Your listing has been featured! The feature period is now active.' });
      searchParams.delete('featured');
      searchParams.delete('session_id');
      setSearchParams(searchParams, { replace: true });
    } else if (featuredParam === 'cancelled') {
      setFeatureBanner({ type: 'cancelled', message: 'Payment was cancelled. You can try again anytime.' });
      searchParams.delete('featured');
      setSearchParams(searchParams, { replace: true });
    }

    if (newListingParam === 'true' && listingIdParam) {
      const listing = listings.find(l => l.id === listingIdParam);
      if (listing) {
        setNewListingBanner({ listingId: listingIdParam, title: listing.title });
      } else {
        setTimeout(() => {
          loadUserListings().then(() => {
            const foundListing = listings.find(l => l.id === listingIdParam);
            if (foundListing) {
              setNewListingBanner({ listingId: listingIdParam, title: foundListing.title });
            }
          });
        }, 500);
      }
      searchParams.delete('new_listing');
      searchParams.delete('listing_id');
      setSearchParams(searchParams, { replace: true });
    }
  }, [listings]);

  const loadAdminSettings = async () => {
    try {
      const settings = await listingsService.getAdminSettings();
      setAdminSettings(settings);
    } catch (error) {
      console.error("Error loading admin settings:", error);
    }
  };

  const loadGlobalFeaturedCount = async () => {
    try {
      const count = await listingsService.getGlobalFeaturedCount();
      setGlobalFeaturedCount(count);
    } catch (error) {
      console.error("Error loading global featured count:", error);
    }
  };

  const loadCurrentUserProfile = async () => {
    if (!user) return;

    try {
      const profileData = await profilesService.getProfile(user.id);
      setCurrentUserProfile(profileData);
    } catch (error) {
      console.error("Error loading current user profile:", error);
    }
  };

  const loadFeaturedPurchases = async () => {
    try {
      const purchases = await stripeService.getUserPurchases();
      const purchaseMap: Record<string, FeaturedPurchase> = {};
      for (const p of purchases) {
        if (!purchaseMap[p.listing_id] || ['active', 'paid', 'free'].includes(p.status)) {
          purchaseMap[p.listing_id] = p;
        }
      }
      setFeaturedPurchases(purchaseMap);
    } catch (error) {
      console.error('Error loading featured purchases:', error);
    }
  };

  const loadUserListings = async () => {
    if (!user) return;

    try {
      const [data, counts] = await Promise.all([
        listingsService.getUserListings(user.id),
        listingsService.getInquiryCountsForUser(),
      ]);
      console.debug(
        '[Dashboard] loaded listings with metrics',
        data.map((listing) => ({
          id: listing.id,
          impressions: listing.impressions ?? 0,
          direct_views: listing.direct_views ?? 0,
        })),
      );
      setListings(data);
      setInquiryCounts(counts);
    } catch (error) {
      console.error("Error loading user listings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleFeatureClick = (listing: Listing) => {
    if (isListingCurrentlyFeatured(listing)) {
      handleUnfeatureListing(listing.id);
    } else {
      setFeatureModalListing(listing);
    }
  };

  const handleUnfeatureListing = async (listingId: string) => {
    // Check for active featured purchase with remaining time
    try {
      const { data: activePurchase, error } = await supabase
        .from('featured_purchases')
        .select('*')
        .eq('listing_id', listingId)
        .in('status', ['active', 'paid'])
        .gt('featured_end', new Date().toISOString())
        .order('featured_end', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error checking featured purchase:', error);
      }

      let confirmMessage = 'Are you sure you want to remove the featured status from this listing?';

      if (activePurchase && activePurchase.featured_end) {
        const now = Date.now();
        const featuredEnd = new Date(activePurchase.featured_end).getTime();
        const daysRemaining = Math.ceil((featuredEnd - now) / (1000 * 60 * 60 * 24));

        if (daysRemaining > 0) {
          confirmMessage = `⚠️ Warning: You have ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining on your featured period. If you unfeature this listing, you will lose the remaining time and need to purchase again to re-feature it. Are you sure you want to continue?`;
        }
      }

      if (!confirm(confirmMessage)) return;
    } catch (error) {
      console.error('Error checking featured status:', error);
      // Fallback to basic confirmation if query fails
      if (!confirm('Are you sure you want to remove the featured status from this listing?')) return;
    }

    setActionLoading(listingId);
    try {
      await listingsService.updateListing(listingId, { is_featured: false });
      await Promise.all([loadUserListings(), loadFeaturedPurchases(), loadGlobalFeaturedCount()]);
    } catch (error) {
      console.error('Error removing featured status:', error);
      alert('Failed to remove featured status. Please try again.');
    } finally {
      setActionLoading(null);
    }
  };

  const getListingFeaturedStatus = (listing: Listing) => {
    if (isListingCurrentlyFeatured(listing)) return 'active';
    const purchase = featuredPurchases[listing.id];
    if (purchase && purchase.status === 'paid' && !purchase.featured_start) return 'pending_approval';
    if (purchase && purchase.status === 'pending') return 'pending_payment';
    return 'none';
  };

  const handleRenewListing = async (listingId: string) => {
    setActionLoading(listingId);
    try {
      const listing = listings.find((l) => l.id === listingId);
      const listingType = listing?.listing_type || 'rental';
      const saleStatus = listing?.sale_status as SaleStatus | undefined;

      await listingsService.renewListing(listingId, listingType, saleStatus);

      // Send email notification for listing reactivation
      try {
        if (user?.email && profile?.full_name && listing) {
          await emailService.sendListingReactivationEmail(
            user.email,
            profile.full_name,
            listing.title,
          );
          console.log("✅ Email sent: listing reactivation to", user.email);
        }
      } catch (emailError) {
        console.error(
          "❌ Email failed: listing reactivation -",
          emailError.message,
        );
      }

      await loadUserListings();
    } catch (error) {
      console.error("Error renewing listing:", error);
      alert("Failed to renew listing. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleExtendSalesListing = async (listingId: string) => {
    setActionLoading(listingId);
    try {
      await listingsService.extendSalesListing(listingId);
      await loadUserListings();
    } catch (error) {
      console.error("Error extending listing:", error);
      const message = error instanceof Error ? error.message : "Failed to extend listing. Please try again.";
      alert(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaleStatusChange = async (listingId: string, newStatus: SaleStatus) => {
    const listing = listings.find((l) => l.id === listingId);
    if (!listing) return;

    const oldStatus = listing.sale_status || 'available';

    if (newStatus === 'sold') {
      if (!confirm(
        "Are you sure you want to mark this listing as SOLD? Sold listings cannot be extended and will automatically expire after 30 days."
      )) {
        return;
      }
    }

    setActionLoading(listingId);
    try {
      const updatedListing = await listingsService.updateSaleStatus(listingId, newStatus);

      try {
        if (user?.email && profile?.full_name) {
          await emailService.sendSaleStatusChangeEmail(
            user.email,
            profile.full_name,
            listing.title,
            oldStatus,
            newStatus,
            updatedListing.expires_at || new Date().toISOString(),
          );
          console.log("✅ Email sent: sale status change to", user.email);
        }
      } catch (emailError) {
        console.error(
          "❌ Email failed: sale status change -",
          emailError instanceof Error ? emailError.message : emailError,
        );
      }

      await loadUserListings();
    } catch (error) {
      console.error("Error updating sale status:", error);
      const message = error instanceof Error ? error.message : "Failed to update sale status. Please try again.";
      alert(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnpublishListing = async (listingId: string) => {
    if (
      !confirm(
        "Are you sure you want to unpublish this listing? It will be hidden from public view but can be republished later.",
      )
    ) {
      return;
    }

    setActionLoading(listingId);
    try {
      await listingsService.updateListing(listingId, {
        is_active: false,
        updated_at: new Date().toISOString(),
      });
      await loadUserListings();
    } catch (error) {
      console.error("Error unpublishing listing:", error);
      alert("Failed to unpublish listing. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };
  const handleDeleteListing = async (listingId: string) => {
    if (
      !confirm(
        "Are you sure you want to permanently delete this listing? This action cannot be undone.",
      )
    ) {
      return;
    }

    // Store listing data before deletion for email
    const listingToDelete = listings.find((l) => l.id === listingId);

    setActionLoading(listingId);
    try {
      await listingsService.deleteListing(listingId);
      // Remove from UI immediately on success
      setListings((prev) => prev.filter((listing) => listing.id !== listingId));

      // Send email notification
      try {
        if (user?.email && profile?.full_name && listingToDelete) {
          await emailService.sendListingDeletedEmail(
            user.email,
            profile.full_name,
            listingToDelete.title,
          );
          console.log("✅ Email sent: listing deletion to", user.email);
        }
      } catch (emailError) {
        console.error(
          "❌ Email failed: listing deletion -",
          emailError.message,
        );
        // Don't block the user flow if email fails
      }

      console.log("✅ Listing deleted successfully");
    } catch (error) {
      console.error("❌ Error deleting listing:", error);
      alert("Failed to delete listing. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenInquiries = async (listingId: string, listingTitle: string) => {
    setModalListingId(listingId);
    setModalListingTitle(listingTitle);
    setModalOpen(true);
    setModalLoading(true);
    setModalInquiries([]);

    try {
      const inquiries = await listingsService.getInquiriesForListing(listingId);
      setModalInquiries(inquiries);
    } catch (error) {
      console.error('Error loading inquiries:', error);
    } finally {
      setModalLoading(false);
    }
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setModalListingId(null);
    setModalListingTitle('');
    setModalInquiries([]);
  };

  const formatPrice = (price: number | null) => {
    if (price == null) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  // Calculate user's effective featured limit and current count
  const effectiveUserFeaturedLimit = (currentUserProfile || profile)?.is_admin
    ? Infinity
    : ((currentUserProfile || profile)?.max_featured_listings_per_user ??
      adminSettings?.max_featured_per_user ??
      0);

  const currentUserFeaturedCount = listings.filter(
    (listing) =>
      listing.is_featured &&
      (!listing.featured_expires_at ||
        new Date(listing.featured_expires_at) > new Date()),
  ).length;

  const globalLimitReached = adminSettings
    ? globalFeaturedCount >= adminSettings.max_featured_listings
    : false;
  const canFeatureMore =
    (currentUserProfile || profile)?.is_admin ||
    currentUserFeaturedCount < effectiveUserFeaturedLimit;

  // Helper function to check if a listing is actually featured (not expired)
  const isListingCurrentlyFeatured = (listing: Listing) => {
    return (
      listing.is_featured &&
      listing.featured_expires_at &&
      new Date(listing.featured_expires_at) > new Date()
    );
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
      {featureBanner && (
        <div className={`mb-6 rounded-lg p-4 flex items-center justify-between ${
          featureBanner.type === 'success'
            ? 'bg-green-50 border border-green-200'
            : 'bg-gray-50 border border-gray-200'
        }`}>
          <div className="flex items-center gap-3">
            {featureBanner.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-gray-500 flex-shrink-0" />
            )}
            <p className={featureBanner.type === 'success' ? 'text-green-800' : 'text-gray-700'}>
              {featureBanner.message}
            </p>
          </div>
          <button
            onClick={() => setFeatureBanner(null)}
            className="text-gray-400 hover:text-gray-600 ml-4"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {newListingBanner && (
        <div className="mb-6 rounded-lg p-4 flex items-center justify-between bg-green-50 border border-green-200">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-green-800 font-medium">Your listing has been posted successfully!</p>
              <p className="text-sm text-green-700 mt-0.5">
                Get more views by featuring your listing at the top of search results.
              </p>
            </div>
            <button
              onClick={() => {
                const listing = listings.find(l => l.id === newListingBanner.listingId);
                if (listing) {
                  setFeatureModalListing(listing);
                }
              }}
              className="px-4 py-2 bg-accent-600 hover:bg-accent-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ml-4"
            >
              <Star className="w-4 h-4" />
              Feature This Listing
            </button>
          </div>
          <button
            onClick={() => setNewListingBanner(null)}
            className="text-gray-400 hover:text-gray-600 ml-4"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Banned User Warning Banner */}
      {(currentUserProfile || profile)?.is_banned && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="w-5 h-5 text-red-600 mr-3 flex-shrink-0" />
            <div className="text-red-800">
              <p className="font-medium">
                🚫 Your account has been banned. Your listings are hidden from
                public view.
              </p>
            </div>
          </div>
        </div>
      )}

      <h1 className="text-3xl font-bold text-[#273140] mb-4">
        Welcome back
        {(currentUserProfile || profile)?.full_name
          ? `, ${(currentUserProfile || profile).full_name}`
          : ""}
        !
      </h1>

      <div>
        <div className="flex items-center justify-between mb-6">
          <p className="text-gray-600">Manage your property listings</p>
          <Link
            to="/post"
            className="bg-accent-500 text-white px-4 py-2 rounded-md font-medium hover:bg-accent-600 transition-colors flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add New Listing
          </Link>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-4">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => handleTabChange('rentals')}
              className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                activeTab === 'rentals'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Home className="w-4 h-4" />
              Rentals
              {rentalListings.length > 0 && (
                <span className={`ml-1 px-2 py-0.5 text-xs rounded-full ${
                  activeTab === 'rentals' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {rentalListings.length}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange('sales')}
              className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                activeTab === 'sales'
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              Sales
              {salesListings.length > 0 && (
                <span className={`ml-1 px-2 py-0.5 text-xs rounded-full ${
                  activeTab === 'sales' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {salesListings.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Lifecycle notice */}
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-start gap-2 text-sm text-gray-600">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
          {activeTab === 'rentals' ? (
            <span>
              Rental listings are active for {LISTING_DURATION_DAYS.RENTAL} days. Renew within 7 days of expiration to keep your listing active for another 14 days. After expiration, listings become inactive and are purged after 30 additional days.
            </span>
          ) : (
            <span>
              Sales listings are active for {LISTING_DURATION_DAYS.SALE_AVAILABLE} days (42 days for In Contract). Extend within 7 days of expiration to keep your listing active.
            </span>
          )}
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140] mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading your listings...</p>
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="text-gray-400 mb-4">
              {activeTab === 'sales' ? (
                <DollarSign className="mx-auto h-12 w-12" />
              ) : (
                <Home className="mx-auto h-12 w-12" />
              )}
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No {activeTab === 'sales' ? 'sale' : 'rental'} listings yet
            </h3>
            <p className="text-gray-500 mb-4">
              {activeTab === 'sales'
                ? 'Create your first property for sale listing.'
                : 'Start by creating your first rental property listing.'}
            </p>
            <Link
              to="/post"
              className="inline-flex items-center bg-accent-500 text-white px-4 py-2 rounded-md font-medium hover:bg-accent-600 transition-colors"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Listing
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ minWidth: '200px', maxWidth: '300px', width: '25%' }}>
                      Property
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ width: '120px' }}>
                      Price
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ width: '110px' }}>
                      Impressions
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ width: '120px' }}>
                      Direct Views
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ width: '100px' }}>
                      Inquiries
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ width: '140px' }}>
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ width: '100px' }}>
                      Expires
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{ width: '140px' }}>
                      Created
                    </th>
                    <th className="sticky right-0 bg-gray-50 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap shadow-[-4px_0_6px_rgba(0,0,0,0.05)] z-10" style={{ width: '200px' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredListings.map((listing) => {
                    const featuredImage =
                      listing.listing_images?.find((img) => img.is_featured) ||
                      listing.listing_images?.[0];
                    const isSale = listing.listing_type === 'sale';
                    const daysUntilExpiration = getDaysUntilExpiration(listing.expires_at);
                    const extensionCheck = canExtendListing(listing);

                    return (
                      <tr key={listing.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4" style={{ maxWidth: '300px' }}>
                          <div className="flex items-center min-w-0">
                            {featuredImage && (
                              <img
                                src={featuredImage.image_url}
                                alt={listing.title}
                                className="w-12 h-12 object-cover rounded-lg mr-4 flex-shrink-0"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <Link
                                to={`/listing/${listing.id}`}
                                className="font-medium text-gray-900 hover:text-[#4E4B43] transition-colors block truncate"
                                title={listing.title}
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
                          {listing.call_for_price
                            ? 'Call for Price'
                            : isSale
                              ? formatPrice(listing.asking_price ?? listing.price)
                              : `${formatPrice(listing.price)}/month`}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center gap-1.5">
                            <Eye className="h-4 w-4 opacity-70" aria-hidden />
                            <span>
                              {loading
                                ? "—"
                                : (listing.impressions ?? 0).toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <div className="flex items-center gap-1.5">
                            <MousePointerClick className="h-4 w-4 opacity-70" aria-hidden />
                            <span>
                              {loading
                                ? "—"
                                : (listing.direct_views ?? 0).toLocaleString()}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <button
                            type="button"
                            onClick={() => handleOpenInquiries(listing.id, listing.title)}
                            className="flex items-center gap-1.5 hover:text-accent-600 transition-colors cursor-pointer"
                            title="View inquiries"
                          >
                            <MessageSquare className="h-4 w-4 opacity-70" aria-hidden />
                            <span className="hover:underline">
                              {inquiryCounts[listing.id] ?? 0}
                            </span>
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`px-2 py-1 text-xs rounded-full whitespace-nowrap ${
                                  listing.is_active
                                    ? "bg-green-100 text-green-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {listing.is_active ? "Active" : "Inactive"}
                              </span>
                              {!listing.approved && (
                                <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full whitespace-nowrap">
                                  Pending Approval
                                </span>
                              )}
                              {(() => {
                                const featuredStatus = getListingFeaturedStatus(listing);
                                if (featuredStatus === 'active') {
                                  const daysLeft = listing.featured_expires_at
                                    ? Math.max(0, Math.ceil((new Date(listing.featured_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                                    : 0;
                                  return (
                                    <span className="px-2 py-1 text-xs bg-accent-50 text-accent-700 border border-accent-200 rounded-full flex items-center whitespace-nowrap">
                                      <Zap className="w-3 h-3 mr-1" />
                                      Featured {daysLeft > 0 ? `· ${daysLeft}d left` : '· Expiring'}
                                    </span>
                                  );
                                }
                                if (featuredStatus === 'pending_approval') {
                                  return (
                                    <span className="px-2 py-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full flex items-center whitespace-nowrap">
                                      <Clock className="w-3 h-3 mr-1" />
                                      Featured · Starts on approval
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                            {isSale && listing.is_active && (
                              <div className="mt-1">
                                <SaleStatusSelector
                                  currentStatus={listing.sale_status}
                                  listingId={listing.id}
                                  onStatusChange={handleSaleStatusChange}
                                  disabled={actionLoading === listing.id}
                                />
                              </div>
                            )}
                            {isSale && !listing.is_active && listing.sale_status && (
                              <SaleStatusBadge status={listing.sale_status} size="sm" />
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {listing.is_active && daysUntilExpiration !== null ? (
                            <div className="flex flex-col gap-2">
                              <div className={`flex items-center gap-1 ${
                                daysUntilExpiration <= 3
                                  ? 'text-red-600 font-medium'
                                  : daysUntilExpiration <= 7
                                    ? 'text-amber-600'
                                    : 'text-gray-600'
                              }`}>
                                <Clock className="w-3.5 h-3.5" />
                                {daysUntilExpiration <= 0
                                  ? 'Expired'
                                  : `${daysUntilExpiration}d`}
                              </div>
                              {!isSale && daysUntilExpiration <= 7 && (
                                <button
                                  type="button"
                                  onClick={() => handleRenewListing(listing.id)}
                                  disabled={actionLoading === listing.id}
                                  className="px-2.5 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                  title="Renew for 14 days"
                                >
                                  Renew
                                </button>
                              )}
                              {isSale && (
                                <button
                                  type="button"
                                  onClick={() => handleExtendSalesListing(listing.id)}
                                  disabled={
                                    actionLoading === listing.id ||
                                    !extensionCheck.canExtend
                                  }
                                  className={`px-2.5 py-1.5 text-xs font-medium text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${
                                    extensionCheck.canExtend
                                      ? 'bg-emerald-600 hover:bg-emerald-700'
                                      : 'bg-gray-300 cursor-not-allowed'
                                  }`}
                                  title={extensionCheck.canExtend
                                    ? `Extend ${listing.sale_status === 'in_contract' ? '42' : '30'} days`
                                    : extensionCheck.reason || 'Cannot extend'}
                                >
                                  Extend
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <div>
                            <div className="whitespace-nowrap">
                              Posted:{" "}
                              {new Date(
                                listing.created_at,
                              ).toLocaleDateString()}
                            </div>
                            {listing.last_published_at && (
                              <div className="text-xs text-gray-400 whitespace-nowrap">
                                Last Published:{" "}
                                {new Date(
                                  listing.last_published_at,
                                ).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="sticky right-0 bg-white px-6 py-4 text-sm font-medium shadow-[-4px_0_6px_rgba(0,0,0,0.05)] z-[5]">
                          <div className="flex items-center gap-3">
                            <Link
                              to={`/listing/${listing.id}`}
                              title="View Listing"
                              className="text-gray-500 hover:text-[#273140] transition-colors"
                            >
                              <Eye className="w-4.5 h-4.5" />
                            </Link>

                            <Link
                              to={`/edit/${listing.id}`}
                              className="text-gray-500 hover:text-blue-600 transition-colors"
                              title="Edit Listing"
                            >
                              <Edit className="w-4.5 h-4.5" />
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleFeatureClick(listing)}
                              disabled={
                                actionLoading === listing.id ||
                                getListingFeaturedStatus(listing) === 'pending_approval' ||
                                getListingFeaturedStatus(listing) === 'pending_payment'
                              }
                              className={`transition-colors ${
                                isListingCurrentlyFeatured(listing)
                                  ? "text-accent-500 hover:text-accent-600"
                                  : getListingFeaturedStatus(listing) === 'pending_approval'
                                    ? "text-amber-400 cursor-not-allowed"
                                    : "text-gray-400 hover:text-accent-500"
                              }`}
                              title={
                                isListingCurrentlyFeatured(listing)
                                  ? "Remove Featured"
                                  : getListingFeaturedStatus(listing) === 'pending_approval'
                                    ? "Featured - activates on approval"
                                    : "Boost to top of search results"
                              }
                            >
                              <Star
                                className={`w-4.5 h-4.5 ${isListingCurrentlyFeatured(listing) || getListingFeaturedStatus(listing) === 'pending_approval' ? "fill-current" : ""}`}
                              />
                            </button>

                            {listing.is_active ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUnpublishListing(listing.id)
                                }
                                disabled={
                                  actionLoading === listing.id ||
                                  !listing.approved
                                }
                                className="text-gray-500 hover:text-orange-600 transition-colors"
                                title="Unpublish Listing"
                              >
                                <EyeOff className="w-4.5 h-4.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleRenewListing(listing.id)}
                                disabled={
                                  actionLoading === listing.id ||
                                  !listing.approved
                                }
                                className="text-gray-500 hover:text-blue-600 transition-colors"
                                title="Republish Listing"
                              >
                                <RefreshCw className="w-4.5 h-4.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleDeleteListing(listing.id)}
                              disabled={actionLoading === listing.id}
                              className="text-gray-500 hover:text-red-600 transition-colors"
                              title="Delete Listing"
                            >
                              <Trash2 className="w-4.5 h-4.5" />
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

      <InquiriesModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        listingTitle={modalListingTitle}
        inquiries={modalInquiries}
        loading={modalLoading}
      />

      {featureModalListing && (
        <FeatureListingModal
          isOpen={!!featureModalListing}
          onClose={() => setFeatureModalListing(null)}
          listing={featureModalListing}
        />
      )}
    </div>
  );
}

export { Dashboard };
