import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { useAuth } from '@/hooks/useAuth';
import { Modal } from '../../components/shared/Modal';
import { AuthForm } from '../../components/auth/AuthForm';
import { listingsService, getExpirationDate, getAdminActiveDays } from '../../services/listings';
import { useListingMedia } from '../listing/useListingMedia';
import { useWizardState } from './useWizardState';
import { PathPicker } from './PathPicker';
import { WizardBreadcrumb } from './WizardBreadcrumb';
import { ComingSoon } from './ComingSoon';
import { Step1PropertyTypeAndLayout } from './steps/residential/Step1PropertyTypeAndLayout';
import { Step2PriceAndTerms } from './steps/residential/Step2PriceAndTerms';
import { Step3ShowItOff } from './steps/residential/Step3ShowItOff';
import { Step4Location } from './steps/residential/Step4Location';
import { Step5FeaturesAndCondition } from './steps/residential/Step5FeaturesAndCondition';
import { Step6ContactAndReview } from './steps/residential/Step6ContactAndReview';

export function PostListingWizard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const wizard = useWizardState(user?.id ?? null);

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
    isSaleListing: false,
    allowAnonymous: true,
  });

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

      const { rentalDays } = await getAdminActiveDays();
      const expiresAt = getExpirationDate('rental', undefined, rentalDays);

      const imageMedia = mediaFiles.filter(m => m.type === 'image');

      // Auto-generate title if left blank
      const autoTitle = (() => {
        if (wizard.formData.title?.trim()) return wizard.formData.title.trim();
        const { bedrooms, additional_rooms, property_type } = wizard.formData;
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
        listing_type: 'rental' as const,
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
        price: wizard.formData.call_for_price ? null : wizard.formData.price,
        asking_price: null,
        sale_status: null,
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
      </>
    );
  }

  if (wizard.selectedPath !== 'residential_rent') {
    return <ComingSoon onBack={() => wizard.setSelectedPath(null)} />;
  }

  const stepProps = {
    formData: wizard.formData,
    updateFormData: wizard.updateFormData,
    onNext: handleNext,
    onBack: handleBack,
  };

  const renderStep = () => {
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

  return (
    <>
      <WizardBreadcrumb
        currentStep={wizard.currentStep}
        onGoToStep={handleGoToStep}
      />

      <div className="max-w-5xl mx-auto px-4 pt-4 pb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-900">Post a Listing</h1>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent-50 text-accent-700 border border-accent-200 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-500 flex-shrink-0" />
            Residential · For rent
          </span>
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
  );
}
