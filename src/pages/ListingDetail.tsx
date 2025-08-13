import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Bed,
  Bath,
  Car,
  MapPin,
  Star,
  Heart,
  Phone,
  User,
  Calendar,
  Home as HomeIcon,
  ArrowLeft,
  Flame,
  Droplets,
  WashingMachine,
  DollarSign,
} from "lucide-react";
import { Listing } from "../config/supabase";
import { listingsService } from "../services/listings";
import { useAuth } from "../hooks/useAuth";
import { SimilarListings } from "../components/listings/SimilarListings";
import { ImageCarousel } from "../components/media/ImageCarousel";

export function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      "",
      "First",
      "Second",
      "Third",
      "Fourth",
      "Fifth",
      "Sixth",
      "Seventh",
      "Eighth",
      "Ninth",
      "Tenth",
      "Eleventh",
      "Twelfth",
      "Thirteenth",
      "Fourteenth",
      "Fifteenth",
      "Sixteenth",
      "Seventeenth",
      "Eighteenth",
      "Nineteenth",
      "Twentieth",
    ];
    return ordinals[num] || `${getOrdinalSuffixText(num)}`;
  };

  const formatPhoneNumber = (phone: string): string => {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, "");

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
          console.error("Error incrementing view count:", error);
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
        setError("Listing not found or no longer available");
      }
    } catch (error) {
      console.error("Error loading listing:", error);
      setError("Failed to load listing. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleFavoriteToggle = async () => {
    if (!user || !listing) {
      if (!user) {
        navigate("/auth", { state: { isSignUp: true } });
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
      setListing((prev) =>
        prev ? { ...prev, is_favorited: !prev.is_favorited } : null,
      );
    } catch (error) {
      console.error("Error toggling favorite:", error);
      alert("Failed to update favorite. Please try again.");

      // Revert the optimistic update on error
      setListing((prev) =>
        prev ? { ...prev, is_favorited: !prev.is_favorited } : null,
      );
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
        <p className="text-gray-600">{error || "Listing not found."}</p>
      </div>
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);
  };

  const getRoleLabel = () => {
    if (listing.owner?.role === "agent") {
      return "Agent";
    }
    return listing.owner?.role === "landlord" ? "Landlord" : "Homeowner";
  };

  const getPropertyTypeLabel = () => {
    switch (listing.property_type) {
      case "apartment_building":
        return "Apartment in Building";
      case "apartment_house":
        return "Apartment in House";
      case "full_house":
        return "Full House";
      default:
        return listing.property_type;
    }
  };

  const carouselImages =
    listing.listing_images
      ?.sort((a, b) => {
        if (a.is_featured && !b.is_featured) return -1;
        if (!a.is_featured && b.is_featured) return 1;
        return a.sort_order - b.sort_order;
      })
      .map((img) => ({ url: img.image_url, alt: listing.title })) || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Images Section - Full Width at Top */}
      <div className="mb-8">
        <ImageCarousel 
          images={images}
          heightClass="h-[50vh] lg:h-[60vh]"
          showThumbnails={true}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Listing Details - Takes 2/3 width on desktop */}
        <div className="lg:col-span-2 space-y-6">
          {/* Title and Basic Info */}
          <div>
            <h1 className="text-3xl font-bold text-[#273140] mb-4">{listing.title}</h1>
            <div className="flex items-center justify-between mb-4">
              <div className="text-3xl font-bold text-[#273140]">
                {formatPrice(listing.price)}/month
              </div>
              {listing.is_featured && (
                <span className="inline-flex items-center bg-accent-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                  <Star className="w-4 h-4 mr-1 fill-current" />
                  Featured
                </span>
              )}
            </div>
          </div>

          {/* Property Details */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-[#273140] mb-4">Property Details</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="flex items-center">
                <Bed className="w-5 h-5 text-gray-600 mr-2" />
                <span className="text-gray-900">
                  {listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} BR`}
                </span>
              </div>
              <div className="flex items-center">
                <Bath className="w-5 h-5 text-gray-600 mr-2" />
                <span className="text-gray-900">{listing.bathrooms} Bath</span>
              </div>
              {listing.square_footage && (
                <div className="flex items-center">
                  <Home className="w-5 h-5 text-gray-600 mr-2" />
                  <span className="text-gray-900">{listing.square_footage} sq ft</span>
                </div>
              )}
              {listing.floor && (
                <div className="flex items-center">
                  <Building className="w-5 h-5 text-gray-600 mr-2" />
                  <span className="text-gray-900">Floor {listing.floor}</span>
                </div>
              )}
            </div>

            {/* Amenities */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center">
                <Car className="w-5 h-5 text-gray-600 mr-2" />
                <span className="text-gray-900">
                  Parking: {getParkingLabel(listing.parking)}
                </span>
              </div>
              <div className="flex items-center">
                <Zap className="w-5 h-5 text-gray-600 mr-2" />
                <span className="text-gray-900">
                  Heat: {listing.heat === 'included' ? 'Included' : 'Tenant Pays'}
                </span>
              </div>
              {listing.washer_dryer_hookup && (
                <div className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                  <span className="text-gray-900">Washer/Dryer Hookup</span>
                </div>
              )}
              {listing.dishwasher && (
                <div className="flex items-center">
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                  <span className="text-gray-900">Dishwasher</span>
                </div>
              )}
              <div className="flex items-center">
                <DollarSign className="w-5 h-5 text-gray-600 mr-2" />
                <span className="text-gray-900">
                  {listing.broker_fee ? 'Broker Fee' : 'No Broker Fee'}
                </span>
              </div>
            </div>
          </div>

          {/* Description */}
          {listing.description && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-[#273140] mb-4">Description</h2>
              <div className="prose prose-gray max-w-none">
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {listing.description}
                </p>
              </div>
            </div>
          )}

          {/* Additional Information */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-[#273140] mb-4">Additional Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <span className="font-medium text-gray-900">Property Type:</span>
                <span className="ml-2 text-gray-700">{getPropertyTypeLabel(listing.property_type)}</span>
              </div>
              {listing.lease_length && (
                <div>
                  <span className="font-medium text-gray-900">Lease Length:</span>
                  <span className="ml-2 text-gray-700">{listing.lease_length}</span>
                </div>
              )}
              <div>
                <span className="font-medium text-gray-900">Listed by:</span>
                <span className="ml-2 text-gray-700">{getPosterLabel()}</span>
              </div>
              <div>
                <span className="font-medium text-gray-900">Views:</span>
                <span className="ml-2 text-gray-700">{listing.views || 0}</span>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-[#273140] mb-4">Location</h2>
            <div className="flex items-start">
              <MapPin className="w-5 h-5 text-gray-600 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-gray-900 font-medium">{listing.location}</p>
                {listing.neighborhood && (
                  <p className="text-gray-600 text-sm mt-1">{listing.neighborhood}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Contact Sidebar - Takes 1/3 width on desktop */}
        <div className="lg:col-span-1">
          <div className="sticky top-8 space-y-4">
            {/* Contact Information */}
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-[#273140] mb-4">Contact Information</h2>
              <div className="space-y-3">
                <div>
                  <span className="font-medium text-gray-900">Contact:</span>
                  <p className="text-gray-700">{listing.contact_name}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-900">Phone:</span>
                  <p className="text-gray-700">{listing.contact_phone}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <a
                href={`tel:${listing.contact_phone}`}
                className="w-full bg-[#273140] text-white py-3 px-4 rounded-lg font-semibold hover:bg-[#1e252f] transition-colors flex items-center justify-center"
              >
                <Phone className="w-5 h-5 mr-2" />
                Call Now
              </a>
              
              {user && (
                <button
                  onClick={handleFavoriteToggle}
                  disabled={favoriteLoading}
                  className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center ${
                    listing.is_favorited
                      ? 'bg-red-50 text-red-700 border border-red-200 hover:bg-red-100'
                      : 'bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100'
                  } ${favoriteLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Heart 
                    className={`w-5 h-5 mr-2 ${
                      listing.is_favorited ? 'fill-current' : ''
                    }`} 
                  />
                  {favoriteLoading 
                    ? 'Updating...' 
                    : listing.is_favorited 
                      ? 'Remove from Favorites' 
                      : 'Add to Favorites'
                  }
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Back Button */}
      <Link
        to="/browse"
        className="inline-flex items-center text-[#4E4B43] hover:text-[#3a3832] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Browse
      </Link>
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Left: Media */}
        <div className="relative">
          <ImageCarousel
            images={carouselImages}
            fit="contain"
            heightClass="h-[44vh] lg:h-[56vh]"
            showThumbnails
          />
          <button
            onClick={handleFavoriteToggle}
            className="absolute top-4 right-4 p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition-shadow z-10"
          >
            <Heart
              className={`w-6 h-6 ${
                listing.is_favorited
                  ? "text-red-500 fill-current"
                  : "text-gray-400 hover:text-red-500"
              }`}
            />
          </button>
        </div>

        {/* Right: Key details */}
        <aside className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-[#273140] mb-2">
                {listing.title}
              </h1>
              <div className="flex items-center text-gray-600 mb-2">
                <MapPin className="w-5 h-5 mr-2" />
                <span className="text-lg">
                  {listing.location}
                  {listing.neighborhood && `, ${listing.neighborhood}`}
                </span>
              </div>
              <div className="text-3xl font-bold text-[#273140]">
                {formatPrice(listing.price)}
                <span className="text-lg font-normal text-gray-500">
                  /month
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {listing.is_featured && (
                <span className="inline-flex items-center bg-accent-500 text-white text-xs px-2 py-0.5 rounded">
                  <Star className="w-3 h-3 mr-1" />
                  Featured
                </span>
              )}
      {/* Similar Listings */}
      <SimilarListings listing={listing} />
    </div>
  );
}