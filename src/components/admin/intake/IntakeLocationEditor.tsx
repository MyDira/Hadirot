import React, { useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import {
  GoogleStreetAutocomplete,
  type GoogleStreetFeature,
} from '@/components/listing/GoogleStreetAutocomplete';
import {
  GoogleAddressAutocomplete,
  type GooglePlaceResult,
} from '@/components/listing/GoogleAddressAutocomplete';
import { LocationPicker } from '@/components/listing/LocationPicker';
import { geocodeCrossStreets } from '@/services/geocoding';

/** Same six presets the posting wizard offers; anything else goes under "Other". */
const NEIGHBORHOOD_OPTIONS = [
  'Midwood',
  'Homecrest',
  'Marine Park',
  'Flatbush',
  'Gravesend',
  'Boro Park',
];

type AddressMode = 'cross_streets' | 'full_address';

export interface IntakeLocationValue {
  cross_street_1: string;
  cross_street_2: string;
  full_address: string;
  unit_number: string;
  neighborhood: string;
  latitude: number | null;
  longitude: number | null;
  geocode_status: string;
}

interface IntakeLocationEditorProps {
  value: IntakeLocationValue;
  onChange: (patch: Partial<IntakeLocationValue>) => void;
  /** Raw location text the parser read, shown as a reference line. */
  rawCrossStreets?: string | null;
}

const inputClass =
  'w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

/**
 * Location editor for the intake review drawer — the posting wizard's Step 4
 * in a compact form: the same cross-streets / exact-address toggle, the same
 * Google-backed street and address pickers, the same map with manual pin
 * placement, and a neighborhood that follows the pin.
 *
 * The difference from the wizard is what it starts from: these rows arrive
 * pre-filled by the AI parser, so nothing is cleared or re-geocoded on mount —
 * the admin only pays for a lookup when they actually change something or ask
 * for one.
 *
 * Mount this with `key={listing.id}` so switching rows resets its local state.
 */
export function IntakeLocationEditor({
  value,
  onChange,
  rawCrossStreets,
}: IntakeLocationEditorProps) {
  const [mode, setMode] = useState<AddressMode>(
    value.full_address.trim() ? 'full_address' : 'cross_streets',
  );

  // Seed the pickers from the parsed strings so they render as already-chosen
  // (same trick the posting form's AI quick-fill uses).
  const [streetA, setStreetA] = useState<GoogleStreetFeature | null>(() =>
    value.cross_street_1
      ? {
          placeId: 'intake-parsed-a',
          streetName: value.cross_street_1,
          formattedName: value.cross_street_1,
        }
      : null,
  );
  const [streetB, setStreetB] = useState<GoogleStreetFeature | null>(() =>
    value.cross_street_2
      ? {
          placeId: 'intake-parsed-b',
          streetName: value.cross_street_2,
          formattedName: value.cross_street_2,
        }
      : null,
  );
  const [addressResult, setAddressResult] = useState<GooglePlaceResult | null>(null);
  const [intersectionError, setIntersectionError] = useState<string | null>(null);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeMessage, setGeocodeMessage] = useState<string | null>(null);

  // "Other" is sticky state, not derived: an admin who picks it and hasn't
  // typed a name yet must not have the select snap back to "Select…".
  const startsCustom = !!value.neighborhood && !NEIGHBORHOOD_OPTIONS.includes(value.neighborhood);
  const [otherNeighborhood, setOtherNeighborhood] = useState(startsCustom);
  const [customNeighborhood, setCustomNeighborhood] = useState(
    startsCustom ? value.neighborhood : '',
  );

  const crossStreets = [value.cross_street_1, value.cross_street_2].filter(Boolean).join(' & ');
  const hasPin = value.latitude != null && value.longitude != null;

  // ── Cross streets ─────────────────────────────────────────────────────────
  const handleStreetA = (feature: GoogleStreetFeature | null) => {
    setStreetA(feature);
    setIntersectionError(null);
    onChange({ cross_street_1: feature?.streetName ?? '' });
  };

  const handleStreetB = (feature: GoogleStreetFeature | null) => {
    setStreetB(feature);
    setIntersectionError(null);
    onChange({ cross_street_2: feature?.streetName ?? '' });
  };

  // ── Exact address ─────────────────────────────────────────────────────────
  const handleAddress = (result: GooglePlaceResult | null) => {
    setAddressResult(result);
    if (result) {
      onChange({
        full_address: result.streetAddress,
        latitude: result.latitude,
        longitude: result.longitude,
        geocode_status: 'success',
      });
    } else {
      onChange({ full_address: '', latitude: null, longitude: null, geocode_status: 'failed' });
    }
  };

  // ── Mode toggle ───────────────────────────────────────────────────────────
  // Only the side being left is cleared; the pin survives so an admin flipping
  // modes to look around doesn't lose a good placement by accident.
  const switchMode = (next: AddressMode) => {
    if (next === mode) return;
    setMode(next);
    setIntersectionError(null);
    setGeocodeMessage(null);
    if (next === 'full_address') {
      setStreetA(null);
      setStreetB(null);
      onChange({ cross_street_1: '', cross_street_2: '' });
    } else {
      setAddressResult(null);
      onChange({ full_address: '', unit_number: '' });
    }
  };

  // ── Manual re-geocode ─────────────────────────────────────────────────────
  const query = mode === 'full_address' ? value.full_address.trim() : crossStreets;

  const handleRegeocode = async () => {
    if (!query) {
      setGeocodeMessage(
        mode === 'full_address' ? 'Enter an address first.' : 'Enter both cross streets first.',
      );
      return;
    }
    setGeocoding(true);
    setGeocodeMessage(null);
    try {
      const result = await geocodeCrossStreets({
        crossStreets: query,
        neighborhood: value.neighborhood || undefined,
        asAddress: mode === 'full_address',
        // The stored neighborhood is only ever a guess from the blurb, so let
        // the pin decide it.
        detectNeighborhood: true,
      });
      if (result.success && result.coordinates) {
        onChange({
          latitude: result.coordinates.latitude,
          longitude: result.coordinates.longitude,
          geocode_status: 'success',
        });
        if (result.neighborhood) applyDetectedNeighborhood(result.neighborhood);
        setGeocodeMessage(null);
      } else {
        setGeocodeMessage(result.error || 'Could not find that location.');
      }
    } finally {
      setGeocoding(false);
    }
  };

  // ── Neighborhood ──────────────────────────────────────────────────────────
  const applyDetectedNeighborhood = (detected: string) => {
    if (!detected) return;
    const matched = NEIGHBORHOOD_OPTIONS.find(
      (o) => o.toLowerCase() === detected.toLowerCase(),
    );
    if (matched) {
      setOtherNeighborhood(false);
      setCustomNeighborhood('');
      onChange({ neighborhood: matched });
    } else {
      setOtherNeighborhood(true);
      setCustomNeighborhood(detected);
      onChange({ neighborhood: detected });
    }
  };

  const handleNeighborhoodSelect = (selected: string) => {
    if (selected === '__other__') {
      setOtherNeighborhood(true);
      onChange({ neighborhood: customNeighborhood });
    } else {
      setOtherNeighborhood(false);
      setCustomNeighborhood('');
      onChange({ neighborhood: selected });
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {mode === 'cross_streets'
            ? 'Nearest intersection — pick both streets from the list.'
            : 'Exact street address of the building.'}
        </p>
        <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1 flex-shrink-0">
          {(
            [
              ['cross_streets', 'Cross streets'],
              ['full_address', 'Exact address'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => switchMode(key)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                mode === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'cross_streets' ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Cross street A</label>
            <GoogleStreetAutocomplete
              value={value.cross_street_1}
              onSelect={handleStreetA}
              placeholder="e.g. 53rd Street"
            />
          </div>
          <div>
            <label className={labelClass}>Cross street B</label>
            <GoogleStreetAutocomplete
              value={value.cross_street_2}
              onSelect={handleStreetB}
              placeholder="e.g. 14th Avenue"
              nearViewport={streetA?.viewport}
              invalid={!!intersectionError && !!streetB}
              errorMessage={intersectionError}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={labelClass}>Street address</label>
            <GoogleAddressAutocomplete
              value={value.full_address}
              onSelect={handleAddress}
              placeholder="e.g. 1438 53rd Street"
            />
          </div>
          <div>
            <label className={labelClass}>Unit / Apt</label>
            <input
              type="text"
              value={value.unit_number}
              onChange={(e) => onChange({ unit_number: e.target.value })}
              placeholder="e.g. 2B"
              className={inputClass}
            />
          </div>
        </div>
      )}

      {/* Map + manual pin + confirmation, shared with the posting wizard */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-xs text-gray-500">
            {hasPin
              ? 'Drag the pin in "Set Pin Manually" if the parser placed it badly.'
              : 'Not placed yet — geocode the location or set the pin manually.'}
          </p>
          <button
            type="button"
            onClick={handleRegeocode}
            disabled={geocoding}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {geocoding ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <MapPin className="w-3.5 h-3.5" />
            )}
            Re-geocode
          </button>
        </div>

        <LocationPicker
          crossStreets={query}
          crossStreetAFeature={mode === 'cross_streets' ? streetA : undefined}
          crossStreetBFeature={mode === 'cross_streets' ? streetB : undefined}
          neighborhood={value.neighborhood}
          latitude={value.latitude}
          longitude={value.longitude}
          preResolvedLatitude={
            mode === 'full_address' ? (addressResult?.latitude ?? value.latitude ?? undefined) : undefined
          }
          preResolvedLongitude={
            mode === 'full_address'
              ? (addressResult?.longitude ?? value.longitude ?? undefined)
              : undefined
          }
          hideFindOnMap={mode === 'full_address'}
          initialConfirmed={hasPin}
          detectNeighborhoodFromPin
          onLocationChange={(lat, lng) =>
            onChange({
              latitude: lat,
              longitude: lng,
              geocode_status: lat != null && lng != null ? 'success' : 'failed',
            })
          }
          onNeighborhoodChange={applyDetectedNeighborhood}
          onGeocodeStatusChange={(err) => setIntersectionError(err)}
        />

        {geocodeMessage && (
          <p className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
            {geocodeMessage}
          </p>
        )}

        {rawCrossStreets && (
          <p className="mt-2 text-[11px] text-gray-400">
            Source text: <span className="font-mono">{rawCrossStreets}</span>
          </p>
        )}
      </div>

      {/* Neighborhood — follows the pin, but always overridable */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Neighborhood</label>
          <select
            value={
              otherNeighborhood
                ? '__other__'
                : NEIGHBORHOOD_OPTIONS.includes(value.neighborhood)
                  ? value.neighborhood
                  : ''
            }
            onChange={(e) => handleNeighborhoodSelect(e.target.value)}
            className={inputClass}
          >
            <option value="">Select…</option>
            {NEIGHBORHOOD_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value="__other__">Other…</option>
          </select>
        </div>
        {otherNeighborhood && (
          <div>
            <label className={labelClass}>Neighborhood name</label>
            <input
              type="text"
              value={customNeighborhood}
              onChange={(e) => {
                const v = e.target.value.slice(0, 200);
                setCustomNeighborhood(v);
                onChange({ neighborhood: v });
              }}
              maxLength={200}
              placeholder="Enter neighborhood"
              className={inputClass}
            />
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-400">
        Set from the map pin automatically — change it here if the detected
        neighborhood isn't the one you want on the listing.
      </p>
    </div>
  );
}
