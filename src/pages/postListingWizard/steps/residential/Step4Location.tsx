import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import { GoogleStreetAutocomplete, GoogleStreetFeature } from '../../../../components/listing/GoogleStreetAutocomplete';
import { LocationPicker } from '../../../../components/listing/LocationPicker';
import { StepTips } from '../../StepTips';

const TIPS = {
  heading: 'Setting your location',
  bullets: [
    'Enter the two cross streets closest to the unit (e.g. "Ocean Ave & Ave J").',
    'Cross streets are the standard format for Brooklyn rentals — your exact address is never shown publicly.',
    'Use the map to drag the pin to the exact spot.',
    'Pick the neighborhood that best describes where the unit is located.',
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

  const resolvedNeighborhood =
    neighborhoodSelectValue === 'other' ? customNeighborhoodInput.trim() : neighborhoodSelectValue;

  const canContinue =
    !!crossStreetAFeature &&
    !!crossStreetBFeature &&
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

  return (
    <div className="flex gap-8 items-start">
      <div className="flex-1 min-w-0 space-y-5">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Location</h2>
          <p className="text-sm text-gray-500 mb-5">Enter the cross streets and confirm the map pin</p>

          {/* Cross Streets */}
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

          {/* Map */}
          <div className="mb-5">
            <p className="text-sm text-gray-500 mb-3">
              Verify and confirm the pin location on the map.
            </p>
            <LocationPicker
              crossStreets={formData.location}
              crossStreetAFeature={crossStreetAFeature}
              crossStreetBFeature={crossStreetBFeature}
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

          {/* Neighborhood — below map */}
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
            {!canContinue && (crossStreetAFeature || crossStreetBFeature) && (
              <p className="text-xs text-gray-400">
                {!crossStreetAFeature || !crossStreetBFeature
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
