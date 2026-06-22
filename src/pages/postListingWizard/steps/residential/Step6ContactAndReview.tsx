import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, CheckCircle, Image, AlertCircle, CreditCard, UserPlus, ArrowRight } from 'lucide-react';
import type { ListingFormData } from '../../../postListing/types';
import type { MediaFile } from '../../../../components/shared/MediaUploader';
import type { Profile } from '../../../../config/supabase';
import { StepTips } from '../../StepTips';
import { useMonetizationGate } from '../../../../hooks/useMonetizationGate';
import {
  PaymentChoice,
  type WizardPaymentChoice,
  WIZARD_PAYMENT_CHOICE_STORAGE_KEY,
  isValidWizardPaymentChoice,
} from '../../components/PaymentChoice';
import { PostingOptionsModal } from '../../components/PostingOptionsModal';

const TIPS = {
  heading: 'Contact & Review',
  bullets: [
    'Double-check your phone number — that\'s how renters reach you.',
    'We\'ll send you SMS updates on your listing status — standard rates apply.',
    'Your listing will be reviewed before going live.',
  ],
};

const LEASE_LABELS: Record<string, string> = {
  short_term: 'Short Term',
  long_term_annual: 'Long Term / Annual',
  summer_rental: 'Summer Rental',
  winter_rental: 'Winter Rental',
};

const PARKING_LABELS: Record<string, string> = {
  no: 'No Parking',
  yes: 'Paid',
  included: 'Included',
  optional: 'Optional',
};

interface ReviewRow {
  label: string;
  value: string;
}

interface Step6Props {
  formData: ListingFormData;
  updateFormData: (updates: Partial<ListingFormData>) => void;
  onNext: () => void;
  onBack: () => void;
  mediaFiles: MediaFile[];
  resolvedNeighborhood: string;
  loading: boolean;
  uploadingMedia: boolean;
  submitError: string | null;
  onSubmit: (paymentChoice?: WizardPaymentChoice | null) => void;
  profile: Profile | null;
  submitLabel?: string;
  /** When true (residential rental, edit context, >10d old), contact_phone is locked. */
  isLocked?: boolean;
  /** Whether a user is signed in. Logged-out posters see a "create a free account" CTA
   *  instead of the posting options. */
  isAuthenticated?: boolean;
  /** Opens the auth modal defaulting to the sign-up tab (logged-out CTA). */
  onRequestAccount?: () => void;
  /** Post the listing (held) and route to subscription Stripe checkout for the chosen plan. */
  onSubscribeAndPost?: (plan: 'agent' | 'vip') => void;
}

export function Step6ContactAndReview({
  formData,
  updateFormData,
  onBack,
  mediaFiles,
  resolvedNeighborhood,
  loading,
  uploadingMedia,
  submitError,
  onSubmit,
  profile,
  submitLabel = 'Post Listing',
  isLocked = false,
  isAuthenticated = true,
  onRequestAccount,
  onSubscribeAndPost,
}: Step6Props) {
  const navigate = useNavigate();
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);

  // Pre-fill contact info from profile on first load
  useEffect(() => {
    if (profile?.full_name && !formData.contact_name) {
      updateFormData({ contact_name: profile.full_name });
    }
    if (profile?.phone && !formData.contact_phone) {
      updateFormData({ contact_phone: profile.phone });
    }
  }, [profile]);

  // Monetization branch based on phone + subscription state.
  const gate = useMonetizationGate({
    contactPhone: formData.contact_phone,
    isAdmin: profile?.is_admin === true,
    enabled: true,
  });

  // Locally-tracked payment choice. Auto-defaulted by branch (admin/subscription
  // are forced; trial_eligible defaults to free_trial; must_pay forces must_pay).
  // Initial value: read from sessionStorage so a sign-in-redirect doesn't lose
  // the user's selection.
  const [paymentChoice, setPaymentChoice] = useState<WizardPaymentChoice | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const stored = window.sessionStorage.getItem(WIZARD_PAYMENT_CHOICE_STORAGE_KEY);
      return isValidWizardPaymentChoice(stored) ? stored : null;
    } catch {
      return null;
    }
  });

  // Persist paymentChoice across sign-in.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (paymentChoice) {
        window.sessionStorage.setItem(WIZARD_PAYMENT_CHOICE_STORAGE_KEY, paymentChoice);
      } else {
        window.sessionStorage.removeItem(WIZARD_PAYMENT_CHOICE_STORAGE_KEY);
      }
    } catch {
      // sessionStorage may be unavailable (private mode); fall through silently.
    }
  }, [paymentChoice]);

  useEffect(() => {
    if (gate.mode === 'disabled' || gate.mode === 'agent_free') {
      // Master switch off, or the poster is a free-posting agent — clear any
      // stored choice so the listing posts the legacy way (payment_kind NULL,
      // normal admin-controlled expiration).
      setPaymentChoice(null);
    } else if (gate.mode === 'subscription') {
      setPaymentChoice('subscription_covered');
    } else if (gate.mode === 'admin') {
      setPaymentChoice('admin');
    } else if (gate.mode === 'must_pay') {
      setPaymentChoice('must_pay');
    } else if (gate.mode === 'trial_eligible' && paymentChoice == null) {
      setPaymentChoice('free_trial');
    } else if (gate.mode === 'subscription_at_cap') {
      setPaymentChoice(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.mode]);

  // Computed submit button label/disable state.
  const baseCanSubmit = !!formData.contact_name.trim() && !!formData.contact_phone.trim() && formData.terms_agreed;
  const isBlocked = gate.mode === 'subscription_at_cap' || gate.mode === 'loading';
  // When monetization is disabled (master switch off), submit is unblocked regardless of paymentChoice.
  const canSubmit =
    baseCanSubmit &&
    !isBlocked &&
    (paymentChoice !== null ||
      gate.mode === 'admin' ||
      gate.mode === 'disabled' ||
      gate.mode === 'agent_free');

  // When the submit button is disabled, explain why — a silent greyed-out
  // button with no feedback is impossible to debug for the poster.
  const blockingReason = (() => {
    if (loading || uploadingMedia) return null; // button shows its own spinner
    if (canSubmit) return null;
    if (gate.mode === 'loading') return 'Checking your posting options…';
    if (gate.mode === 'subscription_at_cap')
      return 'Your subscription has reached its listing limit. Renew or remove a listing to post another.';
    if (!formData.contact_name.trim()) return 'Enter your contact name above.';
    if (!formData.contact_phone.trim()) return 'Enter a contact phone number above.';
    if (!formData.terms_agreed) return 'Check the SMS-consent box below to continue.';
    if (paymentChoice === null) return 'Choose a posting option above.';
    return 'Complete the required fields above to post.';
  })();

  const dynamicSubmitLabel = (() => {
    if (paymentChoice === 'pay_at_posting') return 'Pay $25 & post';
    if (paymentChoice === 'must_pay') return 'Pay $25 & post';
    return submitLabel;
  })();
  const isPayPath = paymentChoice === 'pay_at_posting' || paymentChoice === 'must_pay';

  // Logged-in posters without an active subscription choose how to post in a
  // modal (free trial / $25 / upgrade) rather than via inline cards.
  const usesOptionsModal =
    isAuthenticated && (gate.mode === 'trial_eligible' || gate.mode === 'must_pay');
  const trialEligible = gate.mode === 'trial_eligible';

  // "Continue" (opens the options modal) only needs the base fields, not a
  // pre-selected payment choice — the choice is made inside the modal.
  const canContinue = baseCanSubmit && !isBlocked;

  const bedroomLabel =
    formData.bedrooms === 0
      ? 'Studio'
      : formData.additional_rooms > 0
      ? `${formData.bedrooms}+${formData.additional_rooms} BR`
      : `${formData.bedrooms} BR`;

  const reviewSections: { title: string; rows: ReviewRow[]; longValue?: boolean }[] = [
    {
      title: 'Listing Details',
      rows: [
        { label: 'Title', value: formData.title?.trim() || '(auto-generated on submit)' },
        { label: 'Description', value: formData.description?.trim() || '' },
      ].filter(r => r.value),
      longValue: true,
    },
    {
      title: 'Property',
      rows: [
        {
          label: 'Type',
          value: (formData.property_type || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        },
        { label: 'Bedrooms', value: bedroomLabel },
        { label: 'Bathrooms', value: String(formData.bathrooms) },
        ...(formData.floor != null ? [{ label: 'Floor', value: String(formData.floor) }] : []),
      ].filter(r => r.value),
    },
    {
      title: 'Price & Terms',
      rows: [
        {
          label: 'Rent',
          value: formData.call_for_price
            ? 'Call for Price'
            : formData.price
            ? `$${formData.price.toLocaleString()}/mo`
            : '',
        },
        {
          label: 'Lease',
          value: formData.lease_length ? LEASE_LABELS[formData.lease_length] || formData.lease_length : '',
        },
        { label: 'Broker Fee', value: formData.broker_fee ? 'Yes (disclosed)' : 'No Fee' },
      ].filter(r => r.value),
    },
    {
      title: 'Location',
      rows: [
        { label: 'Cross Streets', value: formData.location },
        { label: 'Neighborhood', value: resolvedNeighborhood },
      ].filter(r => r.value),
    },
    {
      title: 'Features',
      rows: [
        {
          label: 'Utilities',
          value: (formData.utilities_included ?? []).join(', ') || '',
        },
        { label: 'Parking', value: PARKING_LABELS[formData.parking] || '' },
        ...(formData.ac_type ? [{ label: 'AC', value: formData.ac_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) }] : []),
        ...(formData.washer_dryer_hookup ? [{ label: 'Washer/Dryer', value: 'Yes' }] : []),
        ...(formData.dishwasher ? [{ label: 'Dishwasher', value: 'Yes' }] : []),
        ...(formData.square_footage ? [{ label: 'Square Footage', value: `${formData.square_footage} sq ft` }] : []),
      ].filter(r => r.value),
    },
  ];

  const photoCount = mediaFiles.filter(m => m.type === 'image').length;

  return (
    <div className="flex gap-8 items-start">
      <div className="flex-1 min-w-0 space-y-6">
        {/* Contact Info */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-5">Contact Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.contact_name}
                onChange={e => updateFormData({ contact_name: e.target.value })}
                placeholder="Full name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number <span className="text-red-500">*</span>
                {isLocked && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    Locked
                  </span>
                )}
              </label>
              <input
                type="tel"
                value={formData.contact_phone}
                onChange={e => updateFormData({ contact_phone: e.target.value })}
                placeholder="e.g. 718-555-1234"
                disabled={isLocked}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-accent-500 focus:border-accent-500 ${isLocked ? 'bg-gray-50 cursor-not-allowed opacity-70' : ''}`}
                title={isLocked ? 'Contact phone is locked 10 days after posting. Contact support if you need a change.' : undefined}
              />
            </div>
          </div>
        </div>

        {/* Review Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-1">Review Your Listing</h2>
          <p className="text-sm text-gray-500 mb-5">Double-check your details before submitting</p>

          <div className="space-y-5">
            {reviewSections.map(section =>
              section.rows.length > 0 ? (
                <div key={section.title}>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    {section.title}
                  </h3>
                  <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
                    {section.rows.map(row => (
                      <div
                        key={row.label}
                        className={`px-4 py-2.5 ${section.longValue ? 'flex flex-col gap-0.5' : 'flex justify-between items-baseline'}`}
                      >
                        <span className="text-sm text-gray-500">{row.label}</span>
                        <span className={`text-sm font-medium text-gray-900 ${section.longValue ? '' : 'text-right ml-4 max-w-[60%] truncate'}`}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            )}

            {/* Photos */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Photos
                {photoCount > 0 && (
                  <span className="ml-2 text-green-600 normal-case font-normal">
                    {photoCount} uploaded <CheckCircle className="inline w-3 h-3 mb-0.5" />
                  </span>
                )}
              </h3>
              {photoCount > 0 ? (() => {
                const photos = mediaFiles.filter(m => m.type === 'image');
                // Featured first, then the rest in order
                const sorted = [
                  ...photos.filter(p => p.is_featured),
                  ...photos.filter(p => !p.is_featured),
                ];
                const MAX_SHOWN = 8;
                const shown = sorted.slice(0, MAX_SHOWN);
                const overflow = sorted.length - shown.length;
                return (
                  <div className="flex flex-wrap gap-2">
                    {shown.map((photo, i) => (
                      <div key={photo.id} className="relative flex-shrink-0">
                        <img
                          src={photo.url}
                          alt={photo.originalName ?? `Photo ${i + 1}`}
                          className="w-16 h-16 object-cover rounded-md border border-gray-200"
                        />
                        {photo.is_featured && (
                          <span className="absolute bottom-0.5 left-0.5 bg-accent-500 text-white text-[9px] font-semibold px-1 rounded leading-tight">
                            Main
                          </span>
                        )}
                      </div>
                    ))}
                    {overflow > 0 && (
                      <div className="w-16 h-16 rounded-md border border-gray-200 bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-500">
                        +{overflow}
                      </div>
                    )}
                  </div>
                );
              })() : (
                <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-2.5 flex items-center gap-2 text-sm text-gray-400">
                  <Image className="w-4 h-4" />
                  No photos uploaded
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Payment Choice — only for authed posters NOT using the options modal
            (i.e. subscription / at-cap / loading / error). Logged-out posters
            see the account CTA below; trial_eligible / must_pay posters choose
            inside PostingOptionsModal. */}
        {isAuthenticated && !usesOptionsModal && (
          <PaymentChoice
            mode={gate.mode}
            subscription={gate.subscription}
            subscriptionListingsUsed={gate.subscriptionListingsUsed}
            errorMessage={gate.errorMessage}
            choice={paymentChoice}
            onChoiceChange={setPaymentChoice}
            onWantsToSubscribe={() => navigate('/dashboard?subscribe=open')}
          />
        )}

        {/* SMS Consent + Submit */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={formData.terms_agreed}
              onChange={e => updateFormData({ terms_agreed: e.target.checked })}
              className="mt-1 h-4 w-4 text-accent-500 focus:ring-accent-500 border-gray-300 rounded"
            />
            <span className="text-sm text-gray-700">
              I agree to receive SMS messages about my listing and inquiries. Message and data rates may apply. See{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-accent-600 font-semibold hover:underline">
                Privacy Policy
              </a>{' '}
              and{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-accent-600 font-semibold hover:underline">
                Terms of Use
              </a>{' '}
              for more information.
            </span>
          </label>

          {submitError && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {submitError}
            </div>
          )}

          {/* Logged-out posters: a friendly "create a free account" CTA. */}
          {!isAuthenticated && (
            <div className="mt-5 rounded-xl border-2 border-accent-200 bg-gradient-to-br from-white to-accent-50/50 p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent-100 border border-accent-200 flex items-center justify-center text-accent-700 flex-shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900">
                    Almost there — let's get you an account
                  </h3>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                    You'll need a free account to post. It takes a few seconds, lets you manage and
                    edit your listing anytime, and keeps renters' inquiries in one place.
                  </p>
                  <button
                    type="button"
                    onClick={onRequestAccount}
                    disabled={!canContinue}
                    className="mt-4 inline-flex items-center gap-2 bg-accent-500 text-white px-6 py-3 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create a free account to post
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  {!canContinue && blockingReason && (
                    <p className="mt-2 text-xs text-amber-700 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      {blockingReason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {isAuthenticated && blockingReason && (
            <div className="mt-4 flex items-center gap-2 text-sm text-amber-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {blockingReason}
            </div>
          )}

          <div className="flex items-center justify-between mt-6">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            {isAuthenticated && usesOptionsModal ? (
              /* Logged-in, no subscription: choose how to post in the modal. */
              <button
                type="button"
                onClick={() => setOptionsModalOpen(true)}
                disabled={!canContinue || loading || uploadingMedia}
                className="flex items-center gap-2 bg-accent-500 text-white px-8 py-3 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : uploadingMedia ? (
                  'Uploading…'
                ) : (
                  <>
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            ) : isAuthenticated ? (
              /* Subscription / admin / disabled / at-cap: post directly. */
              <button
                type="button"
                onClick={() => onSubmit(paymentChoice)}
                disabled={!canSubmit || loading || uploadingMedia}
                className="flex items-center gap-2 bg-accent-500 text-white px-8 py-3 rounded-lg text-sm font-semibold hover:bg-accent-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : uploadingMedia ? (
                  'Uploading…'
                ) : (
                  <>
                    {isPayPath ? <CreditCard className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {dynamicSubmitLabel}
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <StepTips {...TIPS} />

      {/* Posting options modal (logged-in posters without a subscription). */}
      <PostingOptionsModal
        isOpen={optionsModalOpen}
        onClose={() => setOptionsModalOpen(false)}
        trialEligible={trialEligible}
        busy={loading || uploadingMedia}
        error={submitError}
        onChooseTrial={() => onSubmit('free_trial')}
        onChoosePay={() => onSubmit(trialEligible ? 'pay_at_posting' : 'must_pay')}
        onChooseSubscribe={(plan) => {
          if (onSubscribeAndPost) onSubscribeAndPost(plan);
        }}
      />
    </div>
  );
}
