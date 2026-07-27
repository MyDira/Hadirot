import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TablePaginationProps {
  page: number;
  totalPages: number;
  total: number;
  shownFrom: number;
  shownTo: number;
  onPage: (page: number) => void;
  noun: string;
}

export function TablePagination({
  page,
  totalPages,
  total,
  shownFrom,
  shownTo,
  onPage,
  noun,
}: TablePaginationProps) {
  if (total === 0) return null;

  const pageNumbers = Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
    if (totalPages <= 5) return i + 1;
    if (page <= 3) return i + 1;
    if (page >= totalPages - 2) return totalPages - 4 + i;
    return page - 2 + i;
  });

  return (
    <div className="px-4 sm:px-6 py-3 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <p className="text-sm text-gray-600">
        Showing <span className="font-medium text-gray-900">{shownFrom}</span> to{' '}
        <span className="font-medium text-gray-900">{shownTo}</span> of{' '}
        <span className="font-medium text-gray-900">{total.toLocaleString()}</span> {noun}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPage(page - 1)}
            disabled={page === 1}
            className="p-2 text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {pageNumbers.map((pageNum) => (
            <button
              key={pageNum}
              onClick={() => onPage(pageNum)}
              className={`min-w-[36px] px-2 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                page === pageNum
                  ? 'bg-[#4E4B43] text-white'
                  : 'text-gray-600 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {pageNum}
            </button>
          ))}
          {totalPages > 5 && page < totalPages - 2 && (
            <>
              <span className="px-1 text-gray-400">…</span>
              <button
                onClick={() => onPage(totalPages)}
                className="min-w-[36px] px-2 py-1.5 text-sm font-medium rounded-lg text-gray-600 border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                {totalPages}
              </button>
            </>
          )}
          <button
            onClick={() => onPage(page + 1)}
            disabled={page === totalPages}
            className="p-2 text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
