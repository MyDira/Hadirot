import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Phone, Globe, Copy, Check, MapPin, Filter } from 'lucide-react';
import { agenciesService, Agency } from '@/services/agencies';
import { ListingCard } from '@/components/listings/ListingCard';
import { NotFound } from './NotFound';
import { trackEvent } from '@/lib/analytics';

export function AgencyPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [listingsLoading, setListingsLoading] = useState(false);
  const [pagination, setPagination] = useState<any>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // Filter states
  const [bedrooms, setBedrooms] = useState(searchParams.get('bedrooms') || 'any');
  const [minPrice, setMinPrice] = useState(searchParams.get('min_price') || '');
  const [maxPrice, setMaxPrice] = useState(searchParams.get('max_price') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'newest');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'));

  // Load agency data
  useEffect(() => {
    if (!slug) return;

    const loadAgency = async () => {
      setLoading(true);
      const agencyData = await agenciesService.getAgencyBySlug(slug);
      
      if (agencyData) {
        setAgency(agencyData);
        // Track agency page view
        trackEvent('agency_page_view', {
          agencyId: agencyData.id,
          slug: agencyData.slug,
        });
      }
      
      setLoading(false);
    };

    loadAgency();
  }, [slug]);

  // Load listings when agency or filters change
  useEffect(() => {
    if (!agency) return;

    const loadListings = async () => {
      setListingsLoading(true);
      
      const filters = {
        bedrooms: bedrooms !== 'any' ? bedrooms : undefined,
        min_price: minPrice ? parseInt(minPrice) : undefined,
        max_price: maxPrice ? parseInt(maxPrice) : undefined,
        sort,
        page,
      };

      const response = await agenciesService.getAgencyListings(agency.id, filters);
      
      if (response) {
        setListings(response.listings);
        setPagination(response.pagination);
      }
      
      setListingsLoading(false);
    };

    loadListings();
  }, [agency, bedrooms, minPrice, maxPrice, sort, page]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (bedrooms !== 'any') params.set('bedrooms', bedrooms);
    if (minPrice) params.set('min_price', minPrice);
    if (maxPrice) params.set('max_price', maxPrice);
    if (sort !== 'newest') params.set('sort', sort);
    if (page !== 1) params.set('page', page.toString());
    
    setSearchParams(params);
  }, [bedrooms, minPrice, maxPrice, sort, page, setSearchParams]);

  const handleFilterChange = (filterType: string, value: string) => {
    setPage(1); // Reset to first page when filters change
    
    switch (filterType) {
      case 'bedrooms':
        setBedrooms(value);
        break;
      case 'sort':
        setSort(value);
        break;
    }

    // Track filter change
    trackEvent('filter_change', {
      page: 'agency',
      agencyId: agency?.id,
      filterType,
      value,
    });
  };

  const handlePriceChange = () => {
    setPage(1);
    trackEvent('filter_change', {
      page: 'agency',
      agencyId: agency?.id,
      filterType: 'price',
      value: `${minPrice}-${maxPrice}`,
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const getWhatsAppUrl = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '');
    return `https://wa.me/${cleanPhone}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading agency...</p>
        </div>
      </div>
    );
  }

  if (!agency) {
    return <NotFound message="Agency not found" />;
  }

  const primaryColor = agency.theme_primary_color || '#1E4A74';
  const accentColor = agency.theme_accent_color || '#7CB342';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="relative">
        {/* Banner */}
        {agency.banner_url && (
          <div className="h-64 md:h-80 overflow-hidden">
            <img
              src={agency.banner_url}
              alt={`${agency.name} banner`}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        
        {/* Agency Info Overlay */}
        <div 
          className={`${agency.banner_url ? 'absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent' : 'bg-white border-b'} p-6`}
        >
          <div className="max-w-6xl mx-auto">
            <div className="flex items-start gap-6">
              {/* Logo */}
              {agency.logo_url && (
                <div className="flex-shrink-0">
                  <img
                    src={agency.logo_url}
                    alt={`${agency.name} logo`}
                    className="w-20 h-20 md:w-24 md:h-24 rounded-lg object-cover bg-white shadow-lg"
                  />
                </div>
              )}
              
              {/* Agency Details */}
              <div className="flex-1 min-w-0">
                <h1 
                  className={`text-3xl md:text-4xl font-bold mb-2 ${agency.banner_url ? 'text-white' : 'text-gray-900'}`}
                  style={{ color: agency.banner_url ? 'white' : primaryColor }}
                >
                  {agency.name}
                </h1>
                
                {agency.tagline && (
                  <p className={`text-lg mb-4 ${agency.banner_url ? 'text-gray-200' : 'text-gray-600'}`}>
                    {agency.tagline}
                  </p>
                )}
                
                {/* Contact Buttons */}
                <div className="flex flex-wrap gap-3">
                  {agency.phone && (
                    <>
                      <a
                        href={`tel:${agency.phone}`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors"
                        style={{ backgroundColor: accentColor, color: 'white' }}
                      >
                        <Phone className="w-4 h-4" />
                        Call
                      </a>
                      <a
                        href={getWhatsAppUrl(agency.phone)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                      >
                        WhatsApp
                      </a>
                    </>
                  )}
                  
                  {agency.website && (
                    <a
                      href={agency.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors border"
                    >
                      <Globe className="w-4 h-4" />
                      Website
                    </a>
                  )}
                  
                  <button
                    onClick={copyLink}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors border"
                  >
                    {linkCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {linkCopied ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* About Section */}
        {agency.about_content && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <h2 className="text-2xl font-bold mb-4" style={{ color: primaryColor }}>
              About {agency.name}
            </h2>
            <div 
              className="prose max-w-none"
              dangerouslySetInnerHTML={{ __html: agency.about_content }}
            />
          </div>
        )}

        {/* Listings Section */}
        <div className="bg-white rounded-lg shadow-sm">
          <div className="p-6 border-b">
            <h2 className="text-2xl font-bold mb-4" style={{ color: primaryColor }}>
              Available Properties
            </h2>
            
            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-end">
              {/* Bedrooms Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bedrooms
                </label>
                <select
                  value={bedrooms}
                  onChange={(e) => handleFilterChange('bedrooms', e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value="any">Any</option>
                  <option value="studio">Studio</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4+">4+</option>
                </select>
              </div>

              {/* Price Range */}
              <div className="flex gap-2 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Min Price
                  </label>
                  <input
                    type="number"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    onBlur={handlePriceChange}
                    placeholder="Min"
                    className="border border-gray-300 rounded-lg px-3 py-2 w-24 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Price
                  </label>
                  <input
                    type="number"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    onBlur={handlePriceChange}
                    placeholder="Max"
                    className="border border-gray-300 rounded-lg px-3 py-2 w-24 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Sort */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Sort by
                </label>
                <select
                  value={sort}
                  onChange={(e) => handleFilterChange('sort', e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value="newest">Newest</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </select>
              </div>
            </div>
          </div>

          {/* Listings Grid */}
          <div className="p-6">
            {listingsLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Loading listings...</p>
              </div>
            ) : listings.length > 0 ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                  {listings.map((listing) => (
                    <ListingCard key={listing.id} listing={listing} />
                  ))}
                </div>

                {/* Pagination */}
                {pagination && pagination.totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={!pagination.hasPrev}
                      className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    
                    <span className="px-4 py-2 text-sm text-gray-600">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={!pagination.hasNext}
                      className="px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12">
                <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No listings yet</h3>
                <p className="text-gray-600">
                  {agency.name} hasn't posted any properties yet. Check back soon!
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}