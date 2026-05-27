import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { useAuth } from '@/hooks/useAuth';
import { Modal } from '../../components/shared/Modal';
import { AuthForm } from '../../components/auth/AuthForm';
import { commercialListingsService } from '../../services/commercialListings';
import { useWizardState } from './useWizardState';
import { WizardUIContext } from './WizardContext';
import { WizardBreadcrumb } from './WizardBreadcrumb';
import { CommercialStepsRouter } from './CommercialStepsRouter';
import type { CommercialListing } from '../../config/supabase';
import type { MediaFile } from '../../components/shared/MediaUploader';
import type { CommercialListingFormData } from '../postCommercial/commercialTypes';
import { INITIAL_COMMERCIAL_FORM_DATA } from '../postCommercial/commercialTypes';
import { ArrowLeft } from 'lucide-react';

const COMMERCIAL_STEP_LABELS = [
  'Type & Pricing',
  'Photos & Description',
  'Location',
  'Space Details',
  'Optional Details',
  'Contact & Review',
];

const STANDARD_NEIGHBORHOODS = ['Midwood', 'Homecrest', 'Marine Park', 'Flatbush', 'Gravesend', 'Boro Park'];

function commercialListingToFormData(data: CommercialListing): CommercialListingFormData {
  return {
    ...INITIAL_COMMERCIAL_FORM_DATA,
    listing_type: (data.listing_type as 'rental' | 'sale') || 'rental',
    commercial_space_type: (data.commercial_space_type as any) || '',
    commercial_subtype: (data.commercial_subtype as any) || null,
    title: data.title || '',
    description: data.description || '',
    available_sf: data.available_sf,
    price: data.price,
    asking_price: data.asking_price,
    price_per_sf_year: data.price_per_sf_year,
    call_for_price: !!data.call_for_price,
    lease_type: (data.lease_type as any) || null,
    build_out_condition: (data.build_out_condition as any) || null,
    floor_level: data.floor_level || '',
    ceiling_height_ft: data.ceiling_height_ft,
    frontage_ft: data.frontage_ft,
    clear_height_ft: data.clear_height_ft,
    loading_docks: data.loading_docks,
    drive_in_doors: data.drive_in_doors,
    building_class: (data.building_class as any) || null,
    exam_rooms: data.exam_rooms,
    kitchen_exhaust: (data.kitchen_exhaust as any) ?? null,
    grease_trap: (data.grease_trap as any) ?? null,
    corner_location: (data.corner_location as any) ?? null,
    three_phase_power: (data.three_phase_power as any) ?? null,
    private_offices: data.private_offices,
    ada_accessible: (data.ada_accessible as any) ?? null,
    separate_entrance: (data.separate_entrance as any) ?? null,
    previous_use: data.previous_use || '',
    seating_capacity: data.seating_capacity,
    gas_line: (data.gas_line as any) ?? null,
    total_building_sf: data.total_building_sf,
    construction_type: data.construction_type || '',
    parking_spaces: data.parking_spaces,
    parking_type: data.parking_type || '',
    parking_ratio: data.parking_ratio || '',
    signage_rights: (data.signage_rights as any) ?? null,
    private_entrance: (data.private_entrance as any) ?? null,
    elevator_count: data.elevator_count,
    freight_elevator_count: data.freight_elevator_count,
    zoning_code: data.zoning_code || '',
    sprinkler_type: data.sprinkler_type || '',
    electrical_amps: data.electrical_amps,
    electrical_voltage: data.electrical_voltage || '',
    rail_access: (data.rail_access as any) ?? null,
    column_spacing: data.column_spacing || '',
    hvac_type: data.hvac_type || '',
    foot_traffic_vpd: data.foot_traffic_vpd,
    liquor_license_transferable: (data.liquor_license_transferable as any) ?? null,
    conference_rooms: data.conference_rooms,
    capacity_min: data.capacity_min,
    capacity_max: data.capacity_max,
    layout_type: data.layout_type || '',
    plumbing_wet_columns: (data.plumbing_wet_columns as any) ?? null,
    waiting_room: (data.waiting_room as any) ?? null,
    natural_light: (data.natural_light as any) ?? null,
    ventilation: (data.ventilation as any) ?? null,
    moisture_waterproofing: (data.moisture_waterproofing as any) ?? null,
    outdoor_space: data.outdoor_space || '',
    permitted_uses_commercial: data.permitted_uses_commercial || '',
    use_restrictions: data.use_restrictions || '',
    occupancy_limit: data.occupancy_limit,
    office_warehouse_ratio: data.office_warehouse_ratio || '',
    floor_load_capacity: data.floor_load_capacity || '',
    truck_court_depth: data.truck_court_depth || '',
    crane_capacity: data.crane_capacity || '',
    use_breakdown: data.use_breakdown || '',
    current_rental_income: data.current_rental_income,
    year_built: data.year_built,
    year_renovated: data.year_renovated,
    number_of_floors: data.number_of_floors,
    unit_count: data.unit_count,
    lease_term_text: data.lease_term_text || '',
    cam_per_sf: data.cam_per_sf,
    expense_stop_per_sf: data.expense_stop_per_sf,
    ti_allowance_per_sf: data.ti_allowance_per_sf,
    renewal_options: data.renewal_options || '',
    escalation: data.escalation || '',
    sublease: (data.sublease as any) ?? null,
    security_deposit: data.security_deposit || '',
    available_date: data.available_date || '',
    cap_rate: data.cap_rate,
    noi: data.noi,
    property_taxes_annual: data.property_taxes_annual,
    tenancy_type: (data.tenancy_type as any) || null,
    sale_status: (data.sale_status as any) || (data.listing_type === 'sale' ? 'available' : null),
    current_lease_tenant: data.current_lease_tenant || '',
    current_lease_expiration: data.current_lease_expiration || '',
    current_lease_rent: data.current_lease_rent,
    video_url: data.video_url || '',
    contact_name: data.contact_name || '',
    contact_phone: data.contact_phone || '',
    full_address: data.full_address || '',
    cross_street_a: data.cross_street_a || '',
    cross_street_b: data.cross_street_b || '',
    neighborhood: data.neighborhood || '',
    latitude: data.latitude,
    longitude: data.longitude,
    city: 'Brooklyn',
    state: 'NY',
    zip_code: '',
    unit_number: '',
    admin_listing_type_display: data.admin_listing_type_display || 'agent',
    is_featured: !!data.is_featured,
    terms_agreed: true,
  };
}

export function EditCommercialListingWizard() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const [loadingListing, setLoadingListing] = useState(true);
  const [originalListing, setOriginalListing] = useState<CommercialListing | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [mediaToDelete, setMediaToDelete] = useState<string[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const wizard = useWizardState(user?.id ?? null);

  const isSale = wizard.selectedPath === 'commercial_sale';

  // Load existing commercial listing
  useEffect(() => {
    if (!id) return;
    commercialListingsService
      .getCommercialListing(id, user?.id)
      .then(data => {
        if (!data) {
          navigate('/account?tab=listings');
          return;
        }
        setOriginalListing(data);
        const loadedMedia: MediaFile[] = (data.listing_images || []).map(img => ({
          id: img.id,
          type: 'image' as const,
          url: img.image_url,
          is_featured: img.is_featured,
          isExisting: true,
        }));
        setMediaFiles(loadedMedia);
      })
      .catch(() => navigate('/account?tab=listings'))
      .finally(() => setLoadingListing(false));
  }, [id, user?.id]);

  // Seed wizard state
  useEffect(() => {
    if (!originalListing || seeded || !wizard.initialized) return;

    const path = originalListing.listing_type === 'sale' ? 'commercial_sale' : 'commercial_lease';
    wizard.setSelectedPath(path);

    const seededForm = commercialListingToFormData(originalListing);
    wizard.setCommercialFormData(seededForm);

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

    const neighborhood = originalListing.neighborhood || '';
    if (neighborhood && !STANDARD_NEIGHBORHOODS.includes(neighborhood)) {
      wizard.setNeighborhoodSelectValue('other');
      wizard.setCustomNeighborhoodInput(neighborhood);
    } else {
      wizard.setNeighborhoodSelectValue(neighborhood);
      wizard.setCustomNeighborhoodInput('');
    }

    if (originalListing.latitude && originalListing.longitude) {
      wizard.setIsLocationConfirmed(true);
    }

    wizard.setHighWaterStep(COMMERCIAL_STEP_LABELS.length - 1);
    setSeeded(true);
  }, [originalListing, wizard.initialized, seeded]);

  // Ownership check
  useEffect(() => {
    if (!originalListing || !user || !profile) return;
    const isOwner = user.id === originalListing.user_id;
    const isAdmin = profile.is_admin;
    if (!isOwner && !isAdmin) {
      navigate('/account?tab=listings');
    }
  }, [originalListing, user, profile]);

  // Media handlers
  const handleMediaAdd = async (files: File[]) => {
    setUploadingMedia(true);
    try {
      const newFiles: MediaFile[] = files
        .filter(f => f.type.startsWith('image/'))
        .map(f => ({
          id: `${Date.now()}-${Math.random()}`,
          type: 'image' as const,
          file: f,
          url: URL.createObjectURL(f),
          is_featured: false,
          originalName: f.name,
        }));
      if (newFiles.length > 0 && !mediaFiles.some(m => m.is_featured)) {
        newFiles[0].is_featured = true;
      }
      setMediaFiles(prev => [...prev, ...newFiles]);
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleMediaRemove = (mediaId: string) => {
    setMediaFiles(prev => {
      const found = prev.find(m => m.id === mediaId);
      if (found?.isExisting) {
        setMediaToDelete(d => [...d, mediaId]);
      }
      const filtered = prev.filter(m => m.id !== mediaId);
      if (!filtered.some(m => m.is_featured) && filtered.length > 0) {
        filtered[0] = { ...filtered[0], is_featured: true };
      }
      return filtered;
    });
  };

  const handleSetFeatured = (mediaId: string) => {
    setMediaFiles(prev => prev.map(m => ({ ...m, is_featured: m.id === mediaId })));
  };

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

  const handleSubmit = async () => {
    if (!user) { setShowAuthModal(true); return; }
    if (!id || !originalListing) return;
    setSubmitLoading(true);
    setSubmitError(null);

    try {
      const fd = wizard.commercialFormData;

      // Delete removed existing images
      const existingImageIds = (originalListing.listing_images || []).map(i => i.id);
      for (const mediaId of mediaToDelete) {
        if (existingImageIds.includes(mediaId)) {
          const img = originalListing.listing_images?.find(i => i.id === mediaId);
          if (img) {
            await commercialListingsService.deleteCommercialListingImage(mediaId, img.image_url);
          }
        }
      }

      // Update featured flag on retained existing images
      const retainedExisting = mediaFiles.filter(m => m.isExisting && !mediaToDelete.includes(m.id));
      for (const m of retainedExisting) {
        await commercialListingsService.updateCommercialListingImage(m.id, {
          is_featured: m.is_featured,
        });
      }

      // Upload newly added images
      const newImages = mediaFiles.filter(m => !m.isExisting && m.file);
      for (let i = 0; i < newImages.length; i++) {
        const mf = newImages[i];
        if (!mf.file) continue;
        const url = await commercialListingsService.uploadCommercialListingImage(mf.file, id);
        await commercialListingsService.addCommercialListingImage(id, url, mf.is_featured, retainedExisting.length + i);
      }

      // Build update payload
      const updatePayload = {
        listing_type: isSale ? 'sale' as const : 'rental' as const,
        title: fd.title || originalListing.title,
        description: fd.description || null,
        neighborhood: wizard.resolvedNeighborhood || fd.neighborhood || null,
        full_address: fd.full_address || null,
        cross_street_a: wizard.crossStreetAFeature?.streetName || fd.cross_street_a || null,
        cross_street_b: wizard.crossStreetBFeature?.streetName || fd.cross_street_b || null,
        latitude: fd.latitude,
        longitude: fd.longitude,
        price: !isSale && !fd.call_for_price ? fd.price : null,
        asking_price: isSale && !fd.call_for_price ? fd.asking_price : null,
        call_for_price: fd.call_for_price,
        contact_name: fd.contact_name,
        contact_phone: fd.contact_phone,
        admin_listing_type_display: fd.admin_listing_type_display || null,
        video_url: fd.video_url || null,
        commercial_space_type: fd.commercial_space_type,
        commercial_subtype: fd.commercial_subtype,
        available_sf: fd.available_sf,
        price_per_sf_year: !isSale ? fd.price_per_sf_year : null,
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
        sale_status: isSale ? (fd.sale_status || 'available') : null,
        current_lease_tenant: fd.current_lease_tenant || null,
        current_lease_expiration: fd.current_lease_expiration || null,
        current_lease_rent: fd.current_lease_rent,
      };

      await commercialListingsService.updateCommercialListing(id, updatePayload as any);

      navigate(`/account?tab=listings&updated=${id}`);
    } catch (err: any) {
      Sentry.captureException(err);
      setSubmitError(err?.message || 'Something went wrong. Please try again.');
      setSubmitLoading(false);
    }
  };

  if (loadingListing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-600" />
      </div>
    );
  }

  if (!originalListing) return null;

  const totalSteps = COMMERCIAL_STEP_LABELS.length;

  return (
    <WizardUIContext.Provider value={{ currentStep: wizard.currentStep, totalSteps, lastSavedAt: wizard.lastSavedAt }}>
      <>
        <WizardBreadcrumb
          currentStep={wizard.currentStep}
          highWaterStep={wizard.highWaterStep}
          onGoToStep={handleGoToStep}
          stepLabels={COMMERCIAL_STEP_LABELS}
        />

        <div className="max-w-5xl mx-auto px-4 pt-4 pb-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/account?tab=listings')}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Cancel
              </button>
              <h1 className="text-lg font-bold text-gray-900">Edit Listing</h1>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-accent-50 text-accent-700 border border-accent-200 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-500 flex-shrink-0" />
                {isSale ? 'Commercial · For sale' : 'Commercial · For rent'}
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex gap-8 items-start">
            <div className="flex-1 min-w-0">
              <CommercialStepsRouter
                currentStep={wizard.currentStep}
                formData={wizard.commercialFormData}
                updateFormData={wizard.updateCommercialFormData}
                isSale={isSale}
                onNext={handleNext}
                onBack={handleBack}
                mediaFiles={mediaFiles}
                uploadingMedia={uploadingMedia}
                onMediaAdd={handleMediaAdd}
                onMediaRemove={handleMediaRemove}
                onSetFeatured={handleSetFeatured}
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
                loading={submitLoading}
                submitError={submitError}
                onSubmit={handleSubmit}
                profile={profile ?? null}
              />
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
