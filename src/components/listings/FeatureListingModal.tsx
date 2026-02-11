import React, { useState } from 'react';
import { X, Star, Clock, Zap, AlertCircle, Loader2, Check } from 'lucide-react';
import { FEATURED_PLANS, stripeService } from '../../services/stripe';
import type { Listing } from '../../config/supabase';

interface FeatureListingModalProps {
  isOpen: boolean;
  onClose: () => void;
  listing: Listing;
}

export function FeatureListingModal({ isOpen, onClose, listing }: FeatureListingModalProps) {
  const [selectedPlan, setSelectedPlan] = useState<string>('14day');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isPendingApproval = !listing.approved;

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await stripeService.createCheckoutSession(listing.id, selectedPlan);
      if (result.url) {
        window.location.href = result.url;
      }
    } catch (err: any) {
      const msg = err?.message || 'Something went wrong. Please try again.';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="relative bg-white rounded-xl shadow-2xl max-w-xl w-full mx-auto overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
              <Star className="w-4.5 h-4.5 text-amber-500" />
            </div>
            <h3 className="text-lg font-semibold text-[#273140]">Feature Your Listing</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="bg-gray-50 rounded-lg px-4 py-3 mb-5">
            <p className="text-sm text-gray-500">Featuring</p>
            <p className="text-sm font-medium text-[#273140] truncate">
              {listing.title || listing.location || 'Your Listing'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5">
            {FEATURED_PLANS.map((plan) => {
              const isSelected = selectedPlan === plan.id;
              const isBestValue = plan.id === '14day';

              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`relative rounded-xl border-2 p-4 text-center transition-all ${
                    isSelected
                      ? 'border-brand-600 bg-brand-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  {isBestValue && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-brand-600 text-white text-[10px] font-semibold uppercase tracking-wider rounded-full whitespace-nowrap">
                      Best Value
                    </span>
                  )}
                  <div className="mt-1">
                    <p className={`text-sm font-medium ${isSelected ? 'text-brand-700' : 'text-gray-600'}`}>
                      {plan.name}
                    </p>
                    <p className={`text-2xl font-bold mt-1 ${isSelected ? 'text-brand-700' : 'text-[#273140]'}`}>
                      ${plan.price}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{plan.duration}</p>
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-brand-600 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="space-y-2.5 mb-5">
            <div className="flex items-start gap-2.5 text-sm text-gray-500">
              <Zap className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <span>Featured listings appear at the top of search results and the homepage</span>
            </div>
            <div className="flex items-start gap-2.5 text-sm text-gray-500">
              <Clock className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
              <span>Promo codes can be entered at checkout</span>
            </div>
          </div>

          {isPendingApproval && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">
                Your feature period will begin once your listing is approved.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            onClick={handleCheckout}
            disabled={loading}
            className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Redirecting to checkout...
              </>
            ) : (
              <>
                <Star className="w-4 h-4" />
                Feature Now - ${FEATURED_PLANS.find(p => p.id === selectedPlan)?.price}
              </>
            )}
          </button>

          <p className="text-xs text-gray-400 text-center mt-3">
            Secure payment powered by Stripe
          </p>
        </div>
      </div>
    </div>
  );
}
