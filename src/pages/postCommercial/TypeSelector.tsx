import React from "react";
import {
  Store,
  UtensilsCrossed,
  Briefcase,
  Warehouse,
  Factory,
  Building2,
  Users,
  ArrowDownToLine,
} from "lucide-react";
import type { CommercialSpaceType, CommercialSubtype } from "../../config/supabase";
import { SPACE_TYPE_SUBTYPES, type SubtypeOption } from "./typeFieldConfigs";

interface SpaceTypeOption {
  value: CommercialSpaceType;
  label: string;
  icon: React.ReactNode;
}

const SPACE_TYPES: SpaceTypeOption[] = [
  { value: "storefront", label: "Retail / Storefront", icon: <Store className="w-6 h-6" /> },
  { value: "restaurant", label: "Restaurant", icon: <UtensilsCrossed className="w-6 h-6" /> },
  { value: "office", label: "Office", icon: <Briefcase className="w-6 h-6" /> },
  { value: "warehouse", label: "Warehouse", icon: <Warehouse className="w-6 h-6" /> },
  { value: "industrial", label: "Industrial", icon: <Factory className="w-6 h-6" /> },
  { value: "mixed_use", label: "Mixed Use", icon: <Building2 className="w-6 h-6" /> },
  { value: "community_facility", label: "Community Facility", icon: <Users className="w-6 h-6" /> },
  { value: "basement_commercial", label: "Basement Commercial", icon: <ArrowDownToLine className="w-6 h-6" /> },
];

interface TypeSelectorProps {
  selectedType: CommercialSpaceType | "";
  selectedSubtype: CommercialSubtype | null;
  onTypeChange: (type: CommercialSpaceType) => void;
  onSubtypeChange: (subtype: CommercialSubtype | null) => void;
}

export function TypeSelector({
  selectedType,
  selectedSubtype,
  onTypeChange,
  onSubtypeChange,
}: TypeSelectorProps) {
  const subtypeOptions: SubtypeOption[] | undefined =
    selectedType ? SPACE_TYPE_SUBTYPES[selectedType as CommercialSpaceType] : undefined;

  const handleSubtypePill = (option: SubtypeOption) => {
    if (option.value === "__default__") {
      onSubtypeChange(null);
    } else {
      onSubtypeChange(option.value as CommercialSubtype);
    }
  };

  const isSubtypeSelected = (option: SubtypeOption): boolean => {
    if (option.value === "__default__") return selectedSubtype === null;
    return selectedSubtype === option.value;
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="mb-2">
        <h2 className="text-xl font-semibold text-gray-900">Space Type</h2>
        <p className="text-sm text-gray-500 mt-0.5">Select the type of commercial space you are listing</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        {SPACE_TYPES.map((opt) => {
          const isSelected = selectedType === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onTypeChange(opt.value)}
              className={`flex flex-col items-center gap-2.5 p-4 rounded-lg border-2 text-center transition-all ${
                isSelected
                  ? "border-teal-600 bg-teal-50 text-teal-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
              }`}
            >
              <span className={isSelected ? "text-teal-600" : "text-gray-400"}>
                {opt.icon}
              </span>
              <span className="text-xs font-medium leading-tight">{opt.label}</span>
            </button>
          );
        })}
      </div>

      {subtypeOptions && subtypeOptions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-2.5 uppercase tracking-wide">Subtype</p>
          <div className="flex flex-wrap gap-2">
            {subtypeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSubtypePill(option)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  isSubtypeSelected(option)
                    ? "bg-teal-600 border-teal-600 text-white"
                    : "bg-white border-gray-300 text-gray-600 hover:border-teal-400 hover:text-teal-700"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
