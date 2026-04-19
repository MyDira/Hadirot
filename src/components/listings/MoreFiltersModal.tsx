import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import {
  IconSelectGrid,
  RENTAL_PROPERTY_TYPES,
  SALE_PROPERTY_TYPES,
  BUILDING_TYPES,
} from "./IconSelectGrid";
import type { FilterState, SortOption } from "../../hooks/useBrowseFilters";

interface MoreFiltersModalProps {
  isOpen: boolean;
  onClose: () => void;
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  agencies?: string[];
  allNeighborhoods?: string[];
  availableLeaseTerms?: string[];
  listingType?: "rental" | "sale";
  listingTypeFilter?: "all" | "residential" | "commercial";
}

const LEASE_TERM_LABELS: Record<string, string> = {
  long_term_annual: "Long Term / Annual",
  short_term: "Short Term",
  summer_rental: "Summer Rental",
  winter_rental: "Winter Rental",
};

const COMMERCIAL_SPACE_TYPES = [
  { value: "retail", label: "Retail" },
  { value: "restaurant", label: "Restaurant" },
  { value: "office", label: "Office" },
  { value: "warehouse", label: "Warehouse" },
  { value: "industrial", label: "Industrial" },
  { value: "mixed_use", label: "Mixed Use" },
  { value: "community", label: "Community" },
  { value: "basement_commercial", label: "Basement Commercial" },
];

const COMMERCIAL_LEASE_TYPES = [
  { value: "NNN", label: "NNN (Triple Net)" },
  { value: "Gross", label: "Gross" },
  { value: "Modified Gross", label: "Modified Gross" },
  { value: "Full Service", label: "Full Service" },
  { value: "Industrial Gross", label: "Industrial Gross" },
];

const COMMERCIAL_CONDITIONS = [
  { value: "Built Out", label: "Built Out" },
  { value: "Shell", label: "Shell" },
  { value: "2nd Generation", label: "2nd Generation" },
  { value: "Turnkey", label: "Turnkey" },
];

const BUILDING_CLASS_OPTIONS = [
  { value: "A", label: "Class A" },
  { value: "B", label: "Class B" },
  { value: "C", label: "Class C" },
];

function CheckboxGroup({
  header,
  options,
  selected,
  onChange,
}: {
  header: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (updated: string[]) => void;
}) {
  return (
    <div>
      <h3 className="text-base font-semibold text-gray-900 mb-3">{header}</h3>
      <div className="grid grid-cols-2 gap-1">
        {options.map((opt) => {
          const isSelected = selected.includes(opt.value);
          return (
            <label
              key={opt.value}
              className="flex items-center px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => {
                  const updated = isSelected
                    ? selected.filter((v) => v !== opt.value)
                    : [...selected, opt.value];
                  onChange(updated);
                }}
                className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
              />
              <span className="ml-2.5 text-sm text-gray-700">{opt.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function MoreFiltersModal({
  isOpen,
  onClose,
  filters,
  onFiltersChange,
  agencies = [],
  allNeighborhoods = [],
  availableLeaseTerms = [],
  listingType = "rental",
  listingTypeFilter = "all",
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
    setTimeout(() => {
      onFiltersChange(clearedFilters);
      onClose();
    }, 100);
  };

  const propertyTypeOptions =
    listingType === "sale" ? SALE_PROPERTY_TYPES : RENTAL_PROPERTY_TYPES;

  const isCommercial = listingTypeFilter === "commercial";
  const isAll = listingTypeFilter === "all";
  const showResidential = !isCommercial;

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
            {isCommercial && (
              <>
                <CheckboxGroup
                  header="Space Type"
                  options={COMMERCIAL_SPACE_TYPES}
                  selected={localFilters.commercial_space_types || []}
                  onChange={(updated) =>
                    handleLocalFilterChange(
                      "commercial_space_types",
                      updated.length > 0 ? updated : undefined
                    )
                  }
                />

                <div>
                  <h3 className="text-base font-semibold text-gray-900 mb-3">Size Range (SF)</h3>
                  <div className="flex gap-3 items-center">
                    <input
                      type="text"
                      placeholder="Min SF"
                      value={localFilters.min_sf?.toString() || ""}
                      onChange={(e) =>
                        handleLocalFilterChange(
                          "min_sf",
                          e.target.value ? parseInt(e.target.value.replace(/\D/g, "")) : undefined
                        )
                      }
                      className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                    <span className="text-gray-400">–</span>
                    <input
                      type="text"
                      placeholder="Max SF"
                      value={localFilters.max_sf?.toString() || ""}
                      onChange={(e) =>
                        handleLocalFilterChange(
                          "max_sf",
                          e.target.value ? parseInt(e.target.value.replace(/\D/g, "")) : undefined
                        )
                      }
                      className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    />
                  </div>
                </div>

                <CheckboxGroup
                  header="Lease Type"
                  options={COMMERCIAL_LEASE_TYPES}
                  selected={localFilters.commercial_lease_types || []}
                  onChange={(updated) =>
                    handleLocalFilterChange(
                      "commercial_lease_types",
                      updated.length > 0 ? updated : undefined
                    )
                  }
                />

                <CheckboxGroup
                  header="Condition"
                  options={COMMERCIAL_CONDITIONS}
                  selected={localFilters.commercial_conditions || []}
                  onChange={(updated) =>
                    handleLocalFilterChange(
                      "commercial_conditions",
                      updated.length > 0 ? updated : undefined
                    )
                  }
                />

                <CheckboxGroup
                  header="Building Class"
                  options={BUILDING_CLASS_OPTIONS}
                  selected={localFilters.building_classes || []}
                  onChange={(updated) =>
                    handleLocalFilterChange(
                      "building_classes",
                      updated.length > 0 ? updated : undefined
                    )
                  }
                />
              </>
            )}

            {showResidential && !isAll && (
              <>
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
              </>
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

            {!isCommercial && (
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
            )}

            {showResidential && !isAll && listingType === "rental" && availableLeaseTerms.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">
                  Lease Length
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Long Term / Annual excludes short-term and seasonal rentals
                </p>
                <div className="max-h-56 overflow-y-auto border border-gray-200 rounded-xl">
                  {availableLeaseTerms.map((term) => {
                    const isSelected =
                      localFilters.lease_terms?.includes(term) || false;
                    return (
                      <label
                        key={term}
                        className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            const current = localFilters.lease_terms || [];
                            const newLeaseTerms = isSelected
                              ? current.filter((t) => t !== term)
                              : [...current, term];
                            handleLocalFilterChange(
                              "lease_terms",
                              newLeaseTerms.length > 0
                                ? newLeaseTerms
                                : undefined
                            );
                          }}
                          className="h-5 w-5 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                        />
                        <span className="ml-3 text-sm text-gray-700">
                          {LEASE_TERM_LABELS[term] || term}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {showResidential && !isAll && (
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
            )}
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
