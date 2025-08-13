import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Car,
  Heart,
  Phone,
  User,
  ArrowLeft,
  Flame,
  Droplets,
  WashingMachine,
  MapPin,
  Mail,
  Edit,
  Trash2,
  Star,
  Bed,
  Bath,
  Square,
  Dishwasher,
  Thermometer,
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

  const listedByLabel =
    listing.owner?.agency
      ? `Listed by ${listing.owner.agency}`
      : listing.owner?.role
      ? `Listed by ${getRoleLabel()}`
      : null;

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

      <section className="space-y-8">
        {/* Top: media + info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Images */}
          <div className="lg:col-span-2">
            <ImageCarousel
              images={carouselImages}
              initialIndex={0}
              fit="contain"
              heightClass="h-[50vh] lg:h-[60vh]"
              showThumbnails={true}
            />
            
            {/* Description */}
            {listing.description && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-[#273140] mb-3">Description</h3>
                <div className="prose prose-sm max-w-none text-gray-700">
                  <p className="whitespace-pre-wrap">{listing.description}</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Details */}
          <div className="space-y-6">
            {/* Favorite Button */}
            <button
              onClick={handleFavoriteToggle}
              className="absolute top-4 right-4 p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition-shadow z-10 lg:relative lg:top-0 lg:right-0 lg:self-start lg:ml-auto lg:mb-4"
            >
              <Heart
                className={`w-6 h-6 ${
                  listing.is_favorited
                    ? "text-red-500 fill-current"
                    : "text-gray-400 hover:text-red-500"
                }`}
              />
            </button>

            {/* Title and Price */}
            <div>
              <h1 className="text-3xl font-bold text-[#273140] mb-2">
                {listing.title}
              </h1>
              <div className="text-3xl font-bold text-[#667B9A] mb-4">
                {formatPrice(listing.price)}/month
              </div>
            </div>

            {/* Location */}
            <div className="flex items-center text-gray-600 mb-4">
              <MapPin className="w-5 h-5 mr-2 flex-shrink-0" />
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-lg">{listing.location}</span>
                <span className="inline-flex items-center bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full text-xs font-medium">
                  {listing.owner?.role === 'agent' && listing.owner?.agency 
                    ? listing.owner.agency 
                    : 'Owner'}
                </span>
              </div>
            </div>

            {/* Property Details */}
            <div className="space-y-3 mb-6">
              <div className="flex items-center text-gray-700">
                <Bed className="w-4 h-4 mr-2 text-gray-500" />
                <span className="font-medium">
                  {listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} Bedroom${listing.bedrooms > 1 ? 's' : ''}`}
                </span>
              </div>
              
              <div className="flex items-center text-gray-700">
                <Bath className="w-4 h-4 mr-2 text-gray-500" />
                <span className="font-medium">{listing.bathrooms} Bathroom{listing.bathrooms > 1 ? 's' : ''}</span>
              </div>

              {listing.square_footage && (
                <div className="flex items-center text-gray-700">
                  <Square className="w-4 h-4 mr-2 text-gray-500" />
                  <span className="font-medium">{listing.square_footage.toLocaleString()} sq ft</span>
                </div>
              )}

              {listing.floor && (
                <div className="flex items-center text-gray-700">
                  <span className="font-medium">Floor {listing.floor}</span>
                </div>
              )}

              <div className="flex items-center text-gray-700">
                <Car className="w-4 h-4 mr-2 text-gray-500" />
                <span className="font-medium">
                  Parking: {listing.parking === 'yes' ? 'Available' : 
                           listing.parking === 'included' ? 'Included' :
                           listing.parking === 'street' ? 'Street Parking' : 'None'}
                </span>
              </div>

              {listing.washer_dryer_hookup && (
                <div className="flex items-center text-gray-700">
                  <WashingMachine className="w-4 h-4 mr-2 text-gray-500" />
                  <span className="font-medium">Washer/Dryer Hookup</span>
                </div>
              )}

              {listing.dishwasher && (
                <div className="flex items-center text-gray-700">
                  <Dishwasher className="w-4 h-4 mr-2 text-gray-500" />
                  <span className="font-medium">Dishwasher</span>
                </div>
              )}

              <div className="flex items-center text-gray-700">
                <Thermometer className="w-4 h-4 mr-2 text-gray-500" />
                <span className="font-medium">
                  Heat: {listing.heat === 'included' ? 'Included' : 'Tenant Pays'}
                </span>
              </div>

              <div className="flex items-center text-gray-700">
                <DollarSign className="w-4 h-4 mr-2 text-gray-500" />
                <span className="font-medium">
                  {listing.broker_fee ? 'Broker Fee Required' : 'No Broker Fee'}
                </span>
              </div>
            </div>

            {/* Contact Information */}
            <div className="border-t border-gray-200 pt-4 mb-6">
              <h3 className="text-lg font-semibold text-[#273140] mb-3">Contact Information</h3>
              <div className="space-y-2">
                <p className="font-medium">{listing.contact_name}</p>
                <div className="flex items-center mt-2">
                  <Phone className="w-4 h-4 mr-2 text-gray-500" />
                  <a 
                    href={`tel:${listing.contact_phone}`}
                    className="text-[#667B9A] hover:text-[#273140] transition-colors"
                  >
                    {listing.contact_phone}
                  </a>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <a
                href={`tel:${listing.contact_phone}`}
                className="w-full bg-[#273140] text-white py-3 px-4 rounded-md font-semibold hover:bg-[#1e252f] transition-colors flex items-center justify-center"
              >
                <Phone className="w-5 h-5 mr-2" />
                Call Now
              </a>

              <a
                href={`sms:${listing.contact_phone.replace(/\D/g, "")}?body=Hi, I'm interested in your listing: ${listing.title}`}
                className="w-full bg-accent-500 text-white py-3 px-4 rounded-md font-semibold hover:bg-accent-600 transition-colors flex items-center justify-center"
              >
                Send Message
              </a>
            </div>
          </div>
        </div>

        {/* Similar Listings */}
        <SimilarListings listing={listing} />
      </section>
    </div>
  );
}