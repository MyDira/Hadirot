import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { MapPin, Heart } from "lucide-react";
import {
  CommercialListing,
  CommercialSpaceType,
  CommercialSubtype,
  LeaseType,
  BuildOutCondition,
  BuildingClass,
} from "../../config/supabase";
import { commercialListingsService } from "../../services/commercialListings";
import { useAuth } from "@/hooks/useAuth";
import { capitalizeName } from "../../utils/formatters";
import { gaListing } from "@/lib/ga";
import NumericText from "@/components/common/NumericText";
import { computePrimaryListingImage } from "../../utils/stockImage";
import { ShareButton } from "../shared/ShareButton";

interface CommercialListingCardProps {
  listing: CommercialListing;
  isFavorited?: boolean;
  onFavoriteChange?: () => void;
  showFeaturedBadge?: boolean;
  onClick?: () => void;
  onNavigateToDetail?: () => void;
}

const SPACE_TYPE_LABELS: Record<CommercialSpaceType, string> = {
  storefront: "Retail",
  restaurant: "Restaurant",
  office: "Office",
  warehouse: "Warehouse",
  industrial: "Industrial",
  mixed_use: "Mixed Use",
  community_facility: "Community",
  basement_commercial: "Basement Commercial",
};

const LEASE_TYPE_ABBR: Record<LeaseType, string> = {
  nnn: "NNN",
  gross: "Gross",
  modified_gross: "MG",
  full_service: "FS",
  percentage: "%",
  industrial_gross: "IG",
  absolute_net: "Net",
  tenant_electric: "TE",
};

const BUILD_OUT_LABELS: Record<BuildOutCondition, string> = {
  full_build_out: "Built Out",
  turnkey: "Turnkey",
  second_generation: "2nd Gen",
  vanilla_box: "Vanilla Box",
  shell: "Shell",
  cold_dark_shell: "Cold Shell",
};

const BUILDING_CLASS_LABELS: Record<BuildingClass, string> = {
  a: "Class A",
  b: "Class B",
  c: "Class C",
};

function formatSF(sf: number | null): string | null {
  if (!sf) return null;
  return `${sf.toLocaleString()} SF`;
}

function formatFloor(floor: string | null): string | null {
  if (!floor) return null;
  const lower = floor.toLowerCase();
  if (lower === "ground" || lower === "ground floor") return "Ground Fl";
  if (lower.includes("fl") || lower.includes("floor")) return floor;
  return `${floor} Fl`;
}

function getImageBadge(
  spaceType: CommercialSpaceType,
  subtype: CommercialSubtype | null
): string | null {
  if (!subtype) return null;
  const key = `${spaceType}:${subtype}`;
  const map: Record<string, string> = {
    "office:medical_office": "Medical",
    "office:creative_loft": "Creative / Loft",
    "office:coworking": "Coworking",
    "office:rd_lab": "R&D Lab",
    "warehouse:cold_storage": "Cold Storage",
    "warehouse:distribution": "Distribution",
    "storefront:strip_center": "Strip Center",
    "storefront:showroom": "Showroom",
    "restaurant:bar_lounge": "Bar / Lounge",
    "restaurant:cafe": "Café",
    "community_facility:daycare": "Daycare",
    "community_facility:religious": "Religious",
    "industrial:freestanding": "Freestanding",
  };
  return map[key] ?? null;
}

interface SpecItem {
  text: string;
  isPill?: boolean;
}

function getCommercialSpecItems(listing: CommercialListing): SpecItem[] {
  const items: SpecItem[] = [];
  const MAX = 4;
  const isRental = listing.listing_type === "rental";

  const add = (text: string | null) => {
    if (text && items.length < (isRental && listing.lease_type ? MAX - 1 : MAX)) {
      items.push({ text });
    }
  };

  const spaceType = listing.commercial_space_type;
  const subtype = listing.commercial_subtype;

  const sfText = formatSF(listing.available_sf);
  const floorText = formatFloor(listing.floor_level);
  const buildOutText = listing.build_out_condition
    ? BUILD_OUT_LABELS[listing.build_out_condition] ?? null
    : null;

  const loadingText = (() => {
    const docks = listing.loading_docks;
    const driveIn = listing.drive_in_doors;
    if (docks && driveIn) return `${docks} dock${docks > 1 ? "s" : ""} + ${driveIn} drive-in`;
    if (docks) return `${docks} dock${docks > 1 ? "s" : ""}`;
    if (driveIn) return `${driveIn} drive-in`;
    return null;
  })();

  const kitchenText = (() => {
    if (listing.kitchen_exhaust && listing.grease_trap) return "Hood + Trap";
    if (listing.kitchen_exhaust) return "Hood";
    return null;
  })();

  switch (spaceType) {
    case "storefront":
      add(sfText);
      add(floorText);
      add(listing.frontage_ft ? `${listing.frontage_ft} ft front` : null);
      add(buildOutText);
      if (items.length < (isRental && listing.lease_type ? MAX - 1 : MAX)) {
        add(listing.corner_location ? "Corner" : null);
      }
      break;

    case "restaurant":
      add(sfText);
      add(listing.previous_use || null);
      add(kitchenText);
      add(floorText);
      if (items.length < (isRental && listing.lease_type ? MAX - 1 : MAX)) {
        add(listing.gas_line ? "Gas Line" : null);
      }
      break;

    case "office":
      if (subtype === "medical_office") {
        add(sfText);
        add(floorText);
        add(listing.exam_rooms ? `${listing.exam_rooms} exam rm${listing.exam_rooms > 1 ? "s" : ""}` : null);
        add(listing.ada_accessible ? "ADA" : null);
        if (items.length < (isRental && listing.lease_type ? MAX - 1 : MAX)) {
          add(listing.parking_ratio || null);
        }
      } else {
        add(sfText);
        add(floorText);
        add(
          listing.building_class
            ? BUILDING_CLASS_LABELS[listing.building_class] ?? null
            : null
        );
        add(buildOutText);
        if (items.length < (isRental && listing.lease_type ? MAX - 1 : MAX)) {
          add(listing.private_offices ? `${listing.private_offices} pvt office${listing.private_offices > 1 ? "s" : ""}` : null);
        }
      }
      break;

    case "warehouse":
      add(sfText);
      add(listing.clear_height_ft ? `${listing.clear_height_ft} ft clear` : null);
      add(loadingText);
      add(listing.sprinkler_type || null);
      if (items.length < (isRental && listing.lease_type ? MAX - 1 : MAX)) {
        add(listing.three_phase_power ? "3-Phase" : null);
      }
      break;

    case "industrial":
      add(sfText);
      add(listing.clear_height_ft ? `${listing.clear_height_ft} ft clear` : null);
      add(
        listing.electrical_amps
          ? `${listing.electrical_amps}A${listing.electrical_voltage ? ` / ${listing.electrical_voltage}` : ""}`
          : listing.three_phase_power
          ? "3-Phase"
          : null
      );
      add(loadingText);
      if (items.length < (isRental && listing.lease_type ? MAX - 1 : MAX)) {
        add(listing.rail_access ? "Rail Access" : null);
      }
      break;

    case "mixed_use":
      add(listing.total_building_sf ? formatSF(listing.total_building_sf) : sfText);
      add(listing.number_of_floors ? `${listing.number_of_floors} floors` : null);
      add(listing.use_breakdown || null);
      add(listing.unit_count ? `${listing.unit_count} units` : null);
      if (items.length < (isRental && listing.lease_type ? MAX - 1 : MAX)) {
        add(listing.year_built ? `Built ${listing.year_built}` : null);
      }
      break;

    case "community_facility":
      add(sfText);
      add(floorText);
      add(listing.ada_accessible ? "ADA" : null);
      add(listing.outdoor_space || null);
      if (items.length < (isRental && listing.lease_type ? MAX - 1 : MAX)) {
        add(listing.permitted_uses_commercial || null);
      }
      break;

    case "basement_commercial":
      add(sfText);
      add(listing.ceiling_height_ft ? `${listing.ceiling_height_ft} ft ceiling` : null);
      add(listing.separate_entrance ? "Sep Entry" : null);
      add(buildOutText);
      if (items.length < (isRental && listing.lease_type ? MAX - 1 : MAX)) {
        add(listing.ventilation ? "Ventilation" : null);
      }
      break;

    default:
      add(sfText);
      add(floorText);
      add(buildOutText);
      break;
  }

  if (isRental && listing.lease_type && items.length < MAX) {
    items.push({ text: LEASE_TYPE_ABBR[listing.lease_type], isPill: true });
  }

  return items;
}

export function CommercialListingCard({
  listing,
  isFavorited = false,
  onFavoriteChange,
  showFeaturedBadge = true,
  onClick,
  onNavigateToDetail,
}: CommercialListingCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const sortedImages = listing.listing_images?.sort((a, b) => {
    if (a.is_featured && !b.is_featured) return -1;
    if (!a.is_featured && b.is_featured) return 1;
    return a.sort_order - b.sort_order;
  });

  const { url: primaryImageUrl, isStock } = computePrimaryListingImage(
    sortedImages,
    {
      id: listing.id,
      addressLine: listing.full_address,
      city: listing.neighborhood,
      price: listing.price,
    },
    listing.video_thumbnail_url
  );

  const isSaleListing = listing.listing_type === "sale";

  const handleFavoriteToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      navigate("/auth", { state: { isSignUp: true } });
      return;
    }

    try {
      if (isFavorited) {
        await commercialListingsService.removeCommercialFromFavorites(user.id, listing.id);
      } else {
        await commercialListingsService.addCommercialToFavorites(user.id, listing.id);
      }

      const nextIsFav = !isFavorited;
      if (nextIsFav) {
        gaListing("listing_favorite", listing.id);
      } else {
        gaListing("listing_unfavorite", listing.id);
      }

      if (onFavoriteChange) {
        onFavoriteChange();
      }
    } catch (error) {
      console.error("Error toggling commercial favorite:", error);
      alert("Failed to update favorite. Please try again.");
    }
  };

  const getPosterLabel = () => {
    if (listing.admin_custom_agency_name) {
      return listing.admin_custom_agency_name;
    }
    if (listing.admin_listing_type_display === "owner") {
      return "Owner";
    }
    if (listing.owner?.role === "agent" && listing.owner?.agency) {
      return capitalizeName(listing.owner.agency);
    }
    return "Owner";
  };

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price);

  const getPriceText = () => {
    if (listing.call_for_price) return "Contact for Price";
    if (isSaleListing) {
      return listing.asking_price != null ? formatPrice(listing.asking_price) : null;
    }
    if (listing.price != null) {
      const monthly = `${formatPrice(listing.price)}/mo`;
      if (listing.price_per_sf_year != null) {
        return `${monthly} · $${listing.price_per_sf_year.toFixed(0)}/SF/yr`;
      }
      return monthly;
    }
    return "Contact for Price";
  };

  const locationText = (() => {
    if (listing.full_address) return listing.full_address;
    if (listing.cross_street_a && listing.cross_street_b) {
      return `${listing.cross_street_a} & ${listing.cross_street_b}`;
    }
    return listing.neighborhood ?? "";
  })();

  const imageBadge = getImageBadge(
    listing.commercial_space_type,
    listing.commercial_subtype
  );

  const specItems = getCommercialSpecItems(listing);
  const priceText = getPriceText();
  const shareUrl = `${window.location.origin}/commercial-listing/${listing.id}`;

  const handleCardClick = () => {
    if (onNavigateToDetail) onNavigateToDetail();
    if (onClick) onClick();
  };

  return (
    <Link
      to={`/commercial-listing/${listing.id}`}
      className="group block bg-white border border-gray-200 border-l-2 border-l-commercial-600 rounded-lg shadow-sm hover:shadow transition overflow-hidden"
      onClick={handleCardClick}
    >
      <div className="relative aspect-[3/2]">
        <img
          src={primaryImageUrl}
          alt={isStock ? "Stock photo placeholder" : (listing.title ?? "Commercial listing")}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          loading="lazy"
        />

        {imageBadge && (
          <div className="absolute bottom-3 right-3">
            <div className="rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
              {imageBadge}
            </div>
          </div>
        )}

        {isStock && (
          <div className="absolute bottom-3 left-3 rounded-full bg-black/35 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
            Stock photo
          </div>
        )}

        <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
          <div onClick={(e) => e.stopPropagation()}>
            <ShareButton
              listingId={listing.id}
              listingTitle={listing.title ?? "Commercial listing"}
              variant="card"
              urlOverride={shareUrl}
            />
          </div>
          <button
            onClick={handleFavoriteToggle}
            className="p-1.5 bg-white rounded-full shadow-sm hover:shadow-md transition-shadow"
          >
            <Heart
              className={`w-3.5 h-3.5 ${
                isFavorited
                  ? "text-red-500 fill-current"
                  : "text-gray-400 hover:text-red-500"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-baseline justify-between mb-2.5">
          <span className="text-[22px] font-medium text-brand-900 leading-tight">
            {SPACE_TYPE_LABELS[listing.commercial_space_type]}
          </span>
          {priceText && (
            <span className="text-[13px] text-gray-500 ml-2 shrink-0">
              {priceText}
            </span>
          )}
        </div>

        {specItems.length > 0 && (
          <div className="inline-flex flex-wrap items-center gap-2 text-sm text-gray-600 mb-2.5">
            {specItems.map((item, i) =>
              item.isPill ? (
                <span
                  key={i}
                  className="bg-commercial-50 text-commercial-700 px-2 py-0.5 rounded text-xs"
                >
                  {item.text}
                </span>
              ) : (
                <span key={i}>{item.text}</span>
              )
            )}
          </div>
        )}

        <div className="flex items-center text-gray-600 mb-2">
          <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
          <NumericText
            className="text-sm leading-tight truncate flex-1 min-w-0"
            text={locationText}
          />
        </div>

        <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
          <span className="text-xs text-gray-600 truncate">
            by {getPosterLabel()}
            {showFeaturedBadge && listing.is_featured && (
              <span className="text-accent-600 font-medium"> &middot; Featured</span>
            )}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isSaleListing && (
              <span className="inline-flex items-center bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded border border-emerald-200">
                For Sale
              </span>
            )}
            <span className="inline-flex items-center bg-commercial-50 text-commercial-700 border border-commercial-200 text-xs px-2 py-0.5 rounded">
              Commercial
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
