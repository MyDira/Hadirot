import React, { useState, useEffect } from "react";
import {
  X,
  Home,
  Building2,
  CalendarClock,
  Sparkles,
  Car,
  BadgePercent,
  MapPin,
  Users,
  Check,
  LucideIcon,
} from "lucide-react";
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

// Values MUST match the DB enums written by the posting wizard
// (src/pages/postListingWizard/steps/commercial). Do not use display labels as
// values — the service filters with a case-sensitive `.in()`, so a label like
// "NNN" or "Retail" would never match the stored "nnn" / "storefront".
const COMMERCIAL_SPACE_TYPES = [
  { value: "storefront", label: "Retail" },
  { value: "restaurant", label: "Restaurant" },
  { value: "office", label: "Office" },
  { value: "warehouse", label: "Warehouse" },
  { value: "industrial", label: "Industrial" },
  { value: "mixed_use", label: "Mixed Use" },
  { value: "community_facility", label: "Community" },
  { value: "basement_commercial", label: "Basement Commercial" },
];

const COMMERCIAL_LEASE_TYPES = [
  { value: "nnn", label: "NNN (Triple Net)" },
  { value: "gross", label: "Gross" },
  { value: "modified_gross", label: "Modified Gross" },
  { value: "full_service", label: "Full Service" },
  { value: "industrial_gross", label: "Industrial Gross" },
  { value: "percentage", label: "Percentage" },
  { value: "absolute_net", label: "Absolute Net" },
  { value: "tenant_electric", label: "Tenant Electric" },
];

const COMMERCIAL_CONDITIONS = [
  { value: "full_build_out", label: "Built Out" },
  { value: "shell", label: "Shell" },
  { value: "second_generation", label: "2nd Generation" },
  { value: "turnkey", label: "Turnkey" },
  { value: "vanilla_box", label: "Vanilla Box" },
  { value: "cold_dark_shell", label: "Cold Dark Shell" },
];

const BUILDING_CLASS_OPTIONS = [
  { value: "a", label: "Class A" },
  { value: "b", label: "Class B" },
  { value: "c", label: "Class C" },
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

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-600">
            <Icon className="w-4 h-4" />
          </span>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        </div>
        {action}
      </div>
      {subtitle && (
        <p className="mt-2 text-xs text-gray-500 pl-[42px]">{subtitle}</p>
      )}
    </div>
  );
}

function FeatureToggle({
  icon: Icon,
  label,
  description,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
        active
          ? "border-green-600 bg-green-50"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
          active ? "bg-green-600 text-white" : "bg-gray-100 text-gray-400"
        }`}
      >
        <Icon className="w-5 h-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={`block text-sm font-semibold ${
            active ? "text-green-700" : "text-gray-900"
          }`}
        >
          {label}
        </span>
        {description && (
          <span className="block text-xs text-gray-500 mt-0.5">
            {description}
          </span>
        )}
      </span>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          active
            ? "border-green-600 bg-green-600 text-white"
            : "border-gray-300"
        }`}
      >
        {active && <Check className="w-3 h-3" strokeWidth={3} />}
      </span>
    </button>
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

            {showResidential && (
              <>
                <IconSelectGrid
                  header="Property Type"
                  headerIcon={Home}
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

                {listingType === "sale" && (
                  <IconSelectGrid
                    header="Building Type"
                    headerIcon={Building2}
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
                )}

                {listingType === "rental" &&
                  availableLeaseTerms.length > 0 && (
                    <div>
                      <SectionHeader
                        icon={CalendarClock}
                        title="Lease Length"
                        subtitle="Long Term / Annual excludes short-term and seasonal rentals"
                      />
                      <div className="flex flex-wrap gap-2.5">
                        {availableLeaseTerms.map((term) => {
                          const isSelected =
                            localFilters.lease_terms?.includes(term) || false;
                          return (
                            <button
                              key={term}
                              type="button"
                              onClick={() => {
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
                              className={`px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                                isSelected
                                  ? "border-green-600 bg-green-50 text-green-700"
                                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                              }`}
                            >
                              {LEASE_TERM_LABELS[term] || term}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                <div>
                  <SectionHeader icon={Sparkles} title="Features" />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FeatureToggle
                      icon={Car}
                      label="Parking Included"
                      description="On-site or included parking"
                      active={!!localFilters.parking_included}
                      onClick={() =>
                        handleLocalFilterChange(
                          "parking_included",
                          !localFilters.parking_included
                        )
                      }
                    />
                    {listingType === "rental" && (
                      <FeatureToggle
                        icon={BadgePercent}
                        label="No Fee Only"
                        description="Hide broker-fee listings"
                        active={!!localFilters.no_fee_only}
                        onClick={() =>
                          handleLocalFilterChange(
                            "no_fee_only",
                            !localFilters.no_fee_only
                          )
                        }
                      />
                    )}
                  </div>
                </div>
              </>
            )}

            <div>
              <SectionHeader icon={MapPin} title="Neighborhoods" />
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
                <SectionHeader icon={Users} title="Listed By" />
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
