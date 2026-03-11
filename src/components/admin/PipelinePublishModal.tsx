import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { ScrapedListing, PropertyType, ParkingType, HeatType, LeaseLength } from '@/config/supabase';
import { pipelineService } from '@/services/pipeline';
import { useAuth } from '@/hooks/useAuth';

interface PipelinePublishModalProps {
  listing: ScrapedListing | null;
  onClose: () => void;
  onSuccess: () => void;
}

const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: 'apartment_building', label: 'Apartment (Building)' },
  { value: 'apartment_house', label: 'Apartment (House)' },
  { value: 'full_house', label: 'Full House' },
  { value: 'duplex', label: 'Duplex' },
  { value: 'basement', label: 'Basement' },
  { value: 'detached_house', label: 'Detached House' },
  { value: 'semi_attached_house', label: 'Semi-Attached House' },
  { value: 'fully_attached_townhouse', label: 'Townhouse' },
  { value: 'condo', label: 'Condo' },
  { value: 'co_op', label: 'Co-op' },
  { value: 'single_family', label: 'Single Family' },
  { value: 'two_family', label: 'Two Family' },
  { value: 'three_family', label: 'Three Family' },
  { value: 'four_family', label: 'Four Family' },
];

function mapRentalTerm(term: string | null): LeaseLength | null {
  if (term === 'long_term') return 'long_term_annual';
  if (term === 'short_term') return 'short_term';
  return null;
}

function buildAdditionalNotes(listing: ScrapedListing): string {
  const parts: string[] = [];
  if (listing.additional_notes) parts.push(listing.additional_notes);
  if (listing.is_furnished) parts.push('Furnished unit');
  if (listing.section_8_ok) parts.push('Section 8 OK');
  if (listing.has_porch) parts.push('Has porch');
  if (listing.separate_entrance) parts.push('Separate entrance');
  if (listing.utilities_included) parts.push('Utilities included');
  if (listing.basement) parts.push('Basement unit');
  return parts.join('. ');
}

export function PipelinePublishModal({ listing, onClose, onSuccess }: PipelinePublishModalProps) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bathroomsError, setBathroomsError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    bedrooms: 0,
    bathrooms: 0,
    price: null as number | null,
    call_for_price: false,
    neighborhood: '',
    cross_street_a: '',
    cross_street_b: '',
    contact_name: '',
    contact_phone: '',
    property_type: 'apartment_building' as PropertyType,
    parking: 'no' as ParkingType,
    heat: 'tenant_pays' as HeatType,
    washer_dryer_hookup: false,
    lease_length: null as LeaseLength | null,
    floor: null as number | null,
    square_footage: null as number | null,
    description: '',
    latitude: null as number | null,
    longitude: null as number | null,
  });

  useEffect(() => {
    if (!listing) return;
    setError(null);
    setBathroomsError(null);
    setForm({
      title: listing.title || '',
      bedrooms: listing.bedrooms ?? 0,
      bathrooms: listing.bathrooms ?? 0,
      price: listing.price,
      call_for_price: listing.price == null,
      neighborhood: listing.neighborhood || '',
      cross_street_a: listing.cross_street_1 || '',
      cross_street_b: listing.cross_street_2 || '',
      contact_name: listing.contact_name || listing.agency_name || '',
      contact_phone: listing.contact_phone_display || listing.contact_phone || '',
      property_type: 'apartment_building',
      parking: listing.parking ? 'yes' : 'no',
      heat: listing.heat_included ? 'included' : 'tenant_pays',
      washer_dryer_hookup: listing.washer_dryer ?? false,
      lease_length: mapRentalTerm(listing.rental_term),
      floor: listing.floor,
      square_footage: listing.square_footage,
      description: buildAdditionalNotes(listing),
      latitude: listing.latitude,
      longitude: listing.longitude,
    });
  }, [listing]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    if (listing) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [listing, submitting, onClose]);

  if (!listing) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBathroomsError(null);

    if (!form.bathrooms || form.bathrooms <= 0) {
      setBathroomsError('Bathrooms is required and must be greater than zero.');
      return;
    }

    if (!form.title.trim()) {
      setError('Title is required.');
      return;
    }
    if (!form.contact_name.trim()) {
      setError('Contact name is required.');
      return;
    }
    if (!form.contact_phone.trim()) {
      setError('Contact phone is required.');
      return;
    }

    if (!user) return;

    setSubmitting(true);
    try {
      const location = [form.cross_street_a, form.cross_street_b].filter(Boolean).join(' & ') || form.neighborhood || 'Unknown';

      const payload: Record<string, any> = {
        title: form.title.trim(),
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        price: form.call_for_price ? null : form.price,
        call_for_price: form.call_for_price,
        neighborhood: form.neighborhood,
        cross_street_a: form.cross_street_a || null,
        cross_street_b: form.cross_street_b || null,
        location,
        contact_name: form.contact_name.trim(),
        contact_phone: form.contact_phone.trim(),
        property_type: form.property_type,
        parking: form.parking,
        heat: form.heat,
        washer_dryer_hookup: form.washer_dryer_hookup,
        lease_length: form.lease_length,
        floor: form.floor,
        square_footage: form.square_footage,
        description: form.description || null,
        latitude: form.latitude,
        longitude: form.longitude,
      };

      await pipelineService.publishToListings(listing, payload, user.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to publish listing.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === 'bathrooms') setBathroomsError(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={submitting ? undefined : onClose} />

        <div className="relative z-10 w-full max-w-2xl bg-white rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Publish to Listings</h3>
            {!submitting && (
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property Type *</label>
                <select
                  value={form.property_type}
                  onChange={(e) => updateField('property_type', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {PROPERTY_TYPES.map((pt) => (
                    <option key={pt.value} value={pt.value}>{pt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms *</label>
                <input
                  type="number"
                  min={0}
                  value={form.bedrooms}
                  onChange={(e) => updateField('bedrooms', parseInt(e.target.value) || 0)}
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms *</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.bathrooms || ''}
                  onChange={(e) => updateField('bathrooms', parseFloat(e.target.value) || 0)}
                  required
                  className={`w-full px-3 py-2 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                    bathroomsError ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
                {bathroomsError && (
                  <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {bathroomsError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={form.call_for_price ? '' : (form.price ?? '')}
                    onChange={(e) => updateField('price', e.target.value ? parseInt(e.target.value) : null)}
                    disabled={form.call_for_price}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                  />
                  <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={form.call_for_price}
                      onChange={(e) => updateField('call_for_price', e.target.checked)}
                      className="rounded"
                    />
                    Call for price
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Neighborhood</label>
                <input
                  type="text"
                  value={form.neighborhood}
                  onChange={(e) => updateField('neighborhood', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cross Street A</label>
                <input
                  type="text"
                  value={form.cross_street_a}
                  onChange={(e) => updateField('cross_street_a', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cross Street B</label>
                <input
                  type="text"
                  value={form.cross_street_b}
                  onChange={(e) => updateField('cross_street_b', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
                <input
                  type="text"
                  value={form.contact_name}
                  onChange={(e) => updateField('contact_name', e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone *</label>
                <input
                  type="text"
                  value={form.contact_phone}
                  onChange={(e) => updateField('contact_phone', e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parking</label>
                <select
                  value={form.parking}
                  onChange={(e) => updateField('parking', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                  <option value="included">Included</option>
                  <option value="optional">Optional</option>
                  <option value="carport">Carport</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Heat</label>
                <select
                  value={form.heat}
                  onChange={(e) => updateField('heat', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="tenant_pays">Tenant Pays</option>
                  <option value="included">Included</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lease Length</label>
                <select
                  value={form.lease_length ?? ''}
                  onChange={(e) => updateField('lease_length', e.target.value || null)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Not specified</option>
                  <option value="long_term_annual">Long Term (Annual)</option>
                  <option value="short_term">Short Term</option>
                  <option value="summer_rental">Summer Rental</option>
                  <option value="winter_rental">Winter Rental</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Floor</label>
                <input
                  type="number"
                  value={form.floor ?? ''}
                  onChange={(e) => updateField('floor', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Square Footage</label>
                <input
                  type="number"
                  value={form.square_footage ?? ''}
                  onChange={(e) => updateField('square_footage', e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center gap-2 self-end">
                <input
                  type="checkbox"
                  id="publish-washer-dryer"
                  checked={form.washer_dryer_hookup}
                  onChange={(e) => updateField('washer_dryer_hookup', e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="publish-washer-dryer" className="text-sm text-gray-700">Washer/Dryer Hookup</label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description / Notes</label>
              <textarea
                value={form.description}
                onChange={(e) => updateField('description', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>
          </form>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <p className="text-xs text-gray-500">Listing will be submitted for admin approval.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Publishing...' : 'Publish Listing'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
