import React from 'react';
import { Users, Eye, FileText, MessageSquare, ArrowRight, Filter } from 'lucide-react';

interface FunnelData {
  sessions: number;
  impressions: number;
  listing_views: number;
  contact_attempts: number;
}

interface TopFilter {
  filter_key: string;
  filter_value: string;
  uses: number;
}

interface EngagementTabProps {
  funnelData: FunnelData | null;
  topFilters: TopFilter[];
  loading?: boolean;
}

function FunnelStep({
  icon: Icon,
  iconColor,
  bgColor,
  label,
  value,
  dropOff,
  isLast,
}: {
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  label: string;
  value: number;
  dropOff?: number;
  isLast?: boolean;
}) {
  return (
    <div className="flex items-center">
      <div className={`${bgColor} rounded-lg p-4 flex-1 text-center`}>
        <Icon className={`w-6 h-6 ${iconColor} mx-auto mb-2`} />
        <div className="text-2xl font-bold text-gray-900">{(value ?? 0).toLocaleString()}</div>
        <div className="text-sm text-gray-600">{label}</div>
      </div>
      {!isLast && (
        <div className="flex flex-col items-center px-2 md:px-4">
          <ArrowRight className="w-5 h-5 text-gray-400" />
          {dropOff !== undefined && dropOff > 0 && (
            <span className="text-xs text-red-500 mt-1">-{dropOff}%</span>
          )}
        </div>
      )}
    </div>
  );
}

export function EngagementTab({ funnelData, topFilters, loading }: EngagementTabProps) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-40 mb-6"></div>
          <div className="flex gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex-1">
                <div className="h-24 bg-gray-200 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const funnel = funnelData || {
    sessions: 0,
    impressions: 0,
    listing_views: 0,
    contact_attempts: 0,
  };

  const calcDropOff = (current: number, next: number) => {
    if (current === 0) return 0;
    return Math.round(((current - next) / current) * 100);
  };

  const impressionToViewRate = funnel.impressions > 0
    ? ((funnel.listing_views / funnel.impressions) * 100).toFixed(1)
    : '0';

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6">Engagement Funnel</h3>
        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-0">
          <FunnelStep
            icon={Users}
            iconColor="text-blue-600"
            bgColor="bg-blue-50"
            label="Sessions"
            value={funnel.sessions}
            dropOff={calcDropOff(funnel.sessions, funnel.impressions)}
          />
          <FunnelStep
            icon={Eye}
            iconColor="text-green-600"
            bgColor="bg-green-50"
            label="Impressions"
            value={funnel.impressions}
            dropOff={calcDropOff(funnel.impressions, funnel.listing_views)}
          />
          <FunnelStep
            icon={FileText}
            iconColor="text-orange-600"
            bgColor="bg-orange-50"
            label="Listing Views"
            value={funnel.listing_views}
            dropOff={calcDropOff(funnel.listing_views, funnel.contact_attempts)}
          />
          <FunnelStep
            icon={MessageSquare}
            iconColor="text-teal-600"
            bgColor="bg-teal-50"
            label="Contact Attempts"
            value={funnel.contact_attempts}
            isLast
          />
        </div>
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="text-center text-sm text-gray-600">
            Overall Conversion:
            <span className="ml-2 font-semibold text-gray-900">
              {funnel.sessions > 0
                ? ((funnel.contact_attempts / funnel.sessions) * 100).toFixed(2)
                : '0'}%
            </span>
            <span className="mx-2 text-gray-400">|</span>
            View-to-Contact:
            <span className="ml-2 font-semibold text-gray-900">
              {funnel.listing_views > 0
                ? ((funnel.contact_attempts / funnel.listing_views) * 100).toFixed(2)
                : '0'}%
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center mb-4">
          <Eye className="w-5 h-5 text-green-600 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">Engagement Depth</h3>
        </div>
        <div className="flex items-end gap-4">
          <div className="text-4xl font-bold text-gray-900">{impressionToViewRate}%</div>
          <div className="text-sm text-gray-500 pb-1">
            of impressed listings get clicked
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center mb-4">
          <Filter className="w-5 h-5 text-blue-600 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">What Users Are Searching For</h3>
        </div>
        {topFilters.length === 0 ? (
          <div className="text-center py-8">
            <Filter className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No filter data yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-sm font-medium text-gray-700">Filter</th>
                  <th className="text-left py-2 text-sm font-medium text-gray-700">Value</th>
                  <th className="text-right py-2 text-sm font-medium text-gray-700">Uses</th>
                </tr>
              </thead>
              <tbody>
                {topFilters.map((filter, index) => (
                  <tr key={`${filter.filter_key}-${filter.filter_value}-${index}`} className="border-b border-gray-100">
                    <td className="py-2 text-sm text-gray-900 capitalize">
                      {filter.filter_key.replace('_', ' ')}
                    </td>
                    <td className="py-2 text-sm text-gray-900">{filter.filter_value}</td>
                    <td className="py-2 text-sm text-gray-900 text-right font-medium">{filter.uses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
