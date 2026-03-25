import React from "react";

interface TriStateToggleProps {
  label: string;
  value: boolean | null;
  onChange: (val: boolean | null) => void;
  disabled?: boolean;
  recommended?: boolean;
}

export function TriStateToggle({
  label,
  value,
  onChange,
  disabled = false,
  recommended = false,
}: TriStateToggleProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
        {label}
        {recommended && (
          <span className="text-xs font-normal text-teal-600 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
            Recommended
          </span>
        )}
      </span>
      <div className="flex rounded-md border border-gray-300 overflow-hidden flex-shrink-0">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(true)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-gray-300 ${
            value === true
              ? "bg-teal-600 text-white"
              : "bg-white text-gray-600 hover:bg-gray-50"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Yes
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(null)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-gray-300 ${
            value === null
              ? "bg-gray-200 text-gray-700"
              : "bg-white text-gray-600 hover:bg-gray-50"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          —
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange(false)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            value === false
              ? "bg-red-100 text-red-700"
              : "bg-white text-gray-600 hover:bg-gray-50"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          No
        </button>
      </div>
    </div>
  );
}
