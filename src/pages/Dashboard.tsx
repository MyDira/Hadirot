import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CreditCard as Edit, Eye, MousePointerClick, MessageSquare, Star, Trash2, Zap, RefreshCw, Plus, EyeOff, AlertTriangle, Clock, Home, DollarSign, Info, CheckCircle, XCircle, Briefcase, X, Building2, Gift, ArrowUpRight, MoreVertical, Pencil, Crown, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Listing, SaleStatus, CommercialListing, supabase } from "../config/supabase";
import {
  listingsService,
  canExtendListing,
  getDaysUntilExpiration,
  LISTING_DURATION_DAYS,
} from "../services/listings";
import { commercialListingsService } from "../services/commercialListings";
import { profilesService } from "../services/profiles";
import { emailService } from "../services/email";
import { InquiriesModal, Inquiry } from "../components/listing/InquiriesModal";
import { SaleStatusBadge } from "../components/listings/SaleStatusBadge";
import { SaleStatusSelector } from "../components/listings/SaleStatusSelector";
import { FeatureListingModal } from "../components/listings/FeatureListingModal";
import { stripeService, FeaturedPurchase } from "../services/stripe";
import { conciergeService } from "../services/concierge";
import type { ConciergeSubscription } from "../config/supabase";
import { subscriptionsService } from "../services/subscriptions";
import { monetizationStatusService } from "../services/monetizationStatus";
import type { ListingSubscription, PaymentKind } from "../types/monetization";
import { PaidListingStatusCard } from "../components/dashboard/PaidListingStatusCard";
import { MonetizationModal, type MonetizationModalListingOption } from "../components/dashboard/MonetizationModal";
import { QuickPayDaysModal } from "../components/dashboard/QuickPayDaysModal";
import { paymentsService } from "../services/payments";
import type { MonetizationListingFields } from "../services/payments";

type DashboardTab = 'rentals' | 'sales';

export default function Dashboard() {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [listings, setListings] = useState<Listing[]>([]);
  const [commercialListings, setCommercialListings] = useState<CommercialListing[]>([]);
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
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [pendingFeatureListingId, setPendingFeatureListingId] = useState<string | null>(null);
  const [conciergeSub, setConciergeSub] = useState<ConciergeSubscription | null>(null);
  // Residential-rental monetization state (Phase D).
  const [listingSubscription, setListingSubscription] = useState<ListingSubscription | null>(null);
  const [monetizationModalOpen, setMonetizationModalOpen] = useState(false);
  const [monetizationModalPreselect, setMonetizationModalPreselect] = useState<string | null>(null);
  const [monetizationModalInitialTab, setMonetizationModalInitialTab] = useState<'pay' | 'subscribe'>('pay');
  // Small per-listing "add days" modal (opened from a row's green Pay/Renew action).
  const [quickPayListing, setQuickPayListing] = useState<{ id: string; label: string } | null>(null);
  // Which rental card's "⋯" overflow menu is open (card id), or null.
  const [openCardMenu, setOpenCardMenu] = useState<string | null>(null);
  // Phase J: master switch. When false, dashboard hides monetization UI.
  const [monetizationEnabled, setMonetizationEnabled] = useState<boolean>(false);

  // Read the master switch + the user's listing subscription once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await monetizationStatusService.get();
        if (!cancelled) setMonetizationEnabled(status.enabled);
      } catch (err) {
        console.warn('Failed to load monetization status (assuming off):', err);
      }
      try {
        const sub = await subscriptionsService.getMyActiveSubscription();
        if (!cancelled) setListingSubscription(sub);
      } catch (err) {
        console.warn('Failed to load listing subscription:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Auto-open the monetization modal when wizard or another flow appends ?subscribe=open / ?action=pay.
  // Gated by master switch (Phase J) — don't open if monetization isn't enabled yet.
  useEffect(() => {
    if (!monetizationEnabled) return;
    const subOpen = searchParams.get('subscribe');
    const action = searchParams.get('action');
    const listingParam = searchParams.get('listing');
    if (subOpen === 'open') {
      setMonetizationModalInitialTab('subscribe');
      setMonetizationModalPreselect(listingParam);
      setMonetizationModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('subscribe');
      setSearchParams(next, { replace: true });
    } else if (action === 'pay' || action === 'reactivate') {
      setMonetizationModalInitialTab('pay');
      setMonetizationModalPreselect(listingParam);
      setMonetizationModalOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, monetizationEnabled]);

  // Helper: build a MonetizationListingFields view from a Listing row.
  // Tolerates the case where new columns haven't propagated to the fetched
  // shape yet (returns nullish defaults).
  const toMonetizationFields = (l: any): MonetizationListingFields => ({
    id: l.id,
    user_id: l.user_id,
    listing_type: l.listing_type ?? 'rental',
    is_active: l.is_active ?? false,
    approved: l.approved ?? null,
    payment_kind: (l.payment_kind ?? null) as PaymentKind | null,
    trial_started_at: l.trial_started_at ?? null,
    paid_until: l.paid_until ?? null,
    paused_paid_days: l.paused_paid_days ?? 0,
    expires_at: l.expires_at ?? null,
    deactivated_at: l.deactivated_at ?? null,
    created_at: l.created_at ?? null,
  });

  // Human-readable one-line label for a listing (used by the quick-pay modal).
  const buildListingLabel = (l: any): string => {
    const bedrooms = (l as Listing).bedrooms;
    const price = (l as Listing).price;
    const where = (l as Listing).neighborhood || (l as Listing).location || 'Listing';
    const bedText = bedrooms === 0 ? 'Studio' : `${bedrooms} BR`;
    const priceText = price ? `$${price.toLocaleString()}/mo` : 'Call for price';
    return `${bedText} · ${where} · ${priceText}`;
  };

  // Open the small per-listing "add days" modal for a known listing id.
  const openQuickPay = (listingId: string) => {
    const l = listings.find((x) => x.id === listingId);
    setQuickPayListing({ id: listingId, label: l ? buildListingLabel(l) : 'This listing' });
  };

  // One friendly, reassuring status line for a rental card. Avoids scary money
  // language ("Permanently inactive", "Pay") in favor of plain, calm copy.
  const getRentalStatusLine = (
    listing: any,
    payState: ReturnType<typeof paymentsService.derivePaymentState> | null,
    daysUntilExpiration: number | null,
  ): { dot: string; text: string; tone: 'good' | 'warn' | 'muted' } => {
    if (!listing.approved) {
      return { dot: 'bg-amber-400', text: "In review — we'll publish it soon", tone: 'warn' };
    }
    if (!listing.is_active) {
      return { dot: 'bg-gray-400', text: 'Paused — not visible to renters', tone: 'muted' };
    }
    if (payState) {
      switch (payState.label) {
        case 'paid_expired':
          return { dot: 'bg-amber-400', text: 'Time’s up — add days to keep it live', tone: 'warn' };
        case 'paid_renewal_due':
          return { dot: 'bg-amber-400', text: 'Renewal coming up soon', tone: 'warn' };
        case 'trial_ending':
          return { dot: 'bg-amber-400', text: `Free trial ending${payState.trialDaysRemaining != null ? ` · ${payState.trialDaysRemaining}d left` : ''}`, tone: 'warn' };
        case 'trial_active':
          return { dot: 'bg-emerald-500', text: `Live · free trial${payState.trialDaysRemaining != null ? ` · ${payState.trialDaysRemaining}d left` : ''}`, tone: 'good' };
        case 'paid_active':
          return { dot: 'bg-emerald-500', text: `Live${payState.paidDaysRemaining != null ? ` · ${payState.paidDaysRemaining} days left` : ''}`, tone: 'good' };
        case 'subscription_active':
          return { dot: 'bg-emerald-500', text: 'Live · covered by your plan', tone: 'good' };
        case 'admin_granted':
          return { dot: 'bg-emerald-500', text: 'Live · complimentary', tone: 'good' };
        case 'payment_required':
          return { dot: 'bg-amber-400', text: 'Finish payment to publish', tone: 'warn' };
        case 'legacy_free':
          return { dot: 'bg-emerald-500', text: 'Live', tone: 'good' };
      }
    }
    if (daysUntilExpiration != null) {
      if (daysUntilExpiration <= 0) {
        return { dot: 'bg-amber-400', text: 'Expired — extend to keep it live', tone: 'warn' };
      }
      return { dot: 'bg-emerald-500', text: `Live · ${daysUntilExpiration} day${daysUntilExpiration === 1 ? '' : 's'} left`, tone: 'good' };
    }
    return { dot: 'bg-emerald-500', text: 'Live', tone: 'good' };
  };

  // Listings the modal's "pay per listing" tab should offer. Residential rentals
  // owned by the current user, sorted newest first.
  const monetizationModalListings: MonetizationModalListingOption[] = useMemo(() => {
    return listings
      .filter((l) => l.listing_type !== 'sale')
      .map((l) => {
        const bedrooms = (l as Listing).bedrooms;
        const price = (l as Listing).price;
        const where = (l as Listing).neighborhood || (l as Listing).location || 'Listing';
        const bedText = bedrooms === 0 ? 'Studio' : `${bedrooms} BR`;
        const priceText = price ? `$${price.toLocaleString()}/mo` : 'Call for price';
        return { id: l.id, label: `${bedText} · ${where} · ${priceText}` };
      });
  }, [listings]);

  const rentalListings = useMemo(
    () => [
      ...listings.filter((l) => l.listing_type !== 'sale'),
      ...commercialListings.filter((l) => l.listing_type !== 'sale').map((l) => ({ ...l, isCommercial: true as const })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [listings, commercialListings]
  );
  const salesListings = useMemo(
    () => [
      ...listings.filter((l) => l.listing_type === 'sale'),
      ...commercialListings.filter((l) => l.listing_type === 'sale').map((l) => ({ ...l, isCommercial: true as const })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [listings, commercialListings]
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
      conciergeService.getUserActiveSubscription().then(setConciergeSub).catch(() => {});
    }
  }, [user, authLoading]);

  // Effect 1: Capture query params and store listing ID (runs on param changes)
  useEffect(() => {
    const featuredParam = searchParams.get('featured');
    const newListingParam = searchParams.get('new_listing');
    const listingIdParam = searchParams.get('listing_id');

    console.log('[Dashboard] Query params detected:', { featuredParam, newListingParam, listingIdParam });

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
      console.log('[Dashboard] New listing detected, storing ID:', listingIdParam);
      setPendingFeatureListingId(listingIdParam);
      // Clear params immediately to clean URL
      searchParams.delete('new_listing');
      searchParams.delete('listing_id');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams]);

  // Effect 2: Open modal when listings load and we have a pending listing ID
  useEffect(() => {
    if (pendingFeatureListingId && listings.length > 0) {
      console.log('[Dashboard] Checking for pending listing ID:', pendingFeatureListingId);
      console.log('[Dashboard] Current listings count:', listings.length);

      const listing = listings.find(l => l.id === pendingFeatureListingId);

      if (listing) {
        console.log('[Dashboard] Found listing, opening modal:', { id: listing.id, title: listing.title });
        setNewListingBanner({ listingId: listing.id, title: listing.title });
        setFeatureModalListing(listing);
        setShowSuccessBanner(true);
        setPendingFeatureListingId(null); // Clear after success
      } else {
        console.log('[Dashboard] Listing not found in array yet');
      }
    }
  }, [pendingFeatureListingId, listings]);

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
      const [data, counts, commercialData] = await Promise.all([
        listingsService.getUserListings(user.id),
        listingsService.getInquiryCountsForUser(),
        commercialListingsService.getUserCommercialListings(user.id).catch((err) => {
          console.error("[Dashboard] Failed to load commercial listings:", err);
          return [] as CommercialListing[];
        }),
      ]);
      setListings(data);
      setInquiryCounts(counts);
      setCommercialListings(commercialData);
      console.debug("[Dashboard] commercial listings loaded:", commercialData.length);
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
      setShowSuccessBanner(false);
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

    const isCommercial = !!(listing as any).isCommercial;
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
      const updatedListing = isCommercial
        ? await commercialListingsService.updateCommercialSaleStatus(listingId, newStatus as any)
        : await listingsService.updateSaleStatus(listingId, newStatus);

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

  const handleUnpublishCommercialListing = async (listingId: string) => {
    if (!confirm("Are you sure you want to unpublish this listing? It will be hidden from public view but can be republished later.")) {
      return;
    }
    setActionLoading(listingId);
    try {
      await commercialListingsService.updateCommercialListing(listingId, {
        is_active: false,
        updated_at: new Date().toISOString(),
      });
      await loadUserListings();
    } catch (error) {
      console.error("Error unpublishing commercial listing:", error);
      alert("Failed to unpublish listing. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRenewCommercialListing = async (listingId: string) => {
    setActionLoading(listingId);
    try {
      const listing = commercialListings.find((l) => l.id === listingId);
      const listingType = listing?.listing_type ?? 'rental';
      await commercialListingsService.renewCommercialListing(listingId, listingType, listing?.sale_status);
      await loadUserListings();
    } catch (error) {
      console.error("Error renewing commercial listing:", error);
      alert(error instanceof Error ? error.message : "Failed to renew listing. Please try again.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteCommercialListing = async (listingId: string) => {
    if (!confirm("Are you sure you want to permanently delete this listing? This action cannot be undone.")) {
      return;
    }
    setActionLoading(listingId);
    try {
      await commercialListingsService.deleteCommercialListing(listingId);
      setCommercialListings((prev) => prev.filter((l) => l.id !== listingId));
    } catch (error) {
      console.error("Error deleting commercial listing:", error);
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

      {/* Subscription trial banner (Phase H) — hidden when master switch off (Phase J). */}
      {monetizationEnabled && listingSubscription?.status === 'trial' && (() => {
        const trialEnd = new Date(new Date(listingSubscription.created_at).getTime() + 14 * 24 * 60 * 60 * 1000);
        const daysLeft = Math.ceil((trialEnd.getTime() - Date.now()) / 86400000);
        const planName = listingSubscription.plan === 'vip' ? 'VIP' : 'Agent';
        const urgent = daysLeft <= 3;
        return (
          <div className={`mb-6 rounded-lg p-4 flex items-start gap-3 border ${
            urgent
              ? 'bg-amber-50 border-amber-200'
              : 'bg-emerald-50 border-emerald-200'
          }`}>
            <Gift className={`w-5 h-5 flex-shrink-0 mt-0.5 ${urgent ? 'text-amber-700' : 'text-emerald-700'}`} />
            <div className="flex-1 min-w-0">
              <div className={`font-semibold ${urgent ? 'text-amber-900' : 'text-emerald-900'}`}>
                {planName} free trial · {daysLeft > 0 ? `${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'Ends today'}
              </div>
              <div className={`text-sm mt-0.5 ${urgent ? 'text-amber-800' : 'text-emerald-800'}`}>
                {urgent
                  ? `Your card will be charged on day ${daysLeft <= 0 ? 14 : 14} of your trial. Cancel in the billing portal to avoid the charge.`
                  : `Card on file. No charge until day 14, then your subscription begins automatically. Cancel anytime to avoid the charge.`}
              </div>
            </div>
            <button
              onClick={() => {
                setMonetizationModalInitialTab('subscribe');
                setMonetizationModalOpen(true);
              }}
              className={`text-sm font-semibold inline-flex items-center gap-1 ${
                urgent ? 'text-amber-900 hover:text-amber-700' : 'text-emerald-900 hover:text-emerald-700'
              }`}
            >
              Upgrade <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        );
      })()}

      {/* Active subscription banner — current plan + upgrade/manage. Shown for
          paid/comp subscribers (the trial state has its own banner above). */}
      {monetizationEnabled &&
        listingSubscription &&
        (listingSubscription.status === 'active' ||
          listingSubscription.status === 'admin_active' ||
          listingSubscription.status === 'past_due') &&
        (() => {
          const isVip = listingSubscription.plan === 'vip';
          const planName = isVip ? 'VIP' : 'Agent';
          const comp = listingSubscription.status === 'admin_active';
          const pastDue = listingSubscription.status === 'past_due';
          const capText =
            listingSubscription.listing_cap === null
              ? 'Unlimited active listings'
              : `Up to ${listingSubscription.listing_cap} active listings`;
          const renewal = listingSubscription.current_period_end
            ? new Date(listingSubscription.current_period_end).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })
            : null;
          return (
            <div className="mb-6 rounded-lg p-4 flex items-start gap-3 border bg-brand-50 border-brand-100">
              <div className="w-9 h-9 rounded-lg bg-white border border-brand-100 flex items-center justify-center text-brand-700 flex-shrink-0">
                {isVip ? <Crown className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-brand-800">
                  {planName} plan{comp ? ' · complimentary' : ''}
                  {pastDue && (
                    <span className="ml-2 text-xs font-medium text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">
                      Payment past due
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 mt-0.5">
                  {capText}
                  {renewal ? ` · renews ${renewal}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                {!isVip && (
                  <button
                    onClick={() => {
                      setMonetizationModalInitialTab('subscribe');
                      setMonetizationModalOpen(true);
                    }}
                    className="text-sm font-semibold inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800"
                  >
                    Upgrade to VIP <ArrowUpRight className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => setSearchParams({ tab: 'billing' })}
                  className="text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  Manage
                </button>
              </div>
            </div>
          );
        })()}

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
                  setShowSuccessBanner(false);
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

        {!conciergeSub && (
          <div className="mb-4 bg-[#F0F9FF] border border-[#1E4A74]/20 rounded-lg p-3">
            <Link to="/concierge" className="flex items-center gap-3 group">
              <div className="rounded-lg p-2 bg-[#1E4A74]/10 group-hover:bg-[#1E4A74]/20 transition-colors flex-shrink-0">
                <Briefcase className="w-4 h-4 text-[#1E4A74]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">Too busy to post your own listings?</p>
                <p className="text-xs text-gray-600 mt-0.5">Let our Concierge team handle it for you. Starting at $25 per listing.</p>
              </div>
              <span className="text-xs font-semibold text-[#1E4A74] group-hover:underline flex-shrink-0">Learn More</span>
            </Link>
          </div>
        )}

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
            {!localStorage.getItem('concierge_empty_dismissed') && (
              <div className="mt-6 mx-auto max-w-md relative bg-[#F0F9FF] border border-[#1E4A74]/20 rounded-lg p-4">
                <button
                  onClick={() => { localStorage.setItem('concierge_empty_dismissed', '1'); window.dispatchEvent(new Event('storage')); }}
                  className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-start gap-3">
                  <Briefcase className="w-5 h-5 text-[#1E4A74] flex-shrink-0 mt-0.5" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800">Too busy to post?</p>
                    <p className="text-xs text-gray-600 mt-0.5">We'll handle it. Forward us your listings and we'll take care of everything.</p>
                    <Link to="/concierge" className="text-xs font-semibold text-[#1E4A74] hover:underline mt-1.5 inline-block">Learn More</Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'rentals' ? (
          /* ---------------------------------------------------------------
             Rentals tab — modern card list (replaces the old wide table).
             Each card surfaces one friendly status line and one contextual
             primary action, with View / Edit and a "⋯" overflow for the rest.
          ---------------------------------------------------------------- */
          <div className="space-y-3">
            {filteredListings.map((listing) => {
              const isCommercial = !!(listing as any).isCommercial;
              const featuredImage =
                listing.listing_images?.find((img) => img.is_featured) ||
                listing.listing_images?.[0];
              const daysUntilExpiration = getDaysUntilExpiration(listing.expires_at);

              const payState = (!isCommercial && monetizationEnabled)
                ? paymentsService.derivePaymentState(toMonetizationFields(listing), {
                    hasActiveSubscription: listingSubscription !== null,
                    isAdmin: profile?.is_admin === true,
                  })
                : null;
              const showPayAction = !!payState
                && !!payState.nextActionUrl
                && payState.nextActionUrl.includes('action=pay');

              const status = getRentalStatusLine(listing, payState, daysUntilExpiration);

              const priceText = isCommercial
                ? ((listing as CommercialListing).call_for_price
                    ? 'Contact for price'
                    : (listing as CommercialListing).price != null
                      ? `${formatPrice((listing as CommercialListing).price!)}/mo`
                      : 'Contact for price')
                : listing.call_for_price
                  ? 'Call for price'
                  : `${formatPrice(listing.price)}/mo`;

              const bedBath = !isCommercial
                ? `${(listing as Listing).bedrooms} bed · ${(listing as Listing).bathrooms} bath`
                : null;

              const featuredStatus = !isCommercial ? getListingFeaturedStatus(listing as Listing) : null;
              const commercialCurrentlyFeatured = isCommercial
                && !!listing.is_featured
                && !!listing.featured_expires_at
                && new Date(listing.featured_expires_at) > new Date();
              const canGetFeatured = listing.is_active
                && listing.approved
                && (isCommercial
                  ? !commercialCurrentlyFeatured
                  : !isListingCurrentlyFeatured(listing as Listing));

              const expiringSoon = listing.is_active
                && daysUntilExpiration != null
                && daysUntilExpiration <= 7;

              // Pick the single most useful primary action.
              type Primary = { label: string; onClick: () => void; cls: string } | null;
              let primary: Primary = null;
              if (showPayAction) {
                primary = {
                  label: payState?.label === 'paid_expired' ? 'Relist — add days' : 'Keep it active',
                  onClick: () => openQuickPay(listing.id),
                  cls: 'bg-emerald-600 hover:bg-emerald-700 text-white',
                };
              } else if (!listing.is_active && listing.approved) {
                // Republishing is free only while the listing still has
                // coverage (unexpired trial, banked paid days, subscription,
                // admin grant, legacy). An exhausted trial/balance or an
                // unpaid must-pay listing routes to payment instead — the
                // cron would deactivate a free republish within the hour
                // anyway, so don't offer a button that silently un-does itself.
                const lr = listing as Listing & {
                  trial_started_at?: string | null;
                  paused_paid_days?: number | null;
                };
                const trialExpired =
                  payState?.paymentKind === 'individual_trial' &&
                  !!lr.trial_started_at &&
                  Date.now() > new Date(lr.trial_started_at).getTime() + 14 * 86400000;
                const paidExhausted =
                  payState?.paymentKind === 'individual_paid' &&
                  (lr.paused_paid_days ?? 0) <= 0;
                const unpaid = payState?.paymentKind === 'pending_payment';
                const needsPaymentToRepublish =
                  monetizationEnabled && !isCommercial && (trialExpired || paidExhausted || unpaid);
                primary = needsPaymentToRepublish
                  ? {
                      label: 'Add days to relist',
                      onClick: () => openQuickPay(listing.id),
                      cls: 'bg-emerald-600 hover:bg-emerald-700 text-white',
                    }
                  : {
                      label: 'Republish',
                      onClick: () => isCommercial ? handleRenewCommercialListing(listing.id) : handleRenewListing(listing.id),
                      cls: 'bg-brand-600 hover:bg-brand-700 text-white',
                    };
              } else if (expiringSoon) {
                primary = {
                  label: 'Extend listing',
                  onClick: () => isCommercial ? handleRenewCommercialListing(listing.id) : handleRenewListing(listing.id),
                  cls: 'bg-brand-600 hover:bg-brand-700 text-white',
                };
              } else if (canGetFeatured) {
                primary = {
                  label: 'Get Featured',
                  onClick: () => isCommercial
                    ? navigate(`/boost/${listing.id}`)
                    : (() => { setFeatureModalListing(listing as Listing); setShowSuccessBanner(false); })(),
                  cls: 'bg-accent-500 hover:bg-accent-600 text-white',
                };
              }
              const featuredIsPrimary = primary?.label === 'Get Featured';
              const stripe = isCommercial ? '#0891B2' : '#1E4A74';

              return (
                <div
                  key={listing.id}
                  className="relative bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                  style={{ borderLeft: `4px solid ${stripe}` }}
                >
                  <div className="p-3.5 sm:p-4">
                    <div className="flex gap-3.5">
                      {/* Thumbnail */}
                      <Link
                        to={isCommercial ? `/commercial-listing/${listing.id}` : `/listing/${listing.id}`}
                        className="flex-shrink-0"
                      >
                        {featuredImage ? (
                          <img
                            src={featuredImage.image_url}
                            alt={listing.title ?? ''}
                            className="w-16 h-16 sm:w-[72px] sm:h-[72px] object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                            {isCommercial ? <Building2 className="w-6 h-6 text-cyan-600" /> : <Home className="w-6 h-6 text-gray-400" />}
                          </div>
                        )}
                      </Link>

                      {/* Main */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Link
                                to={isCommercial ? `/commercial-listing/${listing.id}` : `/listing/${listing.id}`}
                                className="font-semibold text-gray-900 hover:text-brand-700 transition-colors truncate"
                                title={listing.title ?? ''}
                              >
                                {listing.title}
                              </Link>
                              {isCommercial && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200 whitespace-nowrap flex-shrink-0">
                                  COMM · LEASE
                                </span>
                              )}
                              {featuredStatus === 'active' && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent-50 text-accent-700 border border-accent-200 whitespace-nowrap flex-shrink-0">
                                  <Zap className="w-3 h-3 mr-0.5" /> Featured
                                </span>
                              )}
                              {featuredStatus === 'pending_approval' && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap flex-shrink-0">
                                  <Clock className="w-3 h-3 mr-0.5" /> Featured soon
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500 truncate mt-0.5">
                              {bedBath ? `${bedBath} · ` : ''}<span className="text-gray-700 font-medium">{priceText}</span>
                            </div>
                          </div>

                          {/* Overflow menu */}
                          <div className="relative flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => setOpenCardMenu(openCardMenu === listing.id ? null : listing.id)}
                              className="p-1.5 -mr-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                              aria-label="More actions"
                            >
                              <MoreVertical className="w-5 h-5" />
                            </button>
                            {openCardMenu === listing.id && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setOpenCardMenu(null)} />
                                <div className="absolute right-0 top-9 z-20 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 text-sm">
                                  {canGetFeatured && !featuredIsPrimary && (
                                    <button
                                      type="button"
                                      onClick={() => { setOpenCardMenu(null); setFeatureModalListing(listing as Listing); setShowSuccessBanner(false); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50"
                                    >
                                      <Zap className="w-4 h-4 text-accent-500" /> Get Featured
                                    </button>
                                  )}
                                  {listing.is_active ? (
                                    <button
                                      type="button"
                                      onClick={() => { setOpenCardMenu(null); if (isCommercial) handleUnpublishCommercialListing(listing.id); else handleUnpublishListing(listing.id); }}
                                      disabled={actionLoading === listing.id || !listing.approved}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <EyeOff className="w-4 h-4 text-gray-500" /> Pause listing
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => { setOpenCardMenu(null); if (isCommercial) handleRenewCommercialListing(listing.id); else handleRenewListing(listing.id); }}
                                      disabled={actionLoading === listing.id || !listing.approved}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <RefreshCw className="w-4 h-4 text-gray-500" /> Republish
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => { setOpenCardMenu(null); if (isCommercial) handleDeleteCommercialListing(listing.id); else handleDeleteListing(listing.id); }}
                                    disabled={actionLoading === listing.id}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 disabled:opacity-40"
                                  >
                                    <Trash2 className="w-4 h-4" /> Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Friendly status line */}
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className={`w-2 h-2 rounded-full ${status.dot}`} />
                          <span className={`text-xs font-medium ${
                            status.tone === 'good' ? 'text-emerald-700'
                              : status.tone === 'warn' ? 'text-amber-700'
                              : 'text-gray-500'
                          }`}>
                            {status.text}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stats + actions row */}
                    <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-3 sm:gap-4 text-xs text-gray-500 min-w-0">
                        <span className="flex items-center gap-1" title="Impressions">
                          <Eye className="w-3.5 h-3.5 opacity-70" />
                          {(listing.impressions ?? 0).toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1" title="Direct views">
                          <MousePointerClick className="w-3.5 h-3.5 opacity-70" />
                          {(listing.direct_views ?? 0).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenInquiries(listing.id, listing.title)}
                          className="flex items-center gap-1 hover:text-accent-600 transition-colors"
                          title="View inquiries"
                        >
                          <MessageSquare className="w-3.5 h-3.5 opacity-70" />
                          <span className="hover:underline">{inquiryCounts[listing.id] ?? 0}</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {primary && (
                          <button
                            type="button"
                            onClick={primary.onClick}
                            disabled={actionLoading === listing.id}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${primary.cls}`}
                          >
                            {primary.label}
                          </button>
                        )}
                        <Link
                          to={isCommercial ? `/commercial-listing/${listing.id}` : `/listing/${listing.id}`}
                          className="px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-brand-700 hover:bg-gray-50 rounded-lg transition-colors"
                          title="View listing"
                        >
                          View
                        </Link>
                        <Link
                          to={isCommercial ? `/commercial/edit/${listing.id}` : `/edit/${listing.id}`}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 hover:bg-gray-50 rounded-lg transition-colors"
                          title="Edit listing"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ---------------------------------------------------------------
             Sales tab — same modern card list as rentals, with sale-specific
             info (asking price, sale status, extend).
          ---------------------------------------------------------------- */
          <div className="space-y-3">
            {filteredListings.map((listing) => {
              const isCommercial = !!(listing as any).isCommercial;
              const featuredImage =
                listing.listing_images?.find((img) => img.is_featured) ||
                listing.listing_images?.[0];
              const daysUntilExpiration = getDaysUntilExpiration(listing.expires_at);
              const extensionCheck = isCommercial ? { canExtend: false, reason: '' } : canExtendListing(listing as Listing);

              const priceText = isCommercial
                ? ((listing as CommercialListing).call_for_price
                    ? 'Contact for price'
                    : (listing as CommercialListing).asking_price != null
                      ? formatPrice((listing as CommercialListing).asking_price!)
                      : 'Contact for price')
                : listing.call_for_price
                  ? 'Call for price'
                  : formatPrice((listing as Listing).asking_price ?? listing.price);

              const bedBath = !isCommercial
                ? `${(listing as Listing).bedrooms} bed · ${(listing as Listing).bathrooms} bath`
                : null;

              const featuredStatus = !isCommercial ? getListingFeaturedStatus(listing as Listing) : null;
              const commercialCurrentlyFeatured = isCommercial
                && !!listing.is_featured
                && !!listing.featured_expires_at
                && new Date(listing.featured_expires_at) > new Date();
              const canGetFeatured = listing.is_active
                && listing.approved
                && (isCommercial
                  ? !commercialCurrentlyFeatured
                  : !isListingCurrentlyFeatured(listing as Listing));

              // Pick the single most useful primary action for a sale listing.
              type Primary = { label: string; onClick: () => void; cls: string; disabled?: boolean; title?: string } | null;
              let primary: Primary = null;
              if (!listing.is_active && listing.approved) {
                primary = {
                  label: 'Republish',
                  onClick: () => isCommercial ? handleRenewCommercialListing(listing.id) : handleRenewListing(listing.id),
                  cls: 'bg-brand-600 hover:bg-brand-700 text-white',
                };
              } else if (!isCommercial && listing.is_active && extensionCheck.canExtend) {
                primary = {
                  label: 'Extend listing',
                  onClick: () => handleExtendSalesListing(listing.id),
                  cls: 'bg-emerald-600 hover:bg-emerald-700 text-white',
                  title: `Extend ${(listing as Listing).sale_status === 'in_contract' ? '42' : '30'} days`,
                };
              } else if (canGetFeatured) {
                primary = {
                  label: 'Get Featured',
                  onClick: () => isCommercial
                    ? navigate(`/boost/${listing.id}`)
                    : (() => { setFeatureModalListing(listing as Listing); setShowSuccessBanner(false); })(),
                  cls: 'bg-accent-500 hover:bg-accent-600 text-white',
                };
              }
              const featuredIsPrimary = primary?.label === 'Get Featured';
              const stripe = isCommercial ? '#0891B2' : '#1E4A74';

              return (
                <div
                  key={listing.id}
                  className="relative bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                  style={{ borderLeft: `4px solid ${stripe}` }}
                >
                  <div className="p-3.5 sm:p-4">
                    <div className="flex gap-3.5">
                      {/* Thumbnail */}
                      <Link
                        to={isCommercial ? `/commercial-listing/${listing.id}` : `/listing/${listing.id}`}
                        className="flex-shrink-0"
                      >
                        {featuredImage ? (
                          <img
                            src={featuredImage.image_url}
                            alt={listing.title ?? ''}
                            className="w-16 h-16 sm:w-[72px] sm:h-[72px] object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                            {isCommercial ? <Building2 className="w-6 h-6 text-cyan-600" /> : <Home className="w-6 h-6 text-gray-400" />}
                          </div>
                        )}
                      </Link>

                      {/* Main */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Link
                                to={isCommercial ? `/commercial-listing/${listing.id}` : `/listing/${listing.id}`}
                                className="font-semibold text-gray-900 hover:text-brand-700 transition-colors truncate"
                                title={listing.title ?? ''}
                              >
                                {listing.title}
                              </Link>
                              {isCommercial && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-50 text-cyan-700 border border-cyan-200 whitespace-nowrap flex-shrink-0">
                                  COMM · SALE
                                </span>
                              )}
                              {featuredStatus === 'active' && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent-50 text-accent-700 border border-accent-200 whitespace-nowrap flex-shrink-0">
                                  <Zap className="w-3 h-3 mr-0.5" /> Featured
                                </span>
                              )}
                              {featuredStatus === 'pending_approval' && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap flex-shrink-0">
                                  <Clock className="w-3 h-3 mr-0.5" /> Featured soon
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500 truncate mt-0.5">
                              {bedBath ? `${bedBath} · ` : ''}<span className="text-gray-700 font-medium">{priceText}</span>
                            </div>
                          </div>

                          {/* Overflow menu */}
                          <div className="relative flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => setOpenCardMenu(openCardMenu === listing.id ? null : listing.id)}
                              className="p-1.5 -mr-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                              aria-label="More actions"
                            >
                              <MoreVertical className="w-5 h-5" />
                            </button>
                            {openCardMenu === listing.id && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setOpenCardMenu(null)} />
                                <div className="absolute right-0 top-9 z-20 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 text-sm">
                                  {canGetFeatured && !featuredIsPrimary && (
                                    <button
                                      type="button"
                                      onClick={() => { setOpenCardMenu(null); setFeatureModalListing(listing as Listing); setShowSuccessBanner(false); }}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50"
                                    >
                                      <Zap className="w-4 h-4 text-accent-500" /> Get Featured
                                    </button>
                                  )}
                                  {listing.is_active ? (
                                    <button
                                      type="button"
                                      onClick={() => { setOpenCardMenu(null); if (isCommercial) handleUnpublishCommercialListing(listing.id); else handleUnpublishListing(listing.id); }}
                                      disabled={actionLoading === listing.id || !listing.approved}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <EyeOff className="w-4 h-4 text-gray-500" /> Pause listing
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => { setOpenCardMenu(null); if (isCommercial) handleRenewCommercialListing(listing.id); else handleRenewListing(listing.id); }}
                                      disabled={actionLoading === listing.id || !listing.approved}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      <RefreshCw className="w-4 h-4 text-gray-500" /> Republish
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => { setOpenCardMenu(null); if (isCommercial) handleDeleteCommercialListing(listing.id); else handleDeleteListing(listing.id); }}
                                    disabled={actionLoading === listing.id}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50 disabled:opacity-40"
                                  >
                                    <Trash2 className="w-4 h-4" /> Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Status area — sale status selector / badge */}
                        {!listing.approved ? (
                          <div className="flex items-center gap-1.5 mt-2">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            <span className="text-xs font-medium text-amber-700">In review — we'll publish it soon</span>
                          </div>
                        ) : listing.is_active ? (
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {!isCommercial ? (
                              <SaleStatusSelector
                                currentStatus={(listing as Listing).sale_status}
                                listingId={listing.id}
                                onStatusChange={handleSaleStatusChange}
                                disabled={actionLoading === listing.id}
                              />
                            ) : (
                              <span className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                <span className="text-xs font-medium text-emerald-700">Live</span>
                              </span>
                            )}
                            {daysUntilExpiration != null && (
                              <span className="text-xs text-gray-400">
                                {daysUntilExpiration <= 0 ? 'Expired' : `${daysUntilExpiration} day${daysUntilExpiration === 1 ? '' : 's'} left`}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-gray-400" />
                              <span className="text-xs font-medium text-gray-500">Paused</span>
                            </span>
                            {!isCommercial && (listing as Listing).sale_status && (
                              <SaleStatusBadge status={(listing as Listing).sale_status!} size="sm" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Stats + actions row */}
                    <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-gray-100">
                      <div className="flex items-center gap-3 sm:gap-4 text-xs text-gray-500 min-w-0">
                        <span className="flex items-center gap-1" title="Impressions">
                          <Eye className="w-3.5 h-3.5 opacity-70" />
                          {(listing.impressions ?? 0).toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1" title="Direct views">
                          <MousePointerClick className="w-3.5 h-3.5 opacity-70" />
                          {(listing.direct_views ?? 0).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenInquiries(listing.id, listing.title)}
                          className="flex items-center gap-1 hover:text-accent-600 transition-colors"
                          title="View inquiries"
                        >
                          <MessageSquare className="w-3.5 h-3.5 opacity-70" />
                          <span className="hover:underline">{inquiryCounts[listing.id] ?? 0}</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {primary && (
                          <button
                            type="button"
                            onClick={primary.onClick}
                            disabled={actionLoading === listing.id}
                            title={primary.title}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${primary.cls}`}
                          >
                            {primary.label}
                          </button>
                        )}
                        <Link
                          to={isCommercial ? `/commercial-listing/${listing.id}` : `/listing/${listing.id}`}
                          className="px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-brand-700 hover:bg-gray-50 rounded-lg transition-colors"
                          title="View listing"
                        >
                          View
                        </Link>
                        <Link
                          to={isCommercial ? `/commercial/edit/${listing.id}` : `/edit/${listing.id}`}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:text-blue-600 hover:bg-gray-50 rounded-lg transition-colors"
                          title="Edit listing"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Edit
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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
          onClose={() => {
            setFeatureModalListing(null);
            setShowSuccessBanner(false);
          }}
          listing={featureModalListing}
          showSuccessBanner={showSuccessBanner}
        />
      )}

      {/* Residential-rental monetization modal (Phase D) */}
      <MonetizationModal
        open={monetizationModalOpen}
        onClose={() => {
          setMonetizationModalOpen(false);
          setMonetizationModalPreselect(null);
        }}
        listings={monetizationModalListings}
        preselectedListingId={monetizationModalPreselect}
        initialTab={monetizationModalInitialTab}
        activeSubscription={listingSubscription}
        onUpgraded={async () => {
          try {
            const sub = await subscriptionsService.getMyActiveSubscription();
            setListingSubscription(sub);
          } catch (err) {
            console.warn('Failed to refresh subscription after upgrade:', err);
          }
        }}
      />

      {/* Small per-listing "add days" modal — opened from a row's green Pay/Renew action. */}
      <QuickPayDaysModal
        open={quickPayListing !== null}
        onClose={() => setQuickPayListing(null)}
        listing={quickPayListing}
      />
    </div>
  );
}

export { Dashboard };
