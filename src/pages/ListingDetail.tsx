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
import { useAuth } from "@/hooks/useAuth";
import { SimilarListings } from "../components/listings/SimilarListings";
import ImageCarousel from "@/components/listing/ImageCarousel";
import { gaEvent, gaListing } from "@/lib/ga";
import { trackListingView } from "../lib/analytics";
void gaEvent;
import NumericText from "@/components/common/NumericText";
import { ShareButton } from "../components/shared/ShareButton";

const SCROLL_THRESHOLDS = [25, 50, 75, 100] as const;

function getScrollPercent(): number {
  const el = document.documentElement;
  const body = document.body;
  const scrollTop = el.scrollTop || body.scrollTop;
  const scrollHeight = (el.scrollHeight || body.scrollHeight) - el.clientHeight;
  if (scrollHeight <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((scrollTop / scrollHeight) * 100)));
}

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

  const formatPostedDate = (value?: string | null): string | null => {
    if (!value) {
      return null;
    }

    const date = typeof value === 'string' ? new Date(value) : value;
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
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

  const trackedListingId = React.useRef<string | null>(null);
  useEffect(() => {
    if (!listing?.id) return;
    if (trackedListingId.current === listing.id) return;

    gaListing("listing_view", listing.id, {
      price: Number(listing.price ?? 0),
      bedrooms: Number(listing.bedrooms ?? 0),
      bathrooms: Number(listing.bathrooms ?? 0),
      neighborhood:
        listing.neighborhood ?? listing.area ?? listing.location ?? undefined,
      is_featured: !!(listing.is_featured),
    });

    trackListingView(listing.id);

    trackedListingId.current = listing.id;
  }, [listing?.id]);

  useEffect(() => {
    if (!listing?.id) return;
    const fired = new Set<number>();

    const onScroll = () => {
      const pct = getScrollPercent();
      for (const t of SCROLL_THRESHOLDS) {
        if (pct >= t && !fired.has(t)) {
          fired.add(t);
          gaListing("listing_scroll", listing.id, { depth: t });
        }
      }
      if (fired.size === SCROLL_THRESHOLDS.length) {
        window.removeEventListener("scroll", onScroll);
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // Fire once in case the page opens deep
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [listing?.id]);

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

  const postedDateText = formatPostedDate(listing?.posted_at ?? listing?.created_at ?? null);

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

      const nextIsFav = !listing.is_favorited;

      // Update local state immediately for better UX
      setListing((prev) =>
        prev ? { ...prev, is_favorited: nextIsFav } : null,
      );

      if (nextIsFav) {
        gaListing("listing_favorite", listing.id);
      } else {
        gaListing("listing_unfavorite", listing.id);
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      alert("Failed to update favorite. Please try again.");

      // Revert the optimistic update on error
      setListing((prev) =>
        prev ? { ...prev, is_favorited: !prev.is_favorited } : null,
      );
    }
  };

  const handleCallClick = () => {
    if (!listing?.id) return;
    gaListing("listing_contact_click", listing.id, { contact_method: "phone" });
  };

  const handleMessageClick = () => {
    if (!listing?.id) return;
    gaListing("listing_contact_click", listing.id, { contact_method: "sms" });
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

  const formatLeaseLength = (leaseLength: string | null | undefined): string => {
    if (!leaseLength) return "";
    return leaseLength
      .split("_")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const images =
    listing.listing_images?.sort((a, b) => {
      if (a.is_featured && !b.is_featured) return -1;
      if (!a.is_featured && b.is_featured) return 1;
      return a.sort_order - b.sort_order;
    }) || [];


  const handleBackToBrowse = () => {
    // Mark that we're returning to browse so filters can be restored
    try {
      sessionStorage.setItem('browse_scroll_restore', 'true');
    } catch (error) {
      console.warn('Failed to set navigation flag:', error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Back Button */}
      <Link
        to="/browse"
        onClick={handleBackToBrowse}
        className="inline-flex items-center text-[#4E4B43] hover:text-[#3a3832] mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Browse
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
        {/* LEFT: Images - Desktop only */}
        <div className="hidden lg:block lg:col-span-7">
          <div className="relative">
            <ImageCarousel
              images={images.map((img) => ({ url: img.image_url, alt: listing.title }))}
              className="mb-0"
              listingSeed={{
                id: listing.id,
                addressLine: listing.location,
                city: listing.neighborhood,
                price: listing.price,
              }}
              propertyType={listing.property_type}
              leaseLength={listing.lease_length}
            />
            <button
              onClick={handleFavoriteToggle}
              className="absolute top-4 right-4 p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition-shadow"
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

          {listing.description && (
            <section id="ld-description" className="mt-0 pt-0">
              <h2 className="text-2xl font-bold text-[#273140] mb-4">
                Description
              </h2>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {listing.description}
              </p>
            </section>
          )}
        </div>

        {/* RIGHT: Info stack */}
        <div className="lg:col-span-5 flex flex-col gap-3 text-[0.95rem] md:text-[0.985rem] leading-relaxed">
          {/* Mobile Images - First on mobile */}
          <section id="ld-mobile-images" className="lg:hidden">
            <div className="relative">
              <ImageCarousel
                images={images.map((img) => ({ url: img.image_url, alt: listing.title }))}
                className="mb-0"
                listingSeed={{
                  id: listing.id,
                  addressLine: listing.location,
                  city: listing.neighborhood,
                  price: listing.price,
                }}
                propertyType={listing.property_type}
                leaseLength={listing.lease_length}
              />
              <button
                onClick={handleFavoriteToggle}
                className="absolute top-4 right-4 p-3 bg-white rounded-full shadow-lg hover:shadow-xl transition-shadow"
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
          </section>

          {/* Mobile Contact Card - Second on mobile */}
          <section id="ld-contact-card-mobile" className="lg:hidden text-base">
            <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6">
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
                    onClick={handleCallClick}
                  >
                    {formatPhoneNumber(listing.contact_phone)}
                  </a>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <a
                  href={`tel:${listing.contact_phone}`}
                  className="w-full bg-[#273140] text-white py-3 px-4 rounded-md font-semibold hover:bg-[#1e252f] transition-colors flex items-center justify-center"
                  onClick={handleCallClick}
                >
                  <Phone className="w-5 h-5 mr-2" />
                  Call Now
                </a>

                <a
                  href={`sms:${listing.contact_phone.replace(/\D/g, "")}?body=Hi, I'm interested in your listing: ${listing.title}`}
                  className="w-full bg-accent-500 text-white py-3 px-4 rounded-md font-semibold hover:bg-accent-600 transition-colors flex items-center justify-center"
                  onClick={handleMessageClick}
                >
                  Send Message
                </a>

                {/*
                  RELOCATED: Share button moved to contact card (Mobile)
                  - Less intrusive than title position
                  - Logically grouped with communication actions
                  - Still accessible but not prominently placed
                */}
                <div className="w-full">
                  <ShareButton
                    listingId={listing.id}
                    listingTitle={listing.title}
                    variant="detail"
                    className="w-full justify-center"
                  />
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
                Listed {new Date(listing.created_at).toLocaleDateString()}
              </div>
            </div>
          </section>
          {/* Title - Third on mobile */}
          <section id="ld-title" className="order-3 lg:order-none">
            <h1 className="text-2xl md:text-[1.65rem] font-semibold text-[#273140] mb-2">
              {listing.title}
            </h1>
            {postedDateText && (
              <p className="text-xs text-muted-foreground mt-1">Posted: {postedDateText}</p>
            )}
          </section>

          {/* Location + Tag (mobile-safe truncation) - Third on mobile */}
          <section id="ld-location-and-tag" className="order-3 lg:order-none">
            <div className="flex items-center gap-2">
              {/* LEFT: Location (flexible, truncates first) */}
              <div className="flex-1 min-w-0">
                <div
                  className="truncate"
                  title={`${listing?.location ?? ""}${listing?.location && listing?.neighborhood ? " • " : ""}${listing?.neighborhood ?? ""}`}
                >
                  {/* EXISTING LOCATION JSX HERE (icons/text unchanged) */}
                  <div className="flex items-center text-gray-600">
                    <MapPin className="w-5 h-5 mr-2" />
                    <NumericText
                      className="text-lg"
                      text={`${listing.location}${listing.neighborhood ? `, ${listing.neighborhood}` : ""}`}
                    />
                  </div>
                </div>
              </div>
              {listing.is_featured && (
                <span className="inline-flex items-center bg-accent-500 text-white text-xs px-2 py-0.5 rounded">
                  <Star className="w-3 h-3 mr-1" />
                  Featured
                </span>
              )}
              {/* RIGHT: Poster tag (landlord/agency) — fixed size, truncates if too long */}
              <div className="ml-2 flex-shrink-0 min-w-0 max-w-[50%] sm:max-w-none text-right overflow-hidden">
                {/* A single-line, no-wrap container so the badge/text truncates cleanly */}
                <div
                  className="inline-flex items-center gap-1 whitespace-nowrap truncate"
                  title={
                    listing.owner?.role === "agent" && listing.owner?.agency
                      ? listing.owner.agency
                      : getRoleLabel()
                  }
                >
                  {/* EXISTING TAG/BADGE JSX HERE (unchanged). */}
                  <span className="bg-[#667B9A] text-white px-3 py-1 rounded-full text-sm font-medium">
                    {listing.owner?.role === "agent" && listing.owner?.agency
                      ? listing.owner.agency
                      : getRoleLabel()}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Price - Third on mobile */}
          <section id="ld-price" className="order-3 lg:order-none">
            {listing.call_for_price ? (
              <strong>Call for Price</strong>
            ) : (
              listing.price != null && (
                <div className="text-3xl font-bold text-[#273140]">
                  <span className="num-font">{formatPrice(listing.price)}</span>
                  <span className="text-lg font-normal text-gray-500">/month</span>
                </div>
              )
            )}
          </section>

          {/* Basic info - Fourth on mobile */}
          <section id="ld-basic-info" className="order-4 lg:order-none">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center leading-none">
                <div>
                  <div className="font-semibold">
                    {listing.bedrooms === 0 ? (
                      "Studio"
                    ) : (
                      <span className="num-font">{listing.bedrooms}</span>
                    )}
                  </div>
                </div>
                <Bed className="w-5 h-5 text-[#273140] ml-2 align-middle" />
              </div>

              <div className="flex items-center leading-none">
                <div>
                  <div className="font-semibold">
                    <span className="num-font">{listing.bathrooms}</span>
                  </div>
                </div>
                <Bath className="w-5 h-5 text-[#273140] ml-2 align-middle" />
              </div>

              {listing.square_footage && (
                <div className="flex items-center leading-none">
                  <div>
                    <div className="font-semibold">
                      <span className="num-font">
                        {formatSquareFootage(listing.square_footage)}
                      </span>{" "}
                      sq ft
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center leading-none">
                <div>
                  <div className="font-semibold text-sm">
                    {getPropertyTypeLabel()}
                  </div>
                </div>
                <HomeIcon className="w-5 h-5 text-[#273140] ml-2 align-middle" />
              </div>
            </div>
          </section>

          {/* Contact Information card - Desktop only (sticky) */}
          <section id="ld-contact-card" className="hidden lg:block text-base">
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
                    onClick={handleCallClick}
                  >
                    {formatPhoneNumber(listing.contact_phone)}
                  </a>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <a
                  href={`tel:${listing.contact_phone}`}
                  className="w-full bg-[#273140] text-white py-3 px-4 rounded-md font-semibold hover:bg-[#1e252f] transition-colors flex items-center justify-center"
                  onClick={handleCallClick}
                >
                  <Phone className="w-5 h-5 mr-2" />
                  Call Now
                </a>

                <a
                  href={`sms:${listing.contact_phone.replace(/\D/g, "")}?body=Hi, I'm interested in your listing: ${listing.title}`}
                  className="w-full bg-accent-500 text-white py-3 px-4 rounded-md font-semibold hover:bg-accent-600 transition-colors flex items-center justify-center"
                  onClick={handleMessageClick}
                >
                  Send Message
                </a>

                {/*
                  RELOCATED: Share button moved to contact card (Desktop)
                  - Less intrusive than prominent title position
                  - Natural grouping with other communication/action buttons
                  - Still easily discoverable within contact context
                  - Improves visual hierarchy and reduces clutter
                */}
                <div className="w-full">
                  <ShareButton
                    listingId={listing.id}
                    listingTitle={listing.title}
                    variant="detail"
                    className="w-full justify-center"
                  />
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
                Listed {new Date(listing.created_at).toLocaleDateString()}
              </div>
            </div>
          </section>

          {/* Property Details - Mobile: after basic info, Desktop: in sidebar */}
          <section id="ld-details" className="order-5 lg:order-none">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-[#273140] mb-4">
                Features & Amenities
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center">
                  <DollarSign className="w-5 h-5 text-[#273140] mr-3" />
                  <span>
                    {listing.broker_fee ? "Broker Fee Applies" : "No Broker Fee"}
                  </span>
                </div>

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
                    {listing.heat === "included" ? "Heat Included" : "Tenant Pays Heat"}
                  </span>
                </div>

                {listing.floor && (
                  <div className="flex items-center">
                    <div className="w-5 h-5 bg-[#273140] rounded mr-3 flex items-center justify-center">
                      <span className="text-white text-xs font-bold">
                        {listing.floor}
                      </span>
                    </div>
                    <span>{getOrdinalWordText(listing.floor)} Floor</span>
                  </div>
                )}

                {listing.lease_length && (
                  <div className="flex items-center">
                    <Calendar className="w-5 h-5 text-[#273140] mr-3" />
                    <span>Lease: {formatLeaseLength(listing.lease_length)}</span>
                  </div>
                )}
              </div>
            </div>
          </section>
          {/* Mobile Description - Last on mobile */}
          {listing.description && (
            <section id="ld-description-mobile" className="lg:hidden order-6">
              <h2 className="text-2xl font-bold text-[#273140] mb-4">
                Description
              </h2>
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {listing.description}
              </p>
            </section>
          )}
        </div>

      </div>

      {/* Similar Listings */}
      <SimilarListings listing={listing} />
    </div>
  );
}

