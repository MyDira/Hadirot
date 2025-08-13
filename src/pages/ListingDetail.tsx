import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Bed, 
  Bath, 
  MapPin, 
  Phone, 
  User, 
  Building, 
  Car, 
  Thermometer,
  Utensils,
  Home,
  Star,
  Heart,
  Eye,
  ArrowLeft
} from 'lucide-react';
import { ImageCarousel } from '../components/media/ImageCarousel';
import { SimilarListings } from '../components/listings/SimilarListings';
import { Listing } from '../config/supabase';
import { listingsService } from '../services/listings';
import { useAuth } from '../hooks/useAuth';
import { capitalizeName } from '../utils/formatters';

export function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFavorited, setIsFavorited] = useState(false);

  useEffect(() => {
    if (id) {
      loadListing();
    }
  }, [id, user]);

  const loadListing = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const data = await listingsService.getListing(id, user?.id);
      
      if (!data) {
        setError('Listing not found or no longer available');
        return;
      }

      setListing(data);
      setIsFavorited(data.is_favorited || false);
      
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
      if (isFavorited) {
        await listingsService.removeFromFavorites(user.id, listing.id);
        setIsFavorited(false);
      } else {
        await listingsService.addToFavorites(user.id, listing.id);
        setIsFavorited(true);
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      alert('Failed to update favorite. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="h-96 bg-gray-200 rounded-lg"></div>
            <div className="space-y-4">
              <div className="h-6 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {error || 'Listing not found'}
          </h2>
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

  const getPosterLabel = () => {
    if (listing.owner?.role === 'agent' && listing.owner?.agency) {
      return `Listed by ${capitalizeName(listing.owner.agency)}`;
    }
    return 'Listed by Owner';
  };

  const images = listing.listing_images?.map(img => ({
    url: img.image_url,
    alt: listing.title
  })) || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center text-gray-600 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back
      </button>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Left Column - Images */}
        <div className="space-y-4">
          <ImageCarousel
            images={images}
            heightClass="h-[50vh] lg:h-[60vh]"
            showThumbnails={true}
            fit="cover"
          />
        </div>

        {/* Right Column - Information */}
        <div className="space-y-6">
          {/* Title and Tags */}
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {listing.is_featured && (
                <span className="inline-flex items-center bg-accent-500 text-white text-xs px-2 py-1 rounded-full">
                  <Star className="w-3 h-3 mr-1" />
                  Featured
                </span>
              )}
              <span className="text-sm text-gray-600">
                {getPosterLabel()}
              </span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {listing.title}
            </h1>
          </div>

          {/* Location */}
          <div className="flex items-start text-gray-600">
            <MapPin className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-medium text-gray-900">{listing.location}</div>
              {listing.neighborhood && (
                <div className="text-sm">{listing.neighborhood}</div>
              )}
            </div>
          </div>

          {/* Price */}
          <div className="text-4xl font-bold text-brand-700">
            {formatPrice(listing.price)}
            <span className="text-lg font-normal text-gray-600">/month</span>
          </div>

          {/* Basic Information */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center">
                <Bed className="w-4 h-4 mr-2 text-gray-500" />
                <span className="text-sm">
                  {listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} BR`}
                </span>
              </div>
              <div className="flex items-center">
                <Bath className="w-4 h-4 mr-2 text-gray-500" />
                <span className="text-sm">{listing.bathrooms} Bath</span>
              </div>
              <div className="flex items-center">
                <span className="text-sm">
                  {listing.broker_fee ? 'Broker Fee' : 'No Fee'}
                </span>
              </div>
              <div className="flex items-center">
                <Home className="w-4 h-4 mr-2 text-gray-500" />
                <span className="text-sm">{getPropertyTypeLabel(listing.property_type)}</span>
              </div>
            </div>
          </div>

          {/* Contact Information Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h3>
            <div className="space-y-3">
              <div className="flex items-center">
                <User className="w-5 h-5 mr-3 text-gray-400" />
                <span className="font-medium">{listing.contact_name}</span>
              </div>
              <div className="flex items-center">
                <Phone className="w-5 h-5 mr-3 text-gray-400" />
                <a 
                  href={`tel:${listing.contact_phone}`}
                  className="text-brand-600 hover:text-brand-700 font-medium"
                >
                  {listing.contact_phone}
                </a>
              </div>
              {listing.owner?.agency && (
                <div className="flex items-center">
                  <Building className="w-5 h-5 mr-3 text-gray-400" />
                  <span>{capitalizeName(listing.owner.agency)}</span>
                </div>
              )}
            </div>
            
            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              <a
                href={`tel:${listing.contact_phone}`}
                className="flex-1 bg-brand-600 text-white px-4 py-3 rounded-lg font-semibold text-center hover:bg-brand-700 transition-colors"
              >
                Call Now
              </a>
              <button
                onClick={handleFavoriteToggle}
                className={`px-4 py-3 rounded-lg border transition-colors ${
                  isFavorited
                    ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Heart className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
              </button>
            </div>
          </div>

          {/* Property Details */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Property Details</h3>
            <div className="grid grid-cols-1 gap-3">
              {listing.square_footage && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Square Footage:</span>
                  <span className="font-medium">{listing.square_footage.toLocaleString()} sq ft</span>
                </div>
              )}
              {listing.floor && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Floor:</span>
                  <span className="font-medium">{listing.floor}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Parking:</span>
                <span className="font-medium">{getParkingLabel(listing.parking)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Heat:</span>
                <span className="font-medium">{getHeatLabel(listing.heat)}</span>
              </div>
              {listing.lease_length && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Lease Length:</span>
                  <span className="font-medium">{listing.lease_length}</span>
                </div>
              )}
            </div>
          </div>

          {/* Amenities */}
          {(listing.washer_dryer_hookup || listing.dishwasher) && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3">Amenities</h3>
              <div className="space-y-2">
                {listing.washer_dryer_hookup && (
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                    <span className="text-sm">Washer/Dryer Hookup</span>
                  </div>
                )}
                {listing.dishwasher && (
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                    <span className="text-sm">Dishwasher</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Views Counter */}
          <div className="flex items-center text-sm text-gray-500">
            <Eye className="w-4 h-4 mr-1" />
            <span>{listing.views} views</span>
          </div>
        </div>
      </div>

      {/* Description - Full Width Below Images */}
      {listing.description && (
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Description</h2>
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="prose max-w-none text-gray-700 leading-relaxed">
              {listing.description.split('\n').map((paragraph, index) => (
                <p key={index} className="mb-4 last:mb-0">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Similar Listings */}
      <SimilarListings listing={listing} />
    </div>
  );
}