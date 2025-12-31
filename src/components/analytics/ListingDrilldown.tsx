import React, { useEffect, useState } from 'react';
import { X, Eye, MousePointer, Phone, MessageSquare, Clock, ExternalLink, Star } from 'lucide-react';
import { supabase } from '../../config/supabase';

interface DrilldownData {
  listing_id: string;
  title: string;
  location: string;
  neighborhood: string;
  bedrooms: number;
  price: number;
  is_featured: boolean;
  created_at: string;
  views: number;
  impressions: number;
  ctr: number;
  phone_clicks: number;
  inquiry_count: number;
  hours_to_first_inquiry: number | null;
  views_by_day: { date: string; views: number }[];
  inquiries: { id: string; name: string; phone: string; created_at: string }[];
}

interface ListingDrilldownProps {
  listingId: string | null;
  onClose: () => void;
  daysBack?: number;
}

function MiniSparkline({ data }: { data: number[] }) {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="h-12 w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
}

export function ListingDrilldown({ listingId, onClose, daysBack = 14 }: ListingDrilldownProps) {
  const [data, setData] = useState<DrilldownData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!listingId) {
      setData(null);
      return;
    }

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const { data: result, error: err } = await supabase.rpc('analytics_listing_drilldown', {
          p_listing_id: listingId,
          days_back: daysBack,
          tz: 'America/New_York',
        });

        if (err) throw err;
        if (result && result.length > 0) {
          setData(result[0]);
        } else {
          setError('Listing not found');
        }
      } catch (err) {
        console.error('Error fetching drilldown:', err);
        setError('Failed to load listing details');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [listingId, daysBack]);

  if (!listingId) return null;

  const formatPrice = (price: number | null) => {
    if (!price) return 'Call';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(price);
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900">Listing Details</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {loading && (
            <div className="space-y-4">
              <div className="animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-center py-8">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          {data && !loading && (
            <div className="space-y-6">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">{data.title}</h3>
                    <p className="text-gray-600 mt-1">{data.location}</p>
                    {data.neighborhood && (
                      <p className="text-gray-500 text-sm">{data.neighborhood}</p>
                    )}
                  </div>
                  {data.is_featured && (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                      <Star className="w-3 h-3 mr-1" />
                      Featured
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3 text-sm">
                  <span className="font-semibold text-gray-900">
                    {data.bedrooms === 0 ? 'Studio' : `${data.bedrooms} BR`}
                  </span>
                  <span className="text-gray-400">|</span>
                  <span className="font-semibold text-gray-900">
                    {formatPrice(data.price)}/mo
                  </span>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">Performance</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center">
                    <Eye className="w-4 h-4 text-blue-600 mr-2" />
                    <div>
                      <div className="text-lg font-semibold">{data.views}</div>
                      <div className="text-xs text-gray-500">Views</div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <MousePointer className="w-4 h-4 text-green-600 mr-2" />
                    <div>
                      <div className="text-lg font-semibold">{data.impressions}</div>
                      <div className="text-xs text-gray-500">Impressions</div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <Phone className="w-4 h-4 text-orange-600 mr-2" />
                    <div>
                      <div className="text-lg font-semibold">{data.phone_clicks}</div>
                      <div className="text-xs text-gray-500">Phone Clicks</div>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <MessageSquare className="w-4 h-4 text-teal-600 mr-2" />
                    <div>
                      <div className="text-lg font-semibold">{data.inquiry_count}</div>
                      <div className="text-xs text-gray-500">Inquiries</div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-200">
                  <div>
                    <div className="text-sm text-gray-500">CTR</div>
                    <div className={`text-lg font-semibold ${data.ctr >= 5 ? 'text-green-600' : 'text-gray-900'}`}>
                      {data.ctr}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-500">Time to 1st Inquiry</div>
                    <div className="text-lg font-semibold text-gray-900">
                      {data.hours_to_first_inquiry !== null
                        ? `${data.hours_to_first_inquiry.toFixed(1)}h`
                        : 'None'}
                    </div>
                  </div>
                </div>
              </div>

              {data.views_by_day && data.views_by_day.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">
                    Views Trend ({daysBack} days)
                  </h4>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <MiniSparkline data={data.views_by_day.map((d) => d.views)} />
                  </div>
                </div>
              )}

              {data.inquiries && data.inquiries.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                    Inquiries ({data.inquiries.length})
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {data.inquiries.map((inquiry) => (
                      <div
                        key={inquiry.id}
                        className="bg-gray-50 rounded-lg p-3 text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-gray-900">{inquiry.name}</span>
                          <span className="text-gray-500 text-xs">
                            {formatDateTime(inquiry.created_at)}
                          </span>
                        </div>
                        <a
                          href={`tel:${inquiry.phone}`}
                          className="text-blue-600 hover:underline mt-1 inline-block"
                        >
                          {inquiry.phone}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <a
                href={`/listing/${data.listing_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#273140] text-white rounded-lg hover:bg-[#1e252f] transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View Listing Page
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
