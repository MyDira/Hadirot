import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { useAuth } from '@/hooks/useAuth';
import { Modal } from '../../components/shared/Modal';
import { AuthForm } from '../../components/auth/AuthForm';
import { listingsService, getExpirationDate, getAdminActiveDays } from '../../services/listings';
import { salesService } from '../../services/sales';
import { PermissionRequestModal } from '../postListing/PermissionRequestModal';
import { useListingMedia } from '../listing/useListingMedia';
import { useWizardState, type WizardPath, isCommercialPath } from './useWizardState';
import { WizardUIContext } from './WizardContext';
import { PathPicker } from './PathPicker';
import { WizardBreadcrumb } from './WizardBreadcrumb';
import { ComingSoon } from './ComingSoon';
import { Step1PropertyTypeAndLayout } from './steps/residential/Step1PropertyTypeAndLayout';
import { Step2PriceAndTerms } from './steps/residential/Step2PriceAndTerms';
import { Step3ShowItOff } from './steps/residential/Step3ShowItOff';
import { Step4Location } from './steps/residential/Step4Location';
import { Step5FeaturesAndCondition } from './steps/residential/Step5FeaturesAndCondition';
import { Step6ContactAndReview } from './steps/residential/Step6ContactAndReview';
import { Step1SalePropertyAndLayout } from './steps/sale/Step1SalePropertyAndLayout';
import { Step3SaleShowItOff } from './steps/sale/Step3SaleShowItOff';
import { Step4SaleLocation } from './steps/sale/Step4SaleLocation';
import { Step5SaleConditionAndStatus } from './steps/sale/Step5SaleConditionAndStatus';
import { Step6SaleOptionalFeatures } from './steps/sale/Step6SaleOptionalFeatures';
import { Step7SaleContactAndReview } from './steps/sale/Step7SaleContactAndReview';
import { CommercialStepsRouter } from './CommercialStepsRouter';
import { commercialListingsService } from '../../services/commercialListings';
import { emailService, renderBrandEmail } from '../../services/email';
import { paymentsService } from '../../services/payments';
import {
  type WizardPaymentChoice,
  WIZARD_PAYMENT_CHOICE_STORAGE_KEY,
  isValidWizardPaymentChoice,
} from './components/PaymentChoice';

function readStoredPaymentChoice(): WizardPaymentChoice | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.sessionStorage.getItem(WIZARD_PAYMENT_CHOICE_STORAGE_KEY);
    return isValidWizardPaymentChoice(v) ? v : null;
  } catch {
    return null;
  }
}

function clearStoredPaymentChoice(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(WIZARD_PAYMENT_CHOICE_STORAGE_KEY);
  } catch {
    /* noop */
  }
}
import type { MediaFile } from '../../components/shared/MediaUploader';
import {
  trackPostStart,
  trackPostSubmit,
  trackPostSuccess,
  trackWizardStepViewed,
  trackWizardStepCompleted,
  type WizardFunnelPath,
} from '../../lib/analytics';

// WizardPath → analytics path label. Names match how a non-technical
// admin would describe the four flows in the funnel report.
function wizardPathToFunnelLabel(path: WizardPath | null): WizardFunnelPath | null {
  switch (path) {
    case 'residential_rent': return 'residential_rental';
    case 'residential_sale': return 'residential_sale';
    case 'commercial_lease': return 'commercial_rental';
    case 'commercial_sale':  return 'commercial_sale';
    default: return null;
  }
}

const RENTAL_STEP_LABELS = [
  'Property & Layout',
  'Price & Terms',
  'Photos & Description',
  'Location',
  'Features & Condition',
  'Contact & Review',
];

const SALE_STEP_LABELS = [
  'Basic Info',
  'Photos & Description',
  'Location',
  'Size & Condition',
  'Details & Features',
  'Contact & Review',
];

const COMMERCIAL_STEP_LABELS = [
  'Type & Pricing',
  'Photos & Description',
  'Location',
  'Space Details',
  'Optional Details',
  'Contact & Review',
];

// ── Change Listing Type dropdown ──────────────────────────────────────────────

const LISTING_TYPE_OPTIONS: { path: WizardPath; label: string; sub: string; comingSoon?: boolean }[] = [
  { path: 'residential_rent', label: 'Residential Rental', sub: 'Apartment, room, house for rent' },
  { path: 'residential_sale', label: 'Residential Sale',   sub: 'House, condo, co-op for sale'   },
  { path: 'commercial_lease', label: 'Commercial Rental',  sub: 'Office, retail, industrial', comingSoon: true },
  { path: 'commercial_sale',  label: 'Commercial Sale',    sub: 'Office, retail, industrial', comingSoon: true },
];

function ChangeListingTypeButton({
  currentPath,
  onChangePath,
}: {
  currentPath: WizardPath | null;
  onChangePath: (path: WizardPath) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors"
      >
        Change listing type
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <p className="px-4 pt-3 pb-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            Switch to
          </p>
          {LISTING_TYPE_OPTIONS.map(({ path, label, sub, comingSoon }) => {
            const isCurrent = path === currentPath;
            const isDisabled = isCurrent || comingSoon;
            return (
              <button
                key={path}
                type="button"
                disabled={isDisabled}
                onClick={() => { if (!isDisabled) { onChangePath(path); setOpen(false); } }}
                className={`w-full text-left px-4 py-2.5 flex flex-col transition-colors ${
                  isCurrent
                    ? 'bg-accent-50 cursor-default'
                    : comingSoon
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <span className={`text-sm font-medium flex items-center gap-2 ${isCurrent ? 'text-accent-700' : 'text-gray-800'}`}>
                  {label}
                  {isCurrent && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-accent-500">current</span>
                  )}
                  {comingSoon && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Coming soon</span>
                  )}
                </span>
                <span className="text-xs text-gray-400 mt-0.5">{sub}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PostListingWizard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Sales permission state
  const [canPostSales, setCanPostSales] = useState(false);
  const [salesUniversalAccess, setSalesUniversalAccess] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState('');
  const [requestingPermission, setRequestingPermission] = useState(false);

  const wizard = useWizardState(user?.id ?? null);

  const isSalePath = wizard.selectedPath === 'residential_sale';
  const isCommercial = isCommercialPath(wizard.selectedPath);
  const isCommercialSale = wizard.selectedPath === 'commercial_sale';

  // Commercial paths manage media locally (matches legacy /post-commercial flow).
  const [commercialMediaFiles, setCommercialMediaFiles] = useState<MediaFile[]>([]);
  const [uploadingCommercialMedia, setUploadingCommercialMedia] = useState(false);

  const {
    mediaFiles,
    uploadingMedia,
    handleMediaAdd,
    handleMediaRemove,
    handleSetFeatured,
    maxAllowedFiles,
    uploadPendingMedia,
  } = useListingMedia({
    userId: user?.id ?? null,
    isSaleListing: isSalePath,
    allowAnonymous: true,
  });

  const handleCommercialMediaAdd = async (files: File[]) => {
    setUploadingCommercialMedia(true);
    try {
      const newFiles: MediaFile[] = files
        .filter(file => {
          const isImage = file.type.startsWith('image/');
          const isVideo =
            file.type === 'video/mp4' ||
            file.type === 'video/webm' ||
            file.type === 'video/quicktime';
          return isImage || isVideo;
        })
        .map(file => ({
          id: `${Date.now()}-${Math.random()}`,
          type: file.type.startsWith('image/') ? ('image' as const) : ('video' as const),
          file,
          url: URL.createObjectURL(file),
          is_featured: false,
          originalName: file.name,
        }));
      if (newFiles.length > 0 && !commercialMediaFiles.some(m => m.is_featured)) {
        newFiles[0].is_featured = true;
      }
      setCommercialMediaFiles(prev => [...prev, ...newFiles]);
    } finally {
      setUploadingCommercialMedia(false);
    }
  };

  const handleCommercialMediaRemove = (id: string) => {
    setCommercialMediaFiles(prev => {
      const filtered = prev.filter(m => m.id !== id);
      if (!filtered.some(m => m.is_featured) && filtered.length > 0) {
        filtered[0] = { ...filtered[0], is_featured: true };
      }
      return filtered;
    });
  };

  const handleCommercialSetFeatured = (id: string) => {
    setCommercialMediaFiles(prev => prev.map(m => ({ ...m, is_featured: m.id === id })));
  };

  // Load sales permission flags
  useEffect(() => {
    salesService.getSalesSettings().then(s => setSalesUniversalAccess(!!s?.sales_universal_access));
    if (user?.id) {
      salesService.canUserPostSales(user.id).then(setCanPostSales);
    } else {
      setCanPostSales(false);
    }
  }, [user?.id]);

  const hasSalesAccess = canPostSales || salesUniversalAccess;

  const handlePermissionRequest = async () => {
    if (!user) return;
    setRequestingPermission(true);
    try {
      await salesService.createPermissionRequest(user.id, permissionMessage);
      setShowPermissionModal(false);
      setPermissionMessage('');
      alert('Your request has been submitted. An admin will review it shortly.');
    } catch (err: any) {
      alert(err?.message || 'Failed to submit request. Please try again.');
    } finally {
      setRequestingPermission(false);
    }
  };

  // Anonymous users can fill the entire wizard. Auth is only required at
  // Submit time. pendingSubmitKind remembers which submit handler the user
  // clicked while logged-out so we can replay it after sign-in.
  // ALL hooks below must stay above the wizard.initialized guard — Rules of Hooks.
  const [pendingSubmitKind, setPendingSubmitKind] = useState<'residential' | 'commercial' | null>(null);

  // Refs to the submit handlers — the OAuth-replay effect must live above the
  // guard but needs to call handlers defined below it. The ref is updated
  // synchronously during each render so by the time any effect fires the
  // current handlers are always present.
  const submitHandlersRef = useRef<{
    handleSubmit: ((paymentChoice?: WizardPaymentChoice | null) => Promise<void>) | null;
    handleCommercialSubmit: (() => Promise<void>) | null;
  }>({ handleSubmit: null, handleCommercialSubmit: null });

  // Per-step labels — computed here (above the guard) so the
  // wizard-step-viewed effect can reference them.
  const stepLabels = isCommercial
    ? COMMERCIAL_STEP_LABELS
    : isSalePath
    ? SALE_STEP_LABELS
    : RENTAL_STEP_LABELS;
  const totalStepsForFunnel = stepLabels.length;
  const funnelPath = wizardPathToFunnelLabel(wizard.selectedPath);

  // Emit wizard_step_viewed only when the user advances to a new step.
  // Backward navigation is silent by product spec.
  useEffect(() => {
    if (!funnelPath) return;
    if (wizard.currentStep > wizard.highWaterStep) return; // shouldn't happen
    if (wizard.currentStep < wizard.highWaterStep) return; // backward — ignore
    trackWizardStepViewed({
      path: funnelPath,
      step: wizard.currentStep,
      totalSteps: totalStepsForFunnel,
    });
  }, [wizard.currentStep, wizard.highWaterStep, funnelPath, totalStepsForFunnel]);

  // Google OAuth path: user becomes truthy after a redirect, by which point
  // the auth modal is gone. We persist pendingSubmitKind to sessionStorage so
  // it survives the redirect; this effect replays the submit via submitHandlersRef.
  useEffect(() => {
    if (!user) return;
    const stashed = sessionStorage.getItem('wizard:pendingSubmit');
    if (!stashed) return;
    sessionStorage.removeItem('wizard:pendingSubmit');
    if (stashed === 'commercial') {
      setTimeout(() => { void submitHandlersRef.current.handleCommercialSubmit?.(); }, 0);
    } else if (stashed === 'residential') {
      setTimeout(() => { void submitHandlersRef.current.handleSubmit?.(); }, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Mirror pendingSubmitKind to sessionStorage so an OAuth round-trip can
  // pick it back up.
  useEffect(() => {
    if (pendingSubmitKind) {
      sessionStorage.setItem('wizard:pendingSubmit', pendingSubmitKind);
    }
  }, [pendingSubmitKind]);

  // Early return — must come after ALL hook calls above.
  if (!wizard.initialized) return null;

  const handleSelectPath = (path: Parameters<typeof wizard.setSelectedPath>[0]) => {
    // Sales path requires permission — but we can only check this for a
    // signed-in user. Anonymous users get through; permission is rechecked
    // at submit time after they sign in.
    if (path === 'residential_sale' && user && !hasSalesAccess) {
      setShowPermissionModal(true);
      return;
    }
    // Reset commercial media when switching paths
    if (isCommercialPath(path)) {
      setCommercialMediaFiles([]);
    }
    trackPostStart();
    wizard.setSelectedPath(path);
  };

  const handleNext = () => {
    if (funnelPath) {
      trackWizardStepCompleted({
        path: funnelPath,
        step: wizard.currentStep,
        totalSteps: totalStepsForFunnel,
      });
    }
    wizard.nextStep();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    if (wizard.currentStep === 0) {
      wizard.setSelectedPath(null);
    } else {
      wizard.prevStep();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoToStep = (step: number) => {
    wizard.goToStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCommercialSubmit = async () => {
    if (!user) {
      setPendingSubmitKind('commercial');
      setShowAuthModal(true);
      return;
    }
    setLoading(true);
    setSubmitError(null);
    trackPostSubmit();

    try {
      const fd = wizard.commercialFormData;
      const { rentalDays, saleDays } = await getAdminActiveDays();
      const activeDays = isCommercialSale ? saleDays : rentalDays;
      const expiresAt = getExpirationDate(
        isCommercialSale ? 'sale' : 'rental',
        isCommercialSale ? 'available' : undefined,
        activeDays
      );

      const cross_street_a = wizard.crossStreetAFeature?.streetName || null;
      const cross_street_b = wizard.crossStreetBFeature?.streetName || null;

      const autoTitle =
        fd.title.trim() ||
        [
          fd.full_address || (cross_street_a && cross_street_b ? `${cross_street_a} & ${cross_street_b}` : ''),
          fd.commercial_space_type
            ? fd.commercial_space_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
            : '',
        ]
          .filter(Boolean)
          .join(' — ');

      const payload = {
        user_id: user.id,
        agency_id: null,
        listing_type: (isCommercialSale ? 'sale' : 'rental') as 'rental' | 'sale',
        is_commercial: true,
        title: autoTitle || null,
        description: fd.description || null,
        neighborhood: wizard.resolvedNeighborhood || fd.neighborhood || null,
        full_address: fd.full_address || null,
        cross_street_a,
        cross_street_b,
        latitude: fd.latitude,
        longitude: fd.longitude,
        price: !isCommercialSale && !fd.call_for_price ? fd.price : null,
        asking_price: isCommercialSale && !fd.call_for_price ? fd.asking_price : null,
        call_for_price: fd.call_for_price,
        contact_name: fd.contact_name,
        contact_phone: fd.contact_phone,
        is_featured: false,
        featured_expires_at: null,
        featured_started_at: null,
        featured_plan: null,
        is_active: false,
        approved: false,
        expires_at: expiresAt.toISOString(),
        deactivated_at: null,
        last_published_at: null,
        last_deactivation_email_sent_at: null,
        views: 0,
        impressions: 0,
        direct_views: 0,
        admin_custom_agency_name: null,
        admin_listing_type_display: fd.admin_listing_type_display || null,
        video_url: fd.video_url || null,
        video_thumbnail_url: null,
        // Mirror residential sale: auto-set 'available' on create.
        // Sellers change it later via the edit wizard.
        sale_status: isCommercialSale ? 'available' : null,
        commercial_space_type: fd.commercial_space_type,
        commercial_subtype: fd.commercial_subtype,
        available_sf: fd.available_sf,
        price_per_sf_year: !isCommercialSale ? fd.price_per_sf_year : null,
        lease_type: fd.lease_type,
        build_out_condition: fd.build_out_condition,
        floor_level: fd.floor_level || null,
        ceiling_height_ft: fd.ceiling_height_ft,
        frontage_ft: fd.frontage_ft,
        clear_height_ft: fd.clear_height_ft,
        loading_docks: fd.loading_docks,
        drive_in_doors: fd.drive_in_doors,
        building_class: fd.building_class,
        exam_rooms: fd.exam_rooms,
        kitchen_exhaust: fd.kitchen_exhaust,
        grease_trap: fd.grease_trap,
        corner_location: fd.corner_location,
        three_phase_power: fd.three_phase_power,
        private_offices: fd.private_offices,
        ada_accessible: fd.ada_accessible,
        separate_entrance: fd.separate_entrance,
        previous_use: fd.previous_use || null,
        seating_capacity: fd.seating_capacity,
        gas_line: fd.gas_line,
        total_building_sf: fd.total_building_sf,
        construction_type: fd.construction_type || null,
        parking_spaces: fd.parking_spaces,
        parking_type: fd.parking_type || null,
        parking_ratio: fd.parking_ratio || null,
        signage_rights: fd.signage_rights,
        private_entrance: fd.private_entrance,
        elevator_count: fd.elevator_count,
        freight_elevator_count: fd.freight_elevator_count,
        zoning_code: fd.zoning_code || null,
        sprinkler_type: fd.sprinkler_type || null,
        electrical_amps: fd.electrical_amps,
        electrical_voltage: fd.electrical_voltage || null,
        rail_access: fd.rail_access,
        column_spacing: fd.column_spacing || null,
        hvac_type: fd.hvac_type || null,
        foot_traffic_vpd: fd.foot_traffic_vpd,
        liquor_license_transferable: fd.liquor_license_transferable,
        conference_rooms: fd.conference_rooms,
        capacity_min: fd.capacity_min,
        capacity_max: fd.capacity_max,
        layout_type: fd.layout_type || null,
        plumbing_wet_columns: fd.plumbing_wet_columns,
        waiting_room: fd.waiting_room,
        natural_light: fd.natural_light,
        ventilation: fd.ventilation,
        moisture_waterproofing: fd.moisture_waterproofing,
        outdoor_space: fd.outdoor_space || null,
        permitted_uses_commercial: fd.permitted_uses_commercial || null,
        use_restrictions: fd.use_restrictions || null,
        occupancy_limit: fd.occupancy_limit,
        office_warehouse_ratio: fd.office_warehouse_ratio || null,
        floor_load_capacity: fd.floor_load_capacity || null,
        truck_court_depth: fd.truck_court_depth || null,
        crane_capacity: fd.crane_capacity || null,
        use_breakdown: fd.use_breakdown || null,
        current_rental_income: fd.current_rental_income,
        year_built: fd.year_built,
        year_renovated: fd.year_renovated,
        number_of_floors: fd.number_of_floors,
        unit_count: fd.unit_count,
        lease_term_text: fd.lease_term_text || null,
        cam_per_sf: fd.cam_per_sf,
        expense_stop_per_sf: fd.expense_stop_per_sf,
        ti_allowance_per_sf: fd.ti_allowance_per_sf,
        renewal_options: fd.renewal_options || null,
        escalation: fd.escalation || null,
        sublease: fd.sublease,
        security_deposit: fd.security_deposit || null,
        available_date: fd.available_date || null,
        cap_rate: fd.cap_rate,
        noi: fd.noi,
        property_taxes_annual: fd.property_taxes_annual,
        tenancy_type: fd.tenancy_type,
        current_lease_tenant: fd.current_lease_tenant || null,
        current_lease_expiration: fd.current_lease_expiration || null,
        current_lease_rent: fd.current_lease_rent,
      };

      const listing = await commercialListingsService.createCommercialListing(payload as any);
      trackPostSuccess(listing.id);

      // Upload images
      const imageFiles = commercialMediaFiles.filter(m => m.type === 'image' && m.file);
      for (let i = 0; i < imageFiles.length; i++) {
        const mf = imageFiles[i];
        if (!mf.file) continue;
        try {
          const url = await commercialListingsService.uploadCommercialListingImage(mf.file, listing.id);
          await commercialListingsService.addCommercialListingImage(listing.id, url, mf.is_featured, i);
        } catch (err) {
          console.error('Failed to upload commercial image:', err);
          Sentry.captureException(err);
        }
      }

      wizard.clearDraft();
      setCommercialMediaFiles([]);
      navigate(`/dashboard?new_listing=true&listing_id=${listing.id}`);

      // Branded confirmation email — matches residential pattern.
      try {
        const siteUrl = window.location.origin;
        const userName = profile?.full_name || 'A user';
        const titleForEmail = autoTitle || 'your commercial listing';
        const html = renderBrandEmail({
          title: 'New Listing Posted',
          intro: `${userName} has posted a new listing.`,
          bodyHtml: '<p>View the listing here:</p>',
          ctaLabel: 'View Listing',
          ctaHref: `${siteUrl}/commercial-listing/${listing.id}`,
        });
        await emailService.sendEmail({
          to: user.email!,
          subject: `Listing Submitted: ${titleForEmail} - HaDirot`,
          html,
        });
      } catch (emailErr) {
        console.warn('Failed to send commercial listing submission email', emailErr);
      }
    } catch (err: any) {
      Sentry.captureException(err);
      setSubmitError(err?.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const handleSubmit = async (paymentChoice?: WizardPaymentChoice | null) => {
    // OAuth-replay safety net: if called from the auth-replay effect (no arg),
    // recover the user's selection from sessionStorage so they don't lose the
    // pay-at-posting bonus path after signing in.
    if (paymentChoice === undefined || paymentChoice === null) {
      const stored = readStoredPaymentChoice();
      if (stored) paymentChoice = stored;
    }

    if (!user) {
      setPendingSubmitKind('residential');
      setShowAuthModal(true);
      return;
    }
    // Sales path requires permission. If a logged-out user filled out a
    // sale listing and just signed in, recheck now.
    if (isSalePath && !hasSalesAccess) {
      setShowPermissionModal(true);
      return;
    }
    setLoading(true);
    setSubmitError(null);
    trackPostSubmit();

    try {
      // Upload any pending media first
      const mediaOk = await uploadPendingMedia();
      if (!mediaOk) {
        setSubmitError('Photo upload failed. Please try again.');
        setLoading(false);
        return;
      }

      const { rentalDays, saleDays } = await getAdminActiveDays();
      const activeDays = isSalePath ? saleDays : rentalDays;
      const expiresAt = getExpirationDate(
        isSalePath ? 'sale' : 'rental',
        isSalePath ? 'available' : null,
        activeDays
      );

      const imageMedia = mediaFiles.filter(m => m.type === 'image');

      // Auto-generate title if left blank
      const autoTitle = (() => {
        if (wizard.formData.title?.trim()) return wizard.formData.title.trim();
        const { bedrooms, additional_rooms, property_type } = wizard.formData;
        if (isSalePath) {
          const saleTypeLabels: Record<string, string> = {
            single_family: 'Single-Family',
            two_family: 'Two-Family',
            three_family: 'Three-Family',
            four_family: 'Multi-Family',
            condo: 'Condo',
            co_op: 'Co-op',
          };
          const typeLabel = saleTypeLabels[property_type] || '';
          const bedroomLabel = bedrooms === 0 ? 'Studio' : `${bedrooms} BR`;
          const locationPart = wizard.resolvedNeighborhood || wizard.formData.location || '';
          return [bedroomLabel, typeLabel, locationPart ? `— ${locationPart}` : ''].filter(Boolean).join(' ');
        }
        const bedroomLabel = bedrooms === 0 ? 'Studio' : `${bedrooms}${additional_rooms > 0 ? `+${additional_rooms}` : ''} BR`;
        const typeLabels: Record<string, string> = {
          apartment_building: 'Apartment',
          apartment_house: 'Apartment',
          full_house: 'Full House',
          duplex: 'Duplex',
          basement: 'Basement Apt',
        };
        const typeLabel = typeLabels[property_type] || '';
        const locationPart = wizard.resolvedNeighborhood || wizard.formData.location || '';
        return [bedroomLabel, typeLabel, locationPart ? `— ${locationPart}` : ''].filter(Boolean).join(' ');
      })();

      const payload = {
        ...wizard.formData,
        title: autoTitle,
        listing_type: (isSalePath ? 'sale' : 'rental') as 'sale' | 'rental',
        user_id: user.id,
        neighborhood: wizard.resolvedNeighborhood,
        location: wizard.formData.location,
        full_address: wizard.formData.street_address
          ? [wizard.formData.street_address, wizard.formData.unit_number ? `Unit ${wizard.formData.unit_number}` : ''].filter(Boolean).join(', ')
          : null,
        is_active: false,
        approved: false,
        is_featured: false,
        expires_at: expiresAt.toISOString(),
        price: isSalePath
          ? null
          : (wizard.formData.call_for_price ? null : wizard.formData.price),
        asking_price: isSalePath
          ? (wizard.formData.call_for_price ? null : wizard.formData.asking_price)
          : null,
        sale_status: isSalePath ? 'available' : null,
        call_for_price: !!wizard.formData.call_for_price,
        ac_type: wizard.formData.ac_type || null,
        apartment_conditions: wizard.formData.apartment_conditions?.length > 0 ? wizard.formData.apartment_conditions : null,
        additional_rooms: wizard.formData.additional_rooms > 0 ? wizard.formData.additional_rooms : null,
        utilities_included: wizard.formData.utilities_included?.length > 0 ? wizard.formData.utilities_included : null,
        tenant_notes: wizard.formData.tenant_notes || null,
        // Enum fields that default to "" must be null — DB rejects empty strings
        basement_type: wizard.formData.basement_type || null,
        building_type: wizard.formData.building_type || null,
        delivery_condition: (wizard.formData as any).delivery_condition || null,
        heating_type: wizard.formData.heating_type || null,
        laundry_type: (wizard.formData as any).laundry_type || null,
        occupancy_status: (wizard.formData as any).occupancy_status || null,
        property_condition: (wizard.formData as any).property_condition || null,
        driveway_status: (wizard.formData as any).driveway_status || null,
        // Array/text fields — ensure clean nulls
        basement_notes: wizard.formData.basement_notes || null,
        outdoor_space: wizard.formData.outdoor_space?.length > 0 ? wizard.formData.outdoor_space : null,
        interior_features: wizard.formData.interior_features?.length > 0 ? wizard.formData.interior_features : null,
        rent_roll_data: wizard.formData.rent_roll_data?.length > 0 ? wizard.formData.rent_roll_data : null,
        // Sale-specific number fields (use computed dimensions if user picked dimension mode)
        building_size_sqft: isSalePath
          ? (wizard.formData.building_size_input_mode === 'dimensions' && wizard.formData.building_length_ft && wizard.formData.building_width_ft
              ? Math.round(wizard.formData.building_length_ft * wizard.formData.building_width_ft)
              : (wizard.formData.building_size_sqft || null))
          : null,
        lot_size_sqft: isSalePath
          ? (wizard.formData.lot_size_input_mode === 'dimensions' && wizard.formData.property_length_ft && wizard.formData.property_width_ft
              ? Math.round(wizard.formData.property_length_ft * wizard.formData.property_width_ft)
              : (wizard.formData.lot_size_sqft || null))
          : null,
        building_length_ft: isSalePath ? (wizard.formData.building_length_ft || null) : null,
        building_width_ft: isSalePath ? (wizard.formData.building_width_ft || null) : null,
        property_length_ft: isSalePath ? (wizard.formData.property_length_ft || null) : null,
        property_width_ft: isSalePath ? (wizard.formData.property_width_ft || null) : null,
        number_of_floors: isSalePath ? (wizard.formData.number_of_floors || null) : null,
        unit_count: isSalePath ? (wizard.formData.unit_count || null) : null,
        year_built: isSalePath ? (wizard.formData.year_built || null) : null,
        year_renovated: isSalePath ? (wizard.formData.year_renovated || null) : null,
        property_taxes: isSalePath ? (wizard.formData.property_taxes || null) : null,
        hoa_fees: isSalePath ? (wizard.formData.hoa_fees || null) : null,
        rent_roll_total: isSalePath ? (wizard.formData.rent_roll_total || null) : null,
        multi_family: isSalePath
          ? ['two_family', 'three_family', 'four_family'].includes(wizard.formData.property_type)
          : null,
        latitude: wizard.formData.latitude,
        longitude: wizard.formData.longitude,
        // strip UI-only fields
        terms_agreed: undefined,
        building_size_input_mode: undefined,
        lot_size_input_mode: undefined,
        street_address: undefined,
        unit_number: undefined,
        city: undefined,
        state: undefined,
        zip_code: undefined,
        // -----------------------------------------------------------------
        // Monetization fields — residential rentals only.
        // payment_kind drives the new payment-permission gate (see
        // auto_inactivate_old_listings RPC + set_listing_deactivated_timestamp trigger).
        //   subscription_covered → 'subscription'
        //   must_pay             → null (webhook flips to 'individual_paid' on payment success)
        //   anything else        → 'individual_trial' with trial_started_at=NOW
        // Sale listings: leave these fields as null/undefined.
        // -----------------------------------------------------------------
        ...(isSalePath
          ? {}
          : paymentChoice === 'subscription_covered'
            ? { payment_kind: 'subscription' }
            : paymentChoice === 'must_pay'
              ? { payment_kind: null }
              : {
                  payment_kind: 'individual_trial',
                  trial_started_at: new Date().toISOString(),
                }),
      } as any;

      const listing = await listingsService.createListing(payload);

      if (!listing || !listing.id) {
        throw new Error('Failed to create listing. Please try again.');
      }

      trackPostSuccess(listing.id);

      // Finalize images
      if (imageMedia.length > 0) {
        const tempImages = imageMedia.map(m => ({
          filePath: m.filePath!,
          publicUrl: m.publicUrl || m.url,
          is_featured: m.is_featured,
          originalName: m.originalName || '',
        }));
        await listingsService.finalizeTempListingImages(listing.id, user.id, tempImages);
      }

      wizard.clearDraft();

      // If the user chose a pay path on the wizard, hand off to Stripe Checkout
      // instead of dropping them on the dashboard. On checkout completion the
      // webhook flips payment_kind to 'individual_paid' and (for pay-at-posting)
      // grants the 30 bonus days.
      const requiresStripeCheckout =
        !isSalePath && (paymentChoice === 'pay_at_posting' || paymentChoice === 'must_pay');

      if (requiresStripeCheckout) {
        try {
          const checkout = await paymentsService.createCheckoutSession({
            listingId: listing.id,
            days: 30,
            isInitialPurchase: paymentChoice === 'pay_at_posting',
          });
          clearStoredPaymentChoice();
          window.location.href = checkout.url;
          return;
        } catch (checkoutErr) {
          console.error('Failed to create Stripe checkout, falling back to dashboard:', checkoutErr);
          setSubmitError(
            'Your listing was created, but we couldn\'t open the payment page. You can pay from your dashboard.',
          );
          clearStoredPaymentChoice();
          navigate(`/dashboard?new_listing=true&listing_id=${listing.id}&payment_pending=true`);
          return;
        }
      }

      clearStoredPaymentChoice();
      navigate(`/dashboard?new_listing=true&listing_id=${listing.id}`);

      // Branded confirmation email — matches legacy residential pattern.
      try {
        const siteUrl = window.location.origin;
        const userName = profile?.full_name || 'A user';
        const html = renderBrandEmail({
          title: 'New Listing Posted',
          intro: `${userName} has posted a new listing.`,
          bodyHtml: '<p>View the listing here:</p>',
          ctaLabel: 'View Listing',
          ctaHref: `${siteUrl}/listing/${listing.id}`,
        });
        await emailService.sendEmail({
          to: user.email!,
          subject: `Listing Submitted: ${autoTitle} - HaDirot`,
          html,
        });
      } catch (emailErr) {
        console.warn('Failed to send residential listing submission email', emailErr);
      }
    } catch (err: any) {
      Sentry.captureException(err);
      setSubmitError(err?.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  // Keep submit handler refs in sync so the OAuth-replay effect (above the
  // wizard.initialized guard) can always call the current handler.
  submitHandlersRef.current.handleSubmit = handleSubmit;
  submitHandlersRef.current.handleCommercialSubmit = handleCommercialSubmit;

  // --- Render ---

  // Shared post-auth handler for email/password sign-in path.
  // Google OAuth uses the useEffect above the guard instead.
  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    const kind = pendingSubmitKind;
    setPendingSubmitKind(null);
    if (kind === 'commercial') {
      setTimeout(() => { void handleCommercialSubmit(); }, 0);
    } else if (kind === 'residential') {
      setTimeout(() => { void handleSubmit(); }, 0);
    }
  };

  if (!wizard.selectedPath) {
    return (
      <>
        <PathPicker onSelect={handleSelectPath} />
        <Modal isOpen={showAuthModal} onClose={() => { setShowAuthModal(false); setPendingSubmitKind(null); try { sessionStorage.removeItem('wizard:pendingSubmit'); } catch { /* ignore */ } }} title="Sign in to continue">
          <AuthForm onAuthSuccess={handleAuthSuccess} />
        </Modal>
        <PermissionRequestModal
          isOpen={showPermissionModal}
          onClose={() => { setShowPermissionModal(false); setPermissionMessage(''); }}
          permissionRequestMessage={permissionMessage}
          setPermissionRequestMessage={setPermissionMessage}
          requestingPermission={requestingPermission}
          onSubmit={handlePermissionRequest}
        />
      </>
    );
  }

  if (
    wizard.selectedPath !== 'residential_rent' &&
    wizard.selectedPath !== 'residential_sale' &&
    !isCommercial
  ) {
    return <ComingSoon onBack={() => wizard.setSelectedPath(null)} />;
  }

  const stepProps = {
    formData: wizard.formData,
    updateFormData: wizard.updateFormData,
    onNext: handleNext,
    onBack: handleBack,
  };

  const renderStep = () => {
    if (isCommercial) {
      return (
        <CommercialStepsRouter
          currentStep={wizard.currentStep}
          formData={wizard.commercialFormData}
          updateFormData={wizard.updateCommercialFormData}
          isSale={isCommercialSale}
          onNext={handleNext}
          onBack={handleBack}
          mediaFiles={commercialMediaFiles}
          uploadingMedia={uploadingCommercialMedia}
          onMediaAdd={handleCommercialMediaAdd}
          onMediaRemove={handleCommercialMediaRemove}
          onSetFeatured={handleCommercialSetFeatured}
          maxAllowedFiles={20}
          crossStreetAFeature={wizard.crossStreetAFeature}
          setCrossStreetAFeature={wizard.setCrossStreetAFeature}
          crossStreetBFeature={wizard.crossStreetBFeature}
          setCrossStreetBFeature={wizard.setCrossStreetBFeature}
          neighborhoodSelectValue={wizard.neighborhoodSelectValue}
          setNeighborhoodSelectValue={wizard.setNeighborhoodSelectValue}
          customNeighborhoodInput={wizard.customNeighborhoodInput}
          setCustomNeighborhoodInput={wizard.setCustomNeighborhoodInput}
          isLocationConfirmed={wizard.isLocationConfirmed}
          setIsLocationConfirmed={wizard.setIsLocationConfirmed}
          resolvedNeighborhood={wizard.resolvedNeighborhood}
          loading={loading}
          submitError={submitError}
          onSubmit={handleCommercialSubmit}
          profile={profile ?? null}
        />
      );
    }

    if (isSalePath) {
      switch (wizard.currentStep) {
        case 0:
          return <Step1SalePropertyAndLayout {...stepProps} />;
        case 1:
          return (
            <Step3SaleShowItOff
              {...stepProps}
              mediaFiles={mediaFiles}
              uploadingMedia={uploadingMedia}
              onMediaAdd={handleMediaAdd}
              onMediaRemove={handleMediaRemove}
              onSetFeatured={handleSetFeatured}
              maxAllowedFiles={maxAllowedFiles}
            />
          );
        case 2:
          return (
            <Step4SaleLocation
              {...stepProps}
              crossStreetAFeature={wizard.crossStreetAFeature}
              setCrossStreetAFeature={wizard.setCrossStreetAFeature}
              crossStreetBFeature={wizard.crossStreetBFeature}
              setCrossStreetBFeature={wizard.setCrossStreetBFeature}
              neighborhoodSelectValue={wizard.neighborhoodSelectValue}
              setNeighborhoodSelectValue={wizard.setNeighborhoodSelectValue}
              customNeighborhoodInput={wizard.customNeighborhoodInput}
              setCustomNeighborhoodInput={wizard.setCustomNeighborhoodInput}
              isLocationConfirmed={wizard.isLocationConfirmed}
              setIsLocationConfirmed={wizard.setIsLocationConfirmed}
            />
          );
        case 3:
          return <Step5SaleConditionAndStatus {...stepProps} />;
        case 4:
          return <Step6SaleOptionalFeatures {...stepProps} />;
        case 5:
          return (
            <Step7SaleContactAndReview
              {...stepProps}
              mediaFiles={mediaFiles}
              resolvedNeighborhood={wizard.resolvedNeighborhood}
              loading={loading}
              uploadingMedia={uploadingMedia}
              submitError={submitError}
              onSubmit={handleSubmit}
              profile={profile ?? null}
            />
          );
        default:
          return null;
      }
    }

    // Rental path
    switch (wizard.currentStep) {
      case 0:
        return <Step1PropertyTypeAndLayout {...stepProps} />;
      case 1:
        return <Step2PriceAndTerms {...stepProps} />;
      case 2:
        return (
          <Step3ShowItOff
            {...stepProps}
            mediaFiles={mediaFiles}
            uploadingMedia={uploadingMedia}
            onMediaAdd={handleMediaAdd}
            onMediaRemove={handleMediaRemove}
            onSetFeatured={handleSetFeatured}
            maxAllowedFiles={maxAllowedFiles}
          />
        );
      case 3:
        return (
          <Step4Location
            {...stepProps}
            crossStreetAFeature={wizard.crossStreetAFeature}
            setCrossStreetAFeature={wizard.setCrossStreetAFeature}
            crossStreetBFeature={wizard.crossStreetBFeature}
            setCrossStreetBFeature={wizard.setCrossStreetBFeature}
            neighborhoodSelectValue={wizard.neighborhoodSelectValue}
            setNeighborhoodSelectValue={wizard.setNeighborhoodSelectValue}
            customNeighborhoodInput={wizard.customNeighborhoodInput}
            setCustomNeighborhoodInput={wizard.setCustomNeighborhoodInput}
            isLocationConfirmed={wizard.isLocationConfirmed}
            setIsLocationConfirmed={wizard.setIsLocationConfirmed}
          />
        );
      case 4:
        return <Step5FeaturesAndCondition {...stepProps} />;
      case 5:
        return (
          <Step6ContactAndReview
            {...stepProps}
            mediaFiles={mediaFiles}
            resolvedNeighborhood={wizard.resolvedNeighborhood}
            loading={loading}
            uploadingMedia={uploadingMedia}
            submitError={submitError}
            onSubmit={handleSubmit}
            profile={profile ?? null}
          />
        );
      default:
        return null;
    }
  };

  const totalSteps = totalStepsForFunnel;

  return (
    <WizardUIContext.Provider value={{ currentStep: wizard.currentStep, totalSteps, lastSavedAt: wizard.lastSavedAt }}>
    <>
      <WizardBreadcrumb
        currentStep={wizard.currentStep}
        highWaterStep={wizard.highWaterStep}
        onGoToStep={handleGoToStep}
        stepLabels={stepLabels}
      />

      <div className="max-w-5xl mx-auto px-4 pt-4 pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-gray-900">Post a Listing</h1>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent-50 text-accent-700 border border-accent-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-500 flex-shrink-0" />
              {isCommercial
                ? (isCommercialSale ? 'Commercial · For sale' : 'Commercial · For rent')
                : (isSalePath ? 'Residential · For sale' : 'Residential · For rent')}
            </span>
          </div>

          <ChangeListingTypeButton
            currentPath={wizard.selectedPath}
            onChangePath={(path) => {
              wizard.clearDraft();
              handleSelectPath(path);
            }}
          />
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="flex gap-8 items-start">
          <div className="flex-1 min-w-0">
            {renderStep()}
          </div>
        </div>
      </div>

      <Modal isOpen={showAuthModal} onClose={() => { setShowAuthModal(false); setPendingSubmitKind(null); try { sessionStorage.removeItem('wizard:pendingSubmit'); } catch { /* ignore */ } }} title="Sign in to publish your listing">
        <AuthForm onAuthSuccess={handleAuthSuccess} />
      </Modal>
    </>
    </WizardUIContext.Provider>
  );
}
