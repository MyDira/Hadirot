import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, Star, Home, ArrowRight, Loader2, BedDouble, Bath, MapPin } from 'lucide-react';
import { supabase } from '../config/supabase';

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

export function BoostSuccessPage() {
  const [searchParams] = useSearchParams();
  const listingId = searchParams.get('listing_id');

  const [listing, setListing] = useState<BoostListing | null>(null);
  const [loading, setLoading] = useState(!!listingId);

  useEffect(() => {
    if (!listingId) return;

    supabase.functions
      .invoke('get-boost-listing', { body: { listing_id: listingId } })
      .then(({ data }) => {
        if (data?.listing) {
          setListing(data.listing as BoostListing);
        }
      })
      .finally(() => setLoading(false));
  }, [listingId]);

  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="max-w-lg mx-auto">

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold text-[#273140] mb-2">Your listing is being boosted!</h1>
          <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto">
            Payment confirmed. Your featured badge and boosted placement will activate shortly — usually within a few minutes.
          </p>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center justify-center mb-6">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : listing ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
            {listing.image_url ? (
              <div className="relative h-40">
                <img
                  src={listing.image_url}
                  alt="Listing"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                <div className="absolute bottom-3 left-4">
                  <span className="inline-flex items-center gap-1 bg-amber-400 text-amber-900 text-xs font-semibold px-2.5 py-1 rounded-full">
                    <Star className="w-3 h-3" />
                    Featured
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-24 bg-gradient-to-br from-amber-50 to-amber-100 flex items-center justify-center relative">
                <Home className="w-8 h-8 text-amber-300" />
                <div className="absolute bottom-3 left-4">
                  <span className="inline-flex items-center gap-1 bg-amber-400 text-amber-900 text-xs font-semibold px-2.5 py-1 rounded-full">
                    <Star className="w-3 h-3" />
                    Featured
                  </span>
                </div>
              </div>
            )}

            <div className="px-5 py-4">
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
                <p className="text-sm font-bold text-[#273140] shrink-0">{formatPrice(listing)}</p>
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
          </div>
        ) : null}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 mb-6">
          <p className="text-sm font-medium text-[#273140] mb-3">What happens next</p>
          <div className="space-y-3">
            {[
              'Your listing appears at the top of search results',
              'A featured badge displays on the map pin',
              'Your listing is included in the homepage carousel',
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-5 h-5 bg-green-50 rounded-full flex items-center justify-center shrink-0">
                  <CheckCircle className="w-3 h-3 text-green-500" />
                </div>
                <p className="text-sm text-gray-600">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {listingId && (
            <Link
              to={`/listing/${listingId}`}
              className="flex-1 flex items-center justify-center gap-2 bg-[#273140] text-white font-semibold py-3 px-5 rounded-xl text-sm hover:bg-[#1e2732] transition-colors"
            >
              View Your Listing
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
          <Link
            to="/browse"
            className="flex-1 flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 font-semibold py-3 px-5 rounded-xl text-sm hover:bg-gray-50 transition-colors"
          >
            <Home className="w-4 h-4" />
            Browse All Listings
          </Link>
        </div>

      </div>
    </div>
  );
}
