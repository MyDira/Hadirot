import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  AlertCircle,
  AlertTriangle,
  MapPin,
  Loader2,
  User,
  Building2,
  FileText,
  History,
  Phone,
  Home,
  DollarSign,
  Save,
  Check,
  ExternalLink,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  ScrapedListing,
  IntakeImage,
  PropertyType,
  ParkingType,
  HeatType,
  LeaseLength,
  Profile,
  CallStatus,
} from '@/config/supabase';
import { INTAKE_SOURCE_LABELS } from '@/config/supabase';
import { aiIntakeService, CALL_STATUS_LABELS } from '@/services/aiIntake';
import type { MatchCandidate } from '@/utils/intakeMatch';
import { geocodeCrossStreets } from '@/services/geocoding';
import { UserSearchSelect } from '@/components/admin/UserSearchSelect';
import { useAuth } from '@/hooks/useAuth';
import { IntakeMediaField } from './IntakeMediaField';
import { IntakeLocationMap } from './IntakeLocationMap';

interface IntakeWorkspaceDrawerProps {
  listing: ScrapedListing | null;
  assignedProfile: Profile | null;
  /** Possible live-listing duplicates for this row (advisory, strongest first). */
  duplicates: MatchCandidate[];
  onClose: () => void;
  onSaved: () => void;
  onPublish: (listing: ScrapedListing) => void;
  /** Fired after a successful permanent delete — parent closes + reloads. */
  onDeleted: () => void;
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

const STATUS_PILL: Record<CallStatus, string> = {
  pending_call: 'bg-blue-100 text-blue-700',
  called_no_answer: 'bg-amber-100 text-amber-700',
  called_declined: 'bg-gray-200 text-gray-600',
  approved: 'bg-green-100 text-green-700',
  published: 'bg-emerald-600 text-white',
  suppressed: 'bg-gray-100 text-gray-400',
};

/** The states an admin can set directly from the drawer (published is reached via publishing). */
const WORKFLOW_STEPS: CallStatus[] = [
  'pending_call',
  'called_no_answer',
  'called_declined',
  'approved',
  'suppressed',
];

/** Short button labels for the status control. */
const WORKFLOW_LABELS: Record<CallStatus, string> = {
  pending_call: 'New',
  called_no_answer: 'No answer',
  called_declined: 'Declined',
  approved: 'Permission granted',
  suppressed: 'Discard',
  published: 'Published',
};

/** Highlight colour for the currently-active status button. */
const STATUS_ACTIVE: Record<CallStatus, string> = {
  pending_call: 'bg-blue-600 text-white border-blue-600',
  called_no_answer: 'bg-amber-500 text-white border-amber-500',
  called_declined: 'bg-red-600 text-white border-red-600',
  approved: 'bg-green-600 text-white border-green-600',
  suppressed: 'bg-gray-700 text-white border-gray-700',
  published: 'bg-emerald-600 text-white border-emerald-600',
};

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

const inputClass =
  'w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

function SectionCard({
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
          <span className="text-gray-400">{icon}</span>
          {title}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className={labelClass}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
}

export function IntakeWorkspaceDrawer({
  listing,
  assignedProfile,
  duplicates,
  onClose,
  onSaved,
  onPublish,
  onDeleted,
}: IntakeWorkspaceDrawerProps) {
  const { user } = useAuth();
  const [form, setForm] = useState<IntakeForm | null>(null);
  const [assignedUser, setAssignedUser] = useState<Profile | null>(null);
  const [status, setStatus] = useState<CallStatus>('pending_call');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entered, setEntered] = useState(false);

  // Call notes autosave (independent of the field form).
  const [notes, setNotes] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const lastSavedNotes = useRef('');

  useEffect(() => {
    if (!listing) {
      setForm(null);
      return;
    }
    setForm(buildForm(listing));
    setAssignedUser(assignedProfile);
    setStatus(listing.call_status);
    setNotes(listing.call_notes ?? '');
    lastSavedNotes.current = listing.call_notes ?? '';
    setError(null);
  }, [listing, assignedProfile]);

  // Slide-in animation.
  useEffect(() => {
    if (!listing) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [listing]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    if (listing) document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [listing, saving, onClose]);

  if (!listing || !form) return null;

  const isSale = form.listing_kind === 'sale';
  const crossStreets = [form.cross_street_1, form.cross_street_2].filter(Boolean).join(' & ');
  const sourceLabel = listing.source
    ? INTAKE_SOURCE_LABELS[listing.source] ?? listing.source
    : 'Unknown source';
  const confidencePct =
    listing.parse_confidence != null ? Math.round(listing.parse_confidence * 100) : null;
  const confidenceColor =
    listing.parse_confidence == null
      ? 'text-gray-400'
      : listing.parse_confidence >= 0.8
        ? 'text-green-600'
        : listing.parse_confidence >= 0.5
          ? 'text-yellow-600'
          : 'text-red-600';
  const history = Array.isArray(listing.source_history) ? listing.source_history : [];

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

  // Saving a draft persists whatever's there; only publishing enforces the
  // full field validation, so an incomplete parse can still be saved.
  const persist = async (requireValid: boolean): Promise<ScrapedListing | null> => {
    if (requireValid) {
      const validationError = validate();
      if (validationError) {
        setError(validationError);
        return null;
      }
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
    const saved = await persist(false);
    if (saved) {
      onSaved();
      onClose();
    }
  };

  const handleSaveAndPublish = async () => {
    const strongMatch = duplicates.find((d) => d.strength === 'strong');
    if (
      strongMatch &&
      !confirm(
        `This looks like it may already be live as "${strongMatch.title || 'Untitled'}" (${strongMatch.reason}). Publish this as a separate listing anyway?`,
      )
    ) {
      return;
    }
    const saved = await persist(true);
    if (saved) {
      // Publishing implies the owner gave permission — approve so the publish
      // guard passes even if the lead wasn't marked "Permission granted" yet.
      if (status !== 'approved') {
        try {
          await aiIntakeService.setCallStatus(listing.id, 'approved');
        } catch {
          setError('Could not mark permission before publishing.');
          return;
        }
      }
      onClose();
      onPublish({ ...saved, call_status: 'approved' });
    }
  };

  const handleStatus = async (next: CallStatus) => {
    setStatusBusy(true);
    try {
      await aiIntakeService.setCallStatus(listing.id, next);
      setStatus(next);
      onSaved();
    } catch {
      setError('Failed to update status.');
    } finally {
      setStatusBusy(false);
    }
  };

  const handleDelete = async () => {
    const mediaCount = Array.isArray(listing.image_paths) ? listing.image_paths.length : 0;
    const mediaNote = mediaCount > 0 ? ` and its ${mediaCount} photo/video file${mediaCount === 1 ? '' : 's'}` : '';
    if (!confirm(`Permanently delete this listing${mediaNote}? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await aiIntakeService.deleteIntakeListing(listing);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete listing.');
    } finally {
      setDeleting(false);
    }
  };

  const saveNotes = async () => {
    if (notes === lastSavedNotes.current) return;
    setSavingNotes(true);
    try {
      await aiIntakeService.updateIntakeListing(listing.id, { call_notes: notes.trim() || null });
      lastSavedNotes.current = notes;
    } catch {
      setError('Failed to save notes.');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleRegeocode = async () => {
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

  const formatDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : '—');

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-gray-900/50 transition-opacity duration-300 ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={saving ? undefined : onClose}
      />

      {/* Panel */}
      <div
        className={`absolute inset-y-0 right-0 w-full max-w-5xl bg-gray-50 shadow-2xl flex flex-col transform transition-transform duration-300 ease-out ${
          entered ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded ${
                    isSale ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {isSale ? 'For Sale' : 'For Rent'}
                </span>
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-slate-100 text-slate-600">
                  {sourceLabel}
                </span>
                {listing.source_url && (
                  <a
                    href={listing.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-gray-400 hover:text-blue-600"
                    title="Open original source"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                {confidencePct != null && (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium ${confidenceColor}`}
                    title="AI parse confidence"
                  >
                    <Sparkles className="w-3 h-3" />
                    {confidencePct}% confident
                  </span>
                )}
              </div>
              <h2 className="text-lg font-semibold text-gray-900 truncate">
                {form.title || 'Untitled listing'}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`inline-block px-2 py-0.5 text-[11px] font-medium rounded ${STATUS_PILL[status]}`}
                >
                  {CALL_STATUS_LABELS[status]}
                </span>
                <span className="text-xs text-gray-400">
                  Seen {listing.times_seen}× · last {formatDate(listing.date_last_seen)}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body: reference | edit */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
          {/* Reference column */}
          <div className="lg:w-2/5 lg:border-r border-gray-200 bg-gray-50 overflow-y-auto p-4 space-y-4">
            {/* Call workflow */}
            <SectionCard icon={<Phone className="w-4 h-4" />} title="Status & permission">
              {status === 'published' ? (
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block px-2.5 py-1 text-xs font-medium rounded ${STATUS_ACTIVE.published}`}
                  >
                    Published — live
                  </span>
                  {listing.published_listing_id && (
                    <a
                      href={`/listing/${listing.published_listing_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                    >
                      View live <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-2">
                    Set where this lead stands. Mark <strong>Permission granted</strong> once the owner
                    okays it — you can change it back anytime.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {WORKFLOW_STEPS.map((s) => {
                      const active = status === s;
                      return (
                        <button
                          key={s}
                          onClick={() => handleStatus(s)}
                          disabled={statusBusy}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors disabled:opacity-50 ${
                            active
                              ? STATUS_ACTIVE[s]
                              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {WORKFLOW_LABELS[s]}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </SectionCard>

            {/* Possible live duplicates */}
            {duplicates.length > 0 && (
              <SectionCard
                icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}
                title="Possible live duplicates"
              >
                <div className="space-y-2">
                  {duplicates.map((dup) => (
                    <div
                      key={dup.id}
                      className={`p-2.5 rounded-md border text-xs ${
                        dup.strength === 'strong'
                          ? 'bg-red-50 border-red-200'
                          : 'bg-amber-50 border-amber-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {dup.title || 'Untitled'}
                          </p>
                          <p className="text-gray-500 mt-0.5">
                            {[
                              dup.bedrooms != null ? `${dup.bedrooms}BR` : null,
                              dup.price != null
                                ? `$${dup.price.toLocaleString()}`
                                : dup.asking_price != null
                                  ? `$${dup.asking_price.toLocaleString()}`
                                  : null,
                              [dup.cross_street_a, dup.cross_street_b].filter(Boolean).join(' & ') ||
                                dup.neighborhood,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                          <p
                            className={`mt-1 font-medium ${
                              dup.strength === 'strong' ? 'text-red-700' : 'text-amber-700'
                            }`}
                          >
                            {dup.reason}
                          </p>
                        </div>
                        <a
                          href={`/listing/${dup.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-shrink-0 inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800"
                        >
                          Compare <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Original blurb */}
            <SectionCard icon={<FileText className="w-4 h-4" />} title="Original blurb">
              {listing.raw_text ? (
                <pre className="p-3 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-700 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {listing.raw_text}
                </pre>
              ) : (
                <p className="text-xs text-gray-400">No original text was captured for this lead.</p>
              )}
            </SectionCard>

            {/* Location on map */}
            <SectionCard
              icon={<MapPin className="w-4 h-4" />}
              title="Location"
              action={
                <span
                  className={`text-[11px] font-medium ${
                    form.geocode_status === 'success' ? 'text-green-600' : 'text-amber-600'
                  }`}
                >
                  {form.geocode_status === 'success' ? 'Geocoded' : 'Not geocoded'}
                </span>
              }
            >
              <IntakeLocationMap
                latitude={form.latitude}
                longitude={form.longitude}
                geocodeStatus={form.geocode_status}
                label={crossStreets || listing.neighborhood}
                fallbackText={listing.cross_streets_raw}
              />
              <p className="mt-2 text-xs text-gray-500">
                {crossStreets || <span className="text-gray-400">No cross streets yet</span>}
                {form.neighborhood ? ` · ${form.neighborhood}` : ''}
              </p>
            </SectionCard>

            {/* Sighting history */}
            {history.length > 0 && (
              <SectionCard icon={<History className="w-4 h-4" />} title="Where it appeared">
                <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                  {history
                    .slice()
                    .reverse()
                    .map((h, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                          {INTAKE_SOURCE_LABELS[h.source] ?? h.source}
                        </span>
                        <span className="text-gray-500">{h.date || '—'}</span>
                        <span className="text-gray-400">
                          {h.price ? `$${h.price.toLocaleString()}` : ''}
                        </span>
                      </li>
                    ))}
                </ul>
              </SectionCard>
            )}
          </div>

          {/* Edit column */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Basics */}
            <SectionCard icon={<Home className="w-4 h-4" />} title="Basics">
              <div className="space-y-3">
                <div className="flex gap-2">
                  {(['rental', 'sale'] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => update('listing_kind', kind)}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                        form.listing_kind === kind
                          ? 'bg-gray-900 border-gray-900 text-white'
                          : 'bg-white border-gray-300 text-gray-500 hover:border-gray-400'
                      }`}
                    >
                      {kind === 'rental' ? 'For Rent' : 'For Sale'}
                    </button>
                  ))}
                </div>

                <Field label="Listing title">
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => update('title', e.target.value)}
                    className={inputClass}
                  />
                </Field>

                <Field label="Property type">
                  <select
                    value={form.property_type}
                    onChange={(e) => update('property_type', e.target.value as PropertyType)}
                    className={inputClass}
                  >
                    {PROPERTY_TYPES.map((pt) => (
                      <option key={pt.value} value={pt.value}>
                        {pt.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="grid grid-cols-3 gap-3">
                  <Field label="Bedrooms">
                    <input
                      type="number"
                      min={0}
                      value={form.bedrooms ?? ''}
                      onChange={(e) =>
                        update('bedrooms', e.target.value === '' ? null : parseInt(e.target.value) || 0)
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Bathrooms">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={form.bathrooms ?? ''}
                      onChange={(e) =>
                        update('bathrooms', e.target.value === '' ? null : parseFloat(e.target.value) || 0)
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label={isSale ? 'Asking price' : 'Monthly rent'}>
                    <input
                      type="number"
                      min={0}
                      value={form.call_for_price ? '' : ((isSale ? form.asking_price : form.price) ?? '')}
                      onChange={(e) => {
                        const v = e.target.value ? parseInt(e.target.value) : null;
                        if (isSale) update('asking_price', v);
                        else update('price', v);
                      }}
                      disabled={form.call_for_price}
                      className={`${inputClass} disabled:bg-gray-100`}
                    />
                  </Field>
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={form.call_for_price}
                    onChange={(e) => update('call_for_price', e.target.checked)}
                    className="rounded"
                  />
                  Call for price (hide the number)
                </label>
              </div>
            </SectionCard>

            {/* Location fields */}
            <SectionCard
              icon={<MapPin className="w-4 h-4" />}
              title="Address & map placement"
              action={
                <button
                  type="button"
                  onClick={handleRegeocode}
                  disabled={geocoding}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {geocoding ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <MapPin className="w-3.5 h-3.5" />
                  )}
                  Re-geocode
                </button>
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Neighborhood" className="col-span-2">
                  <input
                    type="text"
                    value={form.neighborhood}
                    onChange={(e) => update('neighborhood', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Cross street A">
                  <input
                    type="text"
                    value={form.cross_street_1}
                    onChange={(e) => update('cross_street_1', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Cross street B">
                  <input
                    type="text"
                    value={form.cross_street_2}
                    onChange={(e) => update('cross_street_2', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              <p className="mt-2 text-xs">
                {form.geocode_status === 'success' && form.latitude != null ? (
                  <span className="text-green-700">
                    Placed at {form.latitude.toFixed(5)}, {form.longitude?.toFixed(5)} — see the map on
                    the left.
                  </span>
                ) : (
                  <span className="text-amber-700">
                    Not geocoded — will publish without a map pin until you re-geocode.
                  </span>
                )}
              </p>
            </SectionCard>

            {/* Features */}
            <SectionCard icon={<DollarSign className="w-4 h-4" />} title="Features & details">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Parking">
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
                </Field>
                <Field label="Heat">
                  <select
                    value={form.heat}
                    onChange={(e) => update('heat', e.target.value as HeatType)}
                    className={inputClass}
                  >
                    <option value="tenant_pays">Tenant pays</option>
                    <option value="included">Included</option>
                  </select>
                </Field>
                {!isSale && (
                  <Field label="Lease length" className="col-span-2">
                    <select
                      value={form.lease_length}
                      onChange={(e) => update('lease_length', e.target.value as LeaseLength | '')}
                      className={inputClass}
                    >
                      <option value="">Not specified</option>
                      <option value="long_term_annual">Long term (annual)</option>
                      <option value="short_term">Short term</option>
                      <option value="summer_rental">Summer rental</option>
                      <option value="winter_rental">Winter rental</option>
                    </select>
                  </Field>
                )}
                <Field label="Floor">
                  <input
                    type="number"
                    value={form.floor ?? ''}
                    onChange={(e) => update('floor', e.target.value ? parseInt(e.target.value) : null)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Square footage">
                  <input
                    type="number"
                    value={form.square_footage ?? ''}
                    onChange={(e) =>
                      update('square_footage', e.target.value ? parseInt(e.target.value) : null)
                    }
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="flex items-center gap-5 mt-3 pt-3 border-t border-gray-100">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.washer_dryer_hookup}
                    onChange={(e) => update('washer_dryer_hookup', e.target.checked)}
                    className="rounded"
                  />
                  Washer/dryer hookup
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.broker_fee}
                    onChange={(e) => update('broker_fee', e.target.checked)}
                    className="rounded"
                  />
                  Broker fee
                </label>
              </div>
            </SectionCard>

            {/* Media */}
            <SectionCard icon={<FileText className="w-4 h-4" />} title="Photos & video">
              <IntakeMediaField
                adminId={user?.id}
                images={form.image_paths}
                onChange={(images) => update('image_paths', images)}
                label=""
                maxFiles={isSale ? 21 : 11}
                onUploadingChange={setUploading}
                deleteOnRemove={false}
              />
              <p className="text-xs text-gray-400 mt-2">
                Media may be shared with sibling listings from the same block — removing it here only
                detaches it from this listing.
              </p>
            </SectionCard>

            {/* Contact & assignment */}
            <SectionCard icon={<User className="w-4 h-4" />} title="Contact & posting account">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Contact name">
                  <input
                    type="text"
                    value={form.contact_name}
                    onChange={(e) => update('contact_name', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Contact phone">
                  <input
                    type="text"
                    value={form.contact_phone}
                    onChange={(e) => update('contact_phone', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
                <Field
                  label="Publish under account"
                  hint="Search for a registered user, or leave empty to publish under your admin account."
                >
                  <UserSearchSelect
                    selectedUser={assignedUser}
                    onSelect={(u) => {
                      setAssignedUser(u);
                      update('assigned_user_id', u?.id ?? null);
                    }}
                    placeholder="Search users by name, email, or agency..."
                  />
                </Field>
                {!form.assigned_user_id && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Custom agency / poster name">
                      <input
                        type="text"
                        value={form.admin_custom_agency_name}
                        onChange={(e) => update('admin_custom_agency_name', e.target.value.slice(0, 100))}
                        maxLength={100}
                        placeholder="Shown on the listing card"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Display as">
                      <select
                        value={form.admin_listing_type_display}
                        onChange={(e) =>
                          update('admin_listing_type_display', e.target.value as '' | 'agent' | 'owner')
                        }
                        className={inputClass}
                      >
                        <option value="">Select…</option>
                        <option value="agent">Real estate agent</option>
                        <option value="owner">By owner</option>
                      </select>
                    </Field>
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
            </SectionCard>

            {/* Notes */}
            <SectionCard
              icon={<FileText className="w-4 h-4" />}
              title="Call notes"
              action={
                savingNotes ? (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Loader2 className="w-3 h-3 animate-spin" /> Saving
                  </span>
                ) : notes === lastSavedNotes.current && notes ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                ) : null
              }
            >
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={saveNotes}
                rows={3}
                placeholder="Notes from the call — who answered, availability, follow-up…"
                className={`${inputClass} resize-none`}
              />
              <p className="text-[11px] text-gray-400 mt-1">Saved automatically when you click away.</p>
            </SectionCard>

            {/* Description */}
            <SectionCard icon={<FileText className="w-4 h-4" />} title="Public description">
              <textarea
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                rows={4}
                placeholder="What renters/buyers will read on the listing…"
                className={`${inputClass} resize-none`}
              />
            </SectionCard>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-shrink-0 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            {status !== 'published' && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deleting}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50 transition-colors"
                title="Permanently delete this row and its uploaded media"
              >
                <Trash2 className="w-4 h-4" />
                {deleting ? 'Deleting…' : 'Delete permanently'}
              </button>
            )}
          </div>
          {error && (
            <p className="flex items-center gap-1.5 text-sm text-red-600 min-w-0 flex-1 justify-end">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{error}</span>
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || uploading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {status !== 'published' && (
              <button
                type="button"
                onClick={handleSaveAndPublish}
                disabled={saving || uploading}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save & Publish'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
