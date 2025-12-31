import React from 'react';
import { Users, Clock, FileText, TrendingDown } from 'lucide-react';

interface SessionQuality {
  pages_per_session: number;
  bounce_rate: number;
  avg_duration_minutes: number;
  total_sessions: number;
  returning_visitor_rate: number;
}

interface TrafficTabProps {
  sessionQuality: SessionQuality | null;
  sparklineData: number[];
  loading?: boolean;
}

function Sparkline({ data, className = '' }: { data: number[]; className?: string }) {
  if (!data || data.length === 0) {
    return <div className={`h-24 bg-gray-100 rounded ${className}`} />;
  }

  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = 100 - ((value - min) / range) * 100;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className={`w-full ${className}`} viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
}

function MetricCard({
  icon: Icon,
  iconColor,
  label,
  value,
  suffix,
  subtext,
}: {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  value: number | string;
  suffix?: string;
  subtext?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-center mb-3">
        <Icon className={`w-5 h-5 ${iconColor} mr-2`} />
        <span className="text-sm font-medium text-gray-600">{label}</span>
      </div>
      <div className="text-3xl font-bold text-gray-900">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {suffix && <span className="text-lg font-normal text-gray-500 ml-1">{suffix}</span>}
      </div>
      {subtext && <div className="text-sm text-gray-500 mt-1">{subtext}</div>}
    </div>
  );
}

export function TrafficTab({ sessionQuality, sparklineData, loading }: TrafficTabProps) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-24 mb-3"></div>
              <div className="h-10 bg-gray-200 rounded w-20"></div>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const sq = sessionQuality || {
    pages_per_session: 0,
    bounce_rate: 0,
    avg_duration_minutes: 0,
    total_sessions: 0,
    returning_visitor_rate: 0,
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={Users}
          iconColor="text-blue-600"
          label="Total Sessions"
          value={sq.total_sessions}
        />
        <MetricCard
          icon={Users}
          iconColor="text-green-600"
          label="Returning Rate"
          value={sq.returning_visitor_rate}
          suffix="%"
        />
        <MetricCard
          icon={Clock}
          iconColor="text-orange-600"
          label="Avg Duration"
          value={sq.avg_duration_minutes}
          suffix="min"
        />
        <MetricCard
          icon={FileText}
          iconColor="text-teal-600"
          label="Pages / Session"
          value={sq.pages_per_session}
        />
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Active Users</h3>
        <div className="h-32 text-blue-600">
          <Sparkline data={sparklineData} className="h-full" />
        </div>
        {sparklineData.length > 0 && (
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>{sparklineData.length} days ago</span>
            <span>Today</span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center mb-4">
          <TrendingDown className="w-5 h-5 text-red-500 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">Bounce Rate</h3>
        </div>
        <div className="flex items-end gap-4">
          <div className="text-4xl font-bold text-gray-900">
            {sq.bounce_rate}%
          </div>
          <div className="text-sm text-gray-500 pb-1">
            of sessions view only 1 page
          </div>
        </div>
        <div className="mt-4 bg-gray-100 rounded-full h-3 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              sq.bounce_rate > 70 ? 'bg-red-500' : sq.bounce_rate > 50 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(sq.bounce_rate, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
