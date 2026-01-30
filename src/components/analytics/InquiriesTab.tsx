import React from 'react';
import { MessageSquare, Phone, Users, TrendingUp, AlertTriangle, PhoneCall, Mail, Activity } from 'lucide-react';

// ========================================
// TypeScript Interfaces
// ========================================

interface InquiryOverview {
  phone_reveals: number;
  phone_reveals_prev: number;
  contact_forms: number;
  contact_forms_prev: number;
  total_inquiries: number;
  total_inquiries_prev: number;
  unique_sessions_phone: number;
  unique_phones_form: number;
}

interface ConversionFunnel {
  total_sessions: number;
  total_listing_views: number;
  phone_reveals: number;
  phone_reveal_session_rate: number;
  phone_reveal_view_rate: number;
  contact_forms: number;
  contact_form_session_rate: number;
  contact_form_view_rate: number;
  combined_inquiry_rate: number;
}

interface UserBehavior {
  phone_only_count: number;
  form_only_count: number;
  both_count: number;
}

interface ListingPerformanceDual {
  listing_id: string;
  title: string;
  location: string;
  neighborhood: string;
  bedrooms: number;
  price: number;
  phone_reveals: number;
  contact_forms: number;
  total_inquiries: number;
  is_featured: boolean;
  posted_by: string;
}

interface DemandBreakdown {
  by_price_band_phones: { label: string; count: number }[];
  by_price_band_forms: { label: string; count: number }[];
  by_bedrooms_phones: { label: string; count: number }[];
  by_bedrooms_forms: { label: string; count: number }[];
  by_neighborhood_phones: { label: string; count: number }[];
  by_neighborhood_forms: { label: string; count: number }[];
}

interface InquiryTrend {
  date: string;
  inquiry_count: number;
  phone_click_count: number;
}

interface TimingData {
  day_of_week: number;
  hour_of_day: number;
  count: number;
}

interface QualityMetrics {
  repeat_inquiry_rate: number;
  avg_listings_per_user: number;
  avg_time_to_first_inquiry_hours: number;
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
  inquiryOverview: InquiryOverview | null;
  conversionFunnel: ConversionFunnel | null;
  userBehavior: UserBehavior | null;
  listingsPerformanceDual: ListingPerformanceDual[];
  demandBreakdown: DemandBreakdown | null;
  inquiryTrend: InquiryTrend[];
  timingPhones: TimingData[];
  timingForms: TimingData[];
  qualityMetrics: QualityMetrics | null;
  abuseSignals: AbuseSignal[];
  onListingClick: (listingId: string) => void;
  loading?: boolean;
}

// ========================================
// Helper Components
// ========================================

function PercentageChange({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    return current > 0 ? <span className="text-green-600 text-xs font-medium">New</span> : null;
  }
  const change = ((current - previous) / previous) * 100;
  const isPositive = change >= 0;
  return (
    <span className={`text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? '+' : ''}{change.toFixed(1)}%
    </span>
  );
}

function DualTrendLine({ data }: { data: InquiryTrend[] }) {
  if (!data || data.length === 0) {
    return <div className="h-32 bg-gray-100 rounded flex items-center justify-center text-gray-500">No data</div>;
  }

  const maxInquiry = Math.max(...data.map((d) => d.inquiry_count), 1);
  const maxPhone = Math.max(...data.map((d) => d.phone_click_count), 1);
  const max = Math.max(maxInquiry, maxPhone);

  return (
    <div className="relative h-32">
      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Contact Forms Line (Teal) */}
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
        {/* Phone Reveals Line (Orange) */}
        <polyline
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          points={data.map((d, i) => {
            const x = (i / (data.length - 1)) * 100;
            const y = 100 - (d.phone_click_count / max) * 100;
            return `${x},${y}`;
          }).join(' ')}
        />
      </svg>
      <div className="flex gap-4 mt-2 text-xs">
        <div className="flex items-center">
          <div className="w-3 h-0.5 bg-orange-500 mr-1"></div>
          <span className="text-gray-600">Phone Reveals</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-0.5 bg-teal-500 mr-1"></div>
          <span className="text-gray-600">Contact Forms</span>
        </div>
      </div>
    </div>
  );
}

function HorizontalBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const width = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-sm text-gray-600 truncate" title={label}>{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${width}%` }} />
      </div>
      <div className="w-12 text-right text-sm font-medium">{value}</div>
    </div>
  );
}

function TimingHeatmap({ data, color = 'teal' }: { data: TimingData[]; color?: 'orange' | 'teal' }) {
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
    const colorMap = {
      orange: {
        high: 'bg-orange-600',
        med: 'bg-orange-500',
        low: 'bg-orange-400',
        veryLow: 'bg-orange-200',
      },
      teal: {
        high: 'bg-teal-600',
        med: 'bg-teal-500',
        low: 'bg-teal-400',
        veryLow: 'bg-teal-200',
      },
    };
    const colors = colorMap[color];
    if (intensity > 0.75) return colors.high;
    if (intensity > 0.5) return colors.med;
    if (intensity > 0.25) return colors.low;
    return colors.veryLow;
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

// ========================================
// Main Component
// ========================================

export function InquiriesTab({
  inquiryOverview,
  conversionFunnel,
  userBehavior,
  listingsPerformanceDual,
  demandBreakdown,
  inquiryTrend,
  timingPhones,
  timingForms,
  qualityMetrics,
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

  const overview = inquiryOverview || {
    phone_reveals: 0,
    phone_reveals_prev: 0,
    contact_forms: 0,
    contact_forms_prev: 0,
    total_inquiries: 0,
    total_inquiries_prev: 0,
    unique_sessions_phone: 0,
    unique_phones_form: 0,
  };

  const funnel = conversionFunnel || {
    total_sessions: 0,
    total_listing_views: 0,
    phone_reveals: 0,
    phone_reveal_session_rate: 0,
    phone_reveal_view_rate: 0,
    contact_forms: 0,
    contact_form_session_rate: 0,
    contact_form_view_rate: 0,
    combined_inquiry_rate: 0,
  };

  const behavior = userBehavior || {
    phone_only_count: 0,
    form_only_count: 0,
    both_count: 0,
  };

  const demand = demandBreakdown || {
    by_price_band_phones: [],
    by_price_band_forms: [],
    by_bedrooms_phones: [],
    by_bedrooms_forms: [],
    by_neighborhood_phones: [],
    by_neighborhood_forms: [],
  };

  const quality = qualityMetrics || {
    repeat_inquiry_rate: 0,
    avg_listings_per_user: 0,
    avg_time_to_first_inquiry_hours: 0,
  };

  const formatPrice = (price: number | null) => {
    if (!price) return 'Call';
    return `$${price.toLocaleString()}`;
  };

  const mildAbuse = abuseSignals.filter((s) => s.severity === 'mild');
  const extremeAbuse = abuseSignals.filter((s) => s.severity === 'extreme');

  // Calculate demand maxes
  const maxPriceBandPhones = Math.max(...demand.by_price_band_phones.map((d) => d.count ?? 0), 1);
  const maxPriceBandForms = Math.max(...demand.by_price_band_forms.map((d) => d.count ?? 0), 1);
  const maxBedroomsPhones = Math.max(...demand.by_bedrooms_phones.map((d) => d.count ?? 0), 1);
  const maxBedroomsForms = Math.max(...demand.by_bedrooms_forms.map((d) => d.count ?? 0), 1);
  const maxNeighborhoodPhones = Math.max(...demand.by_neighborhood_phones.map((d) => d.count ?? 0), 1);
  const maxNeighborhoodForms = Math.max(...demand.by_neighborhood_forms.map((d) => d.count ?? 0), 1);

  const totalBehavior = behavior.phone_only_count + behavior.form_only_count + behavior.both_count;

  return (
    <div className="space-y-6">
      {/* ========================================
          Section 1: Primary Metrics Cards (4 cards)
          ======================================== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <PhoneCall className="w-4 h-4 text-orange-600 mr-2" />
              <span className="text-xs font-medium text-gray-600">Phone Reveals</span>
            </div>
            <PercentageChange current={overview.phone_reveals} previous={overview.phone_reveals_prev} />
          </div>
          <div className="text-2xl font-bold text-gray-900">{overview.phone_reveals.toLocaleString()}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <Mail className="w-4 h-4 text-teal-600 mr-2" />
              <span className="text-xs font-medium text-gray-600">Contact Forms</span>
            </div>
            <PercentageChange current={overview.contact_forms} previous={overview.contact_forms_prev} />
          </div>
          <div className="text-2xl font-bold text-gray-900">{overview.contact_forms.toLocaleString()}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center">
              <MessageSquare className="w-4 h-4 text-blue-600 mr-2" />
              <span className="text-xs font-medium text-gray-600">Total Inquiries</span>
            </div>
            <PercentageChange current={overview.total_inquiries} previous={overview.total_inquiries_prev} />
          </div>
          <div className="text-2xl font-bold text-gray-900">{overview.total_inquiries.toLocaleString()}</div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center mb-2">
            <Users className="w-4 h-4 text-green-600 mr-2" />
            <span className="text-xs font-medium text-gray-600">Unique Inquirers</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {(overview.unique_sessions_phone + overview.unique_phones_form).toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {overview.unique_sessions_phone} sessions + {overview.unique_phones_form} phones
          </div>
        </div>
      </div>

      {/* ========================================
          Section 2: Conversion Funnel
          ======================================== */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Conversion Funnel</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">{funnel.total_sessions.toLocaleString()}</div>
            <div className="text-sm text-gray-600 mt-1">Sessions</div>
          </div>
          <div className="flex items-center justify-center">
            <div className="text-2xl text-gray-400">→</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">{funnel.total_listing_views.toLocaleString()}</div>
            <div className="text-sm text-gray-600 mt-1">Listing Views</div>
          </div>
          <div className="flex items-center justify-center">
            <div className="text-2xl text-gray-400">→</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">{(funnel.phone_reveals + funnel.contact_forms).toLocaleString()}</div>
            <div className="text-sm text-gray-600 mt-1">Inquiries</div>
            <div className="text-xs text-gray-500 mt-1">{funnel.combined_inquiry_rate.toFixed(1)}% of sessions</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-gray-200">
          <div className="bg-orange-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <PhoneCall className="w-4 h-4 text-orange-600 mr-2" />
              <span className="text-sm font-medium text-gray-700">Phone Reveals</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">{funnel.phone_reveals.toLocaleString()}</div>
            <div className="text-xs text-gray-600 mt-1">
              {funnel.phone_reveal_session_rate.toFixed(1)}% of sessions
            </div>
            <div className="text-xs text-gray-600">
              {funnel.phone_reveal_view_rate.toFixed(1)}% of listing views
            </div>
          </div>
          <div className="bg-teal-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <Mail className="w-4 h-4 text-teal-600 mr-2" />
              <span className="text-sm font-medium text-gray-700">Contact Forms</span>
            </div>
            <div className="text-2xl font-bold text-teal-600">{funnel.contact_forms.toLocaleString()}</div>
            <div className="text-xs text-gray-600 mt-1">
              {funnel.contact_form_session_rate.toFixed(1)}% of sessions
            </div>
            <div className="text-xs text-gray-600">
              {funnel.contact_form_view_rate.toFixed(1)}% of listing views
            </div>
          </div>
        </div>
      </div>

      {/* ========================================
          Section 3: User Behavior Segmentation
          ======================================== */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Listing-Level Inquiry Behavior</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-orange-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <PhoneCall className="w-5 h-5 text-orange-600" />
            </div>
            <div className="text-3xl font-bold text-orange-600">{behavior.phone_only_count}</div>
            <div className="text-sm text-gray-600 mt-1">Phone Reveals Only</div>
            {totalBehavior > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                {((behavior.phone_only_count / totalBehavior) * 100).toFixed(1)}% of listings
              </div>
            )}
          </div>
          <div className="bg-teal-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <Mail className="w-5 h-5 text-teal-600" />
            </div>
            <div className="text-3xl font-bold text-teal-600">{behavior.form_only_count}</div>
            <div className="text-sm text-gray-600 mt-1">Contact Forms Only</div>
            {totalBehavior > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                {((behavior.form_only_count / totalBehavior) * 100).toFixed(1)}% of listings
              </div>
            )}
          </div>
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-blue-600">{behavior.both_count}</div>
            <div className="text-sm text-gray-600 mt-1">Both Types</div>
            {totalBehavior > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                {((behavior.both_count / totalBehavior) * 100).toFixed(1)}% of listings
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========================================
          Section 4: Dual-Line Trend Chart
          ======================================== */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Inquiry Trend Over Time</h3>
        <DualTrendLine data={inquiryTrend} />
      </div>

      {/* ========================================
          Section 5: Top Inquired Listings
          ======================================== */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Inquired Listings</h3>
        {listingsPerformanceDual.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No data</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Listing</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">
                    <div className="flex items-center justify-end">
                      <PhoneCall className="w-4 h-4 text-orange-600 mr-1" />
                      <span>Phone</span>
                    </div>
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">
                    <div className="flex items-center justify-end">
                      <Mail className="w-4 h-4 text-teal-600 mr-1" />
                      <span>Form</span>
                    </div>
                  </th>
                  <th className="text-right py-2 px-3 font-medium text-gray-700">
                    <div className="flex items-center justify-end">
                      <MessageSquare className="w-4 h-4 text-blue-600 mr-1" />
                      <span>Total</span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {listingsPerformanceDual.slice(0, 10).map((listing, idx) => (
                  <tr
                    key={listing.listing_id}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => onListingClick(listing.listing_id)}
                  >
                    <td className="py-3 px-3">
                      <div className="font-medium text-gray-900">
                        {listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} BR`} - {listing.location}
                      </div>
                      <div className="text-xs text-gray-500">{formatPrice(listing.price)}/mo</div>
                    </td>
                    <td className="text-right py-3 px-3 font-semibold text-orange-600">
                      {listing.phone_reveals}
                    </td>
                    <td className="text-right py-3 px-3 font-semibold text-teal-600">
                      {listing.contact_forms}
                    </td>
                    <td className="text-right py-3 px-3 font-semibold text-blue-600">
                      {listing.total_inquiries}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================
          Section 6: Demand Breakdown (2x3 grid)
          ======================================== */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Demand Breakdown by Inquiry Type</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Left Column: Phone Reveals */}
          <div>
            <div className="flex items-center mb-4 pb-2 border-b border-orange-200">
              <PhoneCall className="w-5 h-5 text-orange-600 mr-2" />
              <h4 className="text-md font-semibold text-gray-800">Phone Reveals</h4>
            </div>
            <div className="space-y-6">
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-3">By Price Band</h5>
                <div className="space-y-2">
                  {demand.by_price_band_phones.map((item) => (
                    <HorizontalBar
                      key={item.label}
                      label={item.label}
                      value={item.count}
                      max={maxPriceBandPhones}
                      color="bg-orange-500"
                    />
                  ))}
                </div>
              </div>
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-3">By Bedrooms</h5>
                <div className="space-y-2">
                  {demand.by_bedrooms_phones.map((item) => (
                    <HorizontalBar
                      key={item.label}
                      label={item.label}
                      value={item.count}
                      max={maxBedroomsPhones}
                      color="bg-orange-500"
                    />
                  ))}
                </div>
              </div>
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-3">By Neighborhood</h5>
                <div className="space-y-2">
                  {demand.by_neighborhood_phones.map((item) => (
                    <HorizontalBar
                      key={item.label}
                      label={item.label}
                      value={item.count}
                      max={maxNeighborhoodPhones}
                      color="bg-orange-500"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Contact Forms */}
          <div>
            <div className="flex items-center mb-4 pb-2 border-b border-teal-200">
              <Mail className="w-5 h-5 text-teal-600 mr-2" />
              <h4 className="text-md font-semibold text-gray-800">Contact Forms</h4>
            </div>
            <div className="space-y-6">
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-3">By Price Band</h5>
                <div className="space-y-2">
                  {demand.by_price_band_forms.map((item) => (
                    <HorizontalBar
                      key={item.label}
                      label={item.label}
                      value={item.count}
                      max={maxPriceBandForms}
                      color="bg-teal-500"
                    />
                  ))}
                </div>
              </div>
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-3">By Bedrooms</h5>
                <div className="space-y-2">
                  {demand.by_bedrooms_forms.map((item) => (
                    <HorizontalBar
                      key={item.label}
                      label={item.label}
                      value={item.count}
                      max={maxBedroomsForms}
                      color="bg-teal-500"
                    />
                  ))}
                </div>
              </div>
              <div>
                <h5 className="text-sm font-medium text-gray-700 mb-3">By Neighborhood</h5>
                <div className="space-y-2">
                  {demand.by_neighborhood_forms.map((item) => (
                    <HorizontalBar
                      key={item.label}
                      label={item.label}
                      value={item.count}
                      max={maxNeighborhoodForms}
                      color="bg-teal-500"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================
          Section 7: Timing Heatmaps (side-by-side)
          ======================================== */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">When Inquiries Happen</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div className="flex items-center mb-4">
              <PhoneCall className="w-4 h-4 text-orange-600 mr-2" />
              <h4 className="text-md font-semibold text-gray-800">Phone Reveals</h4>
            </div>
            <TimingHeatmap data={timingPhones} color="orange" />
          </div>
          <div>
            <div className="flex items-center mb-4">
              <Mail className="w-4 h-4 text-teal-600 mr-2" />
              <h4 className="text-md font-semibold text-gray-800">Contact Forms</h4>
            </div>
            <TimingHeatmap data={timingForms} color="teal" />
          </div>
        </div>
      </div>

      {/* ========================================
          Section 8: Quality Indicators
          ======================================== */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quality Indicators</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">Repeat Inquiry Rate</div>
            <div className="text-3xl font-bold text-gray-900">{quality.repeat_inquiry_rate.toFixed(1)}%</div>
            <div className="text-xs text-gray-500 mt-1">Users contacting multiple listings</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">Avg Listings per User</div>
            <div className="text-3xl font-bold text-gray-900">{quality.avg_listings_per_user.toFixed(1)}</div>
            <div className="text-xs text-gray-500 mt-1">Interest breadth indicator</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm text-gray-600 mb-1">Avg Time to First Inquiry</div>
            <div className="text-3xl font-bold text-gray-900">{quality.avg_time_to_first_inquiry_hours.toFixed(1)}h</div>
            <div className="text-xs text-gray-500 mt-1">Session to inquiry conversion speed</div>
          </div>
        </div>
      </div>

      {/* ========================================
          Abuse Signals (kept from original)
          ======================================== */}
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
