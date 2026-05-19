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
import { useWizardState, type WizardPath } from './useWizardState';
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

// ── Change Listing Type dropdown ──────────────────────────────────────────────

const LISTING_TYPE_OPTIONS: { path: WizardPath; label: string; sub: string }[] = [
  { path: 'residential_rent', label: 'Residential Rental', sub: 'Apartment, room, house for rent' },
  { path: 'residential_sale', label: 'Residential Sale',   sub: 'House, condo, co-op for sale'   },
  { path: 'commercial_lease', label: 'Commercial Lease',   sub: 'Office, retail, industrial'      },
  { path: 'commercial_sale',  label: 'Commercial Sale',    sub: 'Office, retail, industrial'      },
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
          {LISTING_TYPE_OPTIONS.map(({ path, label, sub }) => {
            const isCurrent = path === currentPath;
            return (
              <button
                key={path}
                type="button"
                disabled={isCurrent}
                onClick={() => { onChangePath(path); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 flex flex-col transition-colors ${
                  isCurrent
                    ? 'bg-accent-50 cursor-default'
                    : 'hover:bg-gray-50 cursor-pointer'
                }`}
              >
                <span className={`text-sm font-medium ${isCurrent ? 'text-accent-700' : 'text-gray-800'}`}>
                  {label}
                  {isCurrent && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-accent-500">current</span>}
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

  if (!wizard.initialized) return null;

  // Require auth to interact beyond path picker
  const requireAuth = () => {
    if (!user) {
      setShowAuthModal(true);
      return false;
    }
    return true;
  };

  const handleSelectPath = (path: Parameters<typeof wizard.setSelectedPath>[0]) => {
    if (!requireAuth()) return;
    // Sales path requires permission
    if (path === 'residential_sale' && !hasSalesAccess) {
      setShowPermissionModal(true);
      return;
    }
    wizard.setSelectedPath(path);
  };

  const handleNext = () => {
    if (!requireAuth()) return;
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

  const handleSubmit = async () => {
    if (!user) { setShowAuthModal(true); return; }
    setLoading(true);
    setSubmitError(null);

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
      } as any;

      const listing = await listingsService.createListing(payload);

      if (!listing || !listing.id) {
        throw new Error('Failed to create listing. Please try again.');
      }

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
      navigate(`/dashboard?new_listing=true&listing_id=${listing.id}`);
    } catch (err: any) {
      Sentry.captureException(err);
      setSubmitError(err?.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  // --- Render ---

  if (!wizard.selectedPath) {
    return (
      <>
        <PathPicker onSelect={handleSelectPath} />
        <Modal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} title="Sign in to continue">
          <AuthForm onAuthSuccess={() => setShowAuthModal(false)} />
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

  if (wizard.selectedPath !== 'residential_rent' && wizard.selectedPath !== 'residential_sale') {
    return <ComingSoon onBack={() => wizard.setSelectedPath(null)} />;
  }

  const stepProps = {
    formData: wizard.formData,
    updateFormData: wizard.updateFormData,
    onNext: handleNext,
    onBack: handleBack,
  };

  const renderStep = () => {
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

  const stepLabels = isSalePath ? SALE_STEP_LABELS : RENTAL_STEP_LABELS;
  const totalSteps = stepLabels.length;

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
              {isSalePath ? 'Residential · For sale' : 'Residential · For rent'}
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

      <Modal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} title="Sign in to continue">
        <AuthForm onSuccess={() => setShowAuthModal(false)} />
      </Modal>
    </>
    </WizardUIContext.Provider>
  );
}
