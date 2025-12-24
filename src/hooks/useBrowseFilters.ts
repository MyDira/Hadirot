import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';

export type SortOption = 'newest' | 'oldest' | 'price_asc' | 'price_desc' | 'bedrooms_asc' | 'bedrooms_desc' | 'bathrooms_asc' | 'bathrooms_desc';

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface FilterState {
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

interface BrowseState {
  filters: FilterState;
  page: number;
  scrollY: number;
}

const BROWSE_STATE_KEY = 'browse_state';
const SCROLL_RESTORE_KEY = 'browse_scroll_restore';

export function useBrowseFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [filters, setFilters] = useState<FilterState>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [isReady, setIsReady] = useState(false); // Track when initialization is complete
  const hasInitialized = useRef(false);
  const scrollRestored = useRef(false);
  const isRestoringFromSession = useRef(false);

  // Check if we're returning from a listing detail page
  const isReturningFromDetail = useCallback(() => {
    try {
      return sessionStorage.getItem(SCROLL_RESTORE_KEY) === 'true';
    } catch {
      return false;
    }
  }, []);

  // Save current browse state to sessionStorage
  const saveBrowseState = useCallback((filterState: FilterState, page: number) => {
    try {
      const state: BrowseState = {
        filters: filterState,
        page,
        scrollY: window.scrollY,
      };
      sessionStorage.setItem(BROWSE_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save browse state:', error);
    }
  }, []);

  // Load browse state from sessionStorage
  const loadBrowseState = useCallback((): BrowseState | null => {
    try {
      const stateStr = sessionStorage.getItem(BROWSE_STATE_KEY);
      if (stateStr) {
        return JSON.parse(stateStr);
      }
    } catch (error) {
      console.warn('Failed to load browse state:', error);
    }
    return null;
  }, []);

  // Parse filters from URL parameters
  const parseFiltersFromURL = useCallback((params: URLSearchParams): { filters: FilterState; page: number } => {
    const urlFilters: FilterState = {};

    const bedrooms = params.get('bedrooms');
    if (bedrooms) {
      // Support both array (comma-separated) and single value for backward compatibility
      const bedroomValues = bedrooms.split(',').map(b => parseInt(b.trim())).filter(b => !isNaN(b));
      if (bedroomValues.length > 0) urlFilters.bedrooms = bedroomValues;
    }

    const poster_type = params.get('poster_type');
    if (poster_type) urlFilters.poster_type = poster_type;

    const agency_name = params.get('agency_name');
    if (agency_name && poster_type === 'agent') urlFilters.agency_name = agency_name;

    const property_type = params.get('property_type');
    if (property_type) urlFilters.property_type = property_type;

    const property_types = params.get('property_types');
    if (property_types) {
      urlFilters.property_types = property_types.split(',').filter(Boolean);
    }

    const building_types = params.get('building_types');
    if (building_types) {
      urlFilters.building_types = building_types.split(',').filter(Boolean);
    }

    const min_price = params.get('min_price');
    if (min_price) urlFilters.min_price = parseInt(min_price);

    const max_price = params.get('max_price');
    if (max_price) urlFilters.max_price = parseInt(max_price);

    const parking_included = params.get('parking_included');
    if (parking_included === 'true') urlFilters.parking_included = true;

    const no_fee_only = params.get('no_fee_only');
    if (no_fee_only === '1' || no_fee_only === 'true') urlFilters.no_fee_only = true;

    const neighborhoods = params.get('neighborhoods');
    if (neighborhoods) {
      urlFilters.neighborhoods = neighborhoods.split(',').filter(Boolean);
    }

    const sort = params.get('sort');
    if (sort) urlFilters.sort = sort as SortOption;

    const boundsN = params.get('bounds_n');
    const boundsS = params.get('bounds_s');
    const boundsE = params.get('bounds_e');
    const boundsW = params.get('bounds_w');
    if (boundsN && boundsS && boundsE && boundsW) {
      const north = parseFloat(boundsN);
      const south = parseFloat(boundsS);
      const east = parseFloat(boundsE);
      const west = parseFloat(boundsW);
      if (!isNaN(north) && !isNaN(south) && !isNaN(east) && !isNaN(west)) {
        urlFilters.searchBounds = { north, south, east, west };
      }
    }

    const areaName = params.get('area_name');
    if (areaName) urlFilters.searchLocationName = areaName;

    const page = params.get('page');
    const pageNum = page ? parseInt(page) : 1;

    return { filters: urlFilters, page: pageNum };
  }, []);

  // Initialize filters from URL or sessionStorage
  useEffect(() => {
    // On first mount, check if we should restore from sessionStorage
    if (!hasInitialized.current) {
      hasInitialized.current = true;

      const savedState = loadBrowseState();
      const shouldRestore = isReturningFromDetail();

      if (shouldRestore && savedState) {
        console.log('🔄 Restoring filters from sessionStorage:', savedState.filters);
        isRestoringFromSession.current = true;

        // Restore from sessionStorage
        setFilters(savedState.filters);
        setCurrentPage(savedState.page);

        // Update URL to match restored state
        const params = new URLSearchParams();
        if (savedState.filters.bedrooms && savedState.filters.bedrooms.length > 0) {
          params.set('bedrooms', savedState.filters.bedrooms.join(','));
        }
        if (savedState.filters.poster_type) params.set('poster_type', savedState.filters.poster_type);
        if (savedState.filters.agency_name) params.set('agency_name', savedState.filters.agency_name);
        if (savedState.filters.property_type) params.set('property_type', savedState.filters.property_type);
        if (savedState.filters.property_types && savedState.filters.property_types.length > 0) {
          params.set('property_types', savedState.filters.property_types.join(','));
        }
        if (savedState.filters.building_types && savedState.filters.building_types.length > 0) {
          params.set('building_types', savedState.filters.building_types.join(','));
        }
        if (savedState.filters.min_price) params.set('min_price', savedState.filters.min_price.toString());
        if (savedState.filters.max_price) params.set('max_price', savedState.filters.max_price.toString());
        if (savedState.filters.parking_included) params.set('parking_included', 'true');
        if (savedState.filters.no_fee_only) params.set('no_fee_only', '1');
        if (savedState.filters.neighborhoods && savedState.filters.neighborhoods.length > 0) {
          params.set('neighborhoods', savedState.filters.neighborhoods.join(','));
        }
        if (savedState.filters.sort) params.set('sort', savedState.filters.sort);
        if (savedState.filters.searchBounds) {
          params.set('bounds_n', savedState.filters.searchBounds.north.toString());
          params.set('bounds_s', savedState.filters.searchBounds.south.toString());
          params.set('bounds_e', savedState.filters.searchBounds.east.toString());
          params.set('bounds_w', savedState.filters.searchBounds.west.toString());
        }
        if (savedState.filters.searchLocationName) {
          params.set('area_name', savedState.filters.searchLocationName);
        }
        params.set('page', savedState.page.toString());
        setSearchParams(params, { replace: true });

        // Schedule scroll restoration
        requestAnimationFrame(() => {
          setTimeout(() => {
            window.scrollTo({ top: savedState.scrollY, behavior: 'instant' });
            scrollRestored.current = true;
          }, 100);
        });

        // Clear the restore flag
        try {
          sessionStorage.removeItem(SCROLL_RESTORE_KEY);
        } catch {}

        // Mark restoration as complete after URL is updated
        setTimeout(() => {
          isRestoringFromSession.current = false;
        }, 50);

        // Mark as ready after restoration
        setIsReady(true);
        return; // Skip parsing from URL on initial restoration
      }

      // If no restoration needed, parse from URL and mark as ready
      const { filters: urlFilters, page: urlPage } = parseFiltersFromURL(searchParams);
      console.log('📋 Initial URL parsing:', urlFilters);
      setFilters(urlFilters);
      setCurrentPage(urlPage);
      setIsReady(true);
      return;
    }

    // If we're in the middle of restoring from session, skip URL parsing
    if (isRestoringFromSession.current) {
      return;
    }

    // Parse from URL parameters (normal case or after restoration completes)
    const { filters: urlFilters, page: urlPage } = parseFiltersFromURL(searchParams);
    console.log('📋 Parsing filters from URL:', urlFilters);
    setFilters(urlFilters);
    setCurrentPage(urlPage);
  }, [searchParams, loadBrowseState, isReturningFromDetail, setSearchParams, parseFiltersFromURL]);

  // Save state whenever filters or page changes
  useEffect(() => {
    if (hasInitialized.current) {
      saveBrowseState(filters, currentPage);
    }
  }, [filters, currentPage, saveBrowseState]);

  // Mark that we're navigating away (so we can detect return)
  const markNavigatingToDetail = useCallback(() => {
    try {
      sessionStorage.setItem(SCROLL_RESTORE_KEY, 'true');
    } catch (error) {
      console.warn('Failed to mark navigation:', error);
    }
  }, []);

  const updateFilters = useCallback((newFilters: FilterState, resetPage: boolean = true) => {
    setFilters(newFilters);
    if (resetPage) {
      setCurrentPage(1);
    }

    // Update URL with new filters
    const params = new URLSearchParams();

    if (newFilters.bedrooms && newFilters.bedrooms.length > 0) {
      params.set('bedrooms', newFilters.bedrooms.join(','));
    }
    if (newFilters.poster_type) params.set('poster_type', newFilters.poster_type);
    if (newFilters.agency_name) params.set('agency_name', newFilters.agency_name);
    if (newFilters.property_type) params.set('property_type', newFilters.property_type);
    if (newFilters.property_types && newFilters.property_types.length > 0) {
      params.set('property_types', newFilters.property_types.join(','));
    }
    if (newFilters.building_types && newFilters.building_types.length > 0) {
      params.set('building_types', newFilters.building_types.join(','));
    }
    if (newFilters.min_price) params.set('min_price', newFilters.min_price.toString());
    if (newFilters.max_price) params.set('max_price', newFilters.max_price.toString());
    if (newFilters.parking_included) params.set('parking_included', 'true');
    if (newFilters.no_fee_only) params.set('no_fee_only', '1');

    if (newFilters.neighborhoods && newFilters.neighborhoods.length > 0) {
      params.set('neighborhoods', newFilters.neighborhoods.join(','));
    }

    if (newFilters.sort) params.set('sort', newFilters.sort);

    if (newFilters.searchBounds) {
      params.set('bounds_n', newFilters.searchBounds.north.toString());
      params.set('bounds_s', newFilters.searchBounds.south.toString());
      params.set('bounds_e', newFilters.searchBounds.east.toString());
      params.set('bounds_w', newFilters.searchBounds.west.toString());
    }
    if (newFilters.searchLocationName) {
      params.set('area_name', newFilters.searchLocationName);
    }

    params.set('page', resetPage ? '1' : currentPage.toString());
    setSearchParams(params);
  }, [setSearchParams, currentPage]);

  const updatePage = useCallback((page: number) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', page.toString());
    setSearchParams(params);
    setCurrentPage(page);
  }, [searchParams, setSearchParams]);

  return {
    filters,
    currentPage,
    updateFilters,
    updatePage,
    markNavigatingToDetail,
    isReady, // Export ready state so consumers know when to fetch
  };
}
