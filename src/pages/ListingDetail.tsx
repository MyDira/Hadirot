import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Bed, Bath, Car, MapPin, Star, Heart, Phone, User, Calendar, Home as HomeIcon, Square, ArrowLeft, Flame, Droplets, WashingMachine } from 'lucide-react';
import { Listing } from '../config/supabase';
import { listingsService } from '../services/listings';
import { useAuth } from '../hooks/useAuth';
import { SimilarListings } from '../components/listings/SimilarListings';

export function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const hasViewedRef = React.useRef(false);

  const getOrdinalSuffixText = (num: number): string => {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) {
      return num + "st";
    }
    if (j === 2 && k !== 12) {
      return num + "nd";
    }
    if (j === 3 && k !== 13) {
      return num + "rd";
    }
    return num + "th";
  };

  const getOrdinalWordText = (num: number): string => {
    const ordinals = [
      '', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth',
      'Eleventh', 'Twelfth', 'Thirteenth', 'Fourteenth', 'Fifteenth', 'Sixteenth', 'Seventeenth', 'Eighteenth', 'Nineteenth', 'Twentieth'
    ];
    return ordinals[num] || `${getOrdinalSuffixText(num)}`;
  };

  const formatPhoneNumber = (phone: string): string => {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX if it's a 10-digit number
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    
    // Return original if not 10 digits
    return phone;
  };

  const formatSquareFootage = (sqft: number): string => {
    return sqft.toLocaleString();
  };

  useEffect(() => {
    if (id && !authLoading) {
      loadListing();
    }
  }, [id, user, authLoading]);

  // Separate useEffect for view increment - runs only once per listing ID
  useEffect(() => {
    if (id && !hasViewedRef.current) {
      const incrementView = async () => {
        try {
          await listingsService.incrementListingView(id);
          hasViewedRef.current = true;
        } catch (error) {
          console.error('Error incrementing view count:', error);
        }
      };
      
      incrementView();
    }
  }, [id]); // Only depends on id, not user or other state
  
  const loadListing = async () => {
    if (!id) return;
    
    try {
      setError(null);
      const data = await listingsService.getListing(id, user?.id);
      if (data) {
        setListing(data);
      } else {
        setError('Listing not found or no longer available');
      }
    } catch (error) {
      console.error('Error loading listing:', error);
      setError('Failed to load listing. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFavoriteToggle = async () => {
    if (!user || !listing) {
      if (!user) {
        navigate('/auth', { state: { isSignUp: true } });
      }
      return;
    }

    try {
      if (listing.is_favorited) {
        await listingsService.removeFromFavorites(user.id, listing.id);
      } else {
        await listingsService.addToFavorites(user.id, listing.id);
      }
      
      // Update local state immediately for better UX
      setListing(prev => prev ? { ...prev, is_favorited: !prev.is_favorited } : null);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      alert('Failed to update favorite. Please try again.');
      
      // Revert the optimistic update on error
      setListing(prev => prev ? { ...prev, is_favorited: !prev.is_favorited } : null);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-96 bg-gray-200 rounded-lg mb-8"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="h-8 bg-gray-200 rounded mb-4"></div>
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
            <div className="bg-gray-200 rounded-lg h-64"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center">
        <p className="text-gray-600">{error || 'Listing not found.'}</p>
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

  const getRoleLabel = () => {
    if (listing.owner?.role === 'agent') {
      return 'Agent';
    }
    return listing.owner?.role === 'landlord' ? 'Landlord' : 'Homeowner';
  };

  const getPropertyTypeLabel = () => {
    switch (listing.property_type) {
      case 'apartment_building':
        return 'Apartment in Building';
      case 'apartment_house':
        return 'Apartment in House';
      case 'full_house':
        return 'Full House';
      default:
        return listing.property_type;
    }
  };

  const images = listing.listing_images?.sort((a, b) => {
    if (a.is_featured && !b.is_featured) return -1;
    if (!a.is_featured && b.is_featured) return 1;
    return a.sort_order - b.sort_order;
  }) || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back Button */}
      <Link
        to="/browse"
        className="inline-flex items-center text-[#4E4B43] hover:text-[#3a3832] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Browse
      </Link>

      {/* Image Gallery */}
      {images.length > 0 && (
        <div className="mb-8">
          {/* Main Image Viewer */}
          <div className="relative mb-4">
            <img
              src={images[currentImageIndex].image_url}
              alt={listing.title}
              className="w-full h-96 object-contain bg-gray-100 rounded-lg"
            />
            
            <button
              onClick={handleFavoriteToggle}
              className="absolute top-4 right-4 p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition-shadow"
            >
              <Heart
                className={`w-6 h-6 ${
                  listing.is_favorited 
                    ? 'text-red-500 fill-current' 
                    : 'text-gray-400 hover:text-red-500'
                }`}
              />
            </button>

            {images.length > 1 && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
                {images.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`w-3 h-3 rounded-full transition-colors ${
                      index === currentImageIndex ? 'bg-white' : 'bg-white bg-opacity-50'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Thumbnail Strip */}
          {images.length > 1 && (
            <div className="relative">
              <div className="flex items-center">
                {/* Left Arrow */}
                <button
                  onClick={() => {
                    const container = document.getElementById('thumbnail-container');
                    if (container) {
                      container.scrollBy({ left: -200, behavior: 'smooth' });
                    }
                  }}
                  className="flex-shrink-0 p-2 mr-2 bg-white rounded-full shadow-md hover:shadow-lg transition-shadow z-10"
                  aria-label="Scroll thumbnails left"
                >
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                {/* Scrollable Thumbnail Container */}
                <div
                  id="thumbnail-container"
                  className="flex-1 flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {images.map((image, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentImageIndex(index)}
                      className={`flex-shrink-0 relative rounded-lg overflow-hidden transition-all ${
                        index === currentImageIndex 
                          ? 'ring-2 ring-[#4E4B43] shadow-md' 
                          : 'hover:ring-2 hover:ring-gray-300'
                      }`}
                    >
                      <img
                        src={image.image_url}
                        alt={`${listing.title} ${index + 1}`}
                        className="w-20 h-16 object-contain bg-gray-50 rounded-lg"
                      />
                      {image.is_featured && (
                        <div className="absolute top-1 right-1">
                          <Star className="w-3 h-3 text-[#D29D86] fill-current drop-shadow-sm" />
                        </div>
                      )}
                      {index === currentImageIndex && (
                        <div className="absolute inset-0 bg-[#4E4B43] bg-opacity-10 rounded-lg"></div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Right Arrow */}
                <button
                  onClick={() => {
                    const container = document.getElementById('thumbnail-container');
                    if (container) {
                      container.scrollBy({ left: 200, behavior: 'smooth' });
                    }
                  }}
                  className="flex-shrink-0 p-2 ml-2 bg-white rounded-full shadow-md hover:shadow-lg transition-shadow z-10"
                  aria-label="Scroll thumbnails right"
                >
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-[#273140] mb-2">{listing.title}</h1>
                <div className="flex items-center text-gray-600 mb-2">
                  <MapPin className="w-5 h-5 mr-2" />
                  <span className="text-lg">
                    {listing.location}
                    {listing.neighborhood && `, ${listing.neighborhood}`}
                  </span>
                </div>
                <div className="text-3xl font-bold text-[#273140]">
                  {formatPrice(listing.price)}
                  <span className="text-lg font-normal text-gray-500">/month</span>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {listing.is_featured && (
                  <span className="bg-[#C5594C] text-white px-3 py-1 rounded-full text-sm font-medium flex items-center">
                    <Star className="w-4 h-4 mr-1" />
                    Featured
                  </span>
                )}
                <span className="bg-[#667B9A] text-white px-3 py-1 rounded-full text-sm font-medium">
                  {listing.owner?.role === 'agent' && listing.owner?.agency 
                    ? listing.owner.agency 
                    : getRoleLabel()}
                </span>
              </div>
            </div>

            {/* Property Details */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center">
                <div>
                  <div className="font-semibold">{listing.bedrooms === 0 ? 'Studio' : listing.bedrooms}</div>
                </div>
                <Bed className="w-5 h-5 text-[#273140] ml-2" />
              </div>
              
              <div className="flex items-center">
                <div>
                  <div className="font-semibold">{listing.bathrooms}</div>
                </div>
                <Bath className="w-5 h-5 text-[#273140] ml-2" />
              </div>

              {listing.square_footage && (
                <div className="flex items-center">
                  <div>
                    <div className="font-semibold">{formatSquareFootage(listing.square_footage)} sq ft</div>
                  </div>
                </div>
              )}

              <div className="flex items-center">
                <div>
                  <div className="font-semibold text-sm">{getPropertyTypeLabel()}</div>
                </div>
                <HomeIcon className="w-5 h-5 text-[#273140] ml-2" />
              </div>
            </div>
          </div>

          {/* Description */}
          {listing.description && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#273140] mb-4">Description</h2>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {listing.description}
              </p>
            </div>
          )}

          {/* Amenities */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[#273140] mb-4">Features & Amenities</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {listing.parking !== 'no' && (
                <div className="flex items-center">
                  <Car className="w-5 h-5 text-[#273140] mr-3" />
                  <span className="capitalize">{listing.parking.replace('_', ' ')}</span>
                </div>
              )}
              
              {listing.washer_dryer_hookup && (
                <div className="flex items-center"> 
                  <WashingMachine className="w-5 h-5 text-[#273140] mr-3" />
                  <span>Washer/Dryer Hookup</span>
                </div>
              )}

              {listing.dishwasher && (
                <div className="flex items-center">
                  <Droplets className="w-5 h-5 text-[#273140] mr-3" />
                  <span>Dishwasher</span>
                </div>
              )}

              <div className="flex items-center">
                <Flame className="w-5 h-5 text-[#273140] mr-3" />
                <span>{listing.heat === 'included' ? 'Heat Included' : 'Tenant Pays Heat'}</span>
              </div>

              {listing.floor && (
                <div className="flex items-center">
                  <div className="w-5 h-5 bg-[#273140] rounded mr-3 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{listing.floor}</span>
                  </div>
                  <span>{getOrdinalWordText(listing.floor)} Floor</span>
                </div>
              )}

              {listing.lease_length && (
                <div className="flex items-center">
                  <Calendar className="w-5 h-5 text-[#273140] mr-3" />
                  <span>Lease: {listing.lease_length}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contact Card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6 sticky top-8">
            <h3 className="text-xl font-bold text-[#273140] mb-4">Contact Information</h3>
            
            <div className="space-y-4">
              <div className="flex items-center">
                <User className="w-5 h-5 text-[#273140] mr-3" />
                <div>
                  <div className="font-semibold">{listing.contact_name}</div>
                  <div className="text-sm text-gray-500">{getRoleLabel()}</div>
                </div>
              </div>

              <div className="flex items-center">
                <Phone className="w-5 h-5 text-[#273140] mr-3" />
                <a
                  href={`tel:${listing.contact_phone}`}
                  className="text-[#273140] hover:text-[#1e252f] font-medium transition-colors"
                >
                  {formatPhoneNumber(listing.contact_phone)}
                </a>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <a
                href={`tel:${listing.contact_phone}`}
                className="w-full bg-[#273140] text-white py-3 px-4 rounded-md font-semibold hover:bg-[#1e252f] transition-colors flex items-center justify-center"
              >
                <Phone className="w-5 h-5 mr-2" />
                Call Now
              </a>
              
              <a
                href={`sms:${listing.contact_phone.replace(/\D/g, '')}?body=Hi, I'm interested in your listing: ${listing.title}`}
                className="w-full bg-[#C5594C] text-white py-3 px-4 rounded-md font-semibold hover:bg-[#b04d42] transition-colors flex items-center justify-center"
              >
                Send Message
              </a>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
              Listed {new Date(listing.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      </div>

      {/* Similar Listings */}
      <SimilarListings listing={listing} />
    </div>
  );
}