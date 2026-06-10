import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

interface SortableHeaderProps<F extends string> {
  label: string;
  field: F;
  sort: string;
  dir: 'asc' | 'desc';
  onSort: (field: F) => void;
  className?: string;
}

export function SortableHeader<F extends string>({
  label,
  field,
  sort,
  dir,
  onSort,
  className = '',
}: SortableHeaderProps<F>) {
  const isActive = sort === field;
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider ${className}`}
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        onClick={() => onSort(field)}
        className={`group inline-flex items-center gap-1 select-none transition-colors hover:text-gray-800 ${
          isActive ? 'text-gray-800' : ''
        }`}
      >
        <span>{label}</span>
        {isActive ? (
          dir === 'asc' ? (
            <ArrowUp className="w-3.5 h-3.5" />
          ) : (
            <ArrowDown className="w-3.5 h-3.5" />
          )
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50 transition-opacity" />
        )}
      </button>
    </th>
  );
}
