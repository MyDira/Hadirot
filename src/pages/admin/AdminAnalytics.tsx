import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, BarChart3, Shield } from 'lucide-react';
import { InternalAnalytics } from '@/pages/InternalAnalytics';

export function AdminAnalytics() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <Link
          to="/admin"
          className="inline-flex items-center text-sm text-gray-600 hover:text-[#4E4B43] mb-4"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Admin Panel
        </Link>

        <div className="flex items-center mb-2">
          <Shield className="w-8 h-8 mr-3 text-[#4E4B43]" />
          <h1 className="text-3xl font-bold text-[#4E4B43]">Analytics Dashboard</h1>
        </div>
        <p className="text-gray-600">Track platform performance and user engagement</p>
      </div>

      <div className="mt-8">
        <InternalAnalytics />
      </div>
    </div>
  );
}
