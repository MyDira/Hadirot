import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DollarSign, Home, Filter } from 'lucide-react';
import { listingsService } from '../services/listings';
import { Listing } from '../config/supabase';
import { ListingCard } from '../components/listings/ListingCard';
import { ListingFilters } from '../components/listings/ListingFilters';
import { useBrowseFilters } from '../hooks/useBrowseFilters';
import { gaEvent } from '@/lib/ga';

export function BrowseSales() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const { filters, setFilter, resetFilters, filtersActive } = useBrowseFilters('sales');

  useEffect(() => {
    gaEvent('page_view', {
      page_title: 'Browse Sales',
      page_location: window.location.href,
      page_path: '/browse-sales',
    });
  }, []);

  useEffect(() => {
    loadListings();
  }, [filters]);

  const loadListings = async () => {
    try {
      setLoading(true);
      const data = await listingsService.getSaleListings(filters);
      setListings(data);
    } catch (error) {
      console.error('Error loading sale listings:', error);
    } finally {
      setLoading(false);
    }
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

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Filters Sidebar */}
        <aside className={`lg:w-80 flex-shrink-0 ${showMobileFilters ? 'block' : 'hidden lg:block'}`}>
          <div className="sticky top-24">
            <ListingFilters
              filters={filters}
              onFilterChange={setFilter}
              onReset={resetFilters}
              listingType="sale"
            />
          </div>
        </aside>

        {/* Listings Grid */}
        <main className="flex-1">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#4E4B43] mx-auto"></div>
              <p className="text-gray-600 mt-4">Loading properties...</p>
            </div>
          ) : listings.length > 0 ? (
            <>
              <div className="mb-4 text-sm text-gray-600">
                {listings.length} {listings.length === 1 ? 'property' : 'properties'} found
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {listings.map((listing) => (
                  <ListingCard key={listing.id} listing={listing} />
                ))}
              </div>
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
    </div>
  );
}
