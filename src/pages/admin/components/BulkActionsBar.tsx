import React from 'react';
import { X } from 'lucide-react';

export interface BulkAction {
  label: string;
  icon: React.ElementType;
  tone: 'default' | 'danger' | 'success';
  onClick: () => void;
  disabled?: boolean;
}

const TONE_CLASSES = {
  default: 'text-gray-700 hover:bg-gray-100 border-gray-300',
  success: 'text-green-700 hover:bg-green-50 border-green-300',
  danger: 'text-red-700 hover:bg-red-50 border-red-300',
} as const;

export function BulkActionsBar({
  count,
  actions,
  onClear,
}: {
  count: number;
  actions: BulkAction[];
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 px-4 py-2.5 bg-[#4E4B43] rounded-t-lg shadow-sm">
      <span className="text-sm font-medium text-white">
        {count} selected
      </span>
      <div className="flex flex-wrap items-center gap-2 ml-2">
        {actions.map(({ label, icon: Icon, tone, onClick, disabled }) => (
          <button
            key={label}
            onClick={onClick}
            disabled={disabled}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${TONE_CLASSES[tone]}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>
      <button
        onClick={onClear}
        className="ml-auto p-1.5 text-white/70 hover:text-white transition-colors"
        aria-label="Clear selection"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
