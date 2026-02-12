import React, { useState } from 'react';
import { Home, TrendingUp, AlertCircle, Eye, MessageSquare, Phone, Star, ChevronDown, ChevronUp, Clock } from 'lucide-react';

interface SupplyStats {
  new_listings_by_day: { date: string; count: number }[];
  active_count: number;
  inactive_count: number;
  total_new_listings: number;
}

interface ListingPerformance {
  listing_id: string;
  title: string;
  location: string;
  neighborhood: string;
  bedrooms: number;
  price: number;
  views: number;
  impressions: number;
  ctr: number;
  inquiry_count: number;
  phone_click_count: number;
  hours_to_first_inquiry: number | null;
  is_featured: boolean;
  posted_by: string;
}

interface ZeroInquiryListing {
  listing_id: string;
  title: string;
  location: string;
  neighborhood: string;
  bedrooms: number;
  price: number;
  views: number;
  days_since_posted: number;
  is_featured: boolean;
}

interface PostingFunnel {
  starts: number;
  submits: number;
  successes: number;
  abandoned: number;
  successRate: number;
  abandonRate: number;
}

interface ListingsTabProps {
  supplyStats: SupplyStats | null;
  listingsPerformance: ListingPerformance[];
  zeroInquiryListings: ZeroInquiryListing[];
  postingFunnel: PostingFunnel | null;
  onListingClick: (listingId: string) => void;
  loading?: boolean;
}

function SimpleBarChart({ data }: { data: { date: string; count: number }[] }) {
  if (!data || data.length === 0) {
    return <div className="h-32 bg-gray-100 rounded flex items-center justify-center text-gray-500">No data</div>;
  }

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="h-32 flex items-end gap-1">
      {data.map((item, index) => {
        const height = (item.count / max) * 100;
        const date = new Date(item.date);
        const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);
        return (
          <div key={index} className="flex-1 flex flex-col items-center">
            <div
              className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600"
              style={{ height: `${Math.max(height, 4)}%` }}
              title={`${item.count} listings on ${date.toLocaleDateString()}`}
            />
            <span className="text-xs text-gray-500 mt-1">{dayLabel}</span>
          </div>
        );
      })}
    </div>
  );
}

function SupplyCard({ icon: Icon, iconColor, bgColor, label, value }: {
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  label: string;
  value: number;
}) {
  return (
    <div className={`${bgColor} rounded-lg p-4 text-center`}>
      <Icon className={`w-6 h-6 ${iconColor} mx-auto mb-2`} />
      <div className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  );
}

export function ListingsTab({
  supplyStats,
  listingsPerformance,
  zeroInquiryListings,
  postingFunnel,
  onListingClick,
  loading,
}: ListingsTabProps) {
  const [showZeroInquiry, setShowZeroInquiry] = useState(false);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-lg p-4 animate-pulse">
              <div className="h-16 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const supply = supplyStats || {
    new_listings_by_day: [],
    active_count: 0,
    inactive_count: 0,
    total_new_listings: 0,
  };

  const funnel = postingFunnel || {
    starts: 0,
    submits: 0,
    successes: 0,
    abandoned: 0,
    successRate: 0,
    abandonRate: 0,
  };

  const formatPrice = (price: number | null) => {
    if (!price) return 'Call';
    return `$${price.toLocaleString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <SupplyCard
          icon={TrendingUp}
          iconColor="text-green-600"
          bgColor="bg-green-50"
          label="New Listings"
          value={supply.total_new_listings}
        />
        <SupplyCard
          icon={Home}
          iconColor="text-blue-600"
          bgColor="bg-blue-50"
          label="Active"
          value={supply.active_count}
        />
        <SupplyCard
          icon={Home}
          iconColor="text-gray-500"
          bgColor="bg-gray-100"
          label="Inactive"
          value={supply.inactive_count}
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">New Listings Trend</h3>
        <SimpleBarChart data={supply.new_listings_by_day} />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <TrendingUp className="w-5 h-5 mr-2" />
          Posting Funnel
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-800">{funnel.starts}</div>
            <div className="text-sm text-blue-600">Started</div>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-yellow-800">{funnel.submits}</div>
            <div className="text-sm text-yellow-600">Submitted</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-800">{funnel.successes}</div>
            <div className="text-sm text-green-600">Success</div>
          </div>
          <div className="bg-red-50 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-800">{funnel.abandoned}</div>
            <div className="text-sm text-red-600">Abandoned</div>
          </div>
        </div>
        <div className="mt-4 text-center text-sm text-gray-600">
          Success Rate: <span className="font-semibold text-green-600">{funnel.successRate}%</span>
          <span className="mx-2 text-gray-400">|</span>
          Abandon Rate: <span className="font-semibold text-red-600">{funnel.abandonRate}%</span>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Listing Performance</h3>
        </div>
        {listingsPerformance.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No listing data</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Property</th>
                  <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Beds</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Price</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Views</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Impr.</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">CTR</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Inquiries</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Calls</th>
                  <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">1st Inq</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {listingsPerformance.map((listing) => (
                  <tr
                    key={listing.listing_id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => onListingClick(listing.listing_id)}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {listing.is_featured && <Star className="w-4 h-4 text-accent-500" />}
                        <div>
                          <div className="font-medium text-gray-900 truncate max-w-[200px]">
                            {listing.location || '-'}
                          </div>
                          <div className="text-xs text-gray-500">{listing.neighborhood || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center text-sm">
                      {(listing.bedrooms ?? 0) === 0 ? 'Studio' : listing.bedrooms}
                    </td>
                    <td className="py-3 px-4 text-right text-sm font-medium">
                      {formatPrice(listing.price)}
                    </td>
                    <td className="py-3 px-4 text-right text-sm">
                      <div className="flex items-center justify-end gap-1">
                        <Eye className="w-3 h-3 text-gray-400" />
                        {listing.views ?? 0}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-gray-600">{listing.impressions ?? 0}</td>
                    <td className="py-3 px-4 text-right text-sm">
                      <span className={(listing.ctr ?? 0) >= 5 ? 'text-green-600 font-medium' : ''}>
                        {listing.ctr ?? 0}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-sm">
                      <div className="flex items-center justify-end gap-1">
                        <MessageSquare className="w-3 h-3 text-gray-400" />
                        {listing.inquiry_count ?? 0}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-sm">
                      <div className="flex items-center justify-end gap-1">
                        <Phone className="w-3 h-3 text-gray-400" />
                        {listing.phone_click_count ?? 0}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-sm text-gray-600">
                      {listing.hours_to_first_inquiry != null
                        ? `${listing.hours_to_first_inquiry.toFixed(0)}h`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {zeroInquiryListings.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowZeroInquiry(!showZeroInquiry)}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-accent-500 mr-2" />
              <span className="font-medium text-gray-900">
                Listings with Views but No Contact ({zeroInquiryListings.length})
              </span>
            </div>
            {showZeroInquiry ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </button>
          {showZeroInquiry && (
            <div className="border-t border-gray-200">
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Property</th>
                      <th className="text-center py-3 px-4 text-xs font-medium text-gray-500 uppercase">Beds</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Price</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Views</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Days Listed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {zeroInquiryListings.map((listing) => (
                      <tr
                        key={listing.listing_id}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => onListingClick(listing.listing_id)}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            {listing.is_featured && <Star className="w-4 h-4 text-accent-500" />}
                            <div>
                              <div className="font-medium text-gray-900 truncate max-w-[200px]">
                                {listing.location}
                              </div>
                              <div className="text-xs text-gray-500">{listing.neighborhood}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center text-sm">
                          {listing.bedrooms === 0 ? 'Studio' : listing.bedrooms}
                        </td>
                        <td className="py-3 px-4 text-right text-sm font-medium">
                          {formatPrice(listing.price)}
                        </td>
                        <td className="py-3 px-4 text-right text-sm">
                          <div className="flex items-center justify-end gap-1">
                            <Eye className="w-3 h-3 text-gray-400" />
                            {listing.views}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right text-sm">
                          <div className="flex items-center justify-end gap-1">
                            <Clock className="w-3 h-3 text-gray-400" />
                            {listing.days_since_posted}d
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
