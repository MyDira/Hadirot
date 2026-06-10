import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Home,
  Star,
  Clock,
  BarChart3,
  FileText,
  Mail,
  DollarSign,
  Briefcase,
  Crown,
  ArrowRight,
} from 'lucide-react';
import { useAdminStats } from '../hooks/useAdminStats';

function StatCard({
  icon: Icon,
  title,
  value,
  color,
  bgColor,
  textColor,
  loading,
}: {
  icon: React.ElementType;
  title: string;
  value: number;
  color: string;
  bgColor: string;
  textColor: string;
  loading: boolean;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-6 ${bgColor} border border-white/20 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-widest ${textColor} opacity-70 mb-1`}>
            {title}
          </p>
          {loading ? (
            <div className="h-12 w-20 mt-2 rounded-lg bg-white/50 animate-pulse" />
          ) : (
            <p className={`text-5xl font-bold ${textColor} leading-none mt-2`}>
              {value.toLocaleString()}
            </p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${color} shadow-sm`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
      </div>
      <div className={`absolute -bottom-4 -right-4 w-24 h-24 rounded-full ${color} opacity-10`} />
    </div>
  );
}

export function OverviewSection() {
  const navigate = useNavigate();
  const {
    stats,
    loading,
    rentalDays,
    saleDays,
    setRentalDays,
    setSaleDays,
    saveLifecycle,
    saving,
  } = useAdminStats();

  const tools = [
    { icon: BarChart3, label: 'Analytics Dashboard', desc: 'View platform metrics and insights', iconBg: 'bg-blue-100', iconColor: 'text-blue-600', to: '/admin/analytics' },
    { icon: FileText, label: 'Content Management', desc: 'Manage pages, featured settings, modals', iconBg: 'bg-green-100', iconColor: 'text-green-600', to: '/admin/content-management' },
    { icon: Mail, label: 'Digest Manager', desc: 'Create WhatsApp digest messages', iconBg: 'bg-purple-100', iconColor: 'text-purple-600', to: '/admin/digest' },
    { icon: DollarSign, label: 'Sales System', desc: 'Manage sales listings and commissions', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', to: '/admin/sales' },
    { icon: Briefcase, label: 'Concierge', desc: 'Manage concierge subscriptions', iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', to: '/admin/concierge' },
    { icon: Crown, label: 'Subscriptions', desc: 'Agent/VIP plans + paid listings', iconBg: 'bg-violet-100', iconColor: 'text-violet-600', to: '/admin/subscriptions' },
    { icon: Home, label: 'Old Listing Form', desc: 'Classic listing form (pre-wizard)', iconBg: 'bg-gray-100', iconColor: 'text-gray-600', to: '/post-old' },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <StatCard
          icon={Users}
          title="Total Users"
          value={stats.totalUsers}
          color="bg-blue-500"
          bgColor="bg-blue-50"
          textColor="text-blue-900"
          loading={loading}
        />
        <StatCard
          icon={Home}
          title="Active Listings"
          value={stats.totalListings}
          color="bg-emerald-500"
          bgColor="bg-emerald-50"
          textColor="text-emerald-900"
          loading={loading}
        />
        <StatCard
          icon={Star}
          title="Featured Listings"
          value={stats.featuredListings}
          color="bg-amber-500"
          bgColor="bg-amber-50"
          textColor="text-amber-900"
          loading={loading}
        />
        <div className="relative overflow-hidden rounded-2xl p-6 bg-slate-50 border border-white/20 shadow-sm">
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1">
                Listing Duration
              </p>
              <p className="text-sm font-medium text-slate-700">Auto-deactivation days</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-600 shadow-sm">
              <Clock className="w-5 h-5 text-white" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-500 w-12 shrink-0">Rentals</span>
              <input
                type="number"
                min="7"
                max="365"
                value={rentalDays}
                onChange={(e) => setRentalDays(parseInt(e.target.value) || 30)}
                className="w-20 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-[#4E4B43] focus:border-[#4E4B43] bg-white"
              />
              <span className="text-xs text-slate-400">days</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-500 w-12 shrink-0">Sales</span>
              <input
                type="number"
                min="7"
                max="365"
                value={saleDays}
                onChange={(e) => setSaleDays(parseInt(e.target.value) || 30)}
                className="w-20 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-[#4E4B43] focus:border-[#4E4B43] bg-white"
              />
              <span className="text-xs text-slate-400">days</span>
            </div>
            <button
              onClick={saveLifecycle}
              disabled={saving}
              className="w-full mt-1 px-4 py-2 bg-[#4E4B43] text-white rounded-xl hover:bg-[#3d3a35] disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {saving ? 'Saving…' : 'Save Duration'}
            </button>
            <p className="text-xs text-slate-400 italic leading-tight">
              Takes effect on next automated check (daily, 12:00 AM GMT)
            </p>
          </div>
          <div className="absolute -bottom-4 -right-4 w-24 h-24 rounded-full bg-slate-400 opacity-10" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-5">
          Admin Tools
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {tools.map(({ icon: ToolIcon, label, desc, iconBg, iconColor, to }) => (
            <button
              key={label}
              onClick={() => navigate(to)}
              className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 hover:border-[#4E4B43] hover:bg-gray-50 transition-all group text-left"
            >
              <div className={`p-2.5 rounded-xl ${iconBg} shrink-0`}>
                <ToolIcon className={`w-5 h-5 ${iconColor}`} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900">{label}</p>
                <p className="text-xs text-gray-500 truncate">{desc}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#4E4B43] ml-auto shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
