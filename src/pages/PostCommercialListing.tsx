import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { Building2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { INITIAL_COMMERCIAL_FORM_DATA } from "./postCommercial/commercialTypes";
import type { CommercialListingFormData } from "./postCommercial/commercialTypes";
import type { CommercialSpaceType, CommercialSubtype } from "../config/supabase";
import { commercialListingsService } from "../services/commercialListings";
import { emailService } from "../services/email";
import { getAdminActiveDays, getExpirationDate } from "../services/listings";
import { TypeSelector } from "./postCommercial/TypeSelector";
import { UniversalFields } from "./postCommercial/UniversalFields";
import { SpaceDetailsSection } from "./postCommercial/SpaceDetailsSection";
import { BuildingDetailsSection } from "./postCommercial/BuildingDetailsSection";
import { LeaseTermsSection } from "./postCommercial/LeaseTermsSection";
import { SaleFinancialsSection } from "./postCommercial/SaleFinancialsSection";
import { ReviewSubmitSection } from "./postCommercial/ReviewSubmitSection";
import type { MediaFile } from "../components/shared/MediaUploader";
import type { GoogleStreetFeature } from "../components/listing/GoogleStreetAutocomplete";
import { TYPE_SPECIFIC_FIELD_KEYS } from "./postCommercial/typeFieldConfigs";

const TYPE_SPECIFIC_NULL_RESET: Partial<CommercialListingFormData> = {
  frontage_ft: null,
  corner_location: null as any,
  foot_traffic_vpd: null,
  signage_rights: null as any,
  ada_accessible: null as any,
  previous_use: "",
  seating_capacity: null,
  kitchen_exhaust: null as any,
  grease_trap: null as any,
  gas_line: null as any,
  liquor_license_transferable: null as any,
  ventilation: null as any,
  private_offices: null,
  conference_rooms: null,
  building_class: null,
  layout_type: "",
  natural_light: null as any,
  plumbing_wet_columns: null as any,
  clear_height_ft: null,
  loading_docks: null,
  drive_in_doors: null,
  three_phase_power: null as any,
  rail_access: null as any,
  column_spacing: "",
  office_warehouse_ratio: "",
  floor_load_capacity: "",
  truck_court_depth: "",
  electrical_amps: null,
  electrical_voltage: "",
  crane_capacity: "",
  sprinkler_type: "",
  use_breakdown: "",
  unit_count: null,
  number_of_floors: null,
  permitted_uses_commercial: "",
  occupancy_limit: null,
  separate_entrance: null as any,
  capacity_min: null,
  capacity_max: null,
  waiting_room: null as any,
  moisture_waterproofing: null as any,
};

function hasTypeSpecificData(
  formData: CommercialListingFormData,
  spaceType: CommercialSpaceType
): boolean {
  const keys = TYPE_SPECIFIC_FIELD_KEYS[spaceType] || [];
  for (const key of keys) {
    const val = (formData as any)[key];
    if (val !== null && val !== undefined && val !== "" && val !== false) {
      return true;
    }
  }
  return false;
}

export function PostCommercialListing() {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState<CommercialListingFormData>({
    ...INITIAL_COMMERCIAL_FORM_DATA,
    listing_type: "rental",
  });

  const [selectedType, setSelectedType] = useState<CommercialSpaceType | "">("");
  const [locationMode, setLocationMode] = useState<"address" | "cross_streets">("address");
  const [crossStreetAFeature, setCrossStreetAFeature] = useState<GoogleStreetFeature | null>(null);
  const [crossStreetBFeature, setCrossStreetBFeature] = useState<GoogleStreetFeature | null>(null);
  const [isLocationConfirmed, setIsLocationConfirmed] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [showTypeResetConfirm, setShowTypeResetConfirm] = useState(false);
  const [pendingTypeChange, setPendingTypeChange] = useState<CommercialSpaceType | null>(null);

  const pricePerSfManuallyEdited = useRef(false);

  // Pre-fill contact info from profile
  useEffect(() => {
    if (profile) {
      setFormData((prev) => ({
        ...prev,
        contact_name: profile.full_name || prev.contact_name,
        contact_phone: profile.phone || prev.contact_phone,
      }));
    }
  }, [profile]);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  // Auto-calculate price_per_sf_year
  useEffect(() => {
    if (pricePerSfManuallyEdited.current) return;
    if (
      formData.listing_type === "rental" &&
      formData.price &&
      formData.price > 0 &&
      formData.available_sf &&
      formData.available_sf > 0
    ) {
      const calculated = parseFloat(
        ((formData.price * 12) / formData.available_sf).toFixed(2)
      );
      setFormData((prev) => ({ ...prev, price_per_sf_year: calculated }));
    }
  }, [formData.price, formData.available_sf, formData.listing_type]);

  const handleFormChange = (updates: Partial<CommercialListingFormData>) => {
    if ("price_per_sf_year" in updates) {
      pricePerSfManuallyEdited.current = true;
    }
    setFormData((prev) => ({ ...prev, ...updates }));
    // Clear errors for changed fields
    const clearedErrors: Partial<Record<string, string>> = {};
    for (const key of Object.keys(updates)) {
      clearedErrors[key] = undefined;
    }
    setErrors((prev) => ({ ...prev, ...clearedErrors }));
  };

  const handleTypeChange = (type: CommercialSpaceType) => {
    if (selectedType && selectedType !== type && hasTypeSpecificData(formData, selectedType as CommercialSpaceType)) {
      setPendingTypeChange(type);
      setShowTypeResetConfirm(true);
      return;
    }
    applyTypeChange(type);
  };

  const applyTypeChange = (type: CommercialSpaceType) => {
    setSelectedType(type);
    setFormData((prev) => ({
      ...prev,
      commercial_space_type: type,
      commercial_subtype: null,
      ...TYPE_SPECIFIC_NULL_RESET,
    }));
    pricePerSfManuallyEdited.current = false;
  };

  const handleSubtypeChange = (subtype: CommercialSubtype | null) => {
    setFormData((prev) => ({ ...prev, commercial_subtype: subtype }));
  };

  const handleMediaAdd = async (files: File[]) => {
    setUploadingMedia(true);
    try {
      const newFiles: MediaFile[] = files
        .filter((file) => {
          const isImage = file.type.startsWith("image/");
          const isVideo =
            file.type === "video/mp4" ||
            file.type === "video/webm" ||
            file.type === "video/quicktime";
          return isImage || isVideo;
        })
        .map((file) => ({
          id: `${Date.now()}-${Math.random()}`,
          type: file.type.startsWith("image/") ? ("image" as const) : ("video" as const),
          file,
          url: URL.createObjectURL(file),
          is_featured: false,
          originalName: file.name,
        }));

      if (newFiles.length > 0 && !mediaFiles.some((m) => m.is_featured)) {
        newFiles[0].is_featured = true;
      }

      setMediaFiles((prev) => [...prev, ...newFiles]);
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleMediaRemove = (id: string) => {
    setMediaFiles((prev) => {
      const filtered = prev.filter((m) => m.id !== id);
      if (!filtered.some((m) => m.is_featured) && filtered.length > 0) {
        filtered[0] = { ...filtered[0], is_featured: true };
      }
      return filtered;
    });
  };

  const handleSetFeatured = (id: string) => {
    setMediaFiles((prev) =>
      prev.map((m) => ({ ...m, is_featured: m.id === id }))
    );
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<string, string>> = {};

    if (!selectedType) {
      newErrors.commercial_space_type = "Please select a space type";
    }

    if (!formData.listing_type) {
      newErrors.listing_type = "Please select a transaction type";
    }

    if (locationMode === "address") {
      if (!formData.full_address) {
        newErrors.full_address = "Please enter a street address";
      }
    } else {
      if (!crossStreetAFeature || !crossStreetBFeature) {
        newErrors.location = "Please enter both cross streets";
      }
    }

    if (!formData.neighborhood) {
      newErrors.neighborhood = "Please select a neighborhood";
    }

    if (!formData.latitude || !formData.longitude) {
      newErrors.location = "Please confirm the map location using 'Find on Map' or 'Set Pin Location'";
    }

    if (!formData.call_for_price) {
      if (formData.listing_type === "rental" && (!formData.price || formData.price <= 0)) {
        newErrors.price = "Please enter a monthly rent or check 'Contact for pricing'";
      }
      if (formData.listing_type === "sale" && (!formData.asking_price || formData.asking_price <= 0)) {
        newErrors.asking_price = "Please enter an asking price or check 'Contact for pricing'";
      }
    }

    if (!formData.contact_name.trim()) {
      newErrors.contact_name = "Contact name is required";
    }
    if (!formData.contact_phone.trim()) {
      newErrors.contact_phone = "Contact phone is required";
    }

    if (!formData.available_sf || formData.available_sf <= 0) {
      newErrors.available_sf = "Available SF is required";
    }

    if (!formData.terms_agreed) {
      newErrors.terms_agreed = "Please agree to the terms";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!validate()) {
      const firstErrorKey = Object.keys(errors)[0];
      const el = document.querySelector(`[data-field="${firstErrorKey}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (!user) return;

    setLoading(true);
    try {
      const { rentalDays, saleDays } = await getAdminActiveDays();
      const activeDays =
        formData.listing_type === "sale" ? saleDays : rentalDays;
      const expiresAt = getExpirationDate(
        formData.listing_type as "rental" | "sale",
        formData.listing_type === "sale" ? "available" : undefined,
        activeDays
      );

      const cross_street_a =
        locationMode === "cross_streets" ? (crossStreetAFeature?.streetName || null) : null;
      const cross_street_b =
        locationMode === "cross_streets" ? (crossStreetBFeature?.streetName || null) : null;

      const autoTitle =
        formData.title.trim() ||
        [
          formData.full_address || (cross_street_a && cross_street_b ? `${cross_street_a} & ${cross_street_b}` : ""),
          selectedType
            ? selectedType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
            : "",
        ]
          .filter(Boolean)
          .join(" — ");

      const payload = {
        user_id: user.id,
        agency_id: null,
        listing_type: formData.listing_type as "rental" | "sale",
        is_commercial: true,
        title: autoTitle || null,
        description: formData.description || null,
        neighborhood: formData.neighborhood || null,
        full_address: locationMode === "address" ? formData.full_address || null : null,
        cross_street_a,
        cross_street_b,
        latitude: formData.latitude,
        longitude: formData.longitude,
        price: formData.listing_type === "rental" && !formData.call_for_price ? formData.price : null,
        asking_price: formData.listing_type === "sale" && !formData.call_for_price ? formData.asking_price : null,
        call_for_price: formData.call_for_price,
        contact_name: formData.contact_name,
        contact_phone: formData.contact_phone,
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
        admin_listing_type_display: formData.admin_listing_type_display || null,
        video_url: null,
        video_thumbnail_url: null,
        commercial_space_type: selectedType as CommercialSpaceType,
        commercial_subtype: formData.commercial_subtype,
        available_sf: formData.available_sf,
        price_per_sf_year: formData.listing_type === "rental" ? formData.price_per_sf_year : null,
        lease_type: formData.lease_type,
        build_out_condition: formData.build_out_condition,
        floor_level: formData.floor_level || null,
        ceiling_height_ft: formData.ceiling_height_ft,
        frontage_ft: formData.frontage_ft,
        clear_height_ft: formData.clear_height_ft,
        loading_docks: formData.loading_docks,
        drive_in_doors: formData.drive_in_doors,
        building_class: formData.building_class,
        exam_rooms: formData.exam_rooms,
        kitchen_exhaust: (formData.kitchen_exhaust as any) === false ? false : (formData.kitchen_exhaust as any) === true ? true : null,
        grease_trap: (formData.grease_trap as any) === false ? false : (formData.grease_trap as any) === true ? true : null,
        corner_location: (formData.corner_location as any) === false ? false : (formData.corner_location as any) === true ? true : null,
        three_phase_power: (formData.three_phase_power as any) === false ? false : (formData.three_phase_power as any) === true ? true : null,
        private_offices: formData.private_offices,
        ada_accessible: (formData.ada_accessible as any) === false ? false : (formData.ada_accessible as any) === true ? true : null,
        separate_entrance: (formData.separate_entrance as any) === false ? false : (formData.separate_entrance as any) === true ? true : null,
        previous_use: formData.previous_use || null,
        seating_capacity: formData.seating_capacity,
        gas_line: (formData.gas_line as any) === false ? false : (formData.gas_line as any) === true ? true : null,
        total_building_sf: formData.total_building_sf,
        construction_type: formData.construction_type || null,
        parking_spaces: formData.parking_spaces,
        parking_type: formData.parking_type || null,
        parking_ratio: formData.parking_ratio || null,
        signage_rights: (formData.signage_rights as any) === false ? false : (formData.signage_rights as any) === true ? true : null,
        private_entrance: (formData.private_entrance as any) === false ? false : (formData.private_entrance as any) === true ? true : null,
        elevator_count: formData.elevator_count,
        freight_elevator_count: formData.freight_elevator_count,
        zoning_code: formData.zoning_code || null,
        sprinkler_type: formData.sprinkler_type || null,
        electrical_amps: formData.electrical_amps,
        electrical_voltage: formData.electrical_voltage || null,
        rail_access: (formData.rail_access as any) === false ? false : (formData.rail_access as any) === true ? true : null,
        column_spacing: formData.column_spacing || null,
        hvac_type: formData.hvac_type || null,
        foot_traffic_vpd: formData.foot_traffic_vpd,
        liquor_license_transferable: (formData.liquor_license_transferable as any) === false ? false : (formData.liquor_license_transferable as any) === true ? true : null,
        conference_rooms: formData.conference_rooms,
        capacity_min: formData.capacity_min,
        capacity_max: formData.capacity_max,
        layout_type: formData.layout_type || null,
        plumbing_wet_columns: (formData.plumbing_wet_columns as any) === false ? false : (formData.plumbing_wet_columns as any) === true ? true : null,
        waiting_room: (formData.waiting_room as any) === false ? false : (formData.waiting_room as any) === true ? true : null,
        natural_light: (formData.natural_light as any) === false ? false : (formData.natural_light as any) === true ? true : null,
        ventilation: (formData.ventilation as any) === false ? false : (formData.ventilation as any) === true ? true : null,
        moisture_waterproofing: (formData.moisture_waterproofing as any) === false ? false : (formData.moisture_waterproofing as any) === true ? true : null,
        outdoor_space: formData.outdoor_space || null,
        permitted_uses_commercial: formData.permitted_uses_commercial || null,
        use_restrictions: formData.use_restrictions || null,
        occupancy_limit: formData.occupancy_limit,
        office_warehouse_ratio: formData.office_warehouse_ratio || null,
        floor_load_capacity: formData.floor_load_capacity || null,
        truck_court_depth: formData.truck_court_depth || null,
        crane_capacity: formData.crane_capacity || null,
        use_breakdown: formData.use_breakdown || null,
        current_rental_income: formData.current_rental_income,
        year_built: formData.year_built,
        year_renovated: formData.year_renovated,
        number_of_floors: formData.number_of_floors,
        unit_count: formData.unit_count,
        lease_term_text: formData.lease_term_text || null,
        cam_per_sf: formData.cam_per_sf,
        expense_stop_per_sf: formData.expense_stop_per_sf,
        ti_allowance_per_sf: formData.ti_allowance_per_sf,
        renewal_options: formData.renewal_options || null,
        escalation: formData.escalation || null,
        sublease: (formData.sublease as any) === false ? false : (formData.sublease as any) === true ? true : null,
        security_deposit: formData.security_deposit || null,
        available_date: formData.available_date || null,
        cap_rate: formData.cap_rate,
        noi: formData.noi,
        property_taxes_annual: formData.property_taxes_annual,
        tenancy_type: formData.tenancy_type,
        current_lease_tenant: formData.current_lease_tenant || null,
        current_lease_expiration: formData.current_lease_expiration || null,
        current_lease_rent: formData.current_lease_rent,
      };

      const listing = await commercialListingsService.createCommercialListing(payload as any);

      // Upload images
      const imageFiles = mediaFiles.filter((m) => m.type === "image" && m.file);
      for (let i = 0; i < imageFiles.length; i++) {
        const mediaFile = imageFiles[i];
        if (!mediaFile.file) continue;
        try {
          const url = await commercialListingsService.uploadCommercialListingImage(
            mediaFile.file,
            listing.id
          );
          await commercialListingsService.addCommercialListingImage(
            listing.id,
            url,
            mediaFile.is_featured,
            i
          );
        } catch (err) {
          console.error("Failed to upload image:", err);
          Sentry.captureException(err);
        }
      }

      // Send admin notification
      const typeLabel = (selectedType as string)
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
      const locationDisplay =
        locationMode === "address"
          ? formData.full_address
          : [crossStreetAFeature?.streetName, crossStreetBFeature?.streetName]
              .filter(Boolean)
              .join(" & ");

      await emailService.sendAdminNotification(
        "New Commercial Listing Pending Approval",
        `A new commercial listing has been submitted and requires approval.\n\nType: ${typeLabel}\nLocation: ${locationDisplay || "Not specified"}\nNeighborhood: ${formData.neighborhood || "Not specified"}\nListing ID: ${listing.id}\n\nPlease review it in the admin panel.`
      );

      // Confirmation email to user
      try {
        const origin = window.location.origin;
        await emailService.sendEmail({
          to: user.email!,
          subject: `Commercial Listing Submitted — HaDirot`,
          html: `<p>Your commercial listing has been submitted and is pending approval. You will be notified once it goes live.</p><p><a href="${origin}/account">View your listings</a></p>`,
        });
      } catch (err) {
        console.warn("Failed to send confirmation email", err);
      }

      navigate("/account?tab=listings");
    } catch (err) {
      console.error("Failed to create commercial listing:", err);
      Sentry.captureException(err);
      setSubmitError(
        err instanceof Error ? err.message : "Failed to create listing. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Post Commercial Listing</h1>
              <p className="text-sm text-gray-500">Your listing will be reviewed before going live.</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 0 — Type Selector */}
          <TypeSelector
            selectedType={selectedType}
            selectedSubtype={formData.commercial_subtype}
            onTypeChange={handleTypeChange}
            onSubtypeChange={handleSubtypeChange}
          />
          {errors.commercial_space_type && (
            <p className="text-sm text-red-600 -mt-4">{errors.commercial_space_type}</p>
          )}

          {/* Sections 1 & 2 — only visible after type is selected */}
          {selectedType && (
            <>
              {/* Section 1 — Universal Fields */}
              <UniversalFields
                formData={formData}
                selectedType={selectedType}
                onFormChange={handleFormChange}
                mediaFiles={mediaFiles}
                onMediaAdd={handleMediaAdd}
                onMediaRemove={handleMediaRemove}
                onSetFeatured={handleSetFeatured}
                uploadingMedia={uploadingMedia}
                crossStreetAFeature={crossStreetAFeature}
                crossStreetBFeature={crossStreetBFeature}
                onCrossStreetAChange={setCrossStreetAFeature}
                onCrossStreetBChange={setCrossStreetBFeature}
                locationMode={locationMode}
                onLocationModeChange={setLocationMode}
                isLocationConfirmed={isLocationConfirmed}
                onLocationConfirmed={setIsLocationConfirmed}
                errors={errors}
              />

              {/* Section 2 — Space Details */}
              <SpaceDetailsSection
                formData={formData}
                selectedType={selectedType as CommercialSpaceType}
                onFormChange={handleFormChange}
                errors={errors}
              />

              {/* Section 3a — Building Details */}
              <BuildingDetailsSection
                formData={formData}
                onFormChange={handleFormChange}
              />

              {/* Section 3b — Lease Terms (rental only) */}
              {formData.listing_type === "rental" && (
                <LeaseTermsSection
                  formData={formData}
                  onFormChange={handleFormChange}
                />
              )}

              {/* Section 3c — Sale Financials (sale only) */}
              {formData.listing_type === "sale" && (
                <SaleFinancialsSection
                  formData={formData}
                  onFormChange={handleFormChange}
                />
              )}

              {/* Section 4 — Review & Submit */}
              <ReviewSubmitSection
                formData={formData}
                selectedType={selectedType}
                mediaFiles={mediaFiles}
                locationMode={locationMode}
                crossStreetAName={crossStreetAFeature?.streetName || null}
                crossStreetBName={crossStreetBFeature?.streetName || null}
                errors={errors}
                submitError={submitError}
                loading={loading}
                uploadingMedia={uploadingMedia}
                onFormChange={handleFormChange}
              />
            </>
          )}
        </form>
      </div>

      {/* Type change confirmation dialog */}
      {showTypeResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Change Space Type?</h3>
            <p className="text-sm text-gray-600 mb-6">
              Changing the space type will reset the space-specific fields you have already filled in.
              Your listing basics (location, pricing, photos, contact) will be preserved.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowTypeResetConfirm(false);
                  setPendingTypeChange(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pendingTypeChange) applyTypeChange(pendingTypeChange);
                  setShowTypeResetConfirm(false);
                  setPendingTypeChange(null);
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700"
              >
                Change Type
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
