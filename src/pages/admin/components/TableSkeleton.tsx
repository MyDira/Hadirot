import React from 'react';

export function TableSkeleton({ rows = 8, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="animate-pulse">
      <div className="h-10 bg-gray-100 border-b border-gray-200" />
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 px-4 py-4 border-b border-gray-100"
        >
          {Array.from({ length: cols }, (_, c) => (
            <div
              key={c}
              className="h-3.5 bg-gray-200 rounded"
              style={{ width: `${c === 0 ? 22 : 100 / cols}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
