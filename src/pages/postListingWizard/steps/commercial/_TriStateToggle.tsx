import React from 'react';

interface Props {
  label: string;
  value: boolean | null;
  onChange: (val: boolean | null) => void;
  recommended?: boolean;
}

export function WizardTriStateToggle({ label, value, onChange, recommended }: Props) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
        {label}
        {recommended && (
          <span className="text-xs font-normal text-accent-700 bg-accent-50 border border-accent-200 px-1.5 py-0.5 rounded">
            Recommended
          </span>
        )}
      </span>
      <div className="flex rounded-md border border-gray-300 overflow-hidden flex-shrink-0">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-gray-300 ${
            value === true
              ? 'bg-accent-500 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-gray-300 ${
            value === null ? 'bg-gray-200 text-gray-700' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          —
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            value === false ? 'bg-red-100 text-red-700' : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          No
        </button>
      </div>
    </div>
  );
}
