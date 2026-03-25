import React, { useState, useEffect } from "react";
import { TriStateToggle } from "./TriStateToggle";
import type { CommercialListingFormData } from "../postListing/commercialTypes";

const CONSTRUCTION_TYPE_OPTIONS = [
  { value: "steel_frame", label: "Steel Frame" },
  { value: "concrete", label: "Concrete" },
  { value: "wood_frame", label: "Wood Frame" },
  { value: "masonry_brick", label: "Masonry / Brick" },
  { value: "pre_engineered_metal", label: "Pre-engineered Metal" },
];

const PARKING_TYPE_OPTIONS = [
  { value: "surface_lot", label: "Surface Lot" },
  { value: "garage", label: "Garage" },
  { value: "street", label: "Street" },
  { value: "valet", label: "Valet" },
  { value: "none", label: "None" },
];

const HVAC_TYPE_OPTIONS = [
  { value: "central", label: "Central" },
  { value: "split_system", label: "Split System" },
  { value: "rooftop_package", label: "Rooftop Package" },
  { value: "none", label: "None" },
  { value: "other", label: "Other" },
];

interface BuildingDetailsSectionProps {
  formData: CommercialListingFormData;
  onFormChange: (updates: Partial<CommercialListingFormData>) => void;
}

export function BuildingDetailsSection({
  formData,
  onFormChange,
}: BuildingDetailsSectionProps) {
  const [showElevatorCount, setShowElevatorCount] = useState<boolean | null>(
    formData.elevator_count != null && formData.elevator_count > 0 ? true : null
  );
  const [showFreightCount, setShowFreightCount] = useState<boolean | null>(
    formData.freight_elevator_count != null && formData.freight_elevator_count > 0 ? true : null
  );

  useEffect(() => {
    if (showElevatorCount !== true) {
      onFormChange({ elevator_count: null });
    }
  }, [showElevatorCount]);

  useEffect(() => {
    if (showFreightCount !== true) {
      onFormChange({ freight_elevator_count: null });
    }
  }, [showFreightCount]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Building Details</h2>
      <p className="text-sm text-gray-500 mb-5">Information about the overall building</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Total Building SF
          </label>
          <input
            type="number"
            min={0}
            value={formData.total_building_sf ?? ""}
            onChange={(e) =>
              onFormChange({ total_building_sf: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="e.g. 25000"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Year Built</label>
          <input
            type="number"
            min={1800}
            max={new Date().getFullYear()}
            value={formData.year_built ?? ""}
            onChange={(e) =>
              onFormChange({ year_built: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="e.g. 1985"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Year Renovated</label>
          <input
            type="number"
            min={1800}
            max={new Date().getFullYear()}
            value={formData.year_renovated ?? ""}
            onChange={(e) =>
              onFormChange({ year_renovated: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="e.g. 2020"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Number of Floors</label>
          <input
            type="number"
            min={0}
            value={formData.number_of_floors ?? ""}
            onChange={(e) =>
              onFormChange({ number_of_floors: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="e.g. 3"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Construction Type</label>
          <select
            value={formData.construction_type || ""}
            onChange={(e) => onFormChange({ construction_type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          >
            <option value="">Select...</option>
            {CONSTRUCTION_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Zoning Code</label>
          <input
            type="text"
            value={formData.zoning_code || ""}
            onChange={(e) => onFormChange({ zoning_code: e.target.value })}
            placeholder="e.g. C4-2A"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Parking Spaces</label>
          <input
            type="number"
            min={0}
            value={formData.parking_spaces ?? ""}
            onChange={(e) =>
              onFormChange({ parking_spaces: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="e.g. 20"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Parking Type</label>
          <select
            value={formData.parking_type || ""}
            onChange={(e) => onFormChange({ parking_type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          >
            <option value="">Select...</option>
            {PARKING_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Parking Ratio</label>
          <input
            type="text"
            value={formData.parking_ratio || ""}
            onChange={(e) => onFormChange({ parking_ratio: e.target.value })}
            placeholder="e.g. 4 per 1,000 SF"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">HVAC Type</label>
          <select
            value={formData.hvac_type || ""}
            onChange={(e) => onFormChange({ hvac_type: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          >
            <option value="">Select...</option>
            {HVAC_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 pt-5 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Vertical Transportation</p>
        <div className="space-y-4">
          <div>
            <TriStateToggle
              label="Elevator"
              value={showElevatorCount}
              onChange={setShowElevatorCount}
            />
            {showElevatorCount === true && (
              <div className="mt-2 ml-0 sm:ml-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  How many elevators?
                </label>
                <input
                  type="number"
                  min={1}
                  value={formData.elevator_count ?? ""}
                  onChange={(e) =>
                    onFormChange({ elevator_count: e.target.value ? Number(e.target.value) : null })
                  }
                  placeholder="e.g. 2"
                  className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
                />
              </div>
            )}
          </div>

          <div>
            <TriStateToggle
              label="Freight Elevator"
              value={showFreightCount}
              onChange={setShowFreightCount}
            />
            {showFreightCount === true && (
              <div className="mt-2 ml-0 sm:ml-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  How many freight elevators?
                </label>
                <input
                  type="number"
                  min={1}
                  value={formData.freight_elevator_count ?? ""}
                  onChange={(e) =>
                    onFormChange({
                      freight_elevator_count: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  placeholder="e.g. 1"
                  className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
