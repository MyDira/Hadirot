import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Share2,
  Filter,
  X,
  ChevronLeft,
  ChevronRight,
  Phone,
  Mail,
  Globe,
} from "lucide-react";
import { ListingCard } from "../components/listings/ListingCard";
import { Listing, Agency } from "@/config/supabase";
import { listingsService } from "@/services/listings";
import { agenciesService } from "@/services/agencies";
import { slugToAgencyLabel } from "@/utils/agency";
import { formatPhoneForDisplay } from "@/utils/phone";
import { normalizeUrlForHref, canonicalUrl } from "@/utils/url";
import { useAuth } from "@/hooks/useAuth";
import { track } from "@/lib/analytics";
import { useListingImpressions } from "@/hooks/useListingImpressions";

interface AgencyFilters {
  bedrooms?: number;
  min_price?: number;
  max_price?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc';
}

const ABOUT_PREVIEW_LIMIT = 280;

export function AgencyPage() {
  const { slug } = useParams<{ slug: string }>();
  const slugParam = slug ?? "";
  const derivedAgencyLabel = slugToAgencyLabel(slugParam);
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [agencyDisplayName, setAgencyDisplayName] = useState<string>(
    derivedAgencyLabel,
  );
  const [agencyDetails, setAgencyDetails] = useState<Agency | null>(null);
  const [agencyDetailsLoaded, setAgencyDetailsLoaded] = useState(false);
  const [matchedAgencyName, setMatchedAgencyName] = useState<string | null>(null);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const agencyDetailsRef = useRef<Agency | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [userFavorites, setUserFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
  const [filters, setFilters] = useState<AgencyFilters>({});
  const [shareToastMessage, setShareToastMessage] = useState<string | null>(null);
  const [isAboutExpanded, setIsAboutExpanded] = useState(false);
  const shareToastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolvedAgencyDisplayName =
    agencyDetails?.name?.trim() ||
    agencyDisplayName ||
    derivedAgencyLabel ||
    (slugParam ? slugParam : "Agency");
  const agencyExists = useMemo<boolean | null>(() => {
    if (!slugParam) {
      return null;
    }

    if (matchedAgencyName || agencyDetails) {
      return true;
    }

    if (profilesLoaded && agencyDetailsLoaded) {
      return false;
    }

    return null;
  }, [
    slugParam,
    matchedAgencyName,
    agencyDetails,
    profilesLoaded,
    agencyDetailsLoaded,
  ]);

  useEffect(() => {
    setAgencyDisplayName(derivedAgencyLabel);
    setMatchedAgencyName(null);
    setProfilesLoaded(false);
    setAgencyDetails(null);
    setAgencyDetailsLoaded(false);
    agencyDetailsRef.current = null;
  }, [derivedAgencyLabel]);

  useEffect(() => {
    return () => {
      if (shareToastTimeoutRef.current) {
        clearTimeout(shareToastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;

    if (!slugParam) {
      setAgencyDetails(null);
      agencyDetailsRef.current = null;
      setAgencyDetailsLoaded(true);
      return;
    }

    const loadAgencyDetails = async () => {
      try {
        setAgencyDetailsLoaded(false);
        const data = await agenciesService.getAgencyBySlug(slugParam);

        if (isCancelled) {
          return;
        }

        setAgencyDetails(data);
        agencyDetailsRef.current = data;

        if (data?.name) {
          setAgencyDisplayName(data.name);
        }
      } catch (error) {
        if (!isCancelled) {
          console.error("Error loading agency details:", error);
          setAgencyDetails(null);
          agencyDetailsRef.current = null;
        }
      } finally {
        if (!isCancelled) {
          setAgencyDetailsLoaded(true);
        }
      }
    };

    loadAgencyDetails();

    return () => {
      isCancelled = true;
    };
  }, [slugParam]);
  
  // Set up listing impression tracking
  const { observeElement } = useListingImpressions({
    listingIds: listings.map(l => l.id),
  });

  const ITEMS_PER_PAGE = 20;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  // Initialize filters from URL
  useEffect(() => {
    const urlFilters: AgencyFilters = {};
    
    const bedrooms = searchParams.get("bedrooms");
    if (bedrooms) urlFilters.bedrooms = parseInt(bedrooms);
    
    const min_price = searchParams.get("min_price");
    if (min_price) urlFilters.min_price = parseInt(min_price);
    
    const max_price = searchParams.get("max_price");
    if (max_price) urlFilters.max_price = parseInt(max_price);
    
    const sort = searchParams.get("sort") as AgencyFilters['sort'];
    if (sort) urlFilters.sort = sort;
    
    const page = searchParams.get("page");
    if (page) setCurrentPage(parseInt(page));
    
    setFilters(urlFilters);
  }, [searchParams]);

  // Load user favorites
  useEffect(() => {
    if (user) {
      loadUserFavorites();
    } else {
      setUserFavorites([]);
    }
  }, [user]);

  // Set page title based on agency name
  useEffect(() => {
    if (resolvedAgencyDisplayName) {
      document.title = `${resolvedAgencyDisplayName} - Listings | HaDirot`;
    } else {
      document.title = "HaDirot Real Estate Listings Platform";
    }

    return () => {
      document.title = "HaDirot Real Estate Listings Platform";
    };
  }, [resolvedAgencyDisplayName]);

  const loadUserFavorites = async () => {
    if (!user) return;
    
    try {
      const favorites = await listingsService.getUserFavoriteIds(user.id);
      setUserFavorites(favorites);
    } catch (error) {
      console.error("Error loading user favorites:", error);
    }
  };

  const loadAgencyListings = async () => {
    if (!slugParam) {
      setListings([]);
      setTotalCount(0);
      setAgencyDisplayName(derivedAgencyLabel);
      setMatchedAgencyName(null);
      setProfilesLoaded(true);
      return;
    }

    try {
      setLoading(true);
      setProfilesLoaded(false);

      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      const {
        data,
        count,
        agencyName: matchedName,
      } = await listingsService.getActiveListingsForAgencySlug(slugParam, {
        beds: filters.bedrooms,
        priceMin: filters.min_price,
        priceMax: filters.max_price,
        sort: filters.sort,
        limit: ITEMS_PER_PAGE,
        offset,
      });

      const resolvedAgencyName = matchedName ?? derivedAgencyLabel;
      const agencyFoundForView = Boolean(
        (matchedName && matchedName.length > 0) || agencyDetailsRef.current,
      );

      setAgencyDisplayName(resolvedAgencyName);
      setMatchedAgencyName(matchedName ?? null);
      setListings(data ?? []);
      setTotalCount(count ?? 0);

      track("agency_page_view", {
        agency_name: resolvedAgencyName,
        agency_slug: slugParam,
        listing_count: count ?? 0,
        agency_found: agencyFoundForView,
      });
    } catch (error) {
      console.error("Error loading agency listings:", error);
      setListings([]);
      setTotalCount(0);
      setMatchedAgencyName(null);
    } finally {
      setLoading(false);
      setProfilesLoaded(true);
    }
  };

  // Load listings when filters, page, or slug changes
  useEffect(() => {
    loadAgencyListings();
  }, [slugParam, filters, currentPage]);

  const handleFiltersChange = (newFilters: AgencyFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
    
    // Update URL with new filters
    const params = new URLSearchParams();
    
    if (newFilters.bedrooms !== undefined) {
      params.set("bedrooms", newFilters.bedrooms.toString());
    }
    if (newFilters.min_price) {
      params.set("min_price", newFilters.min_price.toString());
    }
    if (newFilters.max_price) {
      params.set("max_price", newFilters.max_price.toString());
    }
    if (newFilters.sort && newFilters.sort !== 'newest') {
      params.set("sort", newFilters.sort);
    }
    
    params.set("page", "1");
    setSearchParams(params);
    
    // Track filter usage
    track('agency_filter_apply', {
      agency_name: resolvedAgencyDisplayName,
      agency_slug: slugParam,
      agency_found: agencyExists ?? false,
      filters: newFilters,
    });
  };

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;

    const params = new URLSearchParams(searchParams);
    params.set("page", page.toString());
    setSearchParams(params);
    setCurrentPage(page);

    // Scroll to top when page changes
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const showShareToast = (message: string) => {
    setShareToastMessage(message);
    if (shareToastTimeoutRef.current) {
      clearTimeout(shareToastTimeoutRef.current);
    }
    shareToastTimeoutRef.current = window.setTimeout(() => {
      setShareToastMessage(null);
    }, 3000);
  };

  const handleShareAgency = async () => {
    const shareLink = canonicalUrl(`/agencies/${slugParam}`);

    try {
      await navigator.clipboard.writeText(shareLink);
      showShareToast("Link copied to clipboard");

      track('agency_share', {
        agency_name: resolvedAgencyDisplayName,
        agency_slug: slugParam,
        agency_found: agencyExists ?? false,
        method: 'copy_link',
      });
      return;
    } catch (error) {
      console.error("Failed to copy URL:", error);
    }

    try {
      const input = document.createElement('input');
      input.value = shareLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);

      showShareToast("Link copied to clipboard");

      track('agency_share', {
        agency_name: resolvedAgencyDisplayName,
        agency_slug: slugParam,
        agency_found: agencyExists ?? false,
        method: 'copy_link',
      });
    } catch (fallbackError) {
      console.error("Fallback copy failed:", fallbackError);
      showShareToast("Unable to copy link");
    }
  };

  const handleFavoriteChange = () => {
    loadUserFavorites();
  };

  const hasActiveFilters =
    filters.bedrooms !== undefined ||
    Boolean(filters.min_price) ||
    Boolean(filters.max_price) ||
    (filters.sort && filters.sort !== 'newest');
  const phoneNumberRaw = agencyDetails?.phone;
  const formattedPhoneNumber = formatPhoneForDisplay(phoneNumberRaw);
  const hasPhoneNumber = formattedPhoneNumber.length > 0;
  const emailAddress = agencyDetails?.email?.trim();
  const websiteValue = agencyDetails?.website ?? "";
  const hasWebsite = websiteValue.trim().length > 0;
  const sanitizedAboutHtml = agencyDetails?.about_html ?? "";
  const showAboutColumn = sanitizedAboutHtml.trim().length > 0;

  const aboutPlainText = useMemo(() => {
    if (!sanitizedAboutHtml) {
      return "";
    }

    return sanitizedAboutHtml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }, [sanitizedAboutHtml]);

  const aboutPreviewText = useMemo(() => {
    if (!aboutPlainText) {
      return "";
    }

    if (aboutPlainText.length <= ABOUT_PREVIEW_LIMIT) {
      return aboutPlainText;
    }

    const truncated = aboutPlainText.slice(0, ABOUT_PREVIEW_LIMIT);
    const lastSpace = truncated.lastIndexOf(" ");

    if (lastSpace > 200) {
      return truncated.slice(0, lastSpace).trim();
    }

    return truncated.trim();
  }, [aboutPlainText]);

  const shouldShowReadMore = aboutPlainText.length > ABOUT_PREVIEW_LIMIT;

  const metaItems: { key: string; node: React.ReactNode }[] = [
    {
      key: "count",
      node: (
        <span className="font-medium text-[#273140]">
          {loading
            ? "Loading listings..."
            : `${totalCount} active listing${totalCount === 1 ? "" : "s"}`}
        </span>
      ),
    },
  ];

  if (hasPhoneNumber) {
    metaItems.push({
      key: "phone",
      node: (
        <span className="inline-flex items-center gap-1.5">
          <Phone className="w-4 h-4 text-[#273140]" aria-hidden="true" />
          <span>{formattedPhoneNumber}</span>
        </span>
      ),
    });
  }

  if (emailAddress) {
    metaItems.push({
      key: "email",
      node: (
        <a
          href={`mailto:${emailAddress}`}
          className="inline-flex items-center gap-1.5 hover:text-[#273140] transition-colors"
        >
          <Mail className="w-4 h-4 text-[#273140]" aria-hidden="true" />
          <span>{emailAddress}</span>
        </a>
      ),
    });
  }

  if (hasWebsite) {
    metaItems.push({
      key: "website",
      node: (
        <a
          href={normalizeUrlForHref(websiteValue)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="inline-flex items-center gap-1.5 hover:text-[#273140] transition-colors"
        >
          <Globe className="w-4 h-4 text-[#273140]" aria-hidden="true" />
          <span>{websiteValue}</span>
        </a>
      ),
    });
  }

  metaItems.push({
    key: "share",
    node: (
      <button
        type="button"
        onClick={handleShareAgency}
        className="inline-flex items-center gap-1.5 text-[#273140] font-medium hover:text-[#1b2331] transition-colors"
      >
        <Share2 className="w-4 h-4" aria-hidden="true" />
        <span>Share</span>
      </button>
    ),
  });

  useEffect(() => {
    setIsAboutExpanded(false);
  }, [sanitizedAboutHtml]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {shareToastMessage && (
        <div className="fixed top-24 right-4 z-50 rounded-md bg-[#273140] px-4 py-2 text-sm font-medium text-white shadow-lg">
          {shareToastMessage}
        </div>
      )}

      {/* Header */}
      <div className="mb-10 space-y-6">
        {agencyDetails?.banner_url && (
          <div className="h-48 md:h-60 rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
            <img
              src={agencyDetails.banner_url}
              alt={`${resolvedAgencyDisplayName} banner`}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div
          className={`grid gap-6 ${showAboutColumn ? "lg:grid-cols-2" : ""}`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6">
            {agencyDetails?.logo_url && (
              <img
                src={agencyDetails.logo_url}
                alt={`${resolvedAgencyDisplayName} logo`}
                className="w-20 h-20 md:w-24 md:h-24 rounded-full border border-gray-200 shadow-sm object-cover bg-white"
              />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-bold font-brand text-[#273140]">
                {resolvedAgencyDisplayName}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-600">
                {metaItems.map((item, index) => (
                  <div key={item.key} className="flex items-center gap-1.5">
                    {index > 0 && (
                      <span className="text-gray-300" aria-hidden="true">
                        •
                      </span>
                    )}
                    {item.node}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {showAboutColumn && (
            <div className="text-gray-700 leading-relaxed">
              {isAboutExpanded || !shouldShowReadMore ? (
                <div
                  className="space-y-3"
                  dangerouslySetInnerHTML={{
                    __html: sanitizedAboutHtml,
                  }}
                />
              ) : (
                <p>
                  {aboutPreviewText}
                  {shouldShowReadMore ? "…" : ""}
                </p>
              )}
              {shouldShowReadMore && (
                <button
                  type="button"
                  onClick={() => setIsAboutExpanded((prev) => !prev)}
                  className="mt-3 text-sm font-medium text-[#273140] hover:text-[#1b2331] transition-colors"
                >
                  {isAboutExpanded ? "Collapse" : "Read more"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filter Button */}
      <div className="lg:hidden mb-6">
        <button
          onClick={() => setShowFiltersMobile(true)}
          className="w-full bg-[#f9f4ed] border border-gray-200 rounded-lg p-4 flex items-center justify-center text-[#273140] hover:bg-gray-50 transition-colors"
        >
          <Filter className="w-5 h-5 mr-2" />
          <span className="font-medium">Filter Listings</span>
          {hasActiveFilters && (
            <span className="ml-2 bg-[#667B9A] text-white text-xs px-2 py-1 rounded-full">
              Active
            </span>
          )}
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden lg:block">
          <div className="sticky top-32">
            <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Filter className="w-5 h-5 text-[#273140]" />
                  <h3 className="text-lg font-semibold text-[#273140]">Filters</h3>
                </div>
                <button
                  onClick={() => handleFiltersChange({})}
                  className="text-sm text-gray-500 hover:text-[#273140] transition-colors"
                >
                  Clear All
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bedrooms
                  </label>
                  <select
                    value={filters.bedrooms === 0 ? "0" : filters.bedrooms || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      const bedrooms = value === "" ? undefined : parseInt(value);
                      handleFiltersChange({ ...filters, bedrooms });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  >
                    <option value="">Any</option>
                    <option value="0">Studio</option>
                    <option value="1">1 BR</option>
                    <option value="2">2 BR</option>
                    <option value="3">3 BR</option>
                    <option value="4">4+ BR</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Price
                  </label>
                  <input
                    type="number"
                    placeholder="$"
                    value={filters.min_price || ""}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || undefined;
                      handleFiltersChange({ ...filters, min_price: value });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Price
                  </label>
                  <input
                    type="number"
                    placeholder="$"
                    value={filters.max_price || ""}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || undefined;
                      handleFiltersChange({ ...filters, max_price: value });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sort By
                  </label>
                  <select
                    value={filters.sort || 'newest'}
                    onChange={(e) => {
                      const sort = e.target.value as AgencyFilters['sort'];
                      handleFiltersChange({ ...filters, sort });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                  >
                    <option value="newest">Newest</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="space-y-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden animate-pulse"
                >
                  <div className="aspect-[3/2] bg-gray-200" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 bg-gray-200 rounded" />
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No listings found</h3>
              <p className="text-gray-500">
                {agencyExists === false
                  ? `We couldn't find any agents for "${resolvedAgencyDisplayName}".`
                  : `${resolvedAgencyDisplayName} doesn't have any active listings matching your criteria.`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {listings.map((listing) => (
                <div
                  key={listing.id}
                  ref={(el) => {
                    if (el) {
                      observeElement(el, listing.id);
                    }
                  }}
                >
                  <ListingCard
                    listing={listing}
                    isFavorited={userFavorites.includes(listing.id)}
                    onFavoriteChange={handleFavoriteChange}
                    showFeaturedBadge={false} // Don't show featured badges on agency pages
                  />
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Mobile Filters Modal */}
      {showFiltersMobile && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
            onClick={() => setShowFiltersMobile(false)}
          />
          <div className="fixed top-0 left-0 right-0 bottom-0 bg-white z-50 lg:hidden overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white sticky top-0">
              <h2 className="text-lg font-semibold text-[#273140]">
                Filter Listings
              </h2>
              <button
                onClick={() => setShowFiltersMobile(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Mobile filters - same as desktop but stacked */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bedrooms
                </label>
                <select
                  value={filters.bedrooms === 0 ? "0" : filters.bedrooms || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    const bedrooms = value === "" ? undefined : parseInt(value);
                    handleFiltersChange({ ...filters, bedrooms });
                    setShowFiltersMobile(false);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                >
                  <option value="">Any</option>
                  <option value="0">Studio</option>
                  <option value="1">1 BR</option>
                  <option value="2">2 BR</option>
                  <option value="3">3 BR</option>
                  <option value="4">4+ BR</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Min Price
                </label>
                <input
                  type="number"
                  placeholder="$"
                  value={filters.min_price || ""}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || undefined;
                    handleFiltersChange({ ...filters, min_price: value });
                    setShowFiltersMobile(false);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Price
                </label>
                <input
                  type="number"
                  placeholder="$"
                  value={filters.max_price || ""}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || undefined;
                    handleFiltersChange({ ...filters, max_price: value });
                    setShowFiltersMobile(false);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sort By
                </label>
                <select
                  value={filters.sort || 'newest'}
                  onChange={(e) => {
                    const sort = e.target.value as AgencyFilters['sort'];
                    handleFiltersChange({ ...filters, sort });
                    setShowFiltersMobile(false);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-[#273140] focus:border-[#273140]"
                >
                  <option value="newest">Newest</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </select>
              </div>
            </div>
          </div>
        </>
      )}


    </div>
  );
}
