import React, { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { StepTips } from '../../StepTips';
import {
  GoogleStreetAutocomplete,
  GoogleStreetFeature,
} from '../../../../components/listing/GoogleStreetAutocomplete';

const TIPS = {
  heading: 'Location',
  bullets: [
    'A precise address helps tenants find the space and powers the map pin.',
    'No exact address yet? Enter the two nearest cross streets instead.',
    'Choose the neighborhood tenants search by — it feeds the neighborhood filter.',
  ],
};
import {
  GoogleAddressAutocomplete,
  GooglePlaceResult,
} from '../../../../components/listing/GoogleAddressAutocomplete';
import { LocationPicker } from '../../../../components/listing/LocationPicker';
import type { CommercialStepProps } from './_StepShell';

const NEIGHBORHOOD_OPTIONS = [
  'Midwood',
  'Homecrest',
  'Marine Park',
  'Flatbush',
  'Gravesend',
  'Boro Park',
];

type AddressMode = 'cross_streets' | 'full_address';

interface Props extends CommercialStepProps {
  crossStreetAFeature: GoogleStreetFeature | null;
  setCrossStreetAFeature: (f: GoogleStreetFeature | null) => void;
  crossStreetBFeature: GoogleStreetFeature | null;
  setCrossStreetBFeature: (f: GoogleStreetFeature | null) => void;
  neighborhoodSelectValue: string;
  setNeighborhoodSelectValue: (v: string) => void;
  customNeighborhoodInput: string;
  setCustomNeighborhoodInput: (v: string) => void;
  isLocationConfirmed: boolean;
  setIsLocationConfirmed: (v: boolean) => void;
}

export function Step3CommercialLocation({
  formData,
  updateFormData,
  onNext,
  onBack,
  crossStreetAFeature,
  setCrossStreetAFeature,
  crossStreetBFeature,
  setCrossStreetBFeature,
  neighborhoodSelectValue,
  setNeighborhoodSelectValue,
  customNeighborhoodInput,
  setCustomNeighborhoodInput,
  isLocationConfirmed,
  setIsLocationConfirmed,
}: Props) {
  // Default to exact address; switch to cross-streets for off-market listings
  const [addressMode, setAddressMode] = useState<AddressMode>('full_address');
  const [fullAddressResult, setFullAddressResult] = useState<GooglePlaceResult | null>(null);
  const [intersectionError, setIntersectionError] = useState<string | null>(null);

  const handleStreetASelect = (feature: GoogleStreetFeature | null) => {
    setCrossStreetAFeature(feature);
    updateFormData({
      cross_street_a: feature?.streetName || '',
      full_address: '',
    });
    setIsLocationConfirmed(false);
    setIntersectionError(null);
  };

  const handleStreetBSelect = (feature: GoogleStreetFeature | null) => {
    setCrossStreetBFeature(feature);
    updateFormData({
      cross_street_b: feature?.streetName || '',
      full_address: '',
    });
    setIsLocationConfirmed(false);
    setIntersectionError(null);
  };

  const handleFullAddressSelect = (result: GooglePlaceResult | null) => {
    setFullAddressResult(result);
    if (result) {
      updateFormData({
        full_address: result.streetAddress,
        latitude: result.latitude,
        longitude: result.longitude,
      });
      setIsLocationConfirmed(false);
    } else {
      updateFormData({ full_address: '', latitude: null, longitude: null });
      setIsLocationConfirmed(false);
    }
  };

  const handleModeSwitch = (mode: AddressMode) => {
    if (mode === addressMode) return;
    setAddressMode(mode);
    setIntersectionError(null);
    if (mode === 'full_address') {
      setCrossStreetAFeature(null);
      setCrossStreetBFeature(null);
      updateFormData({ cross_street_a: '', cross_street_b: '', latitude: null, longitude: null });
      setIsLocationConfirmed(false);
    } else {
      setFullAddressResult(null);
      updateFormData({ full_address: '', latitude: null, longitude: null });
      setIsLocationConfirmed(false);
    }
  };

  const resolvedNeighborhood =
    neighborhoodSelectValue === 'other' ? customNeighborhoodInput.trim() : neighborhoodSelectValue;

  const crossStreetsReady = !!crossStreetAFeature && !!crossStreetBFeature;
  const fullAddressReady = !!(formData.full_address?.trim() && formData.latitude && formData.longitude);

  const canContinue =
    (addressMode === 'cross_streets' ? crossStreetsReady : fullAddressReady) &&
    !!resolvedNeighborhood &&
    !!formData.latitude &&
    !!formData.longitude &&
    isLocationConfirmed;

  const handleNeighborhoodSelect = (value: string) => {
    setNeighborhoodSelectValue(value);
    if (value !== 'other') {
      updateFormData({ neighborhood: value });
    }
  };

  const locationPickerCrossStreets =
    addressMode === 'full_address'
      ? (fullAddressResult
          ? `${fullAddressResult.streetAddress}, ${fullAddressResult.city}, ${fullAddressResult.state}`
          : formData.full_address || '')
      : `${formData.cross_street_a} & ${formData.cross_street_b}`.trim().replace(/^&\s*|\s*&$/, '');

  const showMapHint =
    addressMode === 'cross_streets'
      ? 'Verify and confirm the pin location on the map.'
      : 'Verify the pin dropped at your address — drag to adjust if needed.';

  return (
    <div className="flex gap-8 items-start">
    <div className="flex-1 min-w-0 space-y-5">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Location</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {addressMode === 'cross_streets'
                ? 'Enter the two cross streets of the nearest intersection'
                : 'Enter the full street address'}
            </p>
          </div>
          <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => handleModeSwitch('cross_streets')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                addressMode === 'cross_streets'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Cross streets
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('full_address')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                addressMode === 'full_address'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Exact address
            </button>
          </div>
        </div>

        {addressMode === 'cross_streets' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Street A <span className="text-red-500">*</span>
              </label>
              <GoogleStreetAutocomplete
                value={crossStreetAFeature?.streetName}
                onSelect={handleStreetASelect}
                placeholder="e.g. Ocean Ave"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Street B <span className="text-red-500">*</span>
              </label>
              <GoogleStreetAutocomplete
                value={crossStreetBFeature?.streetName}
                onSelect={handleStreetBSelect}
                placeholder="e.g. Ave J"
                nearViewport={crossStreetAFeature?.viewport}
                invalid={!!intersectionError && !!crossStreetBFeature}
                errorMessage={intersectionError}
              />
            </div>
          </div>
        )}

        {addressMode === 'full_address' && (
          <div className="mb-5">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Street Address <span className="text-red-500">*</span>
            </label>
            <GoogleAddressAutocomplete
              value={formData.full_address ?? ''}
              onSelect={handleFullAddressSelect}
              placeholder="e.g. 1234 Ocean Ave"
            />
          </div>
        )}

        <div className="mb-5">
          <p className="text-sm text-gray-500 mb-3">{showMapHint}</p>
          <LocationPicker
            crossStreets={locationPickerCrossStreets}
            crossStreetAFeature={addressMode === 'cross_streets' ? crossStreetAFeature : undefined}
            crossStreetBFeature={addressMode === 'cross_streets' ? crossStreetBFeature : undefined}
            neighborhood={resolvedNeighborhood}
            latitude={formData.latitude ?? undefined}
            longitude={formData.longitude ?? undefined}
            preResolvedLatitude={addressMode === 'full_address'
              ? (fullAddressResult?.latitude ?? formData.latitude ?? undefined)
              : undefined}
            preResolvedLongitude={addressMode === 'full_address'
              ? (fullAddressResult?.longitude ?? formData.longitude ?? undefined)
              : undefined}
            hideFindOnMap={addressMode === 'full_address'}
            initialConfirmed={isLocationConfirmed}
            onLocationChange={(lat, lng) => updateFormData({ latitude: lat, longitude: lng })}
            onNeighborhoodChange={n => {
              if (n && neighborhoodSelectValue !== 'other') {
                const matched = NEIGHBORHOOD_OPTIONS.find(o => o.toLowerCase() === n.toLowerCase());
                if (matched) {
                  setNeighborhoodSelectValue(matched);
                  updateFormData({ neighborhood: matched });
                } else {
                  setNeighborhoodSelectValue('other');
                  setCustomNeighborhoodInput(n);
                  updateFormData({ neighborhood: n });
                }
              }
            }}
            onConfirmationStatusChange={confirmed => setIsLocationConfirmed(confirmed)}
            onGeocodeStatusChange={err => setIntersectionError(err)}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Neighborhood <span className="text-red-500">*</span>
          </label>
          <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-xl">
            {NEIGHBORHOOD_OPTIONS.map(n => (
              <label
                key={n}
                className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={neighborhoodSelectValue === n}
                  onChange={() => handleNeighborhoodSelect(neighborhoodSelectValue === n ? '' : n)}
                  className="h-5 w-5 text-accent-500 focus:ring-accent-500 border-gray-300 rounded"
                />
                <span className="ml-3 text-sm text-gray-700">{n}</span>
              </label>
            ))}
            <label className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer">
              <input
                type="checkbox"
                checked={neighborhoodSelectValue === 'other'}
                onChange={() => handleNeighborhoodSelect(neighborhoodSelectValue === 'other' ? '' : 'other')}
                className="h-5 w-5 text-accent-500 focus:ring-accent-500 border-gray-300 rounded"
              />
              <span className="ml-3 text-sm text-gray-700">Other</span>
            </label>
          </div>
          {neighborhoodSelectValue === 'other' && (
            <input
              type="text"
              value={customNeighborhoodInput}
              onChange={e => {
                const val = e.target.value.slice(0, 200);
                setCustomNeighborhoodInput(val);
                updateFormData({ neighborhood: val });
              }}
              placeholder="Enter neighborhood"
              maxLength={200}
              className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
            />
          )}
        </div>
      </div>

      {!canContinue && (crossStreetAFeature || crossStreetBFeature || fullAddressResult || formData.full_address) && (
        <p className="text-xs text-gray-400 text-right -mb-2">
          {addressMode === 'cross_streets' && (!crossStreetAFeature || !crossStreetBFeature)
            ? 'Enter both cross streets'
            : !resolvedNeighborhood
            ? 'Select a neighborhood'
            : !isLocationConfirmed
            ? 'Confirm the map pin to continue'
            : ''}
        </p>
      )}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 py-2.5 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          className="flex items-center gap-2 bg-accent-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
    <StepTips {...TIPS} />
    </div>
  );
}
