import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ChevronLeft, ChevronRight, Filter, X, List, Map as MapIcon, Locate, RotateCcw, LayoutGrid, ArrowUpDown } from "lucide-react";
import { ListingCard } from "../components/listings/ListingCard";
import { ListingFiltersHorizontal } from "../components/listings/ListingFiltersHorizontal";
import { ListingsMapEnhanced } from "../components/listings/ListingsMapEnhanced";
import { SmartSearchBar, SmartSearchBarRef } from "../components/listings/SmartSearchBar";
import { MobileListingCarousel } from "../components/listings/MobileListingCarousel";
import { Listing } from "../config/supabase";
import { listingsService } from "../services/listings";
import { useAuth } from "@/hooks/useAuth";
import { gaEvent, gaListing } from "@/lib/ga";
import { trackFilterApply } from "../lib/analytics";
import { useListingImpressions } from "../hooks/useListingImpressions";
import { useBrowseFilters } from "../hooks/useBrowseFilters";
import { ParsedSearchQuery } from "../utils/searchQueryParser";
import { LocationResult } from "../services/locationSearch";
import { calculateGeographicCenter } from "../utils/geoUtils";
import { isElementFullyVisible, scrollElementIntoView } from "../utils/viewportUtils";
import { MapPin, applyFilters, FilterState as FilterStateFromUtils } from "../utils/filterUtils";

export type SortOption = 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'bedrooms_asc' | 'bedrooms_desc' | 'bathrooms_asc' | 'bathrooms_desc';

interface FilterState {
  bedrooms?: number[];
  poster_type?: string;
  agency_name?: string;
  property_type?: string;
  property_types?: string[];
  building_types?: string[];
  min_price?: number;
  max_price?: number;
  parking_included?: boolean;
  no_fee_only?: boolean;
  neighborhoods?: string[];
  sort?: SortOption;
  searchBounds?: MapBounds | null;
  searchLocationName?: string;
}

interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

type ViewMode = 'split' | 'list' | 'map';

const isMobileDevice = () => window.innerWidth < 768;

export function BrowseSales() {
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
  const [viewMode, setViewMode] = useState<ViewMode>(() => isMobileDevice() ? 'list' : 'split');
  const [hoveredListingId, setHoveredListingId] = useState<string | null>(null);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [showSearchAreaButton, setShowSearchAreaButton] = useState(false);
  const [isSearchingArea, setIsSearchingArea] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [searchLocation, setSearchLocation] = useState<LocationResult | null>(null);
  const [searchBounds, setSearchBounds] = useState<MapBounds | null>(null);
  const [showSortDropdown, setShowSortDropdown] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);
  const listingsContainerRef = useRef<HTMLDivElement>(null);
  const searchBarRef = useRef<SmartSearchBarRef>(null);
  const [centerOnListings, setCenterOnListings] = useState<{ lat: number; lng: number; zoom: number } | null>(null);
  const [shouldPreserveMapPosition, setShouldPreserveMapPosition] = useState(false);
  const [isFilterClearing, setIsFilterClearing] = useState(false);
  const [shouldFitBounds, setShouldFitBounds] = useState(false);
  const [fitBoundsToAllPins, setFitBoundsToAllPins] = useState(false);
  const preserveMapRef = useRef(false);
  const { user } = useAuth();
  const { filters, currentPage, updateFilters, updatePage, markNavigatingToDetail, isReady } = useBrowseFilters('sales');

  const { observeElement, unobserveElement } = useListingImpressions({
    listingIds: displayListings.map(l => l.id),
  });

  const ITEMS_PER_PAGE = 20;
  const NUM_FEATURED_INJECTED_SLOTS = 4;
  const NUM_STANDARD_SLOTS_PER_PAGE = ITEMS_PER_PAGE - NUM_FEATURED_INJECTED_SLOTS;
  const totalPages = Math.ceil(totalCount / NUM_STANDARD_SLOTS_PER_PAGE);

  const filteredListingsForMap = useMemo(() => {
    const filtersWithBounds = searchBounds
      ? { ...filters, searchBounds } as FilterStateFromUtils
      : filters as FilterStateFromUtils;
    return applyFilters(allListingsForMap, filtersWithBounds);
  }, [allListingsForMap, filters, searchBounds]);

  const pinsFromListings = useMemo((): MapPin[] => {
    return filteredListingsForMap
      .filter((l) => l.latitude != null && l.longitude != null)
      .map((l) => ({
        id: l.id,
        latitude: l.latitude!,
        longitude: l.longitude!,
        price: l.price,
        asking_price: l.asking_price ?? null,
        listing_type: l.listing_type ?? null,
        bedrooms: l.bedrooms,
        property_type: l.property_type,
        broker_fee: l.broker_fee ?? null,
        parking: l.parking,
        neighborhood: l.neighborhood,
        owner: l.owner ? { role: l.owner.role, agency: l.owner.agency ?? null } : null,
      }));
  }, [filteredListingsForMap]);

  const visiblePinIds = useMemo(() => {
    return new Set(pinsFromListings.map((p) => p.id));
  }, [pinsFromListings]);

  useEffect(() => {
    if (user) {
      loadUserFavorites();
    } else {
      setUserFavorites([]);
    }
  }, [user]);

  useEffect(() => {
    loadAgencies();
  }, []);

  const loadAgencies = async () => {
    try {
      const names = await listingsService.getActiveSalesAgencies();
      setAgencies(names);
    } catch (error) {
      console.error("Error loading agencies:", error);
    }
  };

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
  }, [filters, currentPage, user, isReady, searchBounds]);

  const loadListings = async () => {
    try {
      setLoading(true);

      const { no_fee_only, ...restFilters } = filters;
      const serviceFilters = {
        ...restFilters,
        noFeeOnly: no_fee_only,
        bounds: searchBounds || undefined,
      };

      const { totalCount: actualTotalCount } = await listingsService.getSaleListings(
        serviceFilters,
        undefined,
        user?.id,
        0,
        false,
      );
      setTotalCount(actualTotalCount);

      let allFeaturedListings: Listing[] = [];
      try {
        const { data: featuredData } = await listingsService.getSaleListings(
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
      const startIndex = ((currentPage - 1) * featuredSlotsPerPage) % (allFeaturedListings.length || 1);
      let featuredForThisPage: Listing[] = [];

      if (allFeaturedListings.length > 0) {
        for (let i = 0; i < featuredSlotsPerPage && allFeaturedListings.length > 0; i++) {
          const index = (startIndex + i) % allFeaturedListings.length;
          featuredForThisPage.push(allFeaturedListings[index]);
        }
      }

      const standardOffset = (currentPage - 1) * NUM_STANDARD_SLOTS_PER_PAGE;

      const { data: rawStandardListings } = await listingsService.getSaleListings(
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

      const { data: allData } = await listingsService.getSaleListings(
        serviceFilters,
        undefined,
        user?.id,
        0,
        false,
      );

      setAllListingsForMap(allData || []);

      if (!shouldPreserveMapPosition && !searchBounds) {
        const geoCenter = calculateGeographicCenter(allData || []);
        if (geoCenter) {
          setCenterOnListings(geoCenter);
          // Clear after use to prevent stale values
          setTimeout(() => {
            setCenterOnListings(null);
          }, 1500);
        }
      }

    } catch (error) {
      console.error("Error loading listings:", error);
    } finally {
      setLoading(false);
      setIsSearchingArea(false);
    }
  };

  const loadNeighborhoods = async () => {
    try {
      const neighborhoods = await listingsService.getActiveSalesNeighborhoods();
      setAllNeighborhoods(neighborhoods);
    } catch (error) {
      console.error("Error loading neighborhoods:", error);
    }
  };

  const handleFiltersChange = (newFilters: FilterState) => {
    const isClearing = Object.keys(newFilters).length < Object.keys(filters).length ||
      Object.keys(newFilters).every(k => {
        const val = newFilters[k as keyof FilterState];
        return val === undefined || (Array.isArray(val) && val.length === 0);
      });

    setIsFilterClearing(isClearing);
    preserveMapRef.current = true;
    setShouldPreserveMapPosition(true);
    setCenterOnListings(null);

    if (!isClearing) {
      setShouldFitBounds(true);
      setFitBoundsToAllPins(false);
    }

    // If clearing all filters, also clear the search bar
    const isClearingAll = Object.keys(newFilters).length === 0;
    if (isClearingAll && searchBarRef.current) {
      searchBarRef.current.clearSearch();
    }

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

    setTimeout(() => {
      preserveMapRef.current = false;
      setShouldPreserveMapPosition(false);
    }, 2000);
  };

  const handleFitBoundsComplete = useCallback(() => {
    setShouldFitBounds(false);
    setFitBoundsToAllPins(false);
  }, []);

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
      setSearchBounds(mapBounds);
      setSearchLocation({ name: 'Custom area', type: 'custom' } as LocationResult);
    }
  };

  const handleClearAreaSearch = () => {
    setSearchBounds(null);
    setSearchLocation(null);
    setShowSearchAreaButton(false);
  };

  const handleResetMap = () => {
    setMapBounds(null);
    setSearchBounds(null);
    setSearchLocation(null);
    setShowSearchAreaButton(false);
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

    setTimeout(() => {
      const element = document.getElementById(`listing-card-${listingId}`);
      if (element && listingsContainerRef.current) {
        const container = listingsContainerRef.current;

        if (!isElementFullyVisible(element, container)) {
          scrollElementIntoView(element, container, 'smooth');
        }
      }
    }, 100);
  }, []);

  const handleMapClick = useCallback(() => {
    setSelectedListingId(null);
  }, []);

  useEffect(() => {
    if (!displayListings || displayListings.length === 0) return;

    const batchKey = `impression_batch_sales_p${currentPage}_c${displayListings.length}`;
    const hasTracked = sessionStorage.getItem(batchKey);

    if (!hasTracked) {
      const pageNumber = currentPage ?? 1;
      gaEvent("listing_impression_batch", {
        page: pageNumber,
        result_count: displayListings.length,
        listing_type: 'sale',
        items: displayListings.map((l: any, idx: number) => ({
          listing_id: String(l.id),
          price: Number(l.asking_price ?? l.price ?? 0),
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
      price: Number(l.asking_price ?? l.price ?? 0),
      bedrooms: Number(l.bedrooms ?? 0),
      neighborhood: l.neighborhood ?? undefined,
      is_featured: !!(l.is_featured ?? l.featured),
      position: idx + 1,
    });
  };

  const handleFavoriteChange = () => {
    loadUserFavorites();
  };

  const handleSmartSearch = useCallback((parsed: ParsedSearchQuery, location: LocationResult | null) => {
    const newFilters: FilterState = { ...filters };

    if (parsed.bedrooms !== undefined) {
      newFilters.bedrooms = [parsed.bedrooms];
    }

    if (parsed.minPrice !== undefined) {
      newFilters.min_price = parsed.minPrice;
    }

    if (parsed.maxPrice !== undefined) {
      newFilters.max_price = parsed.maxPrice;
    }

    if (parsed.propertyType) {
      newFilters.property_type = parsed.propertyType;
    }

    if (location) {
      setSearchLocation(location);
      if (location.bounds) {
        setSearchBounds(location.bounds);
      }
    }

    gaEvent("smart_search", {
      query: parsed.locationQuery,
      bedrooms: parsed.bedrooms,
      min_price: parsed.minPrice,
      max_price: parsed.maxPrice,
      property_type: parsed.propertyType,
      location_name: location?.name,
      location_type: location?.type,
      listing_type: 'sale',
    });

    updateFilters(newFilters);
  }, [filters, updateFilters]);

  const handleSearchClear = useCallback(() => {
    setShouldPreserveMapPosition(true);
    setSearchLocation(null);
    setSearchBounds(null);
    setMapBounds(null);
    setShowSearchAreaButton(false);
    updateFilters({});

    setTimeout(() => {
      setShouldPreserveMapPosition(false);
    }, 500);
  }, [updateFilters]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(event.target as Node)) {
        setShowSortDropdown(false);
      }
    };

    if (showSortDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSortDropdown]);

  const handleSortChange = (sortValue: SortOption) => {
    updateFilters({ ...filters, sort: sortValue });
    setShowSortDropdown(false);
  };

  const getSortLabel = () => {
    const labels: Record<string, string> = {
      newest: 'Newest',
      oldest: 'Oldest',
      price_asc: 'Price: Low-High',
      price_desc: 'Price: High-Low',
      bedrooms_asc: 'Beds: Low-High',
      bedrooms_desc: 'Beds: High-Low',
      bathrooms_asc: 'Baths: Low-High',
      bathrooms_desc: 'Baths: High-Low',
    };
    return labels[filters.sort || 'newest'] || 'Sort';
  };

  const renderViewModeToggle = (showSplit = true) => (
    <div className="inline-flex items-center bg-white border border-gray-300 rounded-lg overflow-hidden">
      {showSplit && (
        <button
          onClick={() => setViewMode('split')}
          className={`flex items-center px-3 py-2 text-sm font-medium transition-all border-r border-gray-300 ${
            viewMode === 'split'
              ? 'bg-green-50 text-green-700'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <LayoutGrid className="w-4 h-4 mr-1.5" />
          Split
        </button>
      )}
      <button
        onClick={() => setViewMode('list')}
        className={`flex items-center px-3 py-2 text-sm font-medium transition-all ${showSplit ? 'border-r border-gray-300' : ''} ${
          viewMode === 'list'
            ? 'bg-green-50 text-green-700'
            : 'text-gray-600 hover:bg-gray-50'
        }`}
      >
        <List className="w-4 h-4 mr-1.5" />
        List
      </button>
      <button
        onClick={() => setViewMode('map')}
        className={`flex items-center px-3 py-2 text-sm font-medium transition-all ${
          viewMode === 'map'
            ? 'bg-green-50 text-green-700'
            : 'text-gray-600 hover:bg-gray-50'
        }`}
      >
        <MapIcon className="w-4 h-4 mr-1.5" />
        Map
      </button>
    </div>
  );

  const renderListingCards = () => (
    <div className="grid grid-cols-2 gap-3">
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
    <div className="grid grid-cols-2 gap-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="bg-white rounded-lg shadow-sm animate-pulse border border-gray-100">
          <div className="h-32 bg-gray-200 rounded-t-lg"></div>
          <div className="p-3">
            <div className="h-4 bg-gray-200 rounded w-20 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-28 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-24"></div>
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
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {searchLocation
          ? `No properties found in ${searchLocation.name}`
          : "No properties found"}
      </h3>
      <p className="text-gray-500">
        {searchLocation
          ? "Try expanding your search to nearby areas or adjusting your filters."
          : "Try adjusting your filters to see more results."}
      </p>
      {searchLocation && (
        <button
          onClick={handleSearchClear}
          className="mt-4 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium"
        >
          Clear search
        </button>
      )}
    </div>
  );

  return (
    <div className="h-[calc(100vh-56px)] md:h-[calc(100vh-64px)] flex flex-col bg-gray-50">
      {/* Header with Filters */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="max-w-[1800px] mx-auto">
          {/* Top row: Search, Filters, and View Toggle */}
          <div className="hidden md:flex items-center gap-4 mb-3">
            <div className="w-[400px] flex-shrink-0">
              <SmartSearchBar
                ref={searchBarRef}
                onSearch={handleSmartSearch}
                onClear={handleSearchClear}
                placeholder="Try: Park Slope 3 bed under 1M"
              />
            </div>
            <div className="flex-1">
              <ListingFiltersHorizontal
                filters={filters}
                onFiltersChange={handleFiltersChange}
                onSearchClear={() => searchBarRef.current?.clearSearch()}
                agencies={agencies}
                allNeighborhoods={allNeighborhoods}
                listingType="sale"
              />
            </div>
            <div className="flex-shrink-0">
              {renderViewModeToggle(true)}
            </div>
          </div>


          {/* Mobile Layout */}
          <div className="md:hidden space-y-3">
            {/* Search bar */}
            <SmartSearchBar
              ref={searchBarRef}
              onSearch={handleSmartSearch}
              onClear={handleSearchClear}
              placeholder="Search location, beds, price..."
            />

            {/* Title and count */}
            <div>
              <h1 className="text-lg font-bold text-brand-900 flex items-center gap-2 flex-wrap">
                Browse Properties for Sale
                {searchLocation?.type === 'custom' && (
                  <button
                    onClick={handleClearAreaSearch}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded-full text-xs font-medium text-gray-600 transition-colors"
                    title="Clear area search"
                  >
                    <X className="w-3 h-3" />
                    Clear area
                  </button>
                )}
              </h1>
              <p className="text-sm text-gray-500">
                {loading ? "Loading..." : `${totalCount.toLocaleString()} available`}
                {searchLocation && ` in ${searchLocation.name}`}
              </p>
            </div>

            {/* View toggle and filter button */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                {renderViewModeToggle(false)}
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
                  (filters.neighborhoods && filters.neighborhoods.length > 0)) && (
                  <span className="bg-brand-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </button>
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
                onSearchClear={() => searchBarRef.current?.clearSearch()}
                agencies={agencies}
                allNeighborhoods={allNeighborhoods}
                isMobile={true}
                listingType="sale"
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
            {/* Listings Panel - Wider for 2 columns */}
            <div
              ref={listingsContainerRef}
              className="w-full lg:w-[680px] xl:w-[780px] h-full overflow-y-auto border-r border-gray-200 bg-white"
            >
              <div className="p-4">
                {/* Title and Sort - Scrolls with content */}
                <div className="hidden md:flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
                  <div>
                    <h1 className="text-lg font-bold text-brand-900 flex items-center gap-2">
                      {searchLocation ? `Homes for Sale in ${searchLocation.name}` : 'Homes for Sale'}
                      {searchLocation?.type === 'custom' && (
                        <button
                          onClick={handleClearAreaSearch}
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded-full text-xs font-medium text-gray-600 transition-colors"
                          title="Clear area search"
                        >
                          <X className="w-3 h-3" />
                          Clear
                        </button>
                      )}
                    </h1>
                    <p className="text-sm text-gray-500">
                      {loading ? "Loading..." : `${totalCount.toLocaleString()} properties available`}
                    </p>
                  </div>

                  {/* Sort Control */}
                  <div className="relative" ref={sortDropdownRef}>
                    <button
                      onClick={() => setShowSortDropdown(!showSortDropdown)}
                      className="flex items-center gap-2 text-gray-700 hover:text-gray-900 transition-colors"
                    >
                      <ArrowUpDown className="w-4 h-4" />
                      <span className="text-sm font-medium">Sort</span>
                    </button>

                    {showSortDropdown && (
                      <div className="absolute right-0 top-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 z-50 min-w-[200px] py-1">
                        {[
                          { value: 'newest', label: 'Newest First' },
                          { value: 'oldest', label: 'Oldest First' },
                          { value: 'price_asc', label: 'Price: Low to High' },
                          { value: 'price_desc', label: 'Price: High to Low' },
                          { value: 'bedrooms_asc', label: 'Bedrooms: Low to High' },
                          { value: 'bedrooms_desc', label: 'Bedrooms: High to Low' },
                        ].map((option) => (
                          <button
                            key={option.value}
                            onClick={() => handleSortChange(option.value as SortOption)}
                            className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors ${
                              (filters.sort || 'newest') === option.value ? 'text-brand-700 font-medium bg-brand-50' : 'text-gray-700'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

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
                pins={pinsFromListings}
                visiblePinIds={visiblePinIds}
                hoveredListingId={hoveredListingId}
                selectedListingId={selectedListingId}
                onMarkerHover={handleListingHover}
                onMarkerClick={handleMarkerClick}
                onMapClick={handleMapClick}
                onBoundsChange={handleMapBoundsChange}
                userLocation={userLocation}
                searchBounds={searchBounds}
                searchLocationName={searchLocation?.name}
                centerOnListings={centerOnListings}
                shouldPreservePosition={shouldPreserveMapPosition}
                shouldFitBounds={shouldFitBounds}
                fitBoundsToAllPins={fitBoundsToAllPins}
                onFitBoundsComplete={handleFitBoundsComplete}
              />

              {/* Listing count badge */}
              <div className="absolute bottom-4 left-4 bg-white px-3 py-1.5 rounded-full shadow-md text-sm text-gray-600 border border-gray-200">
                {visiblePinIds.size} propert{visiblePinIds.size !== 1 ? "ies" : "y"} on map
                {searchLocation && ` in ${searchLocation.name}`}
              </div>
            </div>
          </div>
        ) : viewMode === 'list' ? (
          /* List Only View */
          <div className="h-full overflow-y-auto">
            {/* Mobile Carousel View */}
            <div className="md:hidden py-4">
              {loading ? (
                <div className="px-6">
                  <div className="bg-white rounded-lg shadow-sm animate-pulse">
                    <div className="h-48 bg-gray-200 rounded-t-lg"></div>
                    <div className="p-4">
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  </div>
                </div>
              ) : displayListings.length === 0 ? (
                <div className="px-6">{renderEmptyState()}</div>
              ) : (
                <MobileListingCarousel
                  listings={displayListings}
                  favoriteIds={new Set(userFavorites)}
                  onFavoriteChange={handleFavoriteChange}
                  onCardClick={(listing) => {
                    const idx = displayListings.findIndex(l => l.id === listing.id);
                    handleCardClick(listing, idx);
                    markNavigatingToDetail();
                  }}
                />
              )}
            </div>

            {/* Desktop Grid View */}
            <div className="hidden md:block max-w-7xl mx-auto px-4 py-6">
              {loading ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
                pins={pinsFromListings}
                visiblePinIds={visiblePinIds}
                hoveredListingId={hoveredListingId}
                selectedListingId={selectedListingId}
                onMarkerHover={handleListingHover}
                onMarkerClick={handleMarkerClick}
                onMapClick={handleMapClick}
                onBoundsChange={handleMapBoundsChange}
                userLocation={userLocation}
                searchBounds={searchBounds}
                searchLocationName={searchLocation?.name}
                centerOnListings={centerOnListings}
                shouldPreservePosition={shouldPreserveMapPosition}
                shouldFitBounds={shouldFitBounds}
                fitBoundsToAllPins={fitBoundsToAllPins}
                onFitBoundsComplete={handleFitBoundsComplete}
              />
            )}

            <div className="absolute bottom-4 left-4 bg-white px-3 py-1.5 rounded-full shadow-md text-sm text-gray-600 border border-gray-200">
              {visiblePinIds.size} propert{visiblePinIds.size !== 1 ? "ies" : "y"} on map
              {searchLocation && ` in ${searchLocation.name}`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
