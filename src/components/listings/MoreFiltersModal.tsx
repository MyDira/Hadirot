import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import {
  IconSelectGrid,
  RENTAL_PROPERTY_TYPES,
  SALE_PROPERTY_TYPES,
  BUILDING_TYPES,
} from "./IconSelectGrid";

export type SortOption =
  | "newest"
  | "oldest"
  | "price_asc"
  | "price_desc"
  | "bedrooms_asc"
  | "bedrooms_desc"
  | "bathrooms_asc"
  | "bathrooms_desc";

interface FilterState {
  bedrooms?: number[];
  poster_type?: string;
  agency_name?: string;
  property_type?: string;
  property_types?: string[];
  building_types?: string[];
  min_price?: number;
  max_price?: number;
  parking_included?: boolean;
  no_fee_only?: boolean;
  neighborhoods?: string[];
  sort?: SortOption;
}

interface MoreFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  agencies?: string[];
  allNeighborhoods?: string[];
  listingType?: "rental" | "sale";
}

export function MoreFiltersModal({
  isOpen,
  onClose,
  filters,
  onFiltersChange,
  agencies = [],
  allNeighborhoods = [],
  listingType = "rental",
}: MoreFiltersModalProps) {
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);

  useEffect(() => {
    setLocalFilters(filters);
  }, [filters]);

  if (!isOpen) return null;

  const handleLocalFilterChange = (key: keyof FilterState, value: any) => {
    setLocalFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApply = () => {
    onFiltersChange(localFilters);
    onClose();
  };

  const handleClear = () => {
    const clearedFilters: FilterState = {
      bedrooms: filters.bedrooms,
      min_price: filters.min_price,
      max_price: filters.max_price,
    };
    setLocalFilters(clearedFilters);
    // Add brief delay for visual feedback
    setTimeout(() => {
      onFiltersChange(clearedFilters);
      onClose();
    }, 100);
  };

  const propertyTypeOptions =
    listingType === "sale" ? SALE_PROPERTY_TYPES : RENTAL_PROPERTY_TYPES;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-2xl max-h-[85vh] bg-white rounded-2xl shadow-2xl z-50 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">All Filters</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-8">
            <div>
              <IconSelectGrid
                header="Property Type"
                options={propertyTypeOptions}
                selected={localFilters.property_types || []}
                onChange={(selected) =>
                  handleLocalFilterChange(
                    "property_types",
                    selected.length > 0 ? selected : undefined
                  )
                }
                columns={3}
              />
            </div>

            {listingType === "sale" && (
              <div>
                <IconSelectGrid
                  header="Building Type"
                  options={BUILDING_TYPES}
                  selected={localFilters.building_types || []}
                  onChange={(selected) =>
                    handleLocalFilterChange(
                      "building_types",
                      selected.length > 0 ? selected : undefined
                    )
                  }
                  columns={4}
                />
              </div>
            )}

            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                Neighborhoods
              </h3>
              <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-xl">
                {allNeighborhoods.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500">
                    No neighborhoods available
                  </div>
                ) : (
                  allNeighborhoods.map((neighborhood) => {
                    const isSelected =
                      localFilters.neighborhoods?.includes(neighborhood) ||
                      false;
                    return (
                      <label
                        key={neighborhood}
                        className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const current = localFilters.neighborhoods || [];
                            const newNeighborhoods = isSelected
                              ? current.filter((n) => n !== neighborhood)
                              : [...current, neighborhood];
                            handleLocalFilterChange(
                              "neighborhoods",
                              newNeighborhoods.length > 0
                                ? newNeighborhoods
                                : undefined
                            );
                          }}
                          className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">
                          {neighborhood}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                Listed By
              </h3>
              <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-xl">
                <label className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                  <input
                    type="radio"
                    checked={!localFilters.poster_type}
                    onChange={() => {
                      setLocalFilters({
                        ...localFilters,
                        poster_type: undefined,
                        agency_name: undefined,
                      });
                    }}
                    className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300"
                  />
                  <span className="ml-3 text-sm text-gray-700">All Posters</span>
                </label>
                <label className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                  <input
                    type="radio"
                    checked={localFilters.poster_type === "owner"}
                    onChange={() => {
                      setLocalFilters({
                        ...localFilters,
                        poster_type: "owner",
                        agency_name: undefined,
                      });
                    }}
                    className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300"
                  />
                  <span className="ml-3 text-sm text-gray-700">By Owner</span>
                </label>
                <label className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                  <input
                    type="radio"
                    checked={localFilters.poster_type === "agent" && !localFilters.agency_name}
                    onChange={() => {
                      setLocalFilters({
                        ...localFilters,
                        poster_type: "agent",
                        agency_name: undefined,
                      });
                    }}
                    className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300"
                  />
                  <span className="ml-3 text-sm text-gray-700">By Agency (All)</span>
                </label>
                {agencies.length > 0 &&
                  agencies.map((agency) => (
                    <label
                      key={agency}
                      className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    >
                      <input
                        type="radio"
                        checked={
                          localFilters.poster_type === "agent" &&
                          localFilters.agency_name === agency
                        }
                        onChange={() => {
                          setLocalFilters({
                            ...localFilters,
                            poster_type: "agent",
                            agency_name: agency,
                          });
                        }}
                        className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300"
                      />
                      <span className="ml-3 text-sm text-gray-700">{agency}</span>
                    </label>
                  ))}
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                More Options
              </h3>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    handleLocalFilterChange(
                      "parking_included",
                      !localFilters.parking_included
                    )
                  }
                  className={`px-5 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                    localFilters.parking_included
                      ? "border-green-600 bg-green-50 text-green-700"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                  }`}
                >
                  Parking Included
                </button>
                {listingType === "rental" && (
                  <button
                    type="button"
                    onClick={() =>
                      handleLocalFilterChange(
                        "no_fee_only",
                        !localFilters.no_fee_only
                      )
                    }
                    className={`px-5 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                      localFilters.no_fee_only
                        ? "border-green-600 bg-green-50 text-green-700"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    No Fee Only
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 border-t border-gray-100 flex items-center gap-4 bg-gray-50">
          <button
            onClick={handleClear}
            className="text-green-600 hover:text-green-700 font-medium text-sm"
          >
            Clear
          </button>
          <div className="flex-1" />
          <button
            onClick={handleApply}
            className="px-8 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
