import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { MapPin, Star, Heart, ArrowLeft, Building, Layers, CalendarDays, Wrench, Car, Users, DollarSign, CheckCircle, Eye, BarChart3, CreditCard as Edit, EyeOff, Trash2, XCircle, Maximize2, ArrowUpFromLine, TrendingUp, Package, Zap, Droplets, Wind, Activity } from 'lucide-react';
import { supabase, CommercialListing, CommercialSpaceType, CommercialSubtype, LeaseType, BuildOutCondition, BuildingClass } from '../config/supabase';
import { commercialListingsService } from '../services/commercialListings';
import { useAuth } from '@/hooks/useAuth';
import ImageCarousel from '@/components/listing/ImageCarousel';
import { normalizeImageUrl } from '@/utils/stockImage';
import { gaListing } from '@/lib/ga';
import { ShareButton } from '../components/shared/ShareButton';
import { ImageZoomModal } from '../components/listing/ImageZoomModal';
import { ListingLocationMap } from '../components/listing/ListingLocationMapLazy';
import { ContactProfileBubble } from '../components/common/ContactProfileBubble';
import { PhoneNumberReveal } from '../components/common/PhoneNumberReveal';
import { ConfirmDialog } from '../components/shared/ConfirmDialog';
import { CommercialContactForm } from '../components/listing/CommercialContactForm';

const SCROLL_THRESHOLDS = [25, 50, 75, 100] as const;

function getScrollPercent(): number {
  const el = document.documentElement;
  const body = document.body;
  const scrollTop = el.scrollTop || body.scrollTop;
  const scrollHeight = (el.scrollHeight || body.scrollHeight) - el.clientHeight;
  if (scrollHeight <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((scrollTop / scrollHeight) * 100)));
}

const SPACE_TYPE_LABELS: Record<CommercialSpaceType, string> = {
  storefront: 'Retail',
  restaurant: 'Restaurant',
  office: 'Office',
  warehouse: 'Warehouse',
  industrial: 'Industrial',
  mixed_use: 'Mixed Use',
  community_facility: 'Community Facility',
  basement_commercial: 'Basement Commercial',
};

const LEASE_TYPE_LABELS: Record<LeaseType, { abbr: string; full: string; explanation: string }> = {
  nnn: {
    abbr: 'NNN',
    full: 'Triple Net',
    explanation: 'Tenant pays base rent + property taxes + insurance + maintenance',
  },
  gross: {
    abbr: 'Gross',
    full: 'Gross Lease',
    explanation: 'Landlord covers most operating expenses',
  },
  modified_gross: {
    abbr: 'MG',
    full: 'Modified Gross',
    explanation: 'Shared operating expenses, negotiated split',
  },
  full_service: {
    abbr: 'FS',
    full: 'Full Service Gross',
    explanation: 'All operating expenses included in rent',
  },
  percentage: {
    abbr: '%',
    full: 'Percentage Lease',
    explanation: 'Base rent plus a percentage of gross sales',
  },
  industrial_gross: {
    abbr: 'IG',
    full: 'Industrial Gross',
    explanation: 'Tenant pays base rent; landlord covers most building expenses',
  },
  absolute_net: {
    abbr: 'Net',
    full: 'Absolute Net',
    explanation: 'Tenant pays all expenses including structural repairs',
  },
  tenant_electric: {
    abbr: 'TE',
    full: 'Tenant Electric',
    explanation: 'Tenant pays base rent + their own electricity',
  },
};

const BUILD_OUT_LABELS: Record<BuildOutCondition, string> = {
  full_build_out: 'Built Out',
  turnkey: 'Turnkey',
  second_generation: '2nd Generation',
  vanilla_box: 'Vanilla Box',
  shell: 'Shell',
  cold_dark_shell: 'Cold Dark Shell',
};

const BUILDING_CLASS_LABELS: Record<BuildingClass, string> = {
  a: 'Class A',
  b: 'Class B',
  c: 'Class C',
};

function getImageBadge(spaceType: CommercialSpaceType, subtype: CommercialSubtype | null): string | null {
  if (!subtype) return null;
  const key = `${spaceType}:${subtype}`;
  const map: Record<string, string> = {
    'office:medical_office': 'Medical',
    'office:creative_loft': 'Creative / Loft',
    'office:coworking': 'Coworking',
    'office:rd_lab': 'R&D Lab',
    'warehouse:cold_storage': 'Cold Storage',
    'warehouse:distribution': 'Distribution',
    'storefront:strip_center': 'Strip Center',
    'storefront:showroom': 'Showroom',
    'restaurant:bar_lounge': 'Bar / Lounge',
    'restaurant:cafe': 'Café',
    'community_facility:daycare': 'Daycare',
    'community_facility:religious': 'Religious',
    'industrial:freestanding': 'Freestanding',
  };
  return map[key] ?? null;
}

function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPostedDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

interface SpecRowItem {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function buildSpecItems(listing: CommercialListing): SpecRowItem[] {
  const items: SpecRowItem[] = [];

  const add = (icon: React.ReactNode, label: string, value: string | null | undefined) => {
    if (value !== null && value !== undefined && value !== '') {
      items.push({ icon, label, value });
    }
  };

  const addBool = (icon: React.ReactNode, label: string, value: boolean | null | undefined) => {
    if (value === true) items.push({ icon, label, value: 'Yes' });
  };

  add(<Building className="w-4 h-4" />, 'Space Type', SPACE_TYPE_LABELS[listing.commercial_space_type]);
  add(<Maximize2 className="w-4 h-4" />, 'Available SF', listing.available_sf ? `${listing.available_sf.toLocaleString()} SF` : null);
  add(<ArrowUpFromLine className="w-4 h-4" />, 'Floor Level', listing.floor_level);
  add(<Activity className="w-4 h-4" />, 'Condition', listing.build_out_condition ? BUILD_OUT_LABELS[listing.build_out_condition] : null);
  add(<Layers className="w-4 h-4" />, 'Layout', listing.layout_type);
  add(<ArrowUpFromLine className="w-4 h-4" />, 'Ceiling Height', listing.ceiling_height_ft ? `${listing.ceiling_height_ft} ft` : null);
  add(<Maximize2 className="w-4 h-4" />, 'Frontage', listing.frontage_ft ? `${listing.frontage_ft} ft` : null);
  add(<ArrowUpFromLine className="w-4 h-4" />, 'Clear Height', listing.clear_height_ft ? `${listing.clear_height_ft} ft` : null);
  add(<Building className="w-4 h-4" />, 'Building Class', listing.building_class ? BUILDING_CLASS_LABELS[listing.building_class] : null);
  add(<Package className="w-4 h-4" />, 'Loading Docks', listing.loading_docks ? `${listing.loading_docks}` : null);
  add(<Package className="w-4 h-4" />, 'Drive-In Doors', listing.drive_in_doors ? `${listing.drive_in_doors}` : null);
  add(<Zap className="w-4 h-4" />, 'Electrical', listing.electrical_amps ? `${listing.electrical_amps}A${listing.electrical_voltage ? ` / ${listing.electrical_voltage}V` : ''}` : null);
  add(<Activity className="w-4 h-4" />, 'Sprinkler', listing.sprinkler_type);
  add(<Activity className="w-4 h-4" />, 'Column Spacing', listing.column_spacing);
  add(<Package className="w-4 h-4" />, 'Floor Load', listing.floor_load_capacity);
  add(<Package className="w-4 h-4" />, 'Truck Court Depth', listing.truck_court_depth);
  add(<Package className="w-4 h-4" />, 'Crane Capacity', listing.crane_capacity);
  add(<Users className="w-4 h-4" />, 'Private Offices', listing.private_offices ? `${listing.private_offices}` : null);
  add(<Users className="w-4 h-4" />, 'Conference Rooms', listing.conference_rooms ? `${listing.conference_rooms}` : null);
  add(<Users className="w-4 h-4" />, 'Exam Rooms', listing.exam_rooms ? `${listing.exam_rooms}` : null);
  add(<Users className="w-4 h-4" />, 'Seating Capacity', listing.seating_capacity ? `${listing.seating_capacity}` : null);
  add(<Users className="w-4 h-4" />, 'Capacity Range', listing.capacity_min || listing.capacity_max ? `${listing.capacity_min ?? '?'} – ${listing.capacity_max ?? '?'} people` : null);
  add(<Users className="w-4 h-4" />, 'Occupancy Limit', listing.occupancy_limit ? `${listing.occupancy_limit}` : null);
  add(<Activity className="w-4 h-4" />, 'Foot Traffic', listing.foot_traffic_vpd ? `${listing.foot_traffic_vpd.toLocaleString()} VPD` : null);
  add(<Activity className="w-4 h-4" />, 'Previous Use', listing.previous_use);
  add(<Car className="w-4 h-4" />, 'Parking', listing.parking_spaces ? `${listing.parking_spaces} spaces${listing.parking_type ? ` (${listing.parking_type})` : ''}` : listing.parking_type ?? null);
  add(<Activity className="w-4 h-4" />, 'Parking Ratio', listing.parking_ratio);
  add(<Building className="w-4 h-4" />, 'Elevators', listing.elevator_count ? `${listing.elevator_count}` : null);
  add(<Building className="w-4 h-4" />, 'Freight Elevators', listing.freight_elevator_count ? `${listing.freight_elevator_count}` : null);
  add(<Wind className="w-4 h-4" />, 'HVAC', listing.hvac_type);
  add(<CalendarDays className="w-4 h-4" />, 'Available Date', listing.available_date);
  add(<Activity className="w-4 h-4" />, 'Outdoor Space', listing.outdoor_space);
  add(<Activity className="w-4 h-4" />, 'Office/Warehouse Ratio', listing.office_warehouse_ratio);
  add(<Activity className="w-4 h-4" />, 'Use Breakdown', listing.use_breakdown);

  addBool(<Zap className="w-4 h-4" />, '3-Phase Power', listing.three_phase_power);
  addBool(<Droplets className="w-4 h-4" />, 'Kitchen Exhaust', listing.kitchen_exhaust);
  addBool(<Droplets className="w-4 h-4" />, 'Grease Trap', listing.grease_trap);
  addBool(<Droplets className="w-4 h-4" />, 'Gas Line', listing.gas_line);
  addBool(<CheckCircle className="w-4 h-4" />, 'Corner Location', listing.corner_location);
  addBool(<CheckCircle className="w-4 h-4" />, 'ADA Accessible', listing.ada_accessible);
  addBool(<CheckCircle className="w-4 h-4" />, 'Separate Entrance', listing.separate_entrance);
  addBool(<CheckCircle className="w-4 h-4" />, 'Private Entrance', listing.private_entrance);
  addBool(<CheckCircle className="w-4 h-4" />, 'Signage Rights', listing.signage_rights);
  addBool(<CheckCircle className="w-4 h-4" />, 'Rail Access', listing.rail_access);
  addBool(<CheckCircle className="w-4 h-4" />, 'Natural Light', listing.natural_light);
  addBool(<CheckCircle className="w-4 h-4" />, 'Waiting Room', listing.waiting_room);
  addBool(<Droplets className="w-4 h-4" />, 'Wet Columns', listing.plumbing_wet_columns);
  addBool(<CheckCircle className="w-4 h-4" />, 'Ventilation', listing.ventilation);
  addBool(<CheckCircle className="w-4 h-4" />, 'Moisture Control', listing.moisture_waterproofing);
  addBool(<CheckCircle className="w-4 h-4" />, 'Liquor License Transferable', listing.liquor_license_transferable);
  addBool(<CheckCircle className="w-4 h-4" />, 'Sublease', listing.sublease);

  if (listing.listing_type === 'sale') {
    add(<DollarSign className="w-4 h-4" />, 'Tenancy', listing.tenancy_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? null);
    add(<Users className="w-4 h-4" />, 'Current Tenant', listing.current_lease_tenant);
    add(<CalendarDays className="w-4 h-4" />, 'Lease Expiration', listing.current_lease_expiration);
    add(<DollarSign className="w-4 h-4" />, 'Current Rent', listing.current_lease_rent ? `${formatPrice(listing.current_lease_rent)}/mo` : null);
    add(<DollarSign className="w-4 h-4" />, 'Rental Income', listing.current_rental_income ? `${formatPrice(listing.current_rental_income)}/mo` : null);
    add(<Building className="w-4 h-4" />, 'Unit Count', listing.unit_count ? `${listing.unit_count}` : null);
  }

  return items;
}

function hasLeaseTermsData(listing: CommercialListing): boolean {
  return !!(
    listing.lease_term_text ||
    listing.cam_per_sf ||
    listing.ti_allowance_per_sf ||
    listing.escalation ||
    listing.renewal_options ||
    listing.security_deposit ||
    listing.expense_stop_per_sf ||
    listing.permitted_uses_commercial ||
    listing.use_restrictions
  );
}

function hasPropertyDetailsData(listing: CommercialListing): boolean {
  return !!(
    listing.total_building_sf ||
    listing.year_built ||
    listing.year_renovated ||
    listing.number_of_floors ||
    listing.construction_type ||
    listing.hvac_type ||
    listing.zoning_code ||
    listing.parking_ratio
  );
}

function CommercialAdminBanner({
  listing,
  userId,
  isAdmin,
  onUnpublish,
  onApprove,
}: {
  listing: CommercialListing;
  userId: string;
  isAdmin?: boolean;
  onUnpublish?: () => void;
  onApprove?: () => void;
}) {
  const navigate = useNavigate();
  const [showUnpublishDialog, setShowUnpublishDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approveLoading, setApproveLoading] = useState(false);
  const [rejectLoading, setRejectLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isOwner = listing.user_id === userId;
  if (!isOwner && !isAdmin) return null;

  const handleUnpublish = async () => {
    setLoading(true);
    setError(null);
    try {
      await commercialListingsService.updateCommercialListing(listing.id, { is_active: false });
      setShowUnpublishDialog(false);
      if (onUnpublish) onUnpublish();
    } catch (err) {
      console.error('Error unpublishing commercial listing:', err);
      setError('Failed to unpublish listing. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await commercialListingsService.deleteCommercialListing(listing.id);
      setShowDeleteDialog(false);
      navigate('/dashboard');
    } catch (err) {
      console.error('Error deleting commercial listing:', err);
      setError('Failed to delete listing. Please try again.');
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setApproveLoading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const { error: fnError } = await supabase.functions.invoke('approve-listing', {
        body: { listingId: listing.id, isCommercial: true },
      });
      if (fnError) throw fnError;
      setSuccessMessage('Listing approved successfully!');
      if (onApprove) onApprove();
    } catch (err) {
      console.error('Error approving commercial listing:', err);
      setError('Failed to approve listing. Please try again.');
    } finally {
      setApproveLoading(false);
    }
  };

  const handleReject = async () => {
    if (!confirm('Are you sure you want to reject this listing? This will permanently delete it.')) return;

    setRejectLoading(true);
    setError(null);
    try {
      await commercialListingsService.deleteCommercialListing(listing.id);
      navigate('/admin?tab=pending');
    } catch (err) {
      console.error('Error rejecting commercial listing:', err);
      setError('Failed to reject listing. Please try again.');
      setRejectLoading(false);
    }
  };

  const formatNumber = (n: number | null | undefined) => (n ?? 0).toLocaleString();

  return (
    <>
      <div className="bg-gray-50 border-b border-gray-200 px-3 py-3 mb-6 -mx-4 sm:-mx-6 lg:-mx-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {!listing.approved && (
            <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-400 px-4 py-3 rounded">
              <div className="flex items-center">
                <svg className="h-5 w-5 text-yellow-400 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-medium text-yellow-700">This listing is pending approval</span>
              </div>
            </div>
          )}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-gray-500" />
                <div>
                  <div className="text-xs text-gray-500">Impressions</div>
                  <div className="text-base font-semibold text-gray-900">{formatNumber(listing.impressions)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-gray-500" />
                <div>
                  <div className="text-xs text-gray-500">Detail Views</div>
                  <div className="text-base font-semibold text-gray-900">{formatNumber(listing.direct_views)}</div>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {isAdmin && !listing.approved && (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={approveLoading || loading}
                    className="inline-flex items-center px-3 py-1.5 border border-green-300 rounded-md text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 transition-colors disabled:opacity-50"
                  >
                    {approveLoading ? (
                      <><div className="w-4 h-4 mr-1.5 border-2 border-green-700 border-t-transparent rounded-full animate-spin" />Approving...</>
                    ) : (
                      <><CheckCircle className="w-4 h-4 mr-1.5" />Approve</>
                    )}
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={rejectLoading || loading}
                    className="inline-flex items-center px-3 py-1.5 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    {rejectLoading ? (
                      <><div className="w-4 h-4 mr-1.5 border-2 border-red-700 border-t-transparent rounded-full animate-spin" />Rejecting...</>
                    ) : (
                      <><XCircle className="w-4 h-4 mr-1.5" />Reject</>
                    )}
                  </button>
                </>
              )}
              <button
                onClick={() => navigate(`/post-commercial?edit=${listing.id}`)}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                <Edit className="w-4 h-4 mr-1.5" />
                Edit
              </button>
              <button
                onClick={() => setShowUnpublishDialog(true)}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                <EyeOff className="w-4 h-4 mr-1.5" />
                Unpublish
              </button>
              <button
                onClick={() => setShowDeleteDialog(true)}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-red-600 bg-white hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete
              </button>
            </div>
          </div>
          {error && <div className="mt-3 text-sm text-red-600">{error}</div>}
          {successMessage && <div className="mt-3 text-sm text-green-600 font-medium">{successMessage}</div>}
        </div>
      </div>

      <ConfirmDialog
        isOpen={showUnpublishDialog}
        onClose={() => setShowUnpublishDialog(false)}
        onConfirm={handleUnpublish}
        title="Unpublish Listing"
        message="Are you sure you want to unpublish this listing? It will be hidden from public view but can be republished later from your dashboard."
        confirmText="Unpublish"
        cancelText="Cancel"
        severity="warning"
        loading={loading}
      />
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Delete Listing"
        message="This action cannot be undone. All listing data, images, and analytics will be permanently deleted."
        confirmText="Delete Permanently"
        cancelText="Cancel"
        severity="danger"
        requireTextConfirmation
        confirmationText="DELETE"
        loading={loading}
      />
    </>
  );
}

export function CommercialListingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [listing, setListing] = useState<CommercialListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomModalOpen, setZoomModalOpen] = useState(false);
  const [zoomInitialIndex, setZoomInitialIndex] = useState(0);

  const hasViewedRef = React.useRef(false);
  const trackedListingId = React.useRef<string | null>(null);

  useEffect(() => {
    if (id && !authLoading) {
      loadListing();
    }
  }, [id, user, authLoading]);

  useEffect(() => {
    if (id && !hasViewedRef.current) {
      hasViewedRef.current = true;
      commercialListingsService.incrementCommercialListingView(id).catch(() => {});
    }
  }, [id]);

  useEffect(() => {
    if (!listing?.id) return;
    if (trackedListingId.current === listing.id) return;

    gaListing('commercial_listing_view', listing.id, {
      is_featured: !!(listing.is_featured),
      listing_type: listing.listing_type,
      space_type: listing.commercial_space_type,
    });

    trackedListingId.current = listing.id;
  }, [listing?.id]);

  useEffect(() => {
    if (!listing?.id) return;
    const fired = new Set<number>();

    const onScroll = () => {
      const pct = getScrollPercent();
      for (const t of SCROLL_THRESHOLDS) {
        if (pct >= t && !fired.has(t)) {
          fired.add(t);
          gaListing('commercial_listing_scroll', listing.id, { depth: t });
        }
      }
      if (fired.size === SCROLL_THRESHOLDS.length) {
        window.removeEventListener('scroll', onScroll);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [listing?.id]);

  const loadListing = async () => {
    if (!id) return;
    try {
      setError(null);
      const data = await commercialListingsService.getCommercialListing(id, user?.id, profile?.is_admin);
      if (data) {
        setListing(data);
      } else {
        setError('Listing not found or no longer available');
      }
    } catch (err) {
      console.error('Error loading commercial listing:', err);
      setError('Failed to load listing. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFavoriteToggle = async () => {
    if (!user || !listing) {
      if (!user) navigate('/auth', { state: { isSignUp: true } });
      return;
    }

    try {
      if (listing.is_favorited) {
        await commercialListingsService.removeCommercialFromFavorites(user.id, listing.id);
      } else {
        await commercialListingsService.addCommercialToFavorites(user.id, listing.id);
      }

      const nextIsFav = !listing.is_favorited;
      setListing(prev => prev ? { ...prev, is_favorited: nextIsFav } : null);

      gaListing(nextIsFav ? 'commercial_listing_favorite' : 'commercial_listing_unfavorite', listing.id);
    } catch (err) {
      console.error('Error toggling commercial favorite:', err);
      setListing(prev => prev ? { ...prev, is_favorited: !prev.is_favorited } : null);
    }
  };

  const handleUnpublish = () => {
    setListing(prev => prev ? { ...prev, is_active: false } : null);
    setTimeout(() => navigate('/dashboard'), 1500);
  };

  const handleApprove = () => {
    setListing(prev => prev ? { ...prev, approved: true, is_active: true } : null);
  };

  if (loading || authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-96 bg-gray-200 rounded-lg mb-8"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-4">
              <div className="h-8 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
            <div className="bg-gray-200 rounded-lg h-64"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <p className="text-gray-600 mb-4">{error || 'Listing not found.'}</p>
        <Link to="/browse" className="inline-flex items-center text-[#4E4B43] hover:text-[#3a3832] transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Browse
        </Link>
      </div>
    );
  }

  const isSale = listing.listing_type === 'sale';
  const postedDateText = formatPostedDate(listing.created_at);
  const leaseInfo = listing.lease_type ? LEASE_TYPE_LABELS[listing.lease_type] : null;
  const subtypeBadge = getImageBadge(listing.commercial_space_type, listing.commercial_subtype);
  const specItems = buildSpecItems(listing);
  const showLeaseTerms = !isSale && hasLeaseTermsData(listing);
  const showPropertyDetails = hasPropertyDetailsData(listing);

  const displayAddress = listing.full_address ||
    (listing.cross_street_a && listing.cross_street_b
      ? `${listing.cross_street_a} & ${listing.cross_street_b}`
      : listing.neighborhood || '');

  const images = (listing.listing_images ?? [])
    .filter(img => img?.image_url?.trim())
    .sort((a, b) => {
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;
      return a.sort_order - b.sort_order;
    });

  const hasRealImages = images.length > 0;

  const handleImageZoom = (index: number) => {
    setZoomInitialIndex(index);
    setZoomModalOpen(true);
    gaListing('commercial_listing_image_zoom', listing.id, { image_index: index });
  };

  const carouselImages = images.map(img => ({ url: normalizeImageUrl(img.image_url, 'hero'), alt: listing.title ?? 'Commercial listing' }));
  // Zoom modal keeps full resolution so users can actually zoom in on detail.
  const zoomImages = images.map(img => ({ url: normalizeImageUrl(img.image_url, 'full'), alt: listing.title ?? 'Commercial listing' }));

  const pricePerSfSale =
    isSale && listing.asking_price && listing.available_sf
      ? listing.asking_price / listing.available_sf
      : null;

  const getRoleLabel = () => {
    if (listing.owner?.role === 'agent') return 'Agent';
    return 'Owner';
  };

  const ContactCard = (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
      <h3 className="text-xl font-bold text-[#273140] mb-4">Contact Information</h3>
      <div className="space-y-4 mb-6">
        <div className="flex items-center">
          <ContactProfileBubble name={listing.contact_name} className="mr-3" />
          <div>
            <div className="font-semibold">
              {listing.contact_name}
              <span className="mx-2 text-gray-400">•</span>
              <PhoneNumberReveal
                phoneNumber={listing.contact_phone}
                listingId={listing.id}
                isMobile={false}
              />
            </div>
            <div className="text-sm text-gray-500">{getRoleLabel()}</div>
          </div>
        </div>
      </div>
      <div className="mb-6">
        <CommercialContactForm commercialListingId={listing.id} />
      </div>
      <div className="flex gap-2">
        <ShareButton
          listingId={listing.id}
          listingTitle={listing.title ?? undefined}
          variant="detail"
          className="w-full justify-center"
        />
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
        Listed {new Date(listing.created_at).toLocaleDateString()}
      </div>
    </div>
  );

  const ContactCardMobile = (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
      <h3 className="text-xl font-bold text-[#273140] mb-4">Contact Information</h3>
      <div className="space-y-4 mb-6">
        <div className="flex items-center">
          <ContactProfileBubble name={listing.contact_name} className="mr-3" />
          <div>
            <div className="font-semibold">
              {listing.contact_name}
              <span className="mx-2 text-gray-400">•</span>
              <PhoneNumberReveal
                phoneNumber={listing.contact_phone}
                listingId={listing.id}
                isMobile={true}
              />
            </div>
            <div className="text-sm text-gray-500">{getRoleLabel()}</div>
          </div>
        </div>
      </div>
      <div className="mb-6">
        <CommercialContactForm commercialListingId={listing.id} />
      </div>
      <div className="flex gap-2">
        <ShareButton
          listingId={listing.id}
          listingTitle={listing.title ?? undefined}
          variant="detail"
          className="w-full justify-center"
        />
      </div>
      <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
        Listed {new Date(listing.created_at).toLocaleDateString()}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link
        to="/browse"
        className="inline-flex items-center text-[#4E4B43] hover:text-[#3a3832] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Browse
      </Link>

      {user && (
        <CommercialAdminBanner
          listing={listing}
          userId={user.id}
          isAdmin={profile?.is_admin}
          onUnpublish={handleUnpublish}
          onApprove={handleApprove}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
        {/* LEFT: Desktop images + description + map */}
        <div className="hidden lg:block lg:col-span-7">
          <div className="relative">
            <ImageCarousel
              images={carouselImages}
              className="mb-0"
              listingSeed={{
                id: listing.id,
                addressLine: displayAddress,
                city: listing.neighborhood ?? undefined,
                price: listing.price ?? listing.asking_price ?? undefined,
              }}
              enableZoom={hasRealImages}
              onImageClick={handleImageZoom}
              videoUrl={listing.video_url ?? undefined}
              videoThumbnail={listing.video_thumbnail_url ?? undefined}
            />
            <button
              onClick={handleFavoriteToggle}
              className="absolute top-4 right-4 p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition-shadow"
            >
              <Heart
                className={`w-6 h-6 ${
                  listing.is_favorited ? 'text-red-500 fill-current' : 'text-gray-400 hover:text-red-500'
                }`}
              />
            </button>
          </div>

          {listing.description && (
            <section className="mt-6">
              <h2 className="text-2xl font-bold text-[#273140] mb-4">Description</h2>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{listing.description}</p>
            </section>
          )}

          {listing.latitude && listing.longitude && (
            <section className="mt-8">
              <h2 className="text-2xl font-bold text-[#273140] mb-4">Location</h2>
              <ListingLocationMap
                latitude={listing.latitude}
                longitude={listing.longitude}
                className="h-[300px]"
              />
            </section>
          )}
        </div>

        {/* RIGHT: Info stack */}
        <div className="lg:col-span-5 flex flex-col gap-3 text-[0.95rem] md:text-[0.985rem] leading-relaxed">

          {/* Mobile images - order 1 */}
          <section className="lg:hidden order-1">
            <div className="relative">
              <ImageCarousel
                images={carouselImages}
                className="mb-0"
                listingSeed={{
                  id: listing.id,
                  addressLine: displayAddress,
                  city: listing.neighborhood ?? undefined,
                  price: listing.price ?? listing.asking_price ?? undefined,
                }}
                enableZoom={hasRealImages}
                onImageClick={handleImageZoom}
                videoUrl={listing.video_url ?? undefined}
                videoThumbnail={listing.video_thumbnail_url ?? undefined}
              />
              <button
                onClick={handleFavoriteToggle}
                className="absolute top-4 right-4 p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition-shadow"
              >
                <Heart
                  className={`w-6 h-6 ${
                    listing.is_favorited ? 'text-red-500 fill-current' : 'text-gray-400 hover:text-red-500'
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Title - order 2 */}
          <section className="order-2 lg:order-none">
            <h1 className="text-2xl md:text-[1.65rem] font-semibold text-[#273140] mb-2">
              {listing.title ?? SPACE_TYPE_LABELS[listing.commercial_space_type]}
            </h1>
            {postedDateText && (
              <p className="text-xs text-gray-400 mt-1">Posted: {postedDateText}</p>
            )}
          </section>

          {/* Location + Badges - order 3 */}
          <section className="order-3 lg:order-none">
            <div className="flex items-start gap-3 mb-3">
              <MapPin className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
              <span className="text-gray-600 text-lg">
                {displayAddress}
                {listing.neighborhood && listing.full_address && listing.full_address !== listing.neighborhood && (
                  <span className="text-gray-400">, {listing.neighborhood}</span>
                )}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center bg-cyan-100 text-cyan-800 text-xs px-2.5 py-1 rounded-full font-medium">
                <Building className="w-3 h-3 mr-1" />
                Commercial
              </span>
              {subtypeBadge && (
                <span className="inline-flex items-center bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-full font-medium">
                  {subtypeBadge}
                </span>
              )}
              {listing.is_featured && (
                <span className="inline-flex items-center bg-accent-500 text-white text-xs px-2.5 py-1 rounded-full font-medium">
                  <Star className="w-3 h-3 mr-1" />
                  Featured
                </span>
              )}
              {isSale && (
                <span className="inline-flex items-center bg-emerald-50 text-emerald-700 text-xs px-2.5 py-1 rounded-full border border-emerald-200 font-medium">
                  For Sale
                </span>
              )}
            </div>
          </section>

          {/* Price block - order 4 */}
          <section className="order-4 lg:order-none">
            {listing.call_for_price ? (
              <div className="text-2xl font-bold text-[#273140]">Call for Price</div>
            ) : isSale ? (
              listing.asking_price != null && (
                <div>
                  <div className="text-3xl font-bold text-[#273140] num-font">{formatPrice(listing.asking_price)}</div>
                  {pricePerSfSale && (
                    <div className="text-sm text-gray-500 mt-1 num-font">
                      {formatPrice(pricePerSfSale)}/SF
                    </div>
                  )}
                  {listing.cap_rate && (
                    <div className="flex items-center gap-1 mt-1 text-sm text-gray-600">
                      <TrendingUp className="w-4 h-4" />
                      <span>Cap Rate: <span className="font-medium num-font">{listing.cap_rate}%</span></span>
                    </div>
                  )}
                  {listing.noi && (
                    <div className="flex items-center gap-1 mt-1 text-sm text-gray-600">
                      <DollarSign className="w-4 h-4" />
                      <span>NOI: <span className="font-medium num-font">{formatPrice(listing.noi)}/yr</span></span>
                    </div>
                  )}
                </div>
              )
            ) : (
              listing.price != null && (
                <div>
                  <div className="text-3xl font-bold text-[#273140]">
                    <span className="num-font">{formatPrice(listing.price)}</span>
                    <span className="text-lg font-normal text-gray-500">/month</span>
                  </div>
                  {listing.price_per_sf_year && (
                    <div className="text-sm text-gray-500 mt-1 num-font">
                      ${listing.price_per_sf_year}/SF/yr
                    </div>
                  )}
                  {leaseInfo && (
                    <div className="mt-2">
                      <span className="inline-flex items-center bg-slate-100 text-slate-700 text-xs px-2.5 py-1 rounded-full font-semibold mr-2">
                        {leaseInfo.abbr}
                      </span>
                      <span className="text-xs text-gray-500">{leaseInfo.explanation}</span>
                    </div>
                  )}
                </div>
              )
            )}
          </section>

          {/* Key Specs Grid - order 5 */}
          {specItems.length > 0 && (
            <section className="order-5 lg:order-none">
              <h2 className="text-xl font-bold text-[#273140] mb-3">Space Details</h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 bg-gray-50 rounded-lg p-4">
                {specItems.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-gray-400 flex-shrink-0 mt-0.5">{item.icon}</span>
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500">{item.label}</div>
                      <div className="text-sm font-medium text-gray-800 truncate">{item.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Contact Card mobile - order 6 */}
          <section className="lg:hidden text-base order-6">
            {ContactCardMobile}
          </section>

          {/* Contact Card desktop (sticky) */}
          <section className="hidden lg:block text-base">
            <div className="sticky top-8">
              {ContactCard}
            </div>
          </section>

          {/* Lease Terms - order 7 */}
          {showLeaseTerms && (
            <section className="order-7 lg:order-none">
              <h2 className="text-xl font-bold text-[#273140] mb-3">Lease Terms</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {listing.lease_term_text && (
                  <div className="flex items-start gap-2">
                    <CalendarDays className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Lease Term</div>
                      <div className="text-sm font-medium">{listing.lease_term_text}</div>
                    </div>
                  </div>
                )}
                {listing.cam_per_sf && (
                  <div className="flex items-start gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">CAM Charges</div>
                      <div className="text-sm font-medium num-font">${listing.cam_per_sf}/SF/yr</div>
                    </div>
                  </div>
                )}
                {listing.expense_stop_per_sf && (
                  <div className="flex items-start gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Expense Stop</div>
                      <div className="text-sm font-medium num-font">${listing.expense_stop_per_sf}/SF/yr</div>
                    </div>
                  </div>
                )}
                {listing.ti_allowance_per_sf && (
                  <div className="flex items-start gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">TI Allowance</div>
                      <div className="text-sm font-medium num-font">${listing.ti_allowance_per_sf}/SF</div>
                    </div>
                  </div>
                )}
                {listing.escalation && (
                  <div className="flex items-start gap-2">
                    <TrendingUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Escalation</div>
                      <div className="text-sm font-medium">{listing.escalation}</div>
                    </div>
                  </div>
                )}
                {listing.renewal_options && (
                  <div className="flex items-start gap-2">
                    <CalendarDays className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Renewal Options</div>
                      <div className="text-sm font-medium">{listing.renewal_options}</div>
                    </div>
                  </div>
                )}
                {listing.security_deposit && (
                  <div className="flex items-start gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Security Deposit</div>
                      <div className="text-sm font-medium">{listing.security_deposit}</div>
                    </div>
                  </div>
                )}
                {listing.permitted_uses_commercial && (
                  <div className="col-span-2 flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Permitted Uses</div>
                      <div className="text-sm font-medium">{listing.permitted_uses_commercial}</div>
                    </div>
                  </div>
                )}
                {listing.use_restrictions && (
                  <div className="col-span-2 flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Use Restrictions</div>
                      <div className="text-sm font-medium">{listing.use_restrictions}</div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Property Details - order 8 */}
          {showPropertyDetails && (
            <section className="order-8 lg:order-none">
              <h2 className="text-xl font-bold text-[#273140] mb-3">Building Details</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {listing.total_building_sf && (
                  <div className="flex items-start gap-2">
                    <Maximize2 className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Total Building Size</div>
                      <div className="text-sm font-medium num-font">{listing.total_building_sf.toLocaleString()} SF</div>
                    </div>
                  </div>
                )}
                {listing.year_built && (
                  <div className="flex items-start gap-2">
                    <CalendarDays className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Year Built</div>
                      <div className="text-sm font-medium num-font">{listing.year_built}</div>
                    </div>
                  </div>
                )}
                {listing.year_renovated && listing.year_renovated !== listing.year_built && (
                  <div className="flex items-start gap-2">
                    <Wrench className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Year Renovated</div>
                      <div className="text-sm font-medium num-font">{listing.year_renovated}</div>
                    </div>
                  </div>
                )}
                {listing.number_of_floors && (
                  <div className="flex items-start gap-2">
                    <Layers className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Floors</div>
                      <div className="text-sm font-medium num-font">{listing.number_of_floors}</div>
                    </div>
                  </div>
                )}
                {listing.construction_type && (
                  <div className="flex items-start gap-2">
                    <Building className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Construction</div>
                      <div className="text-sm font-medium">{listing.construction_type}</div>
                    </div>
                  </div>
                )}
                {listing.hvac_type && (
                  <div className="flex items-start gap-2">
                    <Wind className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">HVAC</div>
                      <div className="text-sm font-medium">{listing.hvac_type}</div>
                    </div>
                  </div>
                )}
                {listing.zoning_code && (
                  <div className="flex items-start gap-2">
                    <Activity className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Zoning</div>
                      <div className="text-sm font-medium">{listing.zoning_code}</div>
                    </div>
                  </div>
                )}
                {listing.parking_ratio && (
                  <div className="flex items-start gap-2">
                    <Car className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Parking Ratio</div>
                      <div className="text-sm font-medium">{listing.parking_ratio}</div>
                    </div>
                  </div>
                )}
                {listing.property_taxes_annual && (
                  <div className="flex items-start gap-2">
                    <DollarSign className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs text-gray-500">Annual Property Taxes</div>
                      <div className="text-sm font-medium num-font">{formatPrice(listing.property_taxes_annual)}/yr</div>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Mobile description - order 9 */}
          {listing.description && (
            <section className="lg:hidden order-9">
              <h2 className="text-2xl font-bold text-[#273140] mb-4">Description</h2>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{listing.description}</p>
            </section>
          )}

          {/* Mobile location map - order 10 */}
          {listing.latitude && listing.longitude && (
            <section className="lg:hidden order-10 mt-6">
              <h2 className="text-2xl font-bold text-[#273140] mb-4">Location</h2>
              <ListingLocationMap
                latitude={listing.latitude}
                longitude={listing.longitude}
                className="h-[260px]"
              />
            </section>
          )}

          <p className="text-xs text-gray-500 mt-6">
            Listing details are provided by the agent or landlord. Hadirot is not responsible for inaccuracies — always confirm details directly with the listing contact.
          </p>

        </div>
      </div>

      {zoomModalOpen && hasRealImages && (
        <ImageZoomModal
          images={zoomImages}
          initialIndex={zoomInitialIndex}
          onClose={() => setZoomModalOpen(false)}
        />
      )}
    </div>
  );
}
