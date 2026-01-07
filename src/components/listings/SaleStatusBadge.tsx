import React from 'react';
import { SaleStatus } from '../../config/supabase';

interface SaleStatusBadgeProps {
  status: SaleStatus;
  size?: 'sm' | 'md';
  showAvailable?: boolean;
}

const statusConfig: Record<SaleStatus, { label: string; className: string }> = {
  available: {
    label: 'Available',
    className: 'bg-gray-100 text-gray-700',
  },
  pending: {
    label: 'Pending',
    className: 'bg-amber-100 text-amber-800',
  },
  in_contract: {
    label: 'In Contract',
    className: 'bg-brand-100 text-brand-800',
  },
  sold: {
    label: 'Sold',
    className: 'bg-emerald-100 text-emerald-800',
  },
};

export function SaleStatusBadge({ status, size = 'md', showAvailable = false }: SaleStatusBadgeProps) {
  if (status === 'available' && !showAvailable) {
    return null;
  }

  const config = statusConfig[status];
  if (!config) return null;

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span className={`inline-flex items-center rounded-full font-medium whitespace-nowrap ${sizeClasses} ${config.className}`}>
      {config.label}
    </span>
  );
}
