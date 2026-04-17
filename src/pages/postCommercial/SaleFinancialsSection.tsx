import React, { useState } from "react";
import type { CommercialListingFormData } from "./commercialTypes";
import type { TenancyType } from "../../config/supabase";

const TENANCY_TYPE_OPTIONS: { value: TenancyType; label: string }[] = [
  { value: "single_tenant", label: "Single Tenant" },
  { value: "multi_tenant", label: "Multi Tenant" },
  { value: "vacant", label: "Vacant" },
];

interface SaleFinancialsSectionProps {
  formData: CommercialListingFormData;
  onFormChange: (updates: Partial<CommercialListingFormData>) => void;
}

export function SaleFinancialsSection({ formData, onFormChange }: SaleFinancialsSectionProps) {
  const [showCurrentLease, setShowCurrentLease] = useState(
    Boolean(formData.current_lease_tenant)
  );

  const handleLeaseToggle = (show: boolean) => {
    setShowCurrentLease(show);
    if (!show) {
      onFormChange({
        current_lease_tenant: "",
        current_lease_expiration: "",
        current_lease_rent: null,
      });
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Sale Financials</h2>
      <p className="text-sm text-gray-500 mb-5">Investment and financial details for this property</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cap Rate
            <span className="ml-1 text-xs font-normal text-gray-400">(%)</span>
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={formData.cap_rate ?? ""}
            onChange={(e) =>
              onFormChange({ cap_rate: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="e.g. 6.5"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            NOI
            <span className="ml-1 text-xs font-normal text-gray-400">($/year)</span>
          </label>
          <input
            type="number"
            min={0}
            value={formData.noi ?? ""}
            onChange={(e) =>
              onFormChange({ noi: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="e.g. 150000"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Property Taxes
            <span className="ml-1 text-xs font-normal text-gray-400">($/year)</span>
          </label>
          <input
            type="number"
            min={0}
            value={formData.property_taxes_annual ?? ""}
            onChange={(e) =>
              onFormChange({ property_taxes_annual: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="e.g. 25000"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tenancy Type</label>
          <select
            value={formData.tenancy_type || ""}
            onChange={(e) =>
              onFormChange({ tenancy_type: (e.target.value as TenancyType) || null })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          >
            <option value="">Select...</option>
            {TENANCY_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5 pt-5 border-t border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium text-gray-700">Current Lease In Place?</span>
          <div className="flex rounded-md border border-gray-300 overflow-hidden flex-shrink-0">
            <button
              type="button"
              onClick={() => handleLeaseToggle(true)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-gray-300 ${
                showCurrentLease
                  ? "bg-teal-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => handleLeaseToggle(false)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                !showCurrentLease
                  ? "bg-gray-200 text-gray-700"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              No
            </button>
          </div>
        </div>

        {showCurrentLease && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tenant Name</label>
              <input
                type="text"
                value={formData.current_lease_tenant || ""}
                onChange={(e) => onFormChange({ current_lease_tenant: e.target.value })}
                placeholder="e.g. ABC Corp"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lease Expiration</label>
              <input
                type="date"
                value={formData.current_lease_expiration || ""}
                onChange={(e) => onFormChange({ current_lease_expiration: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Rent
                <span className="ml-1 text-xs font-normal text-gray-400">($/month)</span>
              </label>
              <input
                type="number"
                min={0}
                value={formData.current_lease_rent ?? ""}
                onChange={(e) =>
                  onFormChange({
                    current_lease_rent: e.target.value ? Number(e.target.value) : null,
                  })
                }
                placeholder="e.g. 5000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm bg-white"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
