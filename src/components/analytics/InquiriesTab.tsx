import React from 'react';
import { MessageSquare, Phone, Users, Clock, TrendingUp, AlertTriangle, Star } from 'lucide-react';

interface InquiryQuality {
  total_inquiries: number;
  unique_phones: number;
  repeat_rate: number;
  avg_listings_per_inquirer: number;
}

interface InquiryTrend {
  date: string;
  inquiry_count: number;
  phone_click_count: number;
}

interface VelocityBucket {
  bucket: string;
  count: number;
  percentage: number;
}

interface TopInquiredListing {
  listing_id: string;
  title: string;
  location: string;
  neighborhood: string;
  bedrooms: number;
  price: number;
  inquiry_count: number;
  is_featured: boolean;
  posted_by: string;
}

interface DemandBreakdown {
  by_price_band: { label: string; count: number }[];
  by_bedrooms: { label: string; count: number }[];
  by_neighborhood: { label: string; count: number }[];
}

interface TimingData {
  day_of_week: number;
  hour_of_day: number;
  count: number;
}

interface AbuseSignal {
  phone_masked: string;
  inquiry_count: number;
  severity: 'mild' | 'extreme';
  first_inquiry: string;
  last_inquiry: string;
  listings_contacted: number;
}

interface InquiriesTabProps {
  inquiryQuality: InquiryQuality | null;
  inquiryTrend: InquiryTrend[];
  velocity: VelocityBucket[];
  topInquired: TopInquiredListing[];
  demand: DemandBreakdown | null;
  timing: TimingData[];
  abuseSignals: AbuseSignal[];
  onListingClick: (listingId: string) => void;
  loading?: boolean;
}

function TrendLine({ data, showPhoneClicks = false }: { data: InquiryTrend[]; showPhoneClicks?: boolean }) {
  if (!data || data.length === 0) {
    return <div className="h-32 bg-gray-100 rounded flex items-center justify-center text-gray-500">No data</div>;
  }

  const maxInquiry = Math.max(...data.map((d) => d.inquiry_count), 1);
  const maxPhone = Math.max(...data.map((d) => d.phone_click_count), 1);
  const max = Math.max(maxInquiry, maxPhone);

  return (
    <div className="relative h-32">
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke="#14b8a6"
          strokeWidth="2"
          points={data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100;
            const y = 100 - (d.inquiry_count / max) * 100;
            return `${x},${y}`;
          }).join(' ')}
        />
        {showPhoneClicks && (
          <polyline
            fill="none"
            stroke="#f97316"
            strokeWidth="2"
            strokeDasharray="4,2"
            points={data.map((d, i) => {
              const x = (i / (data.length - 1)) * 100;
              const y = 100 - (d.phone_click_count / max) * 100;
              return `${x},${y}`;
            }).join(' ')}
          />
        )}
      </svg>
      <div className="flex gap-4 mt-2 text-xs">
        <div className="flex items-center">
          <div className="w-3 h-0.5 bg-teal-500 mr-1"></div>
          <span className="text-gray-600">Inquiries</span>
        </div>
        {showPhoneClicks && (
          <div className="flex items-center">
            <div className="w-3 h-0.5 bg-orange-500 mr-1" style={{ borderStyle: 'dashed' }}></div>
            <span className="text-gray-600">Phone Clicks</span>
          </div>
        )}
      </div>
    </div>
  );
}

function HorizontalBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-sm text-gray-600 truncate">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${width}%` }} />
      </div>
      <div className="w-12 text-right text-sm font-medium">{value}</div>
    </div>
  );
}

function TimingHeatmap({ data }: { data: TimingData[] }) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const matrix: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let maxCount = 0;

  data.forEach((item) => {
    matrix[item.day_of_week][item.hour_of_day] = item.count;
    if (item.count > maxCount) maxCount = item.count;
  });

  const getColor = (count: number) => {
    if (count === 0) return 'bg-gray-100';
    const intensity = count / maxCount;
    if (intensity > 0.75) return 'bg-teal-600';
    if (intensity > 0.5) return 'bg-teal-500';
    if (intensity > 0.25) return 'bg-teal-400';
    return 'bg-teal-200';
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        <div className="flex mb-1">
          <div className="w-10"></div>
          {hours.map((h) => (
            <div key={h} className="flex-1 text-center text-xs text-gray-400">
              {h % 6 === 0 ? `${h}` : ''}
            </div>
          ))}
        </div>
        {days.map((day, dayIndex) => (
          <div key={day} className="flex items-center mb-0.5">
            <div className="w-10 text-xs text-gray-500 pr-2">{day}</div>
            {hours.map((hour) => (
              <div
                key={hour}
                className={`flex-1 h-4 ${getColor(matrix[dayIndex][hour])} rounded-sm mx-px`}
                title={`${day} ${hour}:00 - ${matrix[dayIndex][hour]} inquiries`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function InquiriesTab({
  inquiryQuality,
  inquiryTrend,
  velocity,
  topInquired,
  demand,
  timing,
  abuseSignals,
  onListingClick,
  loading,
}: InquiriesTabProps) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm border p-4 animate-pulse">
              <div className="h-16 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const quality = inquiryQuality || {
    total_inquiries: 0,
    unique_phones: 0,
    repeat_rate: 0,
    avg_listings_per_inquirer: 0,
  };

  const demandData = {
    by_price_band: demand?.by_price_band || [],
    by_bedrooms: demand?.by_bedrooms || [],
    by_neighborhood: demand?.by_neighborhood || [],
  };
  const maxPriceBand = Math.max(...demandData.by_price_band.map((d) => d.count ?? 0), 1);
  const maxBedroom = Math.max(...demandData.by_bedrooms.map((d) => d.count ?? 0), 1);
  const maxNeighborhood = Math.max(...demandData.by_neighborhood.map((d) => d.count ?? 0), 1);

  const formatPrice = (price: number | null) => {
    if (!price) return 'Call';
    return `$${price.toLocaleString()}`;
  };

  const mildAbuse = abuseSignals.filter((s) => s.severity === 'mild');
  const extremeAbuse = abuseSignals.filter((s) => s.severity === 'extreme');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center mb-2">
            <MessageSquare className="w-4 h-4 text-teal-600 mr-2" />
            <span className="text-xs font-medium text-gray-600">Total Inquiries</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{quality.total_inquiries}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center mb-2">
            <Phone className="w-4 h-4 text-blue-600 mr-2" />
            <span className="text-xs font-medium text-gray-600">Unique Phones</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{quality.unique_phones}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center mb-2">
            <Users className="w-4 h-4 text-green-600 mr-2" />
            <span className="text-xs font-medium text-gray-600">Repeat Rate</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{quality.repeat_rate}%</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center mb-2">
            <TrendingUp className="w-4 h-4 text-orange-600 mr-2" />
            <span className="text-xs font-medium text-gray-600">Avg Listings/User</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{quality.avg_listings_per_inquirer}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Inquiry Trend</h3>
        <TrendLine data={inquiryTrend} showPhoneClicks />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <Clock className="w-5 h-5 text-blue-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Time to First Inquiry</h3>
          </div>
          {velocity.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No data</div>
          ) : (
            <div className="space-y-3">
              {velocity.map((bucket) => (
                <div key={bucket.bucket}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">{bucket.bucket}</span>
                    <span className="font-medium">{bucket.count} ({bucket.percentage}%)</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${bucket.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Inquired Listings</h3>
          {topInquired.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No data</div>
          ) : (
            <div className="space-y-3">
              {topInquired.slice(0, 5).map((listing) => (
                <div
                  key={listing.listing_id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                  onClick={() => onListingClick(listing.listing_id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {listing.is_featured && <Star className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} BR`} - {listing.location}
                      </div>
                      <div className="text-xs text-gray-500">{formatPrice(listing.price)}/mo</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-teal-600 font-semibold flex-shrink-0 ml-2">
                    <MessageSquare className="w-4 h-4" />
                    {listing.inquiry_count}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Demand Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">By Price</h4>
            <div className="space-y-2">
              {demandData.by_price_band.map((item) => (
                <HorizontalBar
                  key={item.label}
                  label={item.label}
                  value={item.count}
                  max={maxPriceBand}
                  color="bg-blue-500"
                />
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">By Bedrooms</h4>
            <div className="space-y-2">
              {demandData.by_bedrooms.map((item) => (
                <HorizontalBar
                  key={item.label}
                  label={item.label}
                  value={item.count}
                  max={maxBedroom}
                  color="bg-green-500"
                />
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">By Neighborhood</h4>
            <div className="space-y-2">
              {demandData.by_neighborhood.map((item) => (
                <HorizontalBar
                  key={item.label}
                  label={item.label}
                  value={item.count}
                  max={maxNeighborhood}
                  color="bg-orange-500"
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">When Inquiries Happen</h3>
        <TimingHeatmap data={timing} />
        <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-gray-100 rounded"></div>
            <span>No activity</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-teal-200 rounded"></div>
            <span>Low</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-teal-400 rounded"></div>
            <span>Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-teal-600 rounded"></div>
            <span>High</span>
          </div>
        </div>
      </div>

      {abuseSignals.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
          <div className="flex items-center mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-600 mr-2" />
            <h3 className="text-lg font-semibold text-amber-900">Abuse Signals Detected</h3>
          </div>
          {extremeAbuse.length > 0 && (
            <div className="mb-4">
              <div className="text-sm font-medium text-red-700 mb-2">
                Extreme (15+ inquiries): {extremeAbuse.length} phone number{extremeAbuse.length > 1 ? 's' : ''}
              </div>
              <div className="space-y-2">
                {extremeAbuse.map((signal, i) => (
                  <div key={i} className="bg-red-50 border border-red-200 rounded p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono">{signal.phone_masked}</span>
                      <span className="font-semibold text-red-700">{signal.inquiry_count} inquiries</span>
                    </div>
                    <div className="text-red-600 text-xs mt-1">
                      {signal.listings_contacted} listings contacted
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {mildAbuse.length > 0 && (
            <div>
              <div className="text-sm font-medium text-amber-700 mb-2">
                Mild (6-14 inquiries): {mildAbuse.length} phone number{mildAbuse.length > 1 ? 's' : ''}
              </div>
              <div className="space-y-2">
                {mildAbuse.slice(0, 5).map((signal, i) => (
                  <div key={i} className="bg-amber-100 border border-amber-200 rounded p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-mono">{signal.phone_masked}</span>
                      <span className="font-semibold text-amber-700">{signal.inquiry_count} inquiries</span>
                    </div>
                    <div className="text-amber-600 text-xs mt-1">
                      {signal.listings_contacted} listings contacted
                    </div>
                  </div>
                ))}
                {mildAbuse.length > 5 && (
                  <div className="text-sm text-amber-600">
                    + {mildAbuse.length - 5} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
