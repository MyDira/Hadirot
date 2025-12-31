import React from 'react';

export type DateRange = 7 | 14 | 30;

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const options: DateRange[] = [7, 14, 30];

  return (
    <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
            value === option
              ? 'bg-white text-[#273140] shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {option}d
        </button>
      ))}
    </div>
  );
}
