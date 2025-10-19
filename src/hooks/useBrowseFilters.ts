import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';

interface FilterState {
  bedrooms?: number;
  poster_type?: string;
  agency_name?: string;
  property_type?: string;
  min_price?: number;
  max_price?: number;
  parking_included?: boolean;
  no_fee_only?: boolean;
  neighborhoods?: string[];
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
  const hasInitialized = useRef(false);
  const scrollRestored = useRef(false);

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

  // Initialize filters from URL or sessionStorage
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const urlFilters: FilterState = {};

    // Try to load from sessionStorage first if returning from detail
    const savedState = loadBrowseState();
    const shouldRestore = isReturningFromDetail();

    if (shouldRestore && savedState) {
      // Restore from sessionStorage
      setFilters(savedState.filters);
      setCurrentPage(savedState.page);

      // Update URL to match restored state
      const params = new URLSearchParams();
      if (savedState.filters.bedrooms !== undefined) params.set('bedrooms', savedState.filters.bedrooms.toString());
      if (savedState.filters.poster_type) params.set('poster_type', savedState.filters.poster_type);
      if (savedState.filters.agency_name) params.set('agency_name', savedState.filters.agency_name);
      if (savedState.filters.property_type) params.set('property_type', savedState.filters.property_type);
      if (savedState.filters.min_price) params.set('min_price', savedState.filters.min_price.toString());
      if (savedState.filters.max_price) params.set('max_price', savedState.filters.max_price.toString());
      if (savedState.filters.parking_included) params.set('parking_included', 'true');
      if (savedState.filters.no_fee_only) params.set('no_fee_only', '1');
      if (savedState.filters.neighborhoods && savedState.filters.neighborhoods.length > 0) {
        params.set('neighborhoods', savedState.filters.neighborhoods.join(','));
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
    } else {
      // Parse from URL parameters (initial load or fresh navigation)
      const bedrooms = searchParams.get('bedrooms');
      if (bedrooms) urlFilters.bedrooms = parseInt(bedrooms);

      const poster_type = searchParams.get('poster_type');
      if (poster_type) urlFilters.poster_type = poster_type;

      const agency_name = searchParams.get('agency_name');
      if (agency_name && poster_type === 'agent') urlFilters.agency_name = agency_name;

      const property_type = searchParams.get('property_type');
      if (property_type) urlFilters.property_type = property_type;

      const min_price = searchParams.get('min_price');
      if (min_price) urlFilters.min_price = parseInt(min_price);

      const max_price = searchParams.get('max_price');
      if (max_price) urlFilters.max_price = parseInt(max_price);

      const parking_included = searchParams.get('parking_included');
      if (parking_included === 'true') urlFilters.parking_included = true;

      const no_fee_only = searchParams.get('no_fee_only');
      if (no_fee_only === '1' || no_fee_only === 'true') urlFilters.no_fee_only = true;

      const neighborhoods = searchParams.get('neighborhoods');
      if (neighborhoods) {
        urlFilters.neighborhoods = neighborhoods.split(',').filter(Boolean);
      }

      const page = searchParams.get('page');
      if (page) setCurrentPage(parseInt(page));

      setFilters(urlFilters);
    }
  }, [searchParams, loadBrowseState, isReturningFromDetail, setSearchParams]);

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

  const updateFilters = useCallback((newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentPage(1);

    // Update URL with new filters
    const params = new URLSearchParams();

    if (newFilters.bedrooms !== undefined) params.set('bedrooms', newFilters.bedrooms.toString());
    if (newFilters.poster_type) params.set('poster_type', newFilters.poster_type);
    if (newFilters.agency_name) params.set('agency_name', newFilters.agency_name);
    if (newFilters.property_type) params.set('property_type', newFilters.property_type);
    if (newFilters.min_price) params.set('min_price', newFilters.min_price.toString());
    if (newFilters.max_price) params.set('max_price', newFilters.max_price.toString());
    if (newFilters.parking_included) params.set('parking_included', 'true');
    if (newFilters.no_fee_only) params.set('no_fee_only', '1');

    if (newFilters.neighborhoods && newFilters.neighborhoods.length > 0) {
      params.set('neighborhoods', newFilters.neighborhoods.join(','));
    }

    params.set('page', '1');
    setSearchParams(params);
  }, [setSearchParams]);

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
  };
}
