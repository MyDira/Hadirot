import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Star, Filter, X } from 'lucide-react';
import { ListingCard } from '../components/listings/ListingCard';
import { ListingFilters } from '../components/listings/ListingFilters';
import { Listing } from '../config/supabase';
import { listingsService } from '../services/listings';
import { useAuth } from '../hooks/useAuth';

interface FilterState {
  bedrooms?: number;
  poster_type?: string;
  agency_name?: string;
  property_type?: string;
  min_price?: number;
  max_price?: number;
  parking_included?: boolean;
  neighborhoods?: string[];
}

export function BrowseListings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [displayListings, setDisplayListings] = useState<(Listing & { showFeaturedBadge: boolean })[]>([]);
  const [userFavorites, setUserFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState<FilterState>({});
  const [agencies, setAgencies] = useState<string[]>([]);
  const [allNeighborhoods, setAllNeighborhoods] = useState<string[]>([]);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);
  const { user } = useAuth();

  const ITEMS_PER_PAGE = 20; // Total listings to display per page
  const NUM_FEATURED_INJECTED_SLOTS = 4;
  const NUM_STANDARD_SLOTS_PER_PAGE = ITEMS_PER_PAGE - NUM_FEATURED_INJECTED_SLOTS; // 16
  const totalPages = Math.ceil(totalCount / NUM_STANDARD_SLOTS_PER_PAGE);

  // Load user favorites on mount and when user changes
  useEffect(() => {
    if (user) {
      loadUserFavorites();
    } else {
      setUserFavorites([]);
    }
  }, [user]);

  const loadUserFavorites = async () => {
    if (!user) return;
    
    try {
      const favorites = await listingsService.getUserFavoriteIds(user.id);
      setUserFavorites(favorites);
    } catch (error) {
      console.error('Error loading user favorites:', error);
    }
  };
  // Initialize filters from URL on component mount
  useEffect(() => {
    const urlFilters: FilterState = {};
    
    const bedrooms = searchParams.get('bedrooms');
    if (bedrooms) urlFilters.bedrooms = parseInt(bedrooms);
    
    const poster_type = searchParams.get('poster_type');
    if (poster_type) urlFilters.poster_type = poster_type;
    
    const agency_name = searchParams.get('agency_name');
    if (agency_name && poster_type === 'agency') urlFilters.agency_name = agency_name;
    
    const property_type = searchParams.get('property_type');
    if (property_type) urlFilters.property_type = property_type;
    
    const min_price = searchParams.get('min_price');
    if (min_price) urlFilters.min_price = parseInt(min_price);
    
    const max_price = searchParams.get('max_price');
    if (max_price) urlFilters.max_price = parseInt(max_price);
    
    const parking_included = searchParams.get('parking_included');
    if (parking_included === 'true') urlFilters.parking_included = true;
    
    const neighborhoods = searchParams.get('neighborhoods');
    if (neighborhoods) {
      urlFilters.neighborhoods = neighborhoods.split(',').filter(Boolean);
    }
    
    const page = searchParams.get('page');
    if (page) setCurrentPage(parseInt(page));
    
    setFilters(urlFilters);
  }, [searchParams]);

  // Load listings when filters or page changes
  useEffect(() => {
    loadListings();
    loadNeighborhoods();
  }, [filters, currentPage, user]);

  const loadListings = async () => {
    try {
      setLoading(true);
      
      // const offset = (currentPage - 1) * ITEMS_PER_PAGE; // This offset is no longer directly used for standard listings fetch
      
      // 1. Get accurate total count for pagination (all listings matching filters)
      const { totalCount: actualTotalCount } = await listingsService.getListings(filters, undefined, user?.id, 0, false);
      setTotalCount(actualTotalCount);
      console.log('📊 Total count from DB:', actualTotalCount);
      
      // 2. Fetch ALL featured listings matching current filters for rotation
      let allFeaturedListings: Listing[] = [];
      try {
        const { data: featuredData } = await listingsService.getListings(
          { ...filters, is_featured_only: true }, 
          undefined, 
          user?.id, 
          0, 
          false
        );
        allFeaturedListings = featuredData || [];
      } catch (error) {
        console.error('Error loading featured listings:', error);
      }
      console.log('⭐ All featured listings available:', allFeaturedListings.length);

      // 3. Calculate featured listings for this specific page (rotation logic)
      const featuredSlotsPerPage = NUM_FEATURED_INJECTED_SLOTS;
      const startIndex = ((currentPage - 1) * featuredSlotsPerPage) % allFeaturedListings.length;
      let featuredForThisPage: Listing[] = [];
      
      if (allFeaturedListings.length > 0) {
        for (let i = 0; i < featuredSlotsPerPage && allFeaturedListings.length > 0; i++) {
          const index = (startIndex + i) % allFeaturedListings.length;
          featuredForThisPage.push(allFeaturedListings[index]);
        }
      }
      
      console.log('🎯 Featured injected for page', currentPage + ':', featuredForThisPage.map(l => ({ id: l.id, title: l.title })));
      
      // 4. Check if we need frontend filtering
      // The offset for standard listings must account for the number of standard slots per page
      const standardOffset = (currentPage - 1) * NUM_STANDARD_SLOTS_PER_PAGE;
      
      // Fetch standard listings for the current page
      const { data: rawStandardListings } = await listingsService.getListings(
        filters, 
        NUM_STANDARD_SLOTS_PER_PAGE, // Limit to the number of standard slots we need
        user?.id, 
        standardOffset, // Offset based on the number of standard slots per page
        true // Apply pagination
      );
      
      // Apply frontend filtering if necessary (this part remains the same as before)
      let standardListings = rawStandardListings;
      if (filters.poster_type === 'landlord') {
        standardListings = standardListings.filter(l => l.owner && (l.owner.role === 'landlord' || l.owner.role === 'tenant'));
      }
      if (filters.poster_type === 'agency') {
        standardListings = standardListings.filter(l => l.owner && l.owner.role === 'agent');
      }
      if (filters.agency_name) {
        standardListings = standardListings.filter(l => l.owner && l.owner.agency === filters.agency_name);
      }

      console.log('📦 Standard listings fetched:', standardListings.length);

      // 5. Create map of injected featured listings for quick lookup
      const injectedFeaturedMap = new Map(featuredForThisPage.map(listing => [listing.id, listing]));
      console.log('🗺️ Injected featured map:', Array.from(injectedFeaturedMap.keys()));

      // 6. Build final display list (ITEMS_PER_PAGE slots total, which is 20)
      const featuredSlotPositions = [1, 3, 5, 7]; // 0-indexed positions for slots 2, 4, 6, 8
      const finalListings: (Listing & { showFeaturedBadge: boolean; key: string })[] = [];
      let featuredIndex = 0;
      let standardListingsCursor = 0;

      for (let i = 0; i < ITEMS_PER_PAGE; i++) { // Fill up to ITEMS_PER_PAGE slots
        const isFeaturedSlot = featuredSlotPositions.includes(i);
        
        if (isFeaturedSlot && featuredIndex < featuredForThisPage.length && !finalListings.some(l => l.id === featuredForThisPage[featuredIndex].id && l.showFeaturedBadge)) {
          // Use featured listing for this slot
          const featuredListing = featuredForThisPage[featuredIndex];
          finalListings.push({ 
            ...featuredListing, 
            showFeaturedBadge: true,
            key: featuredListing.id
          });
          featuredIndex++;
        } else if (standardListingsCursor < standardListings.length) {
          // Use standard listing - no badge (even if naturally featured, to avoid confusion with injected slots)
          const standardListing = standardListings[standardListingsCursor];
          
          // Determine unique key for this listing
          const isAlsoInjected = injectedFeaturedMap.has(standardListing.id);
          const key = isAlsoInjected ? `${standardListing.id}-natural` : standardListing.id;
          
          finalListings.push({
            ...standardListing, 
            showFeaturedBadge: false,
            key: key
          });
          standardListingsCursor++;
        } else {
          // No more listings available - break early
          break;
        }
      }
      
      console.log('🎯 Final display listings for page', currentPage + ':', finalListings.map((l, i) => ({
        slot: i + 1, 
        key: l.key,
        id: l.id, 
        title: l.title, 
        is_featured: l.is_featured, 
        showFeaturedBadge: l.showFeaturedBadge,
        isDuplicate: injectedFeaturedMap.has(l.id) && !l.showFeaturedBadge
      })));
      console.log('📊 Final counts - Total DB:', actualTotalCount, 'Displayed:', finalListings.length, 'Page:', currentPage, 'of', totalPages);

      setDisplayListings(finalListings);
      
      // 7. Extract unique agencies for filter dropdown
      const { data: allData } = await listingsService.getListings({}, undefined, user?.id, 0, false);
      const uniqueAgencies = Array.from(
        new Set(
          allData
            .filter(listing => listing.owner?.role === 'agent' && listing.owner?.agency)
            .map(listing => listing.owner!.agency!)
        )
      ).sort();
      setAgencies(uniqueAgencies);
      
    } catch (error) {
      console.error('Error loading listings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadNeighborhoods = async () => {
    try {
      const neighborhoods = await listingsService.getUniqueNeighborhoods();
      setAllNeighborhoods(neighborhoods);
    } catch (error) {
      console.error('Error loading neighborhoods:', error);
    }
  };

  const handleFiltersChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentPage(1);
    
    // Update URL with new filters
    const params = new URLSearchParams();
    
    if (newFilters.bedrooms) params.set('bedrooms', newFilters.bedrooms.toString());
    if (newFilters.poster_type) params.set('poster_type', newFilters.poster_type);
    if (newFilters.agency_name) params.set('agency_name', newFilters.agency_name);
    if (newFilters.property_type) params.set('property_type', newFilters.property_type);
    if (newFilters.min_price) params.set('min_price', newFilters.min_price.toString());
    if (newFilters.max_price) params.set('max_price', newFilters.max_price.toString());
    if (newFilters.parking_included) params.set('parking_included', 'true');
    
    if (newFilters.neighborhoods && newFilters.neighborhoods.length > 0) {
      params.set('neighborhoods', newFilters.neighborhoods.join(','));
    }
    
    params.set('page', '1');
    setSearchParams(params);
  };

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    
    // Update URL with new page
    const params = new URLSearchParams(searchParams);
    params.set('page', page.toString());
    setSearchParams(params);
    setCurrentPage(page);
    
    // Scroll to top when page changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const handleFavoriteChange = () => {
    // Reload user favorites when any favorite is toggled
    loadUserFavorites();
  };
  
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8"> 
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#273140] mb-2">Browse Listings</h1>
        <p className="text-gray-600">
          {loading ? 'Loading...' : `Showing ${((currentPage - 1) * NUM_STANDARD_SLOTS_PER_PAGE) + 1}-${Math.min(((currentPage - 1) * NUM_STANDARD_SLOTS_PER_PAGE) + displayListings.filter(l => !l.showFeaturedBadge).length, totalCount)} of ${totalCount} properties`}
        </p>
      </div>

      {/* Mobile Filter Button */}
      <div className="md:hidden mb-6">
        <button
          onClick={() => setShowFiltersMobile(true)}
          className="w-full bg-white border border-gray-200 rounded-lg p-4 flex items-center justify-center text-[#273140] hover:bg-gray-50 transition-colors"
        >
          <Filter className="w-5 h-5 mr-2" />
          <span className="font-medium">Filter Listings</span>
          {(filters.bedrooms !== undefined || 
            filters.poster_type || 
            filters.property_type || 
            filters.min_price || 
            filters.max_price || 
            filters.parking_included || 
            (filters.neighborhoods && filters.neighborhoods.length > 0)) && (
            <span className="ml-2 bg-[#667B9A] text-white text-xs px-2 py-1 rounded-full">
              Active
            </span>
          )}
        </button>
      </div>

      {/* Desktop Filters */}
      <div className="hidden md:block">
        <ListingFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
          agencies={agencies}
          allNeighborhoods={allNeighborhoods}
        />
      </div>

      {/* Mobile Filters Modal */}
      {showFiltersMobile && (
        <>
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setShowFiltersMobile(false)}
          />
          
          {/* Filters Panel */}
          <div className="fixed top-0 left-0 right-0 bottom-0 bg-white z-50 md:hidden overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white sticky top-0">
              <h2 className="text-lg font-semibold text-[#273140]">Filter Listings</h2>
              <button
                onClick={() => setShowFiltersMobile(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4">
              <ListingFilters
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
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-[#F0E6D5] transition-colors"
            >
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
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {displayListings.map((listing) => (
            <div key={listing.key}>
              <ListingCard
              listing={listing}
              isFavorited={userFavorites.includes(listing.id)}
              onFavoriteChange={handleFavoriteChange}
              showFeaturedBadge={listing.showFeaturedBadge}
              />
            </div>
          ))}
        </div>
      )}
      
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2 mt-12">
          {/* Previous Button */}
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-[#F0E6D5] hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </button>
          
          {/* Page Numbers */}
          <div className="flex space-x-1">
            {/* Always show page 1 if not current page */}
            {currentPage > 1 && (
              <button
                key="page-1"
                onClick={() => handlePageChange(1)}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                1
              </button>
            )}
            
            {/* Add ellipsis if there's a gap */}
            {currentPage > 3 && (
              <span key="ellipsis-start" className="px-3 py-2 text-sm text-gray-500">...</span>
            )}
            
            {/* Show current page and immediate neighbors */}
            {(() => {
              const startPage = Math.max(1, currentPage - 1);
              const endPage = Math.min(totalPages, currentPage + 1);
              const pages = [];
              
              for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
                // Skip page 1 if already added above
                if (pageNum === 1 && currentPage > 1) continue;
                // Skip last page if it will be added below
                if (pageNum === totalPages && currentPage < totalPages) continue;
                
                pages.push(
                  <button
                    key={`page-${pageNum}`}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      pageNum === currentPage
                        ? 'bg-[#273140] text-white'
                        : 'text-gray-700 bg-white border border-gray-300 hover:bg-[#F0E6D5]'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              }
              
              return pages;
            })()}
            
            {/* Add ellipsis if there's a gap */}
            {currentPage < totalPages - 2 && (
              <span key="ellipsis-end" className="px-3 py-2 text-sm text-gray-500">...</span>
            )}
            
            {/* Always show last page if not current page */}
            {currentPage < totalPages && (
              <button
                key={`page-${totalPages}`}
                onClick={() => handlePageChange(totalPages)}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                {totalPages}
              </button>
            )}
          </div>
          
          {/* Next Button */}
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="flex items-center px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-[#F0E6D5] hover:text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </button>
        </div>
      )}
    </div>
  );
}