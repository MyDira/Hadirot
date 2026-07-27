import React, { useState, useEffect } from 'react';
import { X, AlertCircle, MapPin, Loader2, User, Building2 } from 'lucide-react';
import type {
  ScrapedListing,
  IntakeImage,
  PropertyType,
  ParkingType,
  HeatType,
  LeaseLength,
  Profile,
} from '@/config/supabase';
import { aiIntakeService } from '@/services/aiIntake';
import { geocodeCrossStreets } from '@/services/geocoding';
import { UserSearchSelect } from '@/components/admin/UserSearchSelect';
import { useAuth } from '@/hooks/useAuth';
import { IntakeMediaField } from './IntakeMediaField';

interface IntakeEditModalProps {
  listing: ScrapedListing | null;
  assignedProfile: Profile | null;
  onClose: () => void;
  onSaved: () => void;
  onPublish: (listing: ScrapedListing) => void;
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

interface IntakeForm {
  listing_kind: 'rental' | 'sale';
  title: string;
  description: string;
  bedrooms: number | null;
  bathrooms: number | null;
  price: number | null;
  asking_price: number | null;
  call_for_price: boolean;
  floor: number | null;
  square_footage: number | null;
  property_type: PropertyType;
  parking: ParkingType;
  heat: HeatType;
  washer_dryer_hookup: boolean;
  lease_length: LeaseLength | '';
  broker_fee: boolean;
  neighborhood: string;
  cross_street_1: string;
  cross_street_2: string;
  contact_name: string;
  contact_phone: string;
  latitude: number | null;
  longitude: number | null;
  geocode_status: string;
  assigned_user_id: string | null;
  admin_custom_agency_name: string;
  admin_listing_type_display: '' | 'agent' | 'owner';
  image_paths: IntakeImage[];
}

function buildForm(listing: ScrapedListing): IntakeForm {
  const extra = listing.intake_extra || {};
  return {
    listing_kind: listing.listing_kind || 'rental',
    title: listing.title || '',
    description: listing.description || '',
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    price: listing.price,
    asking_price: extra.asking_price ?? null,
    call_for_price: !!extra.call_for_price,
    floor: listing.floor,
    square_footage: listing.square_footage,
    property_type: extra.property_type || 'apartment_building',
    parking: extra.parking || (listing.parking ? 'yes' : 'no'),
    heat: extra.heat || (listing.heat_included ? 'included' : 'tenant_pays'),
    washer_dryer_hookup: extra.washer_dryer_hookup ?? listing.washer_dryer ?? false,
    lease_length: extra.lease_length ?? '',
    broker_fee: extra.broker_fee ?? false,
    neighborhood: listing.neighborhood || '',
    cross_street_1: listing.cross_street_1 || '',
    cross_street_2: listing.cross_street_2 || '',
    contact_name: listing.contact_name || listing.agency_name || '',
    contact_phone: listing.contact_phone_display || listing.contact_phone || '',
    latitude: listing.latitude,
    longitude: listing.longitude,
    geocode_status: listing.geocode_status || 'failed',
    assigned_user_id: listing.assigned_user_id,
    admin_custom_agency_name: listing.admin_custom_agency_name || '',
    admin_listing_type_display: listing.admin_listing_type_display || '',
    image_paths: Array.isArray(listing.image_paths) ? listing.image_paths : [],
  };
}

function formToPatch(form: IntakeForm): Partial<ScrapedListing> {
  return {
    listing_kind: form.listing_kind,
    title: form.title.trim(),
    description: form.description.trim() || null,
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    price: form.listing_kind === 'rental' && !form.call_for_price ? form.price : null,
    floor: form.floor,
    square_footage: form.square_footage,
    neighborhood: form.neighborhood.trim(),
    cross_street_1: form.cross_street_1.trim() || null,
    cross_street_2: form.cross_street_2.trim() || null,
    contact_name: form.contact_name.trim() || null,
    contact_phone: form.contact_phone.replace(/\D/g, '') || null,
    contact_phone_display: form.contact_phone.trim() || null,
    latitude: form.latitude,
    longitude: form.longitude,
    geocode_status: form.geocode_status as ScrapedListing['geocode_status'],
    assigned_user_id: form.assigned_user_id,
    admin_custom_agency_name: form.assigned_user_id
      ? null
      : form.admin_custom_agency_name.trim() || null,
    admin_listing_type_display: form.assigned_user_id
      ? null
      : form.admin_listing_type_display || null,
    image_paths: form.image_paths,
    intake_extra: {
      property_type: form.property_type,
      parking: form.parking,
      heat: form.heat,
      washer_dryer_hookup: form.washer_dryer_hookup,
      lease_length: form.lease_length || null,
      call_for_price: form.call_for_price,
      asking_price:
        form.listing_kind === 'sale' && !form.call_for_price ? form.asking_price : null,
      broker_fee: form.broker_fee,
    },
  };
}

export function IntakeEditModal({
  listing,
  assignedProfile,
  onClose,
  onSaved,
  onPublish,
}: IntakeEditModalProps) {
  const { user } = useAuth();
  const [form, setForm] = useState<IntakeForm | null>(null);
  const [assignedUser, setAssignedUser] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listing) {
      setForm(null);
      return;
    }
    setForm(buildForm(listing));
    setAssignedUser(assignedProfile);
    setError(null);
  }, [listing, assignedProfile]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    if (listing) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [listing, saving, onClose]);

  if (!listing || !form) return null;

  const isSale = form.listing_kind === 'sale';

  const update = <K extends keyof IntakeForm>(field: K, value: IntakeForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const validate = (): string | null => {
    if (!form.title.trim()) return 'Title is required.';
    if (form.bedrooms == null) return 'Bedrooms is required.';
    if (!form.bathrooms || form.bathrooms <= 0) return 'Bathrooms must be greater than zero.';
    if (!form.contact_name.trim()) return 'Contact name is required.';
    if (!form.contact_phone.trim()) return 'Contact phone is required.';
    if (!form.call_for_price) {
      if (!isSale && !form.price) return 'Enter a price or check "Call for price".';
      if (isSale && !form.asking_price) return 'Enter an asking price or check "Call for price".';
    }
    return null;
  };

  const persist = async (): Promise<ScrapedListing | null> => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return null;
    }
    setSaving(true);
    setError(null);
    try {
      const patch = formToPatch(form);
      await aiIntakeService.updateIntakeListing(listing.id, patch);
      return { ...listing, ...patch } as ScrapedListing;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const saved = await persist();
    if (saved) {
      onSaved();
      onClose();
    }
  };

  const handleSaveAndPublish = async () => {
    const saved = await persist();
    if (saved) {
      onClose();
      onPublish(saved);
    }
  };

  const handleRegeocode = async () => {
    const crossStreets = [form.cross_street_1, form.cross_street_2].filter(Boolean).join(' & ');
    if (!crossStreets) {
      setError('Enter cross streets before geocoding.');
      return;
    }
    setGeocoding(true);
    setError(null);
    try {
      const result = await geocodeCrossStreets({
        crossStreets,
        neighborhood: form.neighborhood || undefined,
      });
      if (result.success && result.coordinates) {
        setForm((prev) =>
          prev
            ? {
                ...prev,
                latitude: result.coordinates!.latitude,
                longitude: result.coordinates!.longitude,
                geocode_status: 'success',
              }
            : prev,
        );
      } else {
        setError(result.error || 'Could not find that location.');
      }
    } finally {
      setGeocoding(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center px-4 py-8">
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={saving ? undefined : onClose}
        />

        <div className="relative z-10 w-full max-w-3xl bg-white rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Edit Parsed Listing</h3>
            {!saving && (
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Listing kind */}
            <div className="flex gap-2">
              {(['rental', 'sale'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => update('listing_kind', kind)}
                  className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors capitalize ${
                    form.listing_kind === kind
                      ? 'bg-white border-gray-900 text-gray-900 shadow-sm'
                      : 'bg-transparent border-gray-300 text-gray-500 hover:border-gray-400'
                  }`}
                >
                  {kind}
                </button>
              ))}
            </div>

            {/* Photos & video */}
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
              <IntakeMediaField
                adminId={user?.id}
                images={form.image_paths}
                onChange={(images) => update('image_paths', images)}
                label="Photos & video"
                maxFiles={isSale ? 21 : 11}
                onUploadingChange={setUploading}
                deleteOnRemove={false}
              />
              <p className="text-xs text-gray-500 mt-2">
                Media can be shared with sibling listings parsed from the same block — removing it
                here only detaches it from this listing.
              </p>
            </div>

            {/* Assignment */}
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-md space-y-3">
              <p className="text-sm font-medium text-gray-700">Account Assignment</p>
              <UserSearchSelect
                selectedUser={assignedUser}
                onSelect={(u) => {
                  setAssignedUser(u);
                  update('assigned_user_id', u?.id ?? null);
                }}
                placeholder="Search users by name, email, or agency..."
              />
              {!form.assigned_user_id && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Custom Agency/Poster Name
                    </label>
                    <input
                      type="text"
                      value={form.admin_custom_agency_name}
                      onChange={(e) => update('admin_custom_agency_name', e.target.value.slice(0, 100))}
                      maxLength={100}
                      placeholder="Shown on the listing card"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Display As</label>
                    <select
                      value={form.admin_listing_type_display}
                      onChange={(e) =>
                        update('admin_listing_type_display', e.target.value as '' | 'agent' | 'owner')
                      }
                      className={inputClass}
                    >
                      <option value="">Select display type</option>
                      <option value="agent">
                        Real Estate Agent
                      </option>
                      <option value="owner">By Owner</option>
                    </select>
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-500 flex items-center gap-1">
                {form.assigned_user_id ? (
                  <>
                    <User className="w-3 h-3" /> Will publish under the assigned user's account.
                  </>
                ) : (
                  <>
                    <Building2 className="w-3 h-3" /> Will publish under your admin account with the
                    display settings above.
                  </>
                )}
              </p>
            </div>

            {/* Core fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => update('title', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Property Type *</label>
                <select
                  value={form.property_type}
                  onChange={(e) => update('property_type', e.target.value as PropertyType)}
                  className={inputClass}
                >
                  {PROPERTY_TYPES.map((pt) => (
                    <option key={pt.value} value={pt.value}>{pt.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms *</label>
                  <input
                    type="number"
                    min={0}
                    value={form.bedrooms ?? ''}
                    onChange={(e) => update('bedrooms', e.target.value === '' ? null : parseInt(e.target.value) || 0)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms *</label>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={form.bathrooms ?? ''}
                    onChange={(e) => update('bathrooms', e.target.value === '' ? null : parseFloat(e.target.value) || 0)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {isSale ? 'Asking Price' : 'Monthly Price'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={
                      form.call_for_price
                        ? ''
                        : ((isSale ? form.asking_price : form.price) ?? '')
                    }
                    onChange={(e) => {
                      const v = e.target.value ? parseInt(e.target.value) : null;
                      if (isSale) update('asking_price', v);
                      else update('price', v);
                    }}
                    disabled={form.call_for_price}
                    className={`${inputClass} disabled:bg-gray-100`}
                  />
                  <label className="flex items-center gap-1 text-xs text-gray-600 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={form.call_for_price}
                      onChange={(e) => update('call_for_price', e.target.checked)}
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
                  onChange={(e) => update('neighborhood', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cross Street A</label>
                <input
                  type="text"
                  value={form.cross_street_1}
                  onChange={(e) => update('cross_street_1', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cross Street B</label>
                <input
                  type="text"
                  value={form.cross_street_2}
                  onChange={(e) => update('cross_street_2', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div className="col-span-2 flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleRegeocode}
                  disabled={geocoding}
                  className="flex items-center gap-1 px-3 py-1.5 font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {geocoding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                  Re-geocode
                </button>
                {form.geocode_status === 'success' && form.latitude != null ? (
                  <span className="text-green-700">
                    Located: {form.latitude.toFixed(5)}, {form.longitude?.toFixed(5)}
                  </span>
                ) : (
                  <span className="text-amber-700">Not geocoded — listing will publish without map placement.</span>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name *</label>
                <input
                  type="text"
                  value={form.contact_name}
                  onChange={(e) => update('contact_name', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone *</label>
                <input
                  type="text"
                  value={form.contact_phone}
                  onChange={(e) => update('contact_phone', e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parking</label>
                <select
                  value={form.parking}
                  onChange={(e) => update('parking', e.target.value as ParkingType)}
                  className={inputClass}
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
                  onChange={(e) => update('heat', e.target.value as HeatType)}
                  className={inputClass}
                >
                  <option value="tenant_pays">Tenant Pays</option>
                  <option value="included">Included</option>
                </select>
              </div>

              {!isSale && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lease Length</label>
                  <select
                    value={form.lease_length}
                    onChange={(e) => update('lease_length', e.target.value as LeaseLength | '')}
                    className={inputClass}
                  >
                    <option value="">Not specified</option>
                    <option value="long_term_annual">Long Term (Annual)</option>
                    <option value="short_term">Short Term</option>
                    <option value="summer_rental">Summer Rental</option>
                    <option value="winter_rental">Winter Rental</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Floor</label>
                <input
                  type="number"
                  value={form.floor ?? ''}
                  onChange={(e) => update('floor', e.target.value ? parseInt(e.target.value) : null)}
                  className={inputClass}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Square Footage</label>
                <input
                  type="number"
                  value={form.square_footage ?? ''}
                  onChange={(e) => update('square_footage', e.target.value ? parseInt(e.target.value) : null)}
                  className={inputClass}
                />
              </div>

              <div className="flex items-center gap-4 self-end col-span-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.washer_dryer_hookup}
                    onChange={(e) => update('washer_dryer_hookup', e.target.checked)}
                    className="rounded"
                  />
                  Washer/Dryer Hookup
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.broker_fee}
                    onChange={(e) => update('broker_fee', e.target.checked)}
                    className="rounded"
                  />
                  Broker Fee
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                rows={4}
                className={`${inputClass} resize-none`}
              />
            </div>

            {listing.raw_text && (
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer font-medium text-gray-600">Original text</summary>
                <p className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-md whitespace-pre-wrap">
                  {listing.raw_text}
                </p>
              </details>
            )}
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || uploading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleSaveAndPublish}
                disabled={saving || uploading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Save & Publish'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
