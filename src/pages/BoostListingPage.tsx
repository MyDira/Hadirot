import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Star, Check, AlertCircle, Loader2, CheckCircle, XCircle, Home, BedDouble, Bath, MapPin } from 'lucide-react';
import { supabase } from '../config/supabase';
import { FEATURED_PLANS } from '../services/stripe';

interface BoostListing {
  id: string;
  bedrooms: number | null;
  bathrooms: number | null;
  price: number | null;
  asking_price: number | null;
  neighborhood: string | null;
  cross_street_a: string | null;
  cross_street_b: string | null;
  listing_type: string;
  call_for_price: boolean;
  title: string | null;
  location: string | null;
  image_url: string | null;
  approved: boolean;
}

interface BoostData {
  listing: BoostListing;
  already_featured: boolean;
  already_pending: boolean;
  is_active: boolean;
}

function formatPrice(listing: BoostListing): string {
  if (listing.call_for_price) return 'Call for Price';
  const isSale = listing.listing_type === 'sale';
  const value = isSale ? listing.asking_price : listing.price;
  if (value === null || value === undefined) return 'Price on Request';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value) + (isSale ? '' : '/mo');
}

function formatAddress(listing: BoostListing): string {
  if (listing.cross_street_a && listing.cross_street_b) {
    return `${listing.cross_street_a} & ${listing.cross_street_b}${listing.neighborhood ? `, ${listing.neighborhood}` : ''}`;
  }
  if (listing.neighborhood) return listing.neighborhood;
  return listing.location || 'Brooklyn, NY';
}

export function BoostListingPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const [searchParams] = useSearchParams();
  const cancelled = searchParams.get('cancelled') === 'true';

  const [boostData, setBoostData] = useState<BoostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>('14day');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [cancelledDismissed, setCancelledDismissed] = useState(false);

  useEffect(() => {
    if (!listingId) {
      setError('Invalid listing link.');
      setLoading(false);
      return;
    }

    supabase.functions
      .invoke('get-boost-listing', { body: { listing_id: listingId } })
      .then(({ data, error: fnError }) => {
        if (fnError) {
          setError('Could not load listing details. Please try again.');
        } else if (data?.error) {
          setError(data.error === 'Listing not found' ? 'This listing could not be found.' : data.error);
        } else {
          setBoostData(data as BoostData);
        }
      })
      .finally(() => setLoading(false));
  }, [listingId]);

  const handleCheckout = async () => {
    if (!listingId || !selectedPlan) return;
    setCheckoutLoading(true);
    setCheckoutError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-boost-checkout', {
        body: { listing_id: listingId, plan: selectedPlan },
      });

      if (fnError || data?.error) {
        setCheckoutError(data?.error || 'Something went wrong. Please try again.');
        setCheckoutLoading(false);
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
      }
    } catch {
      setCheckoutError('Something went wrong. Please try again.');
      setCheckoutLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-[#273140] mb-2">Listing Not Available</h1>
          <p className="text-gray-500 mb-6">{error}</p>
          <Link
            to="/browse"
            className="inline-flex items-center gap-2 bg-[#273140] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#1e2732] transition-colors"
          >
            <Home className="w-4 h-4" />
            Browse Listings
          </Link>
        </div>
      </div>
    );
  }

  if (!boostData) return null;

  const { listing, already_featured, already_pending, is_active } = boostData;

  if (!is_active) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-gray-400" />
          </div>
          <h1 className="text-xl font-semibold text-[#273140] mb-2">Listing No Longer Active</h1>
          <p className="text-gray-500 mb-6">This listing has been deactivated and cannot be boosted.</p>
          <Link
            to="/browse"
            className="inline-flex items-center gap-2 bg-[#273140] text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-[#1e2732] transition-colors"
          >
            <Home className="w-4 h-4" />
            Browse Listings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto">

        {cancelled && !cancelledDismissed && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-amber-700 flex-1">Checkout was cancelled. Your listing has not been charged.</p>
            <button
              onClick={() => setCancelledDismissed(true)}
              className="text-amber-500 hover:text-amber-700 text-xs font-medium ml-2 shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-gray-100">
            <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
              <Star className="w-4 h-4 text-amber-500" />
            </div>
            <h1 className="text-lg font-semibold text-[#273140]">Feature Your Listing</h1>
          </div>

          {listing.image_url ? (
            <div className="relative h-48 bg-gray-100">
              <img
                src={listing.image_url}
                alt="Listing"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </div>
          ) : (
            <div className="h-32 bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <Home className="w-10 h-10 text-gray-300" />
            </div>
          )}

          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-base font-semibold text-[#273140] truncate">
                  {listing.title || formatAddress(listing)}
                </p>
                <div className="flex items-center gap-1 mt-1 text-sm text-gray-500">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{formatAddress(listing)}</span>
                </div>
              </div>
              <p className="text-base font-bold text-[#273140] shrink-0">{formatPrice(listing)}</p>
            </div>
            <div className="flex items-center gap-4 mt-2">
              {listing.bedrooms !== null && (
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <BedDouble className="w-3.5 h-3.5" />
                  <span>{listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} bed`}</span>
                </div>
              )}
              {listing.bathrooms !== null && (
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <Bath className="w-3.5 h-3.5" />
                  <span>{listing.bathrooms} bath</span>
                </div>
              )}
            </div>
          </div>

          <div className="px-6 py-5">
            {already_featured ? (
              <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">This listing is already featured</p>
                  <p className="text-sm text-green-700 mt-0.5">Your listing is currently boosted and appearing at the top of search results.</p>
                </div>
              </div>
            ) : already_pending ? (
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">A feature purchase is already pending</p>
                  <p className="text-sm text-blue-700 mt-0.5">A boost for this listing is being processed. It will activate shortly.</p>
                </div>
              </div>
            ) : (
              <>
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
                          <p className="text-xs text-gray-400 mt-1">
                            {plan.id === '7day' ? 'Quick boost' : plan.id === '30day' ? 'Maximum exposure' : plan.duration}
                          </p>
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

                {!listing.approved && (
                  <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-5">
                    <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-amber-700">
                      Your feature period will begin once your listing is approved.
                    </p>
                  </div>
                )}

                {checkoutError && (
                  <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    <p className="text-sm text-red-600">{checkoutError}</p>
                  </div>
                )}

                <div className="space-y-2 mt-2 mb-5">
                  {[
                    'Extra boosted placement in search results',
                    'Stand out with a featured badge on the map',
                    'Get featured in the homepage carousel',
                    'More views means more inquiries',
                  ].map((benefit) => (
                    <div key={benefit} className="flex items-center gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-green-600 shrink-0" />
                      <span>{benefit}</span>
                    </div>
                  ))}
                </div>

                <p className="text-xs text-gray-400 text-center mb-4">
                  Promo codes can be entered at checkout
                </p>

                <button
                  onClick={handleCheckout}
                  disabled={checkoutLoading}
                  className="w-full border-2 border-accent-500 bg-transparent text-black font-bold py-3 px-6 rounded-lg transition-all duration-300 hover:bg-accent-600 hover:text-white hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {checkoutLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Redirecting to checkout...
                    </>
                  ) : (
                    `Get Featured → ${selectedPlan === '7day' ? '7 Days' : selectedPlan === '14day' ? '14 Days' : '30 Days'}`
                  )}
                </button>

                <p className="text-xs text-gray-500 text-center mt-2">
                  You'll be securely redirected to Stripe for checkout
                </p>
              </>
            )}
          </div>
        </div>

        <p className="text-center text-sm text-gray-400">
          <Link to={`/listing/${listing.id}`} className="hover:text-gray-600 underline underline-offset-2">
            View listing page
          </Link>
        </p>
      </div>
    </div>
  );
}
