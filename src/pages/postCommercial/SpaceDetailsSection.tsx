import React, { useState } from "react";
import { TriStateToggle } from "./TriStateToggle";
import { TYPE_SPECIFIC_FIELDS, type TypeSpecificField } from "./typeFieldConfigs";
import type { CommercialListingFormData } from "./commercialTypes";
import type { CommercialSpaceType } from "../../config/supabase";

const FLOOR_LEVEL_OPTIONS = [
  { value: "ground", label: "Ground" },
  { value: "basement", label: "Basement" },
  { value: "mezzanine", label: "Mezzanine" },
  { value: "2nd_floor", label: "2nd Floor" },
  { value: "3rd_floor", label: "3rd Floor" },
  { value: "4th_floor", label: "4th Floor" },
  { value: "5th_plus", label: "5th Floor+" },
  { value: "full_building", label: "Full Building" },
];

const BUILD_OUT_OPTIONS = [
  { value: "full_build_out", label: "Full Build-Out" },
  { value: "turnkey", label: "Turnkey / Move-in Ready" },
  { value: "second_generation", label: "Second Generation" },
  { value: "vanilla_box", label: "Vanilla Box / White Box" },
  { value: "shell", label: "Shell" },
  { value: "cold_dark_shell", label: "Cold Dark Shell" },
];

const AVAILABLE_DATE_OPTIONS = [
  { value: "now", label: "Now" },
  { value: "30_days", label: "30 Days" },
  { value: "60_days", label: "60 Days" },
  { value: "90_days", label: "90 Days" },
  { value: "specific", label: "Specific Date" },
];

interface SpaceDetailsSectionProps {
  formData: CommercialListingFormData;
  selectedType: CommercialSpaceType;
  onFormChange: (updates: Partial<CommercialListingFormData>) => void;
  errors: Partial<Record<string, string>>;
}

export function SpaceDetailsSection({
  formData,
  selectedType,
  onFormChange,
  errors,
}: SpaceDetailsSectionProps) {
  const [availableDateMode, setAvailableDateMode] = useState<string>(
    formData.available_date && !["now", "30_days", "60_days", "90_days"].includes(formData.available_date)
      ? "specific"
      : formData.available_date || ""
  );

  const typeFields: TypeSpecificField[] = TYPE_SPECIFIC_FIELDS[selectedType] || [];

  const handleAvailableDateSelect = (value: string) => {
    setAvailableDateMode(value);
    if (value !== "specific") {
      onFormChange({ available_date: value });
    } else {
      onFormChange({ available_date: "" });
    }
  };

  const renderTypeSpecificField = (field: TypeSpecificField) => {
    const key = field.key as keyof CommercialListingFormData;

    if (field.type === "toggle") {
      const val = formData[key];
      const typedVal: boolean | null =
        val === true ? true : val === false ? false : null;
      return (
        <div key={field.key}>
          <TriStateToggle
            label={field.label}
            value={typedVal}
            onChange={(v) => onFormChange({ [field.key]: v })}
            recommended={field.recommended}
          />
        </div>
      );
    }

    if (field.type === "number") {
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
            {field.label}
            {field.unit && (
              <span className="text-xs font-normal text-gray-400">({field.unit})</span>
            )}
            {field.recommended && (
              <span className="text-xs font-normal text-teal-600 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
                Recommended
              </span>
            )}
          </label>
          <input
            type="number"
            min={0}
            value={(formData[key] as number | null) ?? ""}
            onChange={(e) =>
              onFormChange({ [field.key]: e.target.value ? Number(e.target.value) : null })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>
      );
    }

    if (field.type === "text") {
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
            {field.label}
            {field.recommended && (
              <span className="text-xs font-normal text-teal-600 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
                Recommended
              </span>
            )}
          </label>
          <input
            type="text"
            value={(formData[key] as string) || ""}
            onChange={(e) => onFormChange({ [field.key]: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>
      );
    }

    if (field.type === "textarea") {
      return (
        <div key={field.key} className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
            {field.label}
            {field.recommended && (
              <span className="text-xs font-normal text-teal-600 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
                Recommended
              </span>
            )}
          </label>
          <textarea
            value={(formData[key] as string) || ""}
            onChange={(e) => onFormChange({ [field.key]: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm resize-none"
          />
        </div>
      );
    }

    if (field.type === "select") {
      return (
        <div key={field.key}>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1.5">
            {field.label}
            {field.recommended && (
              <span className="text-xs font-normal text-teal-600 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded">
                Recommended
              </span>
            )}
          </label>
          <select
            value={(formData[key] as string) || ""}
            onChange={(e) => onFormChange({ [field.key]: e.target.value || null })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          >
            <option value="">Select...</option>
            {field.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      );
    }

    return null;
  };

  const toggleFields = typeFields.filter((f) => f.type === "toggle");
  const otherFields = typeFields.filter((f) => f.type !== "toggle");

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-5">Space Details</h2>

      {/* Universal space fields */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Available SF <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min={0}
              value={formData.available_sf ?? ""}
              onChange={(e) =>
                onFormChange({ available_sf: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="e.g. 1500"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
            />
            {errors.available_sf && (
              <p className="text-xs text-red-600 mt-1">{errors.available_sf}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Floor Level</label>
            <select
              value={formData.floor_level || ""}
              onChange={(e) => onFormChange({ floor_level: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
            >
              <option value="">Select...</option>
              {FLOOR_LEVEL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Ceiling Height
              <span className="ml-1 text-xs font-normal text-gray-400">(ft)</span>
            </label>
            <input
              type="number"
              min={0}
              value={formData.ceiling_height_ft ?? ""}
              onChange={(e) =>
                onFormChange({ ceiling_height_ft: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="e.g. 14"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Build-Out Condition</label>
            <select
              value={formData.build_out_condition || ""}
              onChange={(e) =>
                onFormChange({ build_out_condition: (e.target.value as any) || null })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
            >
              <option value="">Select...</option>
              {BUILD_OUT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Available Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Available Date</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {AVAILABLE_DATE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleAvailableDateSelect(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  availableDateMode === opt.value
                    ? "bg-teal-600 border-teal-600 text-white"
                    : "bg-white border-gray-300 text-gray-600 hover:border-teal-400"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {availableDateMode === "specific" && (
            <input
              type="date"
              value={formData.available_date && !["now", "30_days", "60_days", "90_days"].includes(formData.available_date) ? formData.available_date : ""}
              onChange={(e) => onFormChange({ available_date: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
            />
          )}
        </div>
      </div>

      {/* Type-specific additional fields */}
      {typeFields.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-100">
          <h3 className="text-base font-semibold text-gray-800 mb-4">
            Additional Space Details
          </h3>

          {otherFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              {otherFields.map((field) => renderTypeSpecificField(field))}
            </div>
          )}

          {toggleFields.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Features & Amenities</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                {toggleFields.map((field) => renderTypeSpecificField(field))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
