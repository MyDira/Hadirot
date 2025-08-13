import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  Bed, 
  Bath, 
  MapPin, 
  Phone, 
  Heart, 
  ArrowLeft, 
  Car, 
  Utensils, 
  Waves,
  Home,
  Calendar,
  Thermometer,
  Eye,
  Star,
  DollarSign
} from 'lucide-react';
import { Listing } from '../config/supabase';
import { listingsService } from '../services/listings';
import { useAuth } from '../hooks/useAuth';
import { ImageCarousel } from '../components/media/ImageCarousel';
import { SimilarListings } from '../components/listings/SimilarListings';
import { capitalizeName } from '../utils/formatters';

export function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  useEffect(() => {
    if (id) {
      loadListing();
    }
  }, [id, user]);

  const loadListing = async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      
      const data = await listingsService.getListing(id, user?.id);
      
      if (!data) {
        setError('Listing not found or no longer available');
        return;
      }

      setListing(data);
      
      // Increment view count
      await listingsService.incrementListingView(id);
    } catch (err) {
      console.error('Error loading listing:', err);
      setError('Failed to load listing');
    } finally {
      setLoading(false);
    }
  };

  const handleFavoriteToggle = async () => {
    if (!user) {
      navigate('/auth', { state: { isSignUp: true } });
      return;
    }

    if (!listing) return;

    try {
      setFavoriteLoading(true);
      
      if (listing.is_favorited) {
        await listingsService.removeFromFavorites(user.id, listing.id);
        setListing(prev => prev ? { ...prev, is_favorited: false } : null);
      } else {
        await listingsService.addToFavorites(user.id, listing.id);
        setListing(prev => prev ? { ...prev, is_favorited: true } : null);
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      alert('Failed to update favorite. Please try again.');
    } finally {
      setFavoriteLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const getPropertyTypeLabel = (type: string) => {
    switch (type) {
      case 'apartment_building':
        return 'Apartment in Building';
      case 'apartment_house':
        return 'Apartment in House';
      case 'full_house':
        return 'Full House';
      default:
        return type;
    }
  };

  const getParkingLabel = (parking: string) => {
    switch (parking) {
      case 'yes':
        return 'Parking Available';
      case 'included':
        return 'Parking Included';
      case 'optional':
        return 'Optional Parking';
      case 'no':
        return 'No Parking';
      default:
        return parking;
    }
  };

  const getHeatLabel = (heat: string) => {
    switch (heat) {
      case 'included':
        return 'Heat Included';
      case 'tenant_pays':
        return 'Tenant Pays Heat';
      default:
        return heat;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-32 mb-8"></div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <div className="h-96 bg-gray-200 rounded-lg mb-6"></div>
              </div>
              <div className="space-y-4">
                <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="h-20 bg-gray-200 rounded"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            {error || 'Listing not found'}
          </h1>
          <button
            onClick={() => navigate('/browse')}
            className="text-brand-600 hover:text-brand-700 font-medium"
          >
            ← Back to listings
          </button>
        </div>
      </div>
    );
  }

  const images = listing.listing_images?.map(img => ({
    url: img.image_url,
    alt: listing.title
  })) || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </button>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Images Section - Takes up more space */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <ImageCarousel 
                images={images}
                heightClass="h-[50vh] lg:h-[60vh]"
                fit="contain"
                showThumbnails={true}
              />
            </div>
          </div>

          {/* Info Section - Compact but comprehensive */}
          <div className="lg:col-span-2 space-y-6">
            {/* Price and Featured Badge */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="text-3xl font-bold text-gray-900 mb-2">
                    {formatPrice(listing.price)}
                    <span className="text-lg font-normal text-gray-600">/month</span>
                  </div>
                  {listing.is_featured && (
                    <div className="inline-flex items-center bg-accent-500 text-white text-sm px-3 py-1 rounded-full">
                      <Star className="w-4 h-4 mr-1" />
                      Featured
                    </div>
                  )}
                </div>
                <button
                  onClick={handleFavoriteToggle}
                  disabled={favoriteLoading}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  <Heart
                    className={`w-6 h-6 ${
                      listing.is_favorited
                        ? 'text-red-500 fill-current'
                        : 'text-gray-400 hover:text-red-500'
                    }`}
                  />
                </button>
              </div>

              {/* Key Details */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="flex items-center text-gray-700">
                  <Bed className="w-5 h-5 mr-2 text-gray-500" />
                  <span className="font-medium">
                    {listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} BR`}
                  </span>
                </div>
                <div className="flex items-center text-gray-700">
                  <Bath className="w-5 h-5 mr-2 text-gray-500" />
                  <span className="font-medium">{listing.bathrooms} Bath</span>
                </div>
              </div>

              {/* Broker Fee Badge */}
              <div className="mb-4">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  listing.broker_fee 
                    ? 'bg-orange-100 text-orange-800' 
                    : 'bg-green-100 text-green-800'
                }`}>
                  <DollarSign className="w-4 h-4 mr-1" />
                  {listing.broker_fee ? 'Broker Fee' : 'No Fee'}
                </span>
              </div>

              {/* Contact CTA */}
              <div className="pt-4 border-t border-gray-200">
                <a
                  href={`tel:${listing.contact_phone}`}
                  className="w-full bg-brand-700 text-white py-3 px-4 rounded-lg font-semibold hover:bg-brand-800 transition-colors flex items-center justify-center"
                >
                  <Phone className="w-5 h-5 mr-2" />
                  Call {listing.contact_name}
                </a>
                <p className="text-center text-sm text-gray-600 mt-2">
                  {listing.contact_phone}
                </p>
              </div>
            </div>

            {/* Property Details */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Property Details</h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-gray-700">
                    <Home className="w-5 h-5 mr-3 text-gray-500" />
                    <span>Type</span>
                  </div>
                  <span className="font-medium">{getPropertyTypeLabel(listing.property_type)}</span>
                </div>

                {listing.square_footage && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-gray-700">
                      <svg className="w-5 h-5 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V6a2 2 0 012-2h2M4 16v2a2 2 0 002 2h2M16 4h2a2 2 0 012 2v2M16 20h2a2 2 0 002-2v-2" />
                      </svg>
                      <span>Size</span>
                    </div>
                    <span className="font-medium">{listing.square_footage.toLocaleString()} sq ft</span>
                  </div>
                )}

                {listing.floor && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-gray-700">
                      <svg className="w-5 h-5 mr-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span>Floor</span>
                    </div>
                    <span className="font-medium">{listing.floor}</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center text-gray-700">
                    <Car className="w-5 h-5 mr-3 text-gray-500" />
                    <span>Parking</span>
                  </div>
                  <span className="font-medium">{getParkingLabel(listing.parking)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center text-gray-700">
                    <Thermometer className="w-5 h-5 mr-3 text-gray-500" />
                    <span>Heat</span>
                  </div>
                  <span className="font-medium">{getHeatLabel(listing.heat)}</span>
                </div>

                {listing.lease_length && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-gray-700">
                      <Calendar className="w-5 h-5 mr-3 text-gray-500" />
                      <span>Lease</span>
                    </div>
                    <span className="font-medium">{listing.lease_length}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Amenities */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Amenities</h3>
              
              <div className="space-y-3">
                <div className="flex items-center">
                  <Waves className="w-5 h-5 mr-3 text-gray-500" />
                  <span className={listing.washer_dryer_hookup ? 'text-green-700' : 'text-gray-500'}>
                    Washer/Dryer Hookup
                  </span>
                  {listing.washer_dryer_hookup && (
                    <svg className="w-4 h-4 ml-2 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>

                <div className="flex items-center">
                  <Utensils className="w-5 h-5 mr-3 text-gray-500" />
                  <span className={listing.dishwasher ? 'text-green-700' : 'text-gray-500'}>
                    Dishwasher
                  </span>
                  {listing.dishwasher && (
                    <svg className="w-4 h-4 ml-2 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center text-gray-600">
                <Eye className="w-5 h-5 mr-2" />
                <span className="text-sm">{listing.views} views</span>
              </div>
            </div>
          </div>
        </div>

        {/* Full Width Sections */}
        <div className="mt-8 space-y-8">
          {/* Title and Location */}
          <div className="bg-white rounded-xl shadow-sm p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{listing.title}</h1>
            
            <div className="flex items-start mb-6">
              <MapPin className="w-5 h-5 mr-3 text-gray-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-lg text-gray-700 font-medium">{listing.location}</p>
                {listing.neighborhood && (
                  <p className="text-gray-600">{listing.neighborhood}</p>
                )}
              </div>
            </div>

            {/* Description */}
            {listing.description && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Description</h3>
                <div className="prose prose-gray max-w-none">
                  <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {listing.description}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Listing Agent/Owner */}
          <div className="bg-white rounded-xl shadow-sm p-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Listed by</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{capitalizeName(listing.contact_name)}</p>
                {listing.owner?.agency && (
                  <p className="text-gray-600">{capitalizeName(listing.owner.agency)}</p>
                )}
                <p className="text-gray-600 capitalize">
                  {listing.owner?.role === 'agent' ? 'Real Estate Agent' : 
                   listing.owner?.role === 'landlord' ? 'Landlord' : 'Owner'}
                </p>
              </div>
              <a
                href={`tel:${listing.contact_phone}`}
                className="bg-brand-700 text-white py-2 px-6 rounded-lg font-medium hover:bg-brand-800 transition-colors flex items-center"
              >
                <Phone className="w-4 h-4 mr-2" />
                Call
              </a>
            </div>
          </div>
        </div>

        {/* Similar Listings */}
        <SimilarListings listing={listing} />
      </div>
    </div>
  );
}