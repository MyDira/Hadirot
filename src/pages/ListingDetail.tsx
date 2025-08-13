import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Car, Heart, Phone, User, ArrowLeft, Flame, Droplets, WashingMachine, MapPin, Mail, Edit, Trash2, Star, Bed, Bath, Square, BookDashed as Dishwasher, Thermometer, DollarSign, Map } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { listingsService } from "../services/listings";
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
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] gap-8 items-start">
          {/* LEFT: Images */}
          <div id="listing-media" className="relative">
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

          {/* RIGHT: Info stack */}
          <aside id="listing-info" className="flex flex-col gap-4">
            {/* Title + tags */}
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-2xl font-semibold leading-tight">
                  {listing.title}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {listing.is_featured && (
                  <span className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-accent-500 text-white">
                    Featured
                  </span>
                )}
                {listedByLabel && (
                  <span className="inline-flex items-center rounded px-2 py-0.5 text-xs bg-muted">
                    {listedByLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Location */}
            <div>
              <div className="text-sm text-gray-600">
                {listing.location}
                {listing.neighborhood && ` • ${listing.neighborhood}`}
              </div>
            </div>

            {/* Price */}
            <div>
              <div className="text-2xl font-semibold">
                {formatPrice(listing.price)}
                <span className="text-lg font-normal text-gray-500">
                  /month
                </span>
              </div>
            </div>

            {/* Basic info group */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center rounded bg-muted px-2 py-1">
                {listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms} bd`}
              </span>
              <span className="inline-flex items-center rounded bg-muted px-2 py-1">
                {listing.bathrooms} ba
              </span>
              <span className="inline-flex items-center rounded bg-muted px-2 py-1">
                {listing.broker_fee ? "Broker Fee" : "No Broker Fee"}
              </span>
              <span className="inline-flex items-center rounded bg-muted px-2 py-1">
                {getPropertyTypeLabel()}
              </span>
            </div>

            {/* Contact Information card */}
            <div id="contact-card">
              <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6 sticky top-8">
                <h3 className="text-xl font-bold text-[#273140] mb-4">
                  Contact Information
                </h3>

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
                    href={`sms:${listing.contact_phone.replace(/\D/g, "")}?body=Hi, I'm interested in your listing: ${listing.title}`}
                    className="w-full bg-accent-500 text-white py-3 px-4 rounded-md font-semibold hover:bg-accent-600 transition-colors flex items-center justify-center"
                  >
                    Send Message
                  </a>
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
                  Listed {new Date(listing.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Property Details */}
            <div id="property-details" className="p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-3">Property Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                {listing.square_footage && (
                  <div className="flex items-center">
                    <Square className="w-4 h-4 mr-2 text-gray-600" />
                    {formatSquareFootage(listing.square_footage)} sq ft
                  </div>
                )}
                <div>{getPropertyTypeLabel()}</div>
                {listing.floor && (
                  <div>{getOrdinalWordText(listing.floor)} Floor</div>
                )}
                {listing.lease_length && <div>Lease: {listing.lease_length}</div>}
                <div className="flex items-center">
                  <Bed className="w-4 h-4 mr-2 text-gray-600" />
                  <span className="text-sm text-gray-600">
                    {listing.bedrooms === 0 ? "Studio" : `${listing.bedrooms}`}
                  </span>
                </div>
                <div className="flex items-center">
                  <Bath className="w-4 h-4 mr-2 text-gray-600" />
                  <span className="text-sm text-gray-600">{listing.bathrooms}</span>
                </div>
              </div>
            </div>

            {/* Amenities */}
            <div id="amenities">
              <h3 className="text-xl font-bold text-[#273140] mb-4">Amenities</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {listing.parking !== "no" && (
                  <div className="flex items-center">
                    <Car className="w-5 h-5 text-[#273140] mr-3" />
                    <span className="capitalize">
                      {listing.parking.replace("_", " ")}
                    </span>
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
                  <span>
                    {listing.heat === "included" ? "Heat Included" : "Heat Not Included"}
                  </span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Description below both columns */}
        {listing.description && (
          <div id="description" className="prose max-w-none">
            <h2 className="text-2xl font-bold text-[#273140] mb-4">
              Description
            </h2>
            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
              {listing.description}
            </p>
          </div>
        )}
      </section>

      {/* Similar Listings */}
      <SimilarListings listing={listing} />
    </div>
  );
}
