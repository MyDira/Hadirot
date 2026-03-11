import React, { useState, useRef } from 'react';
import {
  ExternalLink, Save, Eye, EyeOff, Phone, User, Building2, MapPin,
  BarChart3, FileText, BedDouble, Bath, DollarSign, Layers, Maximize2,
  CalendarDays, Repeat2, Sofa, Tag, Clock, Calendar,
} from 'lucide-react';
import type { ScrapedListing, CallStatus } from '@/config/supabase';
import { getValidTransitions, CALL_STATUS_LABELS, pipelineService } from '@/services/pipeline';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

interface PipelineListingDetailProps {
  listing: ScrapedListing;
  onStatusChange: (id: string, newStatus: CallStatus) => void;
  onPublish: (listing: ScrapedListing) => void;
  onRefresh: () => void;
}

const FEATURE_PILLS: { key: keyof ScrapedListing; label: string }[] = [
  { key: 'parking', label: 'Parking' },
  { key: 'washer_dryer', label: 'Washer/Dryer' },
  { key: 'section_8_ok', label: 'Section 8 OK' },
  { key: 'heat_included', label: 'Heat included' },
  { key: 'utilities_included', label: 'Utilities included' },
  { key: 'has_porch', label: 'Porch' },
  { key: 'basement', label: 'Basement' },
  { key: 'separate_entrance', label: 'Separate entrance' },
];

function DetailRow({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: React.ReactNode; mono?: boolean }) {
  if (value === null || value === undefined || value === '' || value === '-') return null;
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="flex-shrink-0 w-4 h-4 mt-0.5 text-gray-400">{icon}</span>
      <span className="w-24 flex-shrink-0 text-xs text-gray-500 pt-0.5">{label}</span>
      <span className={`text-sm font-medium text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function SectionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-md border border-gray-200 px-4 py-3 divide-y divide-gray-100 ${className ?? ''}`}>
      {children}
    </div>
  );
}

export function PipelineListingDetail({ listing, onStatusChange, onPublish, onRefresh }: PipelineListingDetailProps) {
  const [callNotes, setCallNotes] = useState(listing.call_notes ?? '');
  const [showRawText, setShowRawText] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [suppressConfirm, setSuppressConfirm] = useState(false);
  const lastSavedNotes = useRef(listing.call_notes ?? '');

  const validTransitions = getValidTransitions(listing.call_status);

  const saveNotes = async () => {
    if (callNotes === lastSavedNotes.current) return;
    setSavingNotes(true);
    try {
      await pipelineService.updateCallNotes(listing.id, callNotes);
      lastSavedNotes.current = callNotes;
    } catch {
      // silent fail
    } finally {
      setSavingNotes(false);
    }
  };

  const handleStatusAction = async (newStatus: CallStatus) => {
    if (newStatus === 'suppressed') {
      setSuppressConfirm(true);
      return;
    }
    onStatusChange(listing.id, newStatus);
  };

  const confirmSuppress = () => {
    setSuppressConfirm(false);
    onStatusChange(listing.id, 'suppressed');
  };

  const crossStreets = [listing.cross_street_1, listing.cross_street_2].filter(Boolean).join(' & ');
  const activePills = FEATURE_PILLS.filter((p) => listing[p.key] === true);

  const geocodeBadge =
    listing.geocode_status === 'success'
      ? { bg: 'bg-green-100', text: 'text-green-700', label: 'Geocoded' }
      : listing.geocode_status === 'pending'
      ? { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Pending' }
      : { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' };

  const formatSource = (s: string | null) =>
    s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '-';

  const confidenceValue =
    listing.parse_confidence != null
      ? `${Math.round(listing.parse_confidence * 100)}%`
      : null;

  const confidenceColor =
    listing.parse_confidence == null
      ? 'text-gray-400'
      : listing.parse_confidence >= 0.8
      ? 'text-green-600'
      : listing.parse_confidence >= 0.5
      ? 'text-yellow-600'
      : 'text-red-600';

  return (
    <div className="bg-gray-50 border-t border-gray-200 px-5 py-4 space-y-4">
      {/* Top two-column grid: Contact + Location */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Section A — Contact */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5" /> Contact
          </p>
          <SectionCard>
            <DetailRow
              icon={<Phone className="w-4 h-4" />}
              label="Phone"
              value={listing.contact_phone_display || listing.contact_phone}
              mono
            />
            <DetailRow
              icon={<User className="w-4 h-4" />}
              label="Name"
              value={listing.contact_name}
            />
            <DetailRow
              icon={<Building2 className="w-4 h-4" />}
              label="Agency"
              value={listing.agency_name}
            />
            <DetailRow
              icon={<Tag className="w-4 h-4" />}
              label="Type"
              value={listing.contact_type ? <span className="capitalize">{listing.contact_type}</span> : null}
            />
          </SectionCard>
        </div>

        {/* Section C — Location */}
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> Location
          </p>
          <SectionCard>
            {crossStreets ? (
              <DetailRow
                icon={<MapPin className="w-4 h-4" />}
                label="Cross streets"
                value={<span className="font-semibold">{crossStreets}</span>}
              />
            ) : (
              <>
                <DetailRow icon={<MapPin className="w-4 h-4" />} label="Street 1" value={listing.cross_street_1} />
                <DetailRow icon={<MapPin className="w-4 h-4" />} label="Street 2" value={listing.cross_street_2} />
              </>
            )}
            <DetailRow
              icon={<Building2 className="w-4 h-4" />}
              label="Neighborhood"
              value={listing.neighborhood}
            />
            <div className="flex items-start gap-2.5 py-1.5">
              <span className="flex-shrink-0 w-4 h-4 mt-0.5 text-gray-400"><MapPin className="w-4 h-4" /></span>
              <span className="w-24 flex-shrink-0 text-xs text-gray-500 pt-0.5">Geocode</span>
              <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${geocodeBadge.bg} ${geocodeBadge.text}`}>
                {geocodeBadge.label}
              </span>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* Section B — Property Details */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" /> Property Details
        </p>
        <div className="bg-white rounded-md border border-gray-200 p-4">
          {/* Stat chips row */}
          <div className="flex flex-wrap gap-3 mb-3">
            {listing.bedrooms != null && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-md border border-gray-200">
                <BedDouble className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-900">{listing.bedrooms}</span>
                <span className="text-xs text-gray-500">bd</span>
              </div>
            )}
            {listing.bathrooms != null && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-md border border-gray-200">
                <Bath className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-900">{listing.bathrooms}</span>
                <span className="text-xs text-gray-500">ba</span>
              </div>
            )}
            {(listing.price || listing.price_note) && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-md border border-gray-200">
                <DollarSign className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-900">
                  {listing.price ? listing.price.toLocaleString() : listing.price_note}
                </span>
                {listing.price && <span className="text-xs text-gray-500">/mo</span>}
              </div>
            )}
            {listing.floor != null && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-md border border-gray-200">
                <Layers className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-900">Floor {listing.floor}</span>
              </div>
            )}
            {listing.square_footage != null && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-md border border-gray-200">
                <Maximize2 className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-900">{listing.square_footage.toLocaleString()}</span>
                <span className="text-xs text-gray-500">ft²</span>
              </div>
            )}
            {listing.rental_term && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-md border border-gray-200">
                <CalendarDays className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-900 capitalize">{listing.rental_term.replace('_', ' ')}</span>
              </div>
            )}
            {listing.is_furnished && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-md border border-amber-200">
                <Sofa className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-amber-700">Furnished</span>
              </div>
            )}
          </div>

          {/* Feature pills */}
          {activePills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100">
              {activePills.map((pill) => (
                <span key={pill.key} className="px-2.5 py-1 text-xs font-medium rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                  {pill.label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Section D — Pipeline Metadata */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" /> Pipeline Info
        </p>
        <div className="bg-white rounded-md border border-gray-200 px-4 py-3 grid grid-cols-2 md:grid-cols-3 gap-x-6 divide-y md:divide-y-0">
          <div className="flex items-center gap-2 py-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500">Confidence</span>
            <span className={`text-sm font-semibold ml-auto ${confidenceColor}`}>{confidenceValue ?? '-'}</span>
          </div>
          <div className="flex items-center gap-2 py-1.5">
            <Repeat2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500">Seen</span>
            <span className="text-sm font-semibold text-gray-900 ml-auto">{listing.times_seen}x</span>
          </div>
          <div className="flex items-center gap-2 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500">PDF date</span>
            <span className="text-sm font-medium text-gray-900 ml-auto">
              {listing.pdf_date ? new Date(listing.pdf_date).toLocaleDateString() : '-'}
            </span>
          </div>
          <div className="flex items-center gap-2 py-1.5">
            <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500">First seen</span>
            <span className="text-sm font-medium text-gray-900 ml-auto">
              {listing.date_first_seen ? new Date(listing.date_first_seen).toLocaleDateString() : '-'}
            </span>
          </div>
          <div className="flex items-center gap-2 py-1.5">
            <Clock className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500">Last seen</span>
            <span className="text-sm font-medium text-gray-900 ml-auto">
              {listing.date_last_seen ? new Date(listing.date_last_seen).toLocaleDateString() : '-'}
            </span>
          </div>
          <div className="flex items-center gap-2 py-1.5">
            <Tag className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            <span className="text-xs text-gray-500">Source</span>
            <span className="text-sm font-medium text-gray-900 ml-auto">{formatSource(listing.source)}</span>
          </div>
        </div>
      </div>

      {/* Section E - Match Info */}
      {listing.match_status !== 'no_match' && (
        <div>
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Match Info</h4>
          <div className="flex items-center gap-3 text-sm">
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${
              listing.match_status === 'matched' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              {listing.match_status === 'matched' ? 'Exact match' : 'Partial match'}
            </span>
            {listing.existing_listing_id && (
              <a
                href={`/listing/${listing.existing_listing_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
              >
                View existing listing <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* Section F - Original Text */}
      <div>
        <button
          onClick={() => setShowRawText(!showRawText)}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors"
        >
          {showRawText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showRawText ? 'Hide original blurb' : 'Show original blurb'}
        </button>
        {showRawText && listing.raw_text && (
          <pre className="mt-2 p-3 bg-white border border-gray-200 rounded text-xs text-gray-700 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto">
            {listing.raw_text}
          </pre>
        )}
      </div>

      {/* Section G - Call Notes */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Call Notes
        </h4>
        <div className="flex gap-2">
          <textarea
            value={callNotes}
            onChange={(e) => setCallNotes(e.target.value)}
            onBlur={saveNotes}
            rows={2}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            placeholder="Add call notes..."
          />
          <button
            onClick={saveNotes}
            disabled={savingNotes || callNotes === lastSavedNotes.current}
            className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md border border-gray-300 disabled:opacity-50 transition-colors flex items-center gap-1"
          >
            <Save className="w-3.5 h-3.5" />
            {savingNotes ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Section H - Actions */}
      {validTransitions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
          {validTransitions.includes('called_no_answer') && (
            <button
              onClick={() => handleStatusAction('called_no_answer')}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors"
            >
              Mark: No Answer
            </button>
          )}
          {validTransitions.includes('called_declined') && (
            <button
              onClick={() => handleStatusAction('called_declined')}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
            >
              Mark: Declined
            </button>
          )}
          {validTransitions.includes('approved') && (
            <button
              onClick={() => handleStatusAction('approved')}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
            >
              Mark: Approved
            </button>
          )}
          {validTransitions.includes('published') && (
            <button
              onClick={() => onPublish(listing)}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Publish &rarr;
            </button>
          )}
          {validTransitions.includes('suppressed') && (
            <button
              onClick={() => handleStatusAction('suppressed')}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200 transition-colors"
            >
              Suppress
            </button>
          )}
          {validTransitions.includes('pending_call') && (
            <button
              onClick={() => handleStatusAction('pending_call')}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-50 text-gray-600 border border-gray-300 hover:bg-gray-100 transition-colors"
            >
              Restore
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={suppressConfirm}
        onClose={() => setSuppressConfirm(false)}
        onConfirm={confirmSuppress}
        title="Suppress this listing?"
        message="This listing will be hidden from the pipeline. You can restore it later."
        confirmText="Suppress"
        severity="warning"
      />
    </div>
  );
}
