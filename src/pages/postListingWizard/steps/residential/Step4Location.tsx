import React, { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import { GoogleStreetAutocomplete, GoogleStreetFeature } from '../../../../components/listing/GoogleStreetAutocomplete';
import { GoogleAddressAutocomplete, GooglePlaceResult } from '../../../../components/listing/GoogleAddressAutocomplete';
import { LocationPicker } from '../../../../components/listing/LocationPicker';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Location',
  bullets: [
    'Use cross streets if you want to keep your exact address private.',
    'The pin is how tenants browse — an inaccurate pin means missed leads.',
    'For cross streets, enter the intersection closest to the unit.',
  ],
};

const NEIGHBORHOOD_OPTIONS = [
  'Midwood',
  'Homecrest',
  'Marine Park',
  'Flatbush',
  'Gravesend',
  'Boro Park',
];

type AddressMode = 'cross_streets' | 'full_address';

interface Step4Props {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  onNext: () => void;
  onBack: () => void;
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

export function Step4Location({
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
}: Step4Props) {
  const [addressMode, setAddressMode] = useState<AddressMode>('cross_streets');
  const [fullAddressResult, setFullAddressResult] = useState<GooglePlaceResult | null>(null);

  // ── Cross streets handlers ──────────────────────────────────────────────────
  const handleStreetASelect = (feature: GoogleStreetFeature | null) => {
    setCrossStreetAFeature(feature);
    updateFormData({
      location: `${feature?.streetName || ''} & ${crossStreetBFeature?.streetName || ''}`.trim().replace(/^&\s*|\s*&$/, ''),
    });
    setIsLocationConfirmed(false);
  };

  const handleStreetBSelect = (feature: GoogleStreetFeature | null) => {
    setCrossStreetBFeature(feature);
    updateFormData({
      location: `${crossStreetAFeature?.streetName || ''} & ${feature?.streetName || ''}`.trim().replace(/^&\s*|\s*&$/, ''),
    });
    setIsLocationConfirmed(false);
  };

  // ── Full address handler ────────────────────────────────────────────────────
  const handleFullAddressSelect = (result: GooglePlaceResult | null) => {
    setFullAddressResult(result);
    if (result) {
      updateFormData({
        street_address: result.streetAddress,
        location: result.streetAddress,
        latitude: result.latitude,
        longitude: result.longitude,
      });
      setIsLocationConfirmed(true);
    } else {
      updateFormData({
        street_address: '',
        location: '',
        latitude: undefined,
        longitude: undefined,
      });
      setIsLocationConfirmed(false);
    }
  };

  // ── Mode toggle ─────────────────────────────────────────────────────────────
  const handleModeSwitch = (mode: AddressMode) => {
    if (mode === addressMode) return;
    setAddressMode(mode);
    // Clear whichever side we're leaving
    if (mode === 'full_address') {
      setCrossStreetAFeature(null);
      setCrossStreetBFeature(null);
      updateFormData({ location: '', latitude: undefined, longitude: undefined });
      setIsLocationConfirmed(false);
    } else {
      setFullAddressResult(null);
      updateFormData({ street_address: '', location: '', latitude: undefined, longitude: undefined });
      setIsLocationConfirmed(false);
    }
  };

  // ── Shared ──────────────────────────────────────────────────────────────────
  const resolvedNeighborhood =
    neighborhoodSelectValue === 'other' ? customNeighborhoodInput.trim() : neighborhoodSelectValue;

  const crossStreetsReady = !!crossStreetAFeature && !!crossStreetBFeature;
  const fullAddressReady = !!fullAddressResult;

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

  // What to pass to LocationPicker as crossStreets for geocoding/display
  const locationPickerCrossStreets =
    addressMode === 'full_address'
      ? `${fullAddressResult?.streetAddress || ''}, ${fullAddressResult?.city || ''}, ${fullAddressResult?.state || ''}`
      : formData.location;

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
                  ? 'Enter the two cross streets closest to the unit'
                  : 'Enter the full street address'}
              </p>
            </div>

            {/* Toggle */}
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

          {/* ── Cross Streets mode ── */}
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
                />
              </div>
            </div>
          )}

          {/* ── Full Address mode ── */}
          {addressMode === 'full_address' && (
            <div className="mb-5 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Street Address <span className="text-red-500">*</span>
                </label>
                <GoogleAddressAutocomplete
                  value={formData.street_address ?? ''}
                  onSelect={handleFullAddressSelect}
                  placeholder="e.g. 1234 Ocean Ave"
                />
              </div>
              <div className="w-40">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit / Apt
                  <span className="ml-1.5 text-xs font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.unit_number ?? ''}
                  onChange={e => updateFormData({ unit_number: e.target.value })}
                  placeholder="e.g. 2B"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
                />
              </div>
            </div>
          )}

          {/* ── Map ── */}
          <div className="mb-5">
            <p className="text-sm text-gray-500 mb-3">{showMapHint}</p>
            <LocationPicker
              crossStreets={locationPickerCrossStreets}
              crossStreetAFeature={addressMode === 'cross_streets' ? crossStreetAFeature : null}
              crossStreetBFeature={addressMode === 'cross_streets' ? crossStreetBFeature : null}
              neighborhood={resolvedNeighborhood}
              latitude={formData.latitude}
              longitude={formData.longitude}
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
            />
          </div>

          {/* ── Neighborhood ── */}
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

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <div className="flex flex-col items-end gap-1">
            {!canContinue && (crossStreetAFeature || crossStreetBFeature || fullAddressResult) && (
              <p className="text-xs text-gray-400">
                {addressMode === 'cross_streets' && (!crossStreetAFeature || !crossStreetBFeature)
                  ? 'Enter both cross streets'
                  : !resolvedNeighborhood
                  ? 'Select a neighborhood'
                  : !isLocationConfirmed
                  ? 'Confirm the map pin to continue'
                  : ''}
              </p>
            )}
            <button
              type="button"
              onClick={onNext}
              disabled={!canContinue}
              className="flex items-center gap-2 bg-accent-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <StepTips {...TIPS} />
    </div>
  );
}
