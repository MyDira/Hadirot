import React, { useState, useRef } from 'react';
import { ExternalLink, Save, Eye, EyeOff, Phone, User, Building2, MapPin, BarChart3, FileText } from 'lucide-react';
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
      // silent fail, user can retry
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

  const geocodeBadge = listing.geocode_status === 'success'
    ? { bg: 'bg-green-100', text: 'text-green-700', label: 'Geocoded' }
    : { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' };

  return (
    <div className="bg-gray-50 border-t border-gray-200 px-6 py-5 space-y-5">
      {/* Section A - Contact Info */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Phone className="w-3.5 h-3.5" /> Contact Info
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Phone</span>
            <p className="font-medium text-gray-900">{listing.contact_phone_display || listing.contact_phone || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Name</span>
            <p className="font-medium text-gray-900">{listing.contact_name || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Type</span>
            <p className="font-medium text-gray-900 capitalize">{listing.contact_type || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Agency</span>
            <p className="font-medium text-gray-900">{listing.agency_name || '-'}</p>
          </div>
        </div>
      </div>

      {/* Section B - Property Details */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5" /> Property Details
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
          <div>
            <span className="text-gray-500">Bedrooms</span>
            <p className="font-medium text-gray-900">{listing.bedrooms ?? '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Bathrooms</span>
            <p className="font-medium text-gray-900">{listing.bathrooms ?? '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Price</span>
            <p className="font-medium text-gray-900">
              {listing.price ? `$${listing.price.toLocaleString()}` : listing.price_note || '-'}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Floor</span>
            <p className="font-medium text-gray-900">{listing.floor ?? '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Sq. Ft.</span>
            <p className="font-medium text-gray-900">{listing.square_footage ? listing.square_footage.toLocaleString() : '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Rental Term</span>
            <p className="font-medium text-gray-900 capitalize">{listing.rental_term?.replace('_', ' ') || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Furnished</span>
            <p className="font-medium text-gray-900">{listing.is_furnished == null ? '-' : listing.is_furnished ? 'Yes' : 'No'}</p>
          </div>
        </div>
        {activePills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {activePills.map((pill) => (
              <span key={pill.key} className="px-2.5 py-1 text-xs font-medium rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                {pill.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Section C - Location */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" /> Location
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Cross Street 1</span>
            <p className="font-medium text-gray-900">{listing.cross_street_1 || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Cross Street 2</span>
            <p className="font-medium text-gray-900">{listing.cross_street_2 || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Neighborhood</span>
            <p className="font-medium text-gray-900">{listing.neighborhood || '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Geocode</span>
            <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${geocodeBadge.bg} ${geocodeBadge.text}`}>
              {geocodeBadge.label}
            </span>
          </div>
        </div>
      </div>

      {/* Section D - Pipeline Metadata */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" /> Pipeline Metadata
        </h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-gray-500">Confidence</span>
            <p className="font-medium text-gray-900">
              {listing.parse_confidence != null ? `${Math.round(listing.parse_confidence * 100)}%` : '-'}
            </p>
          </div>
          <div>
            <span className="text-gray-500">Times Seen</span>
            <p className="font-medium text-gray-900">{listing.times_seen}</p>
          </div>
          <div>
            <span className="text-gray-500">First Seen</span>
            <p className="font-medium text-gray-900">{listing.date_first_seen ? new Date(listing.date_first_seen).toLocaleDateString() : '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Last Seen</span>
            <p className="font-medium text-gray-900">{listing.date_last_seen ? new Date(listing.date_last_seen).toLocaleDateString() : '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">PDF Date</span>
            <p className="font-medium text-gray-900">{listing.pdf_date ? new Date(listing.pdf_date).toLocaleDateString() : '-'}</p>
          </div>
          <div>
            <span className="text-gray-500">Source</span>
            <p className="font-medium text-gray-900">{listing.source || '-'}</p>
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
