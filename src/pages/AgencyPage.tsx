import React, { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Share2, Filter, X, ChevronLeft, ChevronRight } from "lucide-react";
import { ListingCard } from "../components/listings/ListingCard";
import { Listing } from "@/config/supabase";
import { listingsService } from "@/services/listings";
import { slugToAgencyLabel } from "@/utils/agency";
import { useAuth } from "@/hooks/useAuth";
import { track } from "@/lib/analytics";
import { useListingImpressions } from "@/hooks/useListingImpressions";

interface AgencyFilters {
  bedrooms?: number;
  min_price?: number;
  max_price?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc';
}

export function AgencyPage() {
  const { slug } = useParams<{ slug: string }>();
  const slugParam = slug ?? "";
  const derivedAgencyLabel = slugToAgencyLabel(slugParam);
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const [agencyDisplayName, setAgencyDisplayName] = useState<string>(derivedAgencyLabel);
  const [agencyExists, setAgencyExists] = useState<boolean | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [userFavorites, setUserFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
  const [filters, setFilters] = useState<AgencyFilters>({});
  const resolvedAgencyDisplayName =
    agencyDisplayName || derivedAgencyLabel || (slugParam ? slugParam : 'Agency');

  useEffect(() => {
    setAgencyDisplayName(derivedAgencyLabel);
    setAgencyExists(null);
  }, [derivedAgencyLabel]);
  
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
    if (agencyDisplayName) {
      document.title = `${agencyDisplayName} - Listings | HaDirot`;
    }

    return () => {
      document.title = "HaDirot Real Estate Listings Platform";
    };
  }, [agencyDisplayName]);

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
      setAgencyExists(null);
      return;
    }

    try {
      setLoading(true);

      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      const { data, count, agencyName: matchedAgencyName } =
        await listingsService.getActiveListingsForAgencySlug(slugParam, {
          beds: filters.bedrooms,
          priceMin: filters.min_price,
          priceMax: filters.max_price,
          sort: filters.sort,
          limit: ITEMS_PER_PAGE,
          offset,
        });

      const resolvedAgencyName = matchedAgencyName ?? derivedAgencyLabel;

      setAgencyDisplayName(resolvedAgencyName);
      setAgencyExists(Boolean(matchedAgencyName));
      setListings(data ?? []);
      setTotalCount(count ?? 0);

      track('agency_page_view', {
        agency_name: resolvedAgencyName,
        agency_slug: slugParam,
        listing_count: count ?? 0,
        agency_found: Boolean(matchedAgencyName),
      });
    } catch (error) {
      console.error('Error loading agency listings:', error);
      setListings([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
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
      agency_found: agencyExists,
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

  const handleShareAgency = async () => {
    const url = window.location.href;
    
    try {
      await navigator.clipboard.writeText(url);
      // You could add a toast notification here
      console.log("Agency page URL copied to clipboard");
      
      track('agency_share', {
        agency_name: resolvedAgencyDisplayName,
        agency_slug: slugParam,
        agency_found: agencyExists,
        method: 'copy_link',
      });
    } catch (error) {
      console.error("Failed to copy URL:", error);
      // Fallback: select the URL in a temporary input
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }
  };

  const handleFavoriteChange = () => {
    loadUserFavorites();
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#273140] mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading agency listings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold font-brand text-[#273140] mb-2">
              {resolvedAgencyDisplayName}
            </h1>
            <p className="text-gray-600">
              {loading
                ? "Loading..."
                : `${totalCount} active listing${totalCount === 1 ? '' : 's'}`}
            </p>
          </div>
          
          <button
            onClick={handleShareAgency}
            className="flex items-center bg-white border border-gray-300 px-4 py-2 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share Agency
          </button>
        </div>
      </div>

      {/* Mobile Filter Button */}
      <div className="md:hidden mb-6">
        <button
          onClick={() => setShowFiltersMobile(true)}
          className="w-full bg-[#f9f4ed] border border-gray-200 rounded-lg p-4 flex items-center justify-center text-[#273140] hover:bg-gray-50 transition-colors"
        >
          <Filter className="w-5 h-5 mr-2" />
          <span className="font-medium">Filter Listings</span>
          {(filters.bedrooms !== undefined ||
            filters.min_price ||
            filters.max_price ||
            (filters.sort && filters.sort !== 'newest')) && (
            <span className="ml-2 bg-[#667B9A] text-white text-xs px-2 py-1 rounded-full">
              Active
            </span>
          )}
        </button>
      </div>

      {/* Desktop Filters */}
      <div className="hidden md:block mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center mb-4">
            <Filter className="w-5 h-5 text-[#273140] mr-2" />
            <h3 className="text-lg font-semibold text-[#273140]">Filters</h3>
            <button
              onClick={() => handleFiltersChange({})}
              className="ml-auto text-sm text-gray-500 hover:text-[#273140] transition-colors"
            >
              Clear All
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Bedrooms */}
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

            {/* Min Price */}
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

            {/* Max Price */}
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

            {/* Sort */}
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

      {/* Mobile Filters Modal */}
      {showFiltersMobile && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setShowFiltersMobile(false)}
          />
          <div className="fixed top-0 left-0 right-0 bottom-0 bg-white z-50 md:hidden overflow-y-auto">
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

      {/* Listings Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm animate-pulse">
              <div className="h-48 bg-gray-200 rounded-t-lg"></div>
              <div className="p-4">
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
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
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No listings found
          </h3>
          <p className="text-gray-500">
            {agencyExists === false
              ? `We couldn't find any agents for "${resolvedAgencyDisplayName}".`
              : `${resolvedAgencyDisplayName} doesn't have any active listings matching your criteria.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2 mt-12">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </button>

          <div className="flex space-x-1">
            {currentPage > 1 && (
              <button
                onClick={() => handlePageChange(1)}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                1
              </button>
            )}

            {currentPage > 3 && (
              <span className="px-3 py-2 text-sm text-gray-500">...</span>
            )}

            {(() => {
              const startPage = Math.max(1, currentPage - 1);
              const endPage = Math.min(totalPages, currentPage + 1);
              const pages = [];

              for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
                if (pageNum === 1 && currentPage > 1) continue;
                if (pageNum === totalPages && currentPage < totalPages) continue;

                pages.push(
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      pageNum === currentPage
                        ? "bg-brand-700 text-white"
                        : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              }

              return pages;
            })()}

            {currentPage < totalPages - 2 && (
              <span className="px-3 py-2 text-sm text-gray-500">...</span>
            )}

            {currentPage < totalPages && (
              <button
                onClick={() => handlePageChange(totalPages)}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {totalPages}
              </button>
            )}
          </div>

          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      )}
    </div>
  );
}