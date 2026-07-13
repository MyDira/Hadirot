import React from "react";
import {
  Home,
  Building2,
  Building,
  Castle,
  Warehouse,
  Hotel,
  LucideIcon,
} from "lucide-react";

interface IconOption {
  value: string;
  label: string;
  icon: LucideIcon;
}

interface IconSelectGridProps {
  options: IconOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  columns?: 2 | 3 | 4;
  header?: string;
}

export const RENTAL_PROPERTY_TYPES: IconOption[] = [
  { value: "apartment_building", label: "Apartment in Building", icon: Building2 },
  { value: "apartment_house", label: "Apartment in House", icon: Home },
  { value: "full_house", label: "Full House", icon: Castle },
  { value: "duplex", label: "Duplex", icon: Building },
  { value: "basement", label: "Basement", icon: Warehouse },
];

export const SALE_PROPERTY_TYPES: IconOption[] = [
  { value: "single_family", label: "Single-Family", icon: Home },
  { value: "two_family", label: "Two-Family", icon: Building },
  { value: "three_family", label: "Three-Family", icon: Building2 },
  { value: "four_family", label: "Multi-Family", icon: Hotel },
  { value: "condo", label: "Condo", icon: Building2 },
  { value: "co_op", label: "Co-op", icon: Castle },
];

export const BUILDING_TYPES: IconOption[] = [
  { value: "detached", label: "Detached", icon: Home },
  { value: "semi_attached", label: "Semi-Attached", icon: Building },
  { value: "fully_attached", label: "Attached", icon: Building2 },
  { value: "apartment", label: "Apartment", icon: Hotel },
];

export function IconSelectGrid({
  options,
  selected,
  onChange,
  columns = 3,
  header,
}: IconSelectGridProps) {
  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const selectAll = () => {
    onChange(options.map((o) => o.value));
  };

  const clearAll = () => {
    onChange([]);
  };

  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
  };

  return (
    <div>
      {header && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">{header}</h3>
          {selected.length === options.length ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-sm font-medium text-green-600 hover:text-green-700"
            >
              Clear All
            </button>
          ) : (
            <button
              type="button"
              onClick={selectAll}
              className="text-sm font-medium text-green-600 hover:text-green-700"
            >
              Select All
            </button>
          )}
        </div>
      )}
      {!header && (
        <div className="flex items-center justify-end mb-3">
          {selected.length === options.length ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-sm font-medium text-green-600 hover:text-green-700"
            >
              Clear All
            </button>
          ) : (
            <button
              type="button"
              onClick={selectAll}
              className="text-sm font-medium text-green-600 hover:text-green-700"
            >
              Select All
            </button>
          )}
        </div>
      )}
      <div className={`grid ${gridCols[columns]} gap-3`}>
        {options.map((option) => {
          const isSelected = selected.includes(option.value);
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleOption(option.value)}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                isSelected
                  ? "border-green-600 bg-green-50 text-green-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <Icon
                className={`w-7 h-7 mb-2 ${
                  isSelected ? "text-green-600" : "text-gray-400"
                }`}
              />
              <span className="text-sm font-medium text-center leading-tight">
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
