import React from 'react';
import { SaleStatus } from '../../config/supabase';

interface SaleStatusSelectorProps {
  currentStatus: SaleStatus | null | undefined;
  listingId: string;
  onStatusChange: (listingId: string, newStatus: SaleStatus) => void;
  disabled?: boolean;
}

const STATUS_OPTIONS: { value: SaleStatus; label: string; color: string }[] = [
  { value: 'available', label: 'Available', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { value: 'pending', label: 'Pending', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { value: 'in_contract', label: 'In Contract', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'sold', label: 'Sold', color: 'bg-gray-100 text-gray-800 border-gray-200' },
];

export function SaleStatusSelector({
  currentStatus,
  listingId,
  onStatusChange,
  disabled = false,
}: SaleStatusSelectorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value as SaleStatus;
    if (newStatus !== currentStatus) {
      onStatusChange(listingId, newStatus);
    }
  };

  const currentOption = STATUS_OPTIONS.find(opt => opt.value === (currentStatus || 'available'));
  const colorClass = currentOption?.color || STATUS_OPTIONS[0].color;

  return (
    <select
      value={currentStatus || 'available'}
      onChange={handleChange}
      disabled={disabled}
      className={`px-2 py-1 text-xs rounded border font-medium transition-colors ${colorClass} ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'
      }`}
      title="Change sale status"
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
