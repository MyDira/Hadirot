import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Filter, X, List, Map as MapIcon, Locate, RotateCcw } from "lucide-react";
import { ListingCard } from "../components/listings/ListingCard";
import { ListingFiltersHorizontal } from "../components/listings/ListingFiltersHorizontal";
import { ListingsMapEnhanced } from "../components/listings/ListingsMapEnhanced";
import { Listing } from "../config/supabase";
import { listingsService } from "../services/listings";
import { useAuth } from "@/hooks/useAuth";
import { gaEvent, gaListing } from "@/lib/ga";
import { trackFilterApply } from "../lib/analytics";
import { useListingImpressions } from "../hooks/useListingImpressions";
import { useBrowseFilters } from "../hooks/useBrowseFilters";

export type SortOption = 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'bedrooms_asc' | 'bedrooms_desc' | 'bathrooms_asc' | 'bathrooms_desc';

interface FilterState {
  bedrooms?: number[];
  poster_type?: string;
  agency_name?: string;
  property_type?: string;
  min_price?: number;
  max_price?: number;
  parking_included?: boolean;
  no_fee_only?: boolean;
  neighborhoods?: string[];
  sort?: SortOption;
}

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

type ViewMode = 'split' | 'list' | 'map';

export function BrowseListings() {
  const navigate = useNavigate();
  const [displayListings, setDisplayListings] = useState<
    (Listing & { showFeaturedBadge: boolean })[]
  >([]);
  const [allListingsForMap, setAllListingsForMap] = useState<Listing[]>([]);
  const [userFavorites, setUserFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [agencies, setAgencies] = useState<string[]>([]);
  const [allNeighborhoods, setAllNeighborhoods] = useState<string[]>([]);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [hoveredListingId, setHoveredListingId] = useState<string | null>(null);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [showSearchAreaButton, setShowSearchAreaButton] = useState(false);
  const [isSearchingArea, setIsSearchingArea] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const listingsContainerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { filters, currentPage, updateFilters, updatePage, markNavigatingToDetail, isReady } = useBrowseFilters();

  const { observeElement, unobserveElement } = useListingImpressions({
    listingIds: displayListings.map(l => l.id),
  });

  const ITEMS_PER_PAGE = 20;
  const NUM_FEATURED_INJECTED_SLOTS = 4;
  const NUM_STANDARD_SLOTS_PER_PAGE = ITEMS_PER_PAGE - NUM_FEATURED_INJECTED_SLOTS;
  const totalPages = Math.ceil(totalCount / NUM_STANDARD_SLOTS_PER_PAGE);

  useEffect(() => {
    if (user) {
      loadUserFavorites();
    } else {
      setUserFavorites([]);
    }
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const names = await listingsService.getActiveAgencies();
      if (!cancelled) setAgencies(names);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadUserFavorites = async () => {
    if (!user) return;
    try {
      const favorites = await listingsService.getUserFavoriteIds(user.id);
      setUserFavorites(favorites);
    } catch (error) {
      console.error("Error loading user favorites:", error);
    }
  };

  useEffect(() => {
    if (!isReady) return;
    loadListings();
    loadNeighborhoods();
  }, [filters, currentPage, user, isReady]);

  const loadListings = async (boundsFilter?: MapBounds) => {
    try {
      setLoading(true);

      const { no_fee_only, ...restFilters } = filters;
      const serviceFilters = { ...restFilters, noFeeOnly: no_fee_only };

      const { totalCount: actualTotalCount } = await listingsService.getListings(
        serviceFilters,
        undefined,
        user?.id,
        0,
        false,
      );
      setTotalCount(actualTotalCount);

      let allFeaturedListings: Listing[] = [];
      try {
        const { data: featuredData } = await listingsService.getListings(
          { ...serviceFilters, is_featured_only: true },
          undefined,
          user?.id,
          0,
          false,
        );
        allFeaturedListings = featuredData || [];
      } catch (error) {
        console.error("Error loading featured listings:", error);
      }

      const featuredSlotsPerPage = NUM_FEATURED_INJECTED_SLOTS;
      const startIndex = ((currentPage - 1) * featuredSlotsPerPage) % allFeaturedListings.length;
      let featuredForThisPage: Listing[] = [];

      if (allFeaturedListings.length > 0) {
        for (let i = 0; i < featuredSlotsPerPage && allFeaturedListings.length > 0; i++) {
          const index = (startIndex + i) % allFeaturedListings.length;
          featuredForThisPage.push(allFeaturedListings[index]);
        }
      }

      const standardOffset = (currentPage - 1) * NUM_STANDARD_SLOTS_PER_PAGE;

      const { data: rawStandardListings } = await listingsService.getListings(
        serviceFilters,
        NUM_STANDARD_SLOTS_PER_PAGE,
        user?.id,
        standardOffset,
        true,
      );

      let standardListings = rawStandardListings;
      if (filters.poster_type === "owner") {
        standardListings = standardListings.filter(
          (l) => l.owner && (l.owner.role === "landlord" || l.owner.role === "tenant"),
        );
      }
      if (filters.poster_type === "agent") {
        standardListings = standardListings.filter(
          (l) => l.owner && l.owner.role === "agent",
        );
      }
      if (filters.agency_name) {
        standardListings = standardListings.filter(
          (l) => l.owner && l.owner.agency === filters.agency_name,
        );
      }

      const injectedFeaturedMap = new Map(
        featuredForThisPage.map((listing) => [listing.id, listing]),
      );

      const featuredSlotPositions = [1, 3, 5, 7];
      const finalListings: (Listing & { showFeaturedBadge: boolean; key: string })[] = [];
      let featuredIndex = 0;
      let standardListingsCursor = 0;

      for (let i = 0; i < ITEMS_PER_PAGE; i++) {
        const isFeaturedSlot = featuredSlotPositions.includes(i);

        if (
          isFeaturedSlot &&
          featuredIndex < featuredForThisPage.length &&
          !finalListings.some(
            (l) => l.id === featuredForThisPage[featuredIndex].id && l.showFeaturedBadge,
          )
        ) {
          const featuredListing = featuredForThisPage[featuredIndex];
          finalListings.push({
            ...featuredListing,
            showFeaturedBadge: true,
            key: featuredListing.id,
          });
          featuredIndex++;
        } else if (standardListingsCursor < standardListings.length) {
          const standardListing = standardListings[standardListingsCursor];
          const isAlsoInjected = injectedFeaturedMap.has(standardListing.id);
          const key = isAlsoInjected ? `${standardListing.id}-natural` : standardListing.id;

          finalListings.push({
            ...standardListing,
            showFeaturedBadge: false,
            key: key,
          });
          standardListingsCursor++;
        } else {
          break;
        }
      }

      setDisplayListings(finalListings);

      const { data: allData } = await listingsService.getListings(
        serviceFilters,
        undefined,
        user?.id,
        0,
        false,
      );

      let filteredMapListings = allData || [];
      if (boundsFilter) {
        filteredMapListings = filteredMapListings.filter(listing => {
          if (listing.latitude == null || listing.longitude == null) return false;
          return (
            listing.latitude >= boundsFilter.south &&
            listing.latitude <= boundsFilter.north &&
            listing.longitude >= boundsFilter.west &&
            listing.longitude <= boundsFilter.east
          );
        });
      }
      setAllListingsForMap(filteredMapListings);

    } catch (error) {
      console.error("Error loading listings:", error);
    } finally {
      setLoading(false);
      setIsSearchingArea(false);
    }
  };

  const loadNeighborhoods = async () => {
    try {
      const neighborhoods = await listingsService.getUniqueNeighborhoods();
      setAllNeighborhoods(neighborhoods);
    } catch (error) {
      console.error("Error loading neighborhoods:", error);
    }
  };

  const handleFiltersChange = (newFilters: FilterState) => {
    gaEvent("filter_apply", {
      price_min: newFilters.min_price ?? null,
      price_max: newFilters.max_price ?? null,
      bedrooms: newFilters.bedrooms?.join(",") ?? null,
      neighborhood: newFilters.neighborhoods?.join(",") ?? null,
      no_fee_only: !!newFilters.no_fee_only,
      sort: newFilters.sort ?? null,
    });
    trackFilterApply(newFilters);
    updateFilters(newFilters);
    setShowSearchAreaButton(false);
  };

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    updatePage(page);
    if (listingsContainerRef.current) {
      listingsContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleMapBoundsChange = useCallback((bounds: MapBounds, zoomLevel: number) => {
    setMapBounds(bounds);
    if (zoomLevel >= 14) {
      setIsSearchingArea(true);
      loadListings(bounds);
    } else {
      setShowSearchAreaButton(true);
    }
  }, [filters, user]);

  const handleSearchThisArea = () => {
    if (mapBounds) {
      setIsSearchingArea(true);
      setShowSearchAreaButton(false);
      loadListings(mapBounds);
    }
  };

  const handleResetMap = () => {
    setMapBounds(null);
    setShowSearchAreaButton(false);
    loadListings();
  };

  const handleGetUserLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setIsLocating(false);
      },
      (error) => {
        console.error("Error getting location:", error);
        setIsLocating(false);
        alert("Unable to get your location. Please check your browser permissions.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleListingHover = useCallback((listingId: string | null) => {
    setHoveredListingId(listingId);
  }, []);

  const handleMarkerClick = useCallback((listingId: string) => {
    setSelectedListingId(listingId);
    const element = document.getElementById(`listing-card-${listingId}`);
    if (element && listingsContainerRef.current) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  useEffect(() => {
    if (!displayListings || displayListings.length === 0) return;

    const batchKey = `impression_batch_p${currentPage}_c${displayListings.length}`;
    const hasTracked = sessionStorage.getItem(batchKey);

    if (!hasTracked) {
      const pageNumber = currentPage ?? 1;
      gaEvent("listing_impression_batch", {
        page: pageNumber,
        result_count: displayListings.length,
        items: displayListings.map((l: any, idx: number) => ({
          listing_id: String(l.id),
          price: Number(l.price ?? 0),
          bedrooms: Number(l.bedrooms ?? 0),
          neighborhood: l.neighborhood ?? l.area ?? l.location ?? undefined,
          is_featured: !!(l.is_featured ?? l.featured),
          position: idx + 1,
        })),
      });
      sessionStorage.setItem(batchKey, 'true');
    }
  }, [displayListings, currentPage]);

  const handleCardClick = (l: any, idx: number) => {
    const clickKey = `listing_click_${l.id}`;
    const hasTracked = sessionStorage.getItem(clickKey);

    if (!hasTracked) {
      sessionStorage.setItem(clickKey, 'true');
    }

    gaListing("listing_click", l.id, {
      title: l.title ?? undefined,
      price: Number(l.price ?? 0),
      bedrooms: Number(l.bedrooms ?? 0),
      neighborhood: l.neighborhood ?? undefined,
      is_featured: !!(l.is_featured ?? l.featured),
      position: idx + 1,
    });
  };

  const handleFavoriteChange = () => {
    loadUserFavorites();
  };

  const renderViewModeToggle = () => (
    <div className="flex items-center bg-gray-100 rounded-lg p-1">
      <button
        onClick={() => setViewMode('split')}
        className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          viewMode === 'split'
            ? 'bg-white text-brand-800 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        <div className="flex items-center gap-0.5 mr-1.5">
          <div className="w-2 h-3 bg-current rounded-sm opacity-60"></div>
          <div className="w-3 h-3 bg-current rounded-sm"></div>
        </div>
        Split
      </button>
      <button
        onClick={() => setViewMode('list')}
        className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          viewMode === 'list'
            ? 'bg-white text-brand-800 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        <List className="w-4 h-4 mr-1.5" />
        List
      </button>
      <button
        onClick={() => setViewMode('map')}
        className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
          viewMode === 'map'
            ? 'bg-white text-brand-800 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        <MapIcon className="w-4 h-4 mr-1.5" />
        Map
      </button>
    </div>
  );

  const renderListingCards = () => (
    <div className="grid grid-cols-1 gap-4">
      {displayListings.map((listing, idx) => (
        <div
          key={listing.key}
          id={`listing-card-${listing.id}`}
          className={`transition-all duration-200 ${
            hoveredListingId === listing.id || selectedListingId === listing.id
              ? 'ring-2 ring-brand-500 rounded-lg'
              : ''
          }`}
          onMouseEnter={() => handleListingHover(listing.id)}
          onMouseLeave={() => handleListingHover(null)}
          ref={(el) => {
            if (el) {
              observeElement(el, listing.id);
            } else {
              const existingEl = document.querySelector(`[data-listing-id="${listing.id}"]`);
              if (existingEl) {
                unobserveElement(existingEl);
              }
            }
          }}
        >
          <ListingCard
            listing={listing}
            isFavorited={userFavorites.includes(listing.id)}
            onFavoriteChange={handleFavoriteChange}
            showFeaturedBadge={listing.showFeaturedBadge}
            onClick={() => handleCardClick(listing, idx)}
            onNavigateToDetail={markNavigatingToDetail}
          />
        </div>
      ))}
    </div>
  );

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-center space-x-2 py-6 border-t border-gray-200 mt-4">
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Prev
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
            <span className="px-2 py-2 text-sm text-gray-500">...</span>
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
                  key={`page-${pageNum}`}
                  onClick={() => handlePageChange(pageNum)}
                  className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    pageNum === currentPage
                      ? "bg-brand-700 text-white"
                      : "text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {pageNum}
                </button>,
              );
            }
            return pages;
          })()}

          {currentPage < totalPages - 2 && (
            <span className="px-2 py-2 text-sm text-gray-500">...</span>
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
    );
  };

  const renderLoadingState = () => (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="bg-white rounded-lg shadow-sm animate-pulse border border-gray-100">
          <div className="flex">
            <div className="w-48 h-36 bg-gray-200 rounded-l-lg flex-shrink-0"></div>
            <div className="p-4 flex-1">
              <div className="h-5 bg-gray-200 rounded w-24 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-48"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderEmptyState = () => (
    <div className="text-center py-12">
      <div className="text-gray-400 mb-4">
        <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">No listings found</h3>
      <p className="text-gray-500">Try adjusting your filters to see more results.</p>
    </div>
  );

  return (
    <div className="h-[calc(100vh-56px)] md:h-[calc(100vh-64px)] flex flex-col bg-gray-50">
      {/* Header with Filters */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="max-w-[1800px] mx-auto">
          {/* Top row: Title and view toggle */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-brand-900">
                Brooklyn Rentals
              </h1>
              <p className="text-sm text-gray-500">
                {loading ? "Loading..." : `${totalCount.toLocaleString()} properties available`}
              </p>
            </div>
            <div className="hidden md:block">
              {renderViewModeToggle()}
            </div>
          </div>

          {/* Filters row - Desktop */}
          <div className="hidden md:block">
            <ListingFiltersHorizontal
              filters={filters}
              onFiltersChange={handleFiltersChange}
              agencies={agencies}
              allNeighborhoods={allNeighborhoods}
            />
          </div>

          {/* Mobile: View toggle and filter button */}
          <div className="md:hidden flex items-center gap-3">
            <div className="flex-1">
              {renderViewModeToggle()}
            </div>
            <button
              onClick={() => setShowFiltersMobile(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
            >
              <Filter className="w-4 h-4" />
              Filters
              {((filters.bedrooms && filters.bedrooms.length > 0) ||
                filters.poster_type ||
                filters.property_type ||
                filters.min_price ||
                filters.max_price ||
                filters.parking_included ||
                filters.no_fee_only ||
                (filters.neighborhoods && filters.neighborhoods.length > 0)) && (
                <span className="bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                  Active
                </span>
              )}
            </button>
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
              <h2 className="text-lg font-semibold text-brand-900">Filters</h2>
              <button
                onClick={() => setShowFiltersMobile(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4">
              <ListingFiltersHorizontal
                filters={filters}
                onFiltersChange={(newFilters) => {
                  handleFiltersChange(newFilters);
                  setShowFiltersMobile(false);
                }}
                agencies={agencies}
                allNeighborhoods={allNeighborhoods}
                isMobile={true}
              />
            </div>
          </div>
        </>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {viewMode === 'split' ? (
          /* Split View */
          <div className="h-full flex">
            {/* Listings Panel */}
            <div
              ref={listingsContainerRef}
              className="w-full lg:w-[420px] xl:w-[480px] h-full overflow-y-auto border-r border-gray-200 bg-white"
            >
              <div className="p-4">
                {loading ? (
                  renderLoadingState()
                ) : displayListings.length === 0 ? (
                  renderEmptyState()
                ) : (
                  <>
                    {renderListingCards()}
                    {renderPagination()}
                  </>
                )}
              </div>
            </div>

            {/* Map Panel */}
            <div className="hidden lg:block flex-1 h-full relative">
              {/* Map Controls Overlay */}
              <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                {showSearchAreaButton && !isSearchingArea && (
                  <button
                    onClick={handleSearchThisArea}
                    className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg text-sm font-medium text-brand-700 hover:bg-gray-50 transition-colors border border-gray-200"
                  >
                    <MapIcon className="w-4 h-4" />
                    Search this area
                  </button>
                )}
                {isSearchingArea && (
                  <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg text-sm font-medium text-gray-600 border border-gray-200">
                    <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
                    Searching...
                  </div>
                )}
              </div>

              <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                <button
                  onClick={handleGetUserLocation}
                  disabled={isLocating}
                  className="flex items-center justify-center w-10 h-10 bg-white rounded-lg shadow-lg hover:bg-gray-50 transition-colors border border-gray-200 disabled:opacity-50"
                  title="Use my location"
                >
                  {isLocating ? (
                    <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Locate className="w-5 h-5 text-gray-700" />
                  )}
                </button>
                <button
                  onClick={handleResetMap}
                  className="flex items-center justify-center w-10 h-10 bg-white rounded-lg shadow-lg hover:bg-gray-50 transition-colors border border-gray-200"
                  title="Reset map view"
                >
                  <RotateCcw className="w-5 h-5 text-gray-700" />
                </button>
              </div>

              <ListingsMapEnhanced
                listings={allListingsForMap}
                hoveredListingId={hoveredListingId}
                selectedListingId={selectedListingId}
                onMarkerHover={handleListingHover}
                onMarkerClick={handleMarkerClick}
                onBoundsChange={handleMapBoundsChange}
                userLocation={userLocation}
              />

              {/* Listing count badge */}
              <div className="absolute bottom-4 left-4 bg-white px-3 py-1.5 rounded-full shadow-md text-sm text-gray-600 border border-gray-200">
                {allListingsForMap.filter(l => l.latitude && l.longitude).length} listing{allListingsForMap.filter(l => l.latitude && l.longitude).length !== 1 ? "s" : ""} on map
              </div>
            </div>
          </div>
        ) : viewMode === 'list' ? (
          /* List Only View */
          <div className="h-full overflow-y-auto">
            <div className="max-w-7xl mx-auto px-4 py-6">
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
              ) : displayListings.length === 0 ? (
                renderEmptyState()
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {displayListings.map((listing, idx) => (
                      <div
                        key={listing.key}
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
                          showFeaturedBadge={listing.showFeaturedBadge}
                          onClick={() => handleCardClick(listing, idx)}
                          onNavigateToDetail={markNavigatingToDetail}
                        />
                      </div>
                    ))}
                  </div>
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center space-x-2 mt-12">
                      {renderPagination()}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          /* Map Only View */
          <div className="h-full relative">
            {/* Map Controls */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
              {showSearchAreaButton && !isSearchingArea && (
                <button
                  onClick={handleSearchThisArea}
                  className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg text-sm font-medium text-brand-700 hover:bg-gray-50 transition-colors border border-gray-200"
                >
                  <MapIcon className="w-4 h-4" />
                  Search this area
                </button>
              )}
              {isSearchingArea && (
                <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg text-sm font-medium text-gray-600 border border-gray-200">
                  <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
                  Searching...
                </div>
              )}
            </div>

            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
              <button
                onClick={handleGetUserLocation}
                disabled={isLocating}
                className="flex items-center justify-center w-10 h-10 bg-white rounded-lg shadow-lg hover:bg-gray-50 transition-colors border border-gray-200 disabled:opacity-50"
                title="Use my location"
              >
                {isLocating ? (
                  <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <Locate className="w-5 h-5 text-gray-700" />
                )}
              </button>
              <button
                onClick={handleResetMap}
                className="flex items-center justify-center w-10 h-10 bg-white rounded-lg shadow-lg hover:bg-gray-50 transition-colors border border-gray-200"
                title="Reset map view"
              >
                <RotateCcw className="w-5 h-5 text-gray-700" />
              </button>
            </div>

            {loading ? (
              <div className="h-full bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-700 mx-auto mb-3"></div>
                  <p className="text-gray-600">Loading map...</p>
                </div>
              </div>
            ) : (
              <ListingsMapEnhanced
                listings={allListingsForMap}
                hoveredListingId={hoveredListingId}
                selectedListingId={selectedListingId}
                onMarkerHover={handleListingHover}
                onMarkerClick={handleMarkerClick}
                onBoundsChange={handleMapBoundsChange}
                userLocation={userLocation}
              />
            )}

            <div className="absolute bottom-4 left-4 bg-white px-3 py-1.5 rounded-full shadow-md text-sm text-gray-600 border border-gray-200">
              {allListingsForMap.filter(l => l.latitude && l.longitude).length} listing{allListingsForMap.filter(l => l.latitude && l.longitude).length !== 1 ? "s" : ""} on map
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
