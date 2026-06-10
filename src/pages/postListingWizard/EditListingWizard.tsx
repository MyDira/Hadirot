import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { useAuth } from '@/hooks/useAuth';
import { Modal } from '../../components/shared/Modal';
import { AuthForm } from '../../components/auth/AuthForm';
import { listingsService } from '../../services/listings';
import { reverseGeocode } from '../../services/reverseGeocode';
import { useListingMedia } from '../listing/useListingMedia';
import { useWizardState } from './useWizardState';
import { WizardUIContext } from './WizardContext';
import { WizardBreadcrumb } from './WizardBreadcrumb';
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
import type { Listing, SaleStatus } from '../../config/supabase';
import type { MediaFile } from '../../components/shared/MediaUploader';
import type { ListingFormData } from '../postListing/types';
import { ArrowLeft, Lock } from 'lucide-react';

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

// ── Address parser (same as EditListing.tsx) ──────────────────────────────────

function parseFullAddress(fullAddress: string | null | undefined) {
  const defaults = { street_address: '', city: 'Brooklyn', state: 'NY', zip_code: '' };
  if (!fullAddress || typeof fullAddress !== 'string') return defaults;
  const parts = fullAddress.split(',').map(p => p.trim());
  if (parts.length >= 4) return { street_address: parts[0], city: parts[1], state: parts[2], zip_code: parts[3] };
  if (parts.length === 3) return { street_address: parts[0], city: parts[1], state: 'NY', zip_code: parts[2] };
  if (parts.length === 2) return { street_address: parts[0], city: parts[1], state: 'NY', zip_code: '' };
  return { street_address: parts[0] || '', city: 'Brooklyn', state: 'NY', zip_code: '' };
}

// ── Map listing → ListingFormData ─────────────────────────────────────────────

function listingToFormData(data: Listing): ListingFormData {
  const isSale = data.listing_type === 'sale';
  const parsedAddress = isSale ? parseFullAddress(data.full_address) : null;

  return {
    title: data.title,
    description: data.description || '',
    location: data.location,
    neighborhood: data.neighborhood || '',
    bedrooms: data.bedrooms,
    bathrooms: data.bathrooms,
    floor: data.floor || undefined,
    price: data.call_for_price ? null : data.price,
    call_for_price: !!data.call_for_price,
    square_footage: data.square_footage || undefined,
    parking: data.parking,
    washer_dryer_hookup: data.washer_dryer_hookup,
    dishwasher: data.dishwasher,
    lease_length: data.lease_length || null,
    heat: data.heat,
    property_type: data.property_type,
    contact_name: data.contact_name,
    contact_phone: data.contact_phone,
    broker_fee: false,
    ac_type: data.ac_type || null,
    apartment_conditions: data.apartment_conditions || [],
    additional_rooms: data.additional_rooms || 0,
    latitude: data.latitude || null,
    longitude: data.longitude || null,
    listing_type: (data.listing_type || 'rental') as 'rental' | 'sale',
    sale_status: (data.sale_status as SaleStatus) || null,
    asking_price: data.asking_price || null,
    building_type: data.building_type || null,
    property_condition: data.property_condition || null,
    occupancy_status: data.occupancy_status || null,
    delivery_condition: data.delivery_condition || null,
    lot_size_sqft: data.lot_size_sqft || null,
    lot_size_input_mode: 'sqft',
    property_length_ft: null,
    property_width_ft: null,
    building_size_sqft: data.building_size_sqft || null,
    building_size_input_mode: 'sqft',
    building_length_ft: null,
    building_width_ft: null,
    number_of_floors: data.number_of_floors || null,
    year_built: data.year_built || null,
    year_renovated: data.year_renovated || null,
    hoa_fees: data.hoa_fees || null,
    property_taxes: data.property_taxes || null,
    outdoor_space: data.outdoor_space || [],
    interior_features: data.interior_features || [],
    laundry_type: data.laundry_type || null,
    basement_type: data.basement_type || null,
    basement_notes: data.basement_notes || null,
    heating_type: data.heating_type || null,
    rent_roll_total: data.rent_roll_total || null,
    rent_roll_data: data.rent_roll_data || [],
    utilities_included: data.utilities_included || [],
    tenant_notes: data.tenant_notes || null,
    street_address: parsedAddress?.street_address || null,
    unit_number: null,
    city: parsedAddress?.city || (data as any).city || null,
    state: parsedAddress?.state || 'NY',
    zip_code: parsedAddress?.zip_code || (data as any).zip_code || null,
    unit_count: data.unit_count || null,
    // Mark terms as agreed since they already agreed when creating
    terms_agreed: true,
  } as ListingFormData;
}

// ── Main component ────────────────────────────────────────────────────────────

export function EditListingWizard() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [loadingListing, setLoadingListing] = useState(true);
  const [originalListing, setOriginalListing] = useState<Listing | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const wizard = useWizardState(user?.id ?? null);

  const isSalePath = wizard.selectedPath === 'residential_sale';

  const {
    mediaFiles,
    setMediaFiles,
    mediaToDelete,
    uploadingMedia,
    handleMediaAdd,
    handleMediaRemove,
    handleSetFeatured,
    maxAllowedFiles,
    uploadPendingMedia,
  } = useListingMedia({
    userId: user?.id ?? null,
    isSaleListing: isSalePath,
    trackExistingForDelete: true,
  });

  // ── Load existing listing ──────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;

    listingsService.getListing(id, user?.id).then((data) => {
      if (!data) {
        navigate('/account?tab=listings');
        return;
      }
      setOriginalListing(data);

      // Load existing media
      const loadedMedia: MediaFile[] = [];
      if (data.listing_images && data.listing_images.length > 0) {
        data.listing_images.forEach((img) => {
          loadedMedia.push({
            id: img.id,
            type: 'image',
            url: img.image_url,
            is_featured: img.is_featured,
            isExisting: true,
          });
        });
      }
      if (data.video_url) {
        loadedMedia.push({
          id: 'existing-video',
          type: 'video',
          url: data.video_url,
          is_featured: false,
          isExisting: true,
        });
      }
      setMediaFiles(loadedMedia);
    }).catch(() => {
      navigate('/account?tab=listings');
    }).finally(() => {
      setLoadingListing(false);
    });
  }, [id, user?.id]);

  // ── Seed wizard state once listing is loaded ───────────────────────────────

  useEffect(() => {
    if (!originalListing || seeded || !wizard.initialized) return;

    const isSale = originalListing.listing_type === 'sale';
    const path = isSale ? 'residential_sale' : 'residential_rent';
    const totalSteps = isSale ? SALE_STEP_LABELS.length : RENTAL_STEP_LABELS.length;

    // Set the correct path (bypassing the normal auth/permission checks)
    wizard.setSelectedPath(path);

    // Override formData with listing's existing values
    const seededForm = listingToFormData(originalListing);
    wizard.setFormData(seededForm);

    // Seed cross streets for rental listings
    if (!isSale) {
      if (originalListing.cross_street_a) {
        wizard.setCrossStreetAFeature({
          placeId: 'loaded-a',
          streetName: originalListing.cross_street_a,
          formattedName: originalListing.cross_street_a,
        });
      }
      if (originalListing.cross_street_b) {
        wizard.setCrossStreetBFeature({
          placeId: 'loaded-b',
          streetName: originalListing.cross_street_b,
          formattedName: originalListing.cross_street_b,
        });
      }
    }

    // Seed neighborhood
    const STANDARD_NEIGHBORHOODS = ['Midwood', 'Homecrest', 'Marine Park', 'Flatbush', 'Gravesend', 'Boro Park'];
    const neighborhood = originalListing.neighborhood || '';
    if (neighborhood && !STANDARD_NEIGHBORHOODS.includes(neighborhood)) {
      wizard.setNeighborhoodSelectValue('other');
      wizard.setCustomNeighborhoodInput(neighborhood);
    } else {
      wizard.setNeighborhoodSelectValue(neighborhood);
      wizard.setCustomNeighborhoodInput('');
    }

    // If the listing already has a confirmed map location, treat it as confirmed
    // so the user isn't forced to re-confirm an unchanged pin.
    if (originalListing.latitude && originalListing.longitude) {
      wizard.setIsLocationConfirmed(true);
    }

    // Make all steps clickable (editing an existing listing)
    wizard.setHighWaterStep(totalSteps - 1);

    setSeeded(true);
  }, [originalListing, wizard.initialized, seeded]);

  // ── Ownership check ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!originalListing || !user || !profile) return;
    const isOwner = user.id === originalListing.user_id;
    const isAdmin = profile.is_admin;
    if (!isOwner && !isAdmin) {
      navigate('/account?tab=listings');
    }
  }, [originalListing, user, profile]);

  // ── Edit submit handler ────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!id || !originalListing) return;

    setSubmitLoading(true);
    setSubmitError(null);

    try {
      // 1. Upload new pending images
      const mediaOk = await uploadPendingMedia();
      if (!mediaOk) {
        setSubmitError('Photo upload failed. Please try again.');
        setSubmitLoading(false);
        return;
      }

      // 2. Delete removed existing media
      const existingImageIds = originalListing.listing_images?.map(img => img.id) || [];
      for (const mediaId of mediaToDelete) {
        if (existingImageIds.includes(mediaId)) {
          const imageToDelete = originalListing.listing_images?.find(img => img.id === mediaId);
          if (imageToDelete) {
            await listingsService.deleteListingImage(mediaId, imageToDelete.image_url);
          }
        } else if (mediaId === 'existing-video') {
          await listingsService.updateListing(id, { video_url: null });
        }
      }

      // 3. Update featured status for existing images that weren't deleted
      const existingImages = mediaFiles.filter(m => m.type === 'image' && m.isExisting && !mediaToDelete.includes(m.id));
      for (const media of existingImages) {
        await listingsService.updateListingImage(media.id, { is_featured: media.is_featured });
      }

      // 4. Build update payload
      const isSale = wizard.selectedPath === 'residential_sale';
      const neighborhood = wizard.resolvedNeighborhood;

      // For sale listings, derive neighborhood from coordinates if changed
      let finalNeighborhood: string | null = neighborhood || null;
      if (isSale && wizard.formData.latitude && wizard.formData.longitude) {
        const coordsChanged = originalListing.latitude !== wizard.formData.latitude || originalListing.longitude !== wizard.formData.longitude;
        if (coordsChanged) {
          try {
            const geoResult = await reverseGeocode(wizard.formData.latitude, wizard.formData.longitude);
            finalNeighborhood = geoResult.neighborhood || originalListing.neighborhood || null;
          } catch {
            finalNeighborhood = originalListing.neighborhood || null;
          }
        } else {
          finalNeighborhood = originalListing.neighborhood || null;
        }
      }

      const updatePayload: Record<string, unknown> = {
        title: wizard.formData.title || originalListing.title,
        description: wizard.formData.description,
        location: wizard.formData.location,
        cross_street_a: wizard.crossStreetAFeature?.streetName || null,
        cross_street_b: wizard.crossStreetBFeature?.streetName || null,
        neighborhood: finalNeighborhood,
        bedrooms: wizard.formData.bedrooms,
        bathrooms: wizard.formData.bathrooms,
        floor: wizard.formData.floor || null,
        parking: wizard.formData.parking,
        washer_dryer_hookup: wizard.formData.washer_dryer_hookup,
        dishwasher: wizard.formData.dishwasher,
        heat: wizard.formData.heat,
        property_type: wizard.formData.property_type,
        contact_name: wizard.formData.contact_name,
        contact_phone: wizard.formData.contact_phone,
        broker_fee: false,
        ac_type: wizard.formData.ac_type || null,
        apartment_conditions: wizard.formData.apartment_conditions?.length > 0 ? wizard.formData.apartment_conditions : null,
        additional_rooms: wizard.formData.additional_rooms > 0 ? wizard.formData.additional_rooms : null,
        latitude: wizard.formData.latitude,
        longitude: wizard.formData.longitude,
        updated_at: new Date().toISOString(),
        // Enum fields
        basement_type: wizard.formData.basement_type || null,
        building_type: wizard.formData.building_type || null,
        heating_type: wizard.formData.heating_type || null,
        laundry_type: (wizard.formData as any).laundry_type || null,
        // Array fields
        outdoor_space: wizard.formData.outdoor_space?.length > 0 ? wizard.formData.outdoor_space : null,
        interior_features: wizard.formData.interior_features?.length > 0 ? wizard.formData.interior_features : null,
        utilities_included: wizard.formData.utilities_included?.length > 0 ? wizard.formData.utilities_included : null,
      };

      if (isSale) {
        const buildingSize =
          wizard.formData.building_size_input_mode === 'dimensions' &&
          wizard.formData.building_length_ft && wizard.formData.building_width_ft
            ? Math.round(wizard.formData.building_length_ft * wizard.formData.building_width_ft)
            : wizard.formData.building_size_sqft || null;

        const lotSize =
          wizard.formData.lot_size_input_mode === 'dimensions' &&
          wizard.formData.property_length_ft && wizard.formData.property_width_ft
            ? Math.round(wizard.formData.property_length_ft * wizard.formData.property_width_ft)
            : wizard.formData.lot_size_sqft || null;

        const fullAddress = [
          wizard.formData.street_address,
          wizard.formData.unit_number ? `Unit ${wizard.formData.unit_number}` : '',
          wizard.formData.city || 'Brooklyn',
          wizard.formData.state || 'NY',
          wizard.formData.zip_code || '',
        ].filter(Boolean).join(', ');

        Object.assign(updatePayload, {
          asking_price: wizard.formData.call_for_price ? null : wizard.formData.asking_price,
          call_for_price: !!wizard.formData.call_for_price,
          sale_status: wizard.formData.sale_status || 'available',
          full_address: fullAddress,
          city: wizard.formData.city || null,
          zip_code: wizard.formData.zip_code || null,
          building_size_sqft: buildingSize,
          lot_size_sqft: lotSize,
          number_of_floors: wizard.formData.number_of_floors || null,
          year_built: wizard.formData.year_built || null,
          year_renovated: wizard.formData.year_renovated || null,
          hoa_fees: wizard.formData.hoa_fees || null,
          property_taxes: wizard.formData.property_taxes || null,
          property_condition: (wizard.formData as any).property_condition || null,
          occupancy_status: (wizard.formData as any).occupancy_status || null,
          delivery_condition: (wizard.formData as any).delivery_condition || null,
          basement_notes: wizard.formData.basement_notes || null,
          rent_roll_total: wizard.formData.rent_roll_total || null,
          rent_roll_data: wizard.formData.rent_roll_data?.length > 0 ? wizard.formData.rent_roll_data : null,
          tenant_notes: wizard.formData.tenant_notes || null,
          unit_count: wizard.formData.unit_count || null,
          multi_family: ['two_family', 'three_family', 'four_family'].includes(wizard.formData.property_type),
        });
      } else {
        Object.assign(updatePayload, {
          price: wizard.formData.call_for_price ? null : wizard.formData.price,
          call_for_price: !!wizard.formData.call_for_price,
          lease_length: wizard.formData.lease_length || null,
          square_footage: wizard.formData.square_footage || null,
        });
      }

      // 5. Update the listing
      await listingsService.updateListing(id, updatePayload);

      // 6. Finalize new images
      const newImageMedia = mediaFiles.filter(m => m.type === 'image' && !m.isExisting && !mediaToDelete.includes(m.id));
      if (newImageMedia.length > 0) {
        const tempImages = newImageMedia.map(m => ({
          filePath: m.filePath!,
          publicUrl: m.publicUrl || m.url,
          is_featured: m.is_featured,
          originalName: m.originalName || '',
        }));
        await listingsService.finalizeTempListingImages(id, user.id, tempImages);
      }

      navigate(`/listing/${id}`);
    } catch (err: any) {
      Sentry.captureException(err);
      setSubmitError(err?.message || 'Something went wrong. Please try again.');
      setSubmitLoading(false);
    }
  };

  // ── Navigation ────────────────────────────────────────────────────────────

  const handleNext = () => {
    wizard.nextStep();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    if (wizard.currentStep === 0) {
      navigate('/account?tab=listings');
    } else {
      wizard.prevStep();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleGoToStep = (step: number) => {
    wizard.goToStep(step);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── Loading states ────────────────────────────────────────────────────────

  if (loadingListing || !wizard.initialized || !seeded) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 flex flex-col items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-500 mb-4" />
        <p className="text-gray-500 text-sm">Loading listing…</p>
      </div>
    );
  }

  if (!originalListing) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-600">Listing not found or access denied.</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const stepProps = {
    formData: wizard.formData,
    updateFormData: wizard.updateFormData,
    onNext: handleNext,
    onBack: handleBack,
  };

  const stepLabels = isSalePath ? SALE_STEP_LABELS : RENTAL_STEP_LABELS;
  const totalSteps = stepLabels.length;

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
              loading={submitLoading}
              uploadingMedia={uploadingMedia}
              submitError={submitError}
              onSubmit={handleSubmit}
              profile={profile ?? null}
              submitLabel="Save Changes"
            />
          );
        default:
          return null;
      }
    }

    // Phase I: compute 10-day field lock for residential rentals.
    // Non-admins editing a rental >10d after creation see the locked inputs.
    const isFieldLocked = (() => {
      if (!originalListing || profile?.is_admin) return false;
      if (originalListing.listing_type !== 'rental') return false;
      if (!originalListing.created_at) return false;
      const cutoff = new Date(originalListing.created_at).getTime() + 10 * 24 * 60 * 60 * 1000;
      return Date.now() >= cutoff;
    })();

    // Rental path
    switch (wizard.currentStep) {
      case 0:
        return <Step1PropertyTypeAndLayout {...stepProps} isLocked={isFieldLocked} />;
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
            isLocked={isFieldLocked}
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
            loading={submitLoading}
            uploadingMedia={uploadingMedia}
            submitError={submitError}
            onSubmit={handleSubmit}
            profile={profile ?? null}
            submitLabel="Save Changes"
            isLocked={isFieldLocked}
          />
        );
      default:
        return null;
    }
  };

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
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/account?tab=listings')}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Back to listings"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-gray-900">Edit Listing</h1>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent-50 text-accent-700 border border-accent-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-500 flex-shrink-0" />
              {isSalePath ? 'Residential · For sale' : 'Residential · For rent'}
            </span>
          </div>
        </div>

        {/* Residential-rental field lock banner (10 days after creation) */}
        {(() => {
          if (!originalListing || profile?.is_admin) return null;
          if (originalListing.listing_type !== 'rental') return null;
          const created = originalListing.created_at ? new Date(originalListing.created_at) : null;
          if (!created) return null;
          const tenDaysAfter = new Date(created.getTime() + 10 * 24 * 60 * 60 * 1000);
          if (Date.now() < tenDaysAfter.getTime()) return null;
          return (
            <div className="max-w-5xl mx-auto px-4 pt-2">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
                <Lock className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-amber-900">
                  <div className="font-semibold mb-0.5">Some fields are locked on this listing</div>
                  <div>
                    Bedrooms, neighborhood, cross-streets, address, and contact phone can no
                    longer be edited — this listing is older than 10 days. If you need to
                    correct one of these, contact support. Everything else (price, description,
                    photos, features) is still editable.
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        <div className="max-w-5xl mx-auto px-4 py-4">
          {renderStep()}
        </div>

        <Modal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} title="Sign in to continue">
          <AuthForm onAuthSuccess={() => setShowAuthModal(false)} />
        </Modal>
      </>
    </WizardUIContext.Provider>
  );
}
