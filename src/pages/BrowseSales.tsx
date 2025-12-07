import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DollarSign, Home, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { listingsService } from '../services/listings';
import { Listing } from '../config/supabase';
import { ListingCard } from '../components/listings/ListingCard';
import { ListingFilters } from '../components/listings/ListingFilters';
import { useBrowseFilters } from '../hooks/useBrowseFilters';
import { gaEvent } from '@/lib/ga';
import { useAuth } from '@/hooks/useAuth';
import { useListingImpressions } from '../hooks/useListingImpressions';

export function BrowseSales() {
  const { user } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const { filters, setFilter, resetFilters, filtersActive } = useBrowseFilters('sales');

  const ITEMS_PER_PAGE = 20;
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const { observeElement, unobserveElement } = useListingImpressions({
    listingIds: listings.map(l => l.id),
  });

  useEffect(() => {
    gaEvent('page_view', {
      page_title: 'Browse Sales',
      page_location: window.location.href,
      page_path: '/browse-sales',
    });
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  useEffect(() => {
    loadListings();
  }, [filters, currentPage, user]);

  const loadListings = async () => {
    try {
      setLoading(true);
      const offset = (currentPage - 1) * ITEMS_PER_PAGE;
      const { no_fee_only, ...restFilters } = filters;
      const serviceFilters = { ...restFilters, noFeeOnly: no_fee_only };

      const result = await listingsService.getSaleListings(
        serviceFilters,
        ITEMS_PER_PAGE,
        user?.id,
        offset,
        true,
        false
      );

      setListings(result.data || []);
      setTotalCount(result.totalCount || 0);
    } catch (error) {
      console.error('Error loading sale listings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex items-center mb-4">
          <DollarSign className="w-10 h-10 text-[#4E4B43] mr-3" />
          <div>
            <h1 className="text-3xl font-bold text-[#4E4B43]">Properties for Sale</h1>
            <p className="text-gray-600">Browse available properties for purchase</p>
          </div>
        </div>
      </div>

      {/* Desktop Filters */}
      <div className="hidden lg:block mb-6">
        <ListingFilters
          filters={filters}
          onFilterChange={setFilter}
          onReset={resetFilters}
          listingType="sale"
        />
      </div>

      {/* Mobile Filter Button */}
      <div className="lg:hidden mb-6">
        <button
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className="w-full flex items-center justify-center px-4 py-3 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
        >
          <Filter className="w-5 h-5 mr-2" />
          <span className="font-medium">
            {filtersActive ? 'Filters Active' : 'Show Filters'}
          </span>
          {filtersActive && (
            <span className="ml-2 px-2 py-0.5 bg-[#4E4B43] text-white text-xs rounded-full">
              Active
            </span>
          )}
        </button>
      </div>

      {/* Mobile Filters Modal */}
      {showMobileFilters && (
        <div className="lg:hidden fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[#4E4B43]">Filters</h2>
              <button
                onClick={() => setShowMobileFilters(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ListingFilters
              filters={filters}
              onFilterChange={setFilter}
              onReset={resetFilters}
              isMobile
              listingType="sale"
            />
            <div className="mt-6">
              <button
                onClick={() => setShowMobileFilters(false)}
                className="w-full bg-[#4E4B43] text-white py-3 px-4 rounded-lg font-semibold hover:bg-[#3d3a35] transition-colors"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Listings Grid */}
      <main>
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4E4B43] mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading properties...</p>
            </div>
          ) : listings.length > 0 ? (
            <>
              <div className="mb-4 text-sm text-gray-600">
                {totalCount} {totalCount === 1 ? 'property' : 'properties'} found
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
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
                      isFavorited={false}
                    />
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`min-w-[40px] px-3 py-2 rounded-lg border transition-colors ${
                            currentPage === pageNum
                              ? 'bg-brand-700 text-white border-brand-700'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
              <Home className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No properties found</h3>
              <p className="text-gray-500 mb-4">
                {filtersActive
                  ? 'Try adjusting your filters to see more results'
                  : 'No properties for sale are currently available'}
              </p>
              {filtersActive && (
                <button
                  onClick={resetFilters}
                  className="text-[#4E4B43] hover:text-[#3d3a35] font-medium"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </main>
    </div>
  );
}
