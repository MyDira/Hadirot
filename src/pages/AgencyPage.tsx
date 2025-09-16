import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Share2, Filter, X, ChevronLeft, ChevronRight } from "lucide-react";
import { ListingCard } from "../components/listings/ListingCard";
import { Listing, supabase } from "../config/supabase";
import { listingsService } from "../services/listings";
import { useAuth } from "@/hooks/useAuth";
import { track } from "../lib/analytics";
import { useListingImpressions } from "../hooks/useListingImpressions";

interface AgencyFilters {
  bedrooms?: number;
  min_price?: number;
  max_price?: number;
  sort?: 'newest' | 'price_asc' | 'price_desc';
}

// Convert agency name to URL slug
function agencyNameToSlug(agencyName: string): string {
  return agencyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Convert URL slug back to potential agency name patterns for matching
function slugToAgencyPatterns(slug: string): string[] {
  // Generate multiple potential matches for the agency name
  const basePattern = slug.replace(/-/g, ' ');
  const patterns = [
    basePattern,
    basePattern.replace(/\b\w/g, l => l.toUpperCase()), // Title Case
    basePattern.toUpperCase(),
    slug.replace(/-/g, ''), // No spaces
    slug.replace(/-/g, '_'), // Underscores
  ];
  
  return [...new Set(patterns)]; // Remove duplicates
}

export function AgencyPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  
  const [agencyName, setAgencyName] = useState<string>("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [userFavorites, setUserFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
  const [filters, setFilters] = useState<AgencyFilters>({});
  
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

  // Load listings when filters, page, or slug changes
  useEffect(() => {
    if (slug) {
      loadAgencyListings();
    }
  }, [slug, filters, currentPage]);

  // Set page title based on agency name
  useEffect(() => {
    if (agencyName) {
      document.title = `${agencyName} - Listings | HaDirot`;
    }
    
    return () => {
      document.title = "HaDirot Real Estate Listings Platform";
    };
  }, [agencyName]);

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
    if (!slug) return;
    
    try {
      setLoading(true);
      
      // Generate potential agency name patterns from slug
      const agencyPatterns = slugToAgencyPatterns(slug);
      
      // Find the actual agency name by querying profiles
      const { data: agencyProfiles, error: agencyError } = await supabase
        .from('profiles')
        .select('agency')
        .eq('role', 'agent')
        .not('agency', 'is', null)
        .in('agency', agencyPatterns)
        .limit(1);
      
      if (agencyError) {
        console.error("Error finding agency:", agencyError);
        setLoading(false);
        return;
      }
      
      if (!agencyProfiles || agencyProfiles.length === 0) {
        console.log("No agency found for slug:", slug);
        setAgencyName("");
        setListings([]);
        setTotalCount(0);
        setLoading(false);
        return;
      }
      
      const foundAgencyName = agencyProfiles[0].agency;
      setAgencyName(foundAgencyName);
      
      // Build query for listings
      let query = supabase
        .from('listings')
        .select(`
          *,
          owner:profiles!inner(id, full_name, role, agency),
          listing_images(*)
        `, { count: 'exact' })
        .eq('is_active', true)
        .eq('approved', true)
        .eq('owner.role', 'agent')
        .eq('owner.agency', foundAgencyName)

      // Apply filters
      if (filters.bedrooms !== undefined) {
        if (filters.bedrooms >= 4) {
          query = query.gte('bedrooms', 4);
        } else {
          query = query.eq('bedrooms', filters.bedrooms);
        }
      }
      
      if (filters.min_price) {
        query = query.gte('price', filters.min_price);
      }
      
      if (filters.max_price) {
        query = query.lte('price', filters.max_price);
      }

      // Apply sorting
      switch (filters.sort) {
        case 'price_asc':
          query = query.order('price', { ascending: true });
          break;
        case 'price_desc':
          query = query.order('price', { ascending: false });
          break;
        case 'newest':
        default:
          query = query.order('created_at', { ascending: false });
          break;
      }

      // Apply pagination
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      query = query.range(offset, offset + ITEMS_PER_PAGE - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error("Error loading agency listings:", error);
        setListings([]);
        setTotalCount(0);
      } else {
        setListings(data || []);
        setTotalCount(count || 0);
      }
      
      // Track agency page view
      track('agency_page_view', {
        agency_name: foundAgencyName,
        agency_slug: slug,
        listing_count: count || 0,
      });
      
    } catch (error) {
      console.error("Error in loadAgencyListings:", error);
      setListings([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  };

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
      agency_name: agencyName,
      agency_slug: slug,
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
        agency_name: agencyName,
        agency_slug: slug,
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

  if (!agencyName) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Agency Not Found</h1>
          <p className="text-gray-600 mb-6">
            The agency you're looking for doesn't exist or has no active listings.
          </p>
          <Link
            to="/browse"
            className="inline-flex items-center bg-accent-500 text-white px-6 py-3 rounded-md font-medium hover:bg-accent-600 transition-colors"
          >
            Browse All Listings
          </Link>
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
              {agencyName}
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
            {agencyName} doesn't have any active listings matching your criteria.
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