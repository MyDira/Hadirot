import React from 'react';
import { Users, RefreshCw, Home, MessageSquare, TrendingUp, TrendingDown } from 'lucide-react';

interface SnapshotData {
  uniqueVisitors: number;
  uniqueVisitorsPrev: number;
  returningRate: number;
  returningRatePrev: number;
  activeListings: number;
  inquiries: number;
  inquiriesPrev: number;
}

interface GlobalSnapshotProps {
  data: SnapshotData;
  loading?: boolean;
}

function formatChange(current: number, previous: number): { value: string; isPositive: boolean } {
  if (previous === 0) return { value: '+0%', isPositive: true };
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return {
    value: `${sign}${Math.round(change)}%`,
    isPositive: change >= 0,
  };
}

function SnapshotCard({
  icon: Icon,
  iconColor,
  label,
  value,
  change,
  suffix,
}: {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  value: number | string;
  change?: { value: string; isPositive: boolean } | null;
  suffix?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center">
          <Icon className={`w-4 h-4 ${iconColor} mr-2`} />
          <span className="text-xs font-medium text-gray-600">{label}</span>
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div className="text-2xl font-bold text-gray-900">
          {typeof value === 'number' ? value.toLocaleString() : value}
          {suffix && <span className="text-sm font-normal text-gray-500 ml-1">{suffix}</span>}
        </div>
        {change && (
          <div className={`flex items-center text-xs font-medium ${change.isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {change.isPositive ? (
              <TrendingUp className="w-3 h-3 mr-0.5" />
            ) : (
              <TrendingDown className="w-3 h-3 mr-0.5" />
            )}
            {change.value}
          </div>
        )}
      </div>
    </div>
  );
}

export function GlobalSnapshot({ data, loading }: GlobalSnapshotProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-24 mb-3"></div>
            <div className="h-8 bg-gray-200 rounded w-16"></div>
          </div>
        ))}
      </div>
    );
  }

  const visitorChange = formatChange(data.uniqueVisitors, data.uniqueVisitorsPrev);
  const returningChange = formatChange(data.returningRate, data.returningRatePrev);
  const inquiryChange = formatChange(data.inquiries, data.inquiriesPrev);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <SnapshotCard
        icon={Users}
        iconColor="text-blue-600"
        label="Unique Visitors"
        value={data.uniqueVisitors}
        change={visitorChange}
      />
      <SnapshotCard
        icon={RefreshCw}
        iconColor="text-green-600"
        label="Returning Rate"
        value={data.returningRate}
        suffix="%"
        change={returningChange}
      />
      <SnapshotCard
        icon={Home}
        iconColor="text-orange-600"
        label="Active Listings"
        value={data.activeListings}
        change={null}
      />
      <SnapshotCard
        icon={MessageSquare}
        iconColor="text-teal-600"
        label="Inquiries"
        value={data.inquiries}
        change={inquiryChange}
      />
    </div>
  );
}
