import React from "react";
import { GoogleAddressAutocomplete } from "../../components/listing/GoogleAddressAutocomplete";
import { GoogleStreetAutocomplete, GoogleStreetFeature } from "../../components/listing/GoogleStreetAutocomplete";
import { LocationPicker } from "../../components/listing/LocationPicker";
import { MediaUploader, MediaFile } from "../../components/shared/MediaUploader";
import type { CommercialListingFormData } from "./commercialTypes";
import type { CommercialSpaceType } from "../../config/supabase";
import { DESCRIPTION_PLACEHOLDERS } from "./typeFieldConfigs";

const STANDARD_NEIGHBORHOODS = [
  "Midwood",
  "Homecrest",
  "Marine Park",
  "Flatbush",
  "Gravesend",
  "Boro Park",
];

interface UniversalFieldsProps {
  formData: CommercialListingFormData;
  selectedType: CommercialSpaceType | "";
  onFormChange: (updates: Partial<CommercialListingFormData>) => void;
  mediaFiles: MediaFile[];
  onMediaAdd: (files: File[]) => Promise<void>;
  onMediaRemove: (id: string) => void;
  onSetFeatured: (id: string) => void;
  uploadingMedia: boolean;
  crossStreetAFeature: GoogleStreetFeature | null;
  crossStreetBFeature: GoogleStreetFeature | null;
  onCrossStreetAChange: (feature: GoogleStreetFeature | null) => void;
  onCrossStreetBChange: (feature: GoogleStreetFeature | null) => void;
  locationMode: "address" | "cross_streets";
  onLocationModeChange: (mode: "address" | "cross_streets") => void;
  isLocationConfirmed: boolean;
  onLocationConfirmed: (confirmed: boolean) => void;
  errors: Partial<Record<string, string>>;
}

export function UniversalFields({
  formData,
  selectedType,
  onFormChange,
  mediaFiles,
  onMediaAdd,
  onMediaRemove,
  onSetFeatured,
  uploadingMedia,
  crossStreetAFeature,
  crossStreetBFeature,
  onCrossStreetAChange,
  onCrossStreetBChange,
  locationMode,
  onLocationModeChange,
  isLocationConfirmed,
  onLocationConfirmed,
  errors,
}: UniversalFieldsProps) {
  const [neighborhoodMode, setNeighborhoodMode] = React.useState<"select" | "custom">(
    formData.neighborhood && !STANDARD_NEIGHBORHOODS.includes(formData.neighborhood)
      ? "custom"
      : "select"
  );
  const [customNeighborhood, setCustomNeighborhood] = React.useState(
    neighborhoodMode === "custom" ? formData.neighborhood : ""
  );

  const descriptionPlaceholder =
    selectedType && DESCRIPTION_PLACEHOLDERS[selectedType]
      ? DESCRIPTION_PLACEHOLDERS[selectedType]
      : "Describe the space...";

  const pricePerSfLabel =
    formData.listing_type === "rental" ? "Price per SF / Year ($)" : "";

  const handleAddressSelect = (result: import("../../components/listing/GoogleAddressAutocomplete").GooglePlaceResult | null) => {
    if (!result) {
      onFormChange({ full_address: "", latitude: null, longitude: null, city: "Brooklyn", state: "NY", zip_code: "" });
      return;
    }
    onFormChange({
      full_address: result.streetAddress,
      city: result.city || "Brooklyn",
      state: result.state || "NY",
      zip_code: result.zipCode,
      latitude: result.latitude,
      longitude: result.longitude,
    });
    onLocationConfirmed(true);
  };

  const handleNeighborhoodSelect = (value: string) => {
    if (value === "other") {
      setNeighborhoodMode("custom");
      onFormChange({ neighborhood: customNeighborhood });
    } else {
      setNeighborhoodMode("select");
      onFormChange({ neighborhood: value });
    }
  };

  const handleCustomNeighborhood = (value: string) => {
    setCustomNeighborhood(value);
    onFormChange({ neighborhood: value });
  };

  const crossStreetsValue = [
    crossStreetAFeature?.streetName,
    crossStreetBFeature?.streetName,
  ]
    .filter(Boolean)
    .join(" & ");

  return (
    <div className="space-y-6">
      {/* 1a — Listing Basics */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-5">Listing Basics</h2>

        {/* Transaction type toggle */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-2">Transaction Type *</label>
          <div className="flex gap-0 rounded-lg border border-gray-300 overflow-hidden w-fit">
            <button
              type="button"
              onClick={() => onFormChange({ listing_type: "rental" })}
              className={`px-6 py-2.5 text-sm font-medium transition-colors ${
                formData.listing_type === "rental"
                  ? "bg-teal-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              For Rent
            </button>
            <button
              type="button"
              onClick={() => onFormChange({ listing_type: "sale" })}
              className={`px-6 py-2.5 text-sm font-medium transition-colors border-l border-gray-300 ${
                formData.listing_type === "sale"
                  ? "bg-teal-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              For Sale
            </button>
          </div>
          {errors.listing_type && (
            <p className="text-xs text-red-600 mt-1">{errors.listing_type}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Listing Title
              <span className="ml-1 text-xs font-normal text-gray-400">(optional — auto-generated if blank)</span>
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => onFormChange({ title: e.target.value })}
              placeholder="e.g. Ground-Floor Retail Space on Avenue J"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
              <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => onFormChange({ description: e.target.value })}
              placeholder={descriptionPlaceholder}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm resize-none"
            />
          </div>
        </div>
      </div>

      {/* 1b — Location */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-5">
          Location <span className="text-red-500">*</span>
        </h2>

        {/* Mode toggle */}
        <div className="mb-4">
          <button
            type="button"
            onClick={() =>
              onLocationModeChange(locationMode === "address" ? "cross_streets" : "address")
            }
            className="text-sm text-teal-700 hover:underline"
          >
            {locationMode === "address"
              ? "Use cross streets instead"
              : "Use full address instead"}
          </button>
        </div>

        {locationMode === "address" ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
              <GoogleAddressAutocomplete
                value={formData.full_address}
                onSelect={handleAddressSelect}
                placeholder="e.g. 123 Avenue J, Brooklyn, NY"
              />
              {errors.full_address && (
                <p className="text-xs text-red-600 mt-1">{errors.full_address}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Suite / Unit</label>
                <input
                  type="text"
                  value={formData.unit_number}
                  onChange={(e) => onFormChange({ unit_number: e.target.value })}
                  placeholder="Suite 2B"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => onFormChange({ city: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
                <input
                  type="text"
                  value={formData.zip_code}
                  onChange={(e) => onFormChange({ zip_code: e.target.value })}
                  placeholder="11230"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street A *</label>
                <GoogleStreetAutocomplete
                  value={crossStreetAFeature}
                  onChange={onCrossStreetAChange}
                  placeholder="e.g. Avenue J"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Street B *</label>
                <GoogleStreetAutocomplete
                  value={crossStreetBFeature}
                  onChange={onCrossStreetBChange}
                  placeholder="e.g. East 15th Street"
                />
              </div>
            </div>
          </div>
        )}

        {/* Neighborhood */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Neighborhood *</label>
          <select
            value={neighborhoodMode === "custom" ? "other" : (formData.neighborhood || "")}
            onChange={(e) => handleNeighborhoodSelect(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          >
            <option value="">Select neighborhood</option>
            {STANDARD_NEIGHBORHOODS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
            <option value="other">Other (type below)</option>
          </select>
          {neighborhoodMode === "custom" && (
            <input
              type="text"
              value={customNeighborhood}
              onChange={(e) => handleCustomNeighborhood(e.target.value)}
              placeholder="Enter neighborhood name"
              className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
            />
          )}
          {errors.neighborhood && (
            <p className="text-xs text-red-600 mt-1">{errors.neighborhood}</p>
          )}
        </div>

        {/* Map */}
        <div className="mt-5">
          <LocationPicker
            crossStreets={crossStreetsValue}
            crossStreetAFeature={locationMode === "cross_streets" ? crossStreetAFeature : undefined}
            crossStreetBFeature={locationMode === "cross_streets" ? crossStreetBFeature : undefined}
            neighborhood={formData.neighborhood}
            city={formData.city}
            latitude={formData.latitude}
            longitude={formData.longitude}
            onLocationChange={(lat, lng) => onFormChange({ latitude: lat, longitude: lng })}
            onNeighborhoodChange={(neighborhood) => {
              if (neighborhoodMode !== "custom") {
                if (STANDARD_NEIGHBORHOODS.includes(neighborhood)) {
                  onFormChange({ neighborhood });
                }
              }
            }}
            onZipCodeChange={(zip_code) => onFormChange({ zip_code })}
            onCityChange={(city) => onFormChange({ city })}
            onConfirmationStatusChange={onLocationConfirmed}
            preResolvedLatitude={locationMode === "address" ? formData.latitude : null}
            preResolvedLongitude={locationMode === "address" ? formData.longitude : null}
          />
          {errors.location && (
            <p className="text-xs text-red-600 mt-1">{errors.location}</p>
          )}
        </div>
      </div>

      {/* 1c — Pricing */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-5">
          Pricing <span className="text-red-500">*</span>
        </h2>

        <label className="flex items-center gap-2 mb-4">
          <input
            type="checkbox"
            checked={formData.call_for_price}
            onChange={(e) => onFormChange({ call_for_price: e.target.checked })}
            className="h-4 w-4 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
          />
          <span className="text-sm text-gray-700">Contact for pricing (hide price)</span>
        </label>

        {!formData.call_for_price && (
          <div className="space-y-4">
            {formData.listing_type === "rental" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Monthly Rent ($) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={formData.price ?? ""}
                    onChange={(e) =>
                      onFormChange({ price: e.target.value ? Number(e.target.value) : null })
                    }
                    placeholder="e.g. 5000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
                  />
                  {errors.price && <p className="text-xs text-red-600 mt-1">{errors.price}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {pricePerSfLabel}
                    <span className="ml-1 text-xs font-normal text-gray-400">(auto-calculated, editable)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={formData.price_per_sf_year ?? ""}
                    onChange={(e) =>
                      onFormChange({
                        price_per_sf_year: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="e.g. 24.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
                  />
                </div>
              </>
            )}

            {formData.listing_type === "sale" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Asking Price ($) *
                </label>
                <input
                  type="number"
                  min={0}
                  value={formData.asking_price ?? ""}
                  onChange={(e) =>
                    onFormChange({ asking_price: e.target.value ? Number(e.target.value) : null })
                  }
                  placeholder="e.g. 2500000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
                />
                {errors.asking_price && (
                  <p className="text-xs text-red-600 mt-1">{errors.asking_price}</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 1d — Photos & Media */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Photos & Media</h2>
        <p className="text-sm text-gray-500 mb-5">Upload photos to showcase the space. Set one as the featured image.</p>
        <MediaUploader
          mediaFiles={mediaFiles}
          onMediaAdd={onMediaAdd}
          onMediaRemove={onMediaRemove}
          onSetFeatured={onSetFeatured}
          uploading={uploadingMedia}
        />
      </div>

      {/* 1e — Contact */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-5">Contact Information</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.contact_name}
              onChange={(e) => onFormChange({ contact_name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
            />
            {errors.contact_name && (
              <p className="text-xs text-red-600 mt-1">{errors.contact_name}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Phone <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={formData.contact_phone}
              onChange={(e) => onFormChange({ contact_phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
            />
            {errors.contact_phone && (
              <p className="text-xs text-red-600 mt-1">{errors.contact_phone}</p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Contact Type</label>
          <div className="flex gap-0 rounded-lg border border-gray-300 overflow-hidden w-fit">
            {(["Agent", "Owner"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => onFormChange({ admin_listing_type_display: type.toLowerCase() })}
                className={`px-5 py-2 text-sm font-medium transition-colors ${
                  (formData.admin_listing_type_display || "agent") === type.toLowerCase()
                    ? "bg-teal-600 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-50 border-l border-gray-300 first:border-l-0"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
