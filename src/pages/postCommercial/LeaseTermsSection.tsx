import React from "react";
import { TriStateToggle } from "./TriStateToggle";
import type { CommercialListingFormData } from "../postListing/commercialTypes";
import type { LeaseType } from "../../config/supabase";

interface LeaseTypeOption {
  value: LeaseType;
  label: string;
  description: string;
}

const LEASE_TYPE_OPTIONS: LeaseTypeOption[] = [
  {
    value: "nnn",
    label: "NNN (Triple Net)",
    description: "Tenant pays rent + taxes + insurance + maintenance",
  },
  {
    value: "modified_gross",
    label: "Modified Gross",
    description: "Shared expenses, negotiated split between landlord and tenant",
  },
  {
    value: "full_service",
    label: "Full Service / Gross",
    description: "All operating expenses included in the rent",
  },
  {
    value: "percentage",
    label: "Percentage",
    description: "Base rent plus a percentage of tenant's gross sales",
  },
  {
    value: "industrial_gross",
    label: "Industrial Gross",
    description: "Landlord covers taxes and insurance; tenant covers utilities and janitorial",
  },
  {
    value: "absolute_net",
    label: "Absolute Net",
    description: "Tenant responsible for all costs including structural repairs",
  },
  {
    value: "tenant_electric",
    label: "Tenant Electric",
    description: "Landlord covers all expenses except tenant's electric",
  },
];

interface LeaseTermsSectionProps {
  formData: CommercialListingFormData;
  onFormChange: (updates: Partial<CommercialListingFormData>) => void;
}

export function LeaseTermsSection({ formData, onFormChange }: LeaseTermsSectionProps) {
  const showCam = formData.lease_type === "nnn" || formData.lease_type === "modified_gross";
  const showExpenseStop = formData.lease_type === "full_service";

  const subleaseVal: boolean | null =
    (formData.sublease as any) === true ? true : (formData.sublease as any) === false ? false : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Lease Terms</h2>
      <p className="text-sm text-gray-500 mb-5">Details about the lease structure and costs</p>

      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-2">Lease Type</label>
        <div className="space-y-2">
          {LEASE_TYPE_OPTIONS.map((opt) => {
            const isSelected = formData.lease_type === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onFormChange({ lease_type: isSelected ? null : opt.value })}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-all ${
                  isSelected
                    ? "border-teal-600 bg-teal-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <span className={`text-sm font-medium ${isSelected ? "text-teal-700" : "text-gray-800"}`}>
                  {opt.label}
                </span>
                <span className={`block text-xs mt-0.5 ${isSelected ? "text-teal-600" : "text-gray-500"}`}>
                  {opt.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {(showCam || showExpenseStop) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 p-4 bg-gray-50 rounded-lg border border-gray-200">
          {showCam && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CAM / Operating Expenses
                <span className="ml-1 text-xs font-normal text-gray-400">($/SF/year)</span>
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={formData.cam_per_sf ?? ""}
                onChange={(e) =>
                  onFormChange({ cam_per_sf: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="e.g. 8.50"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm bg-white"
              />
            </div>
          )}
          {showExpenseStop && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expense Stop
                <span className="ml-1 text-xs font-normal text-gray-400">($/SF/year)</span>
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={formData.expense_stop_per_sf ?? ""}
                onChange={(e) =>
                  onFormChange({ expense_stop_per_sf: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="e.g. 12.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm bg-white"
              />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            TI Allowance
            <span className="ml-1 text-xs font-normal text-gray-400">($/SF)</span>
          </label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={formData.ti_allowance_per_sf ?? ""}
            onChange={(e) =>
              onFormChange({ ti_allowance_per_sf: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="e.g. 25.00"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lease Term</label>
          <input
            type="text"
            value={formData.lease_term_text || ""}
            onChange={(e) => onFormChange({ lease_term_text: e.target.value })}
            placeholder="e.g. 3-5 years"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Renewal Options</label>
          <input
            type="text"
            value={formData.renewal_options || ""}
            onChange={(e) => onFormChange({ renewal_options: e.target.value })}
            placeholder="e.g. Two 5-year options"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Escalation</label>
          <input
            type="text"
            value={formData.escalation || ""}
            onChange={(e) => onFormChange({ escalation: e.target.value })}
            placeholder="e.g. 3% annually"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Permitted Uses</label>
          <input
            type="text"
            value={formData.permitted_uses_commercial || ""}
            onChange={(e) => onFormChange({ permitted_uses_commercial: e.target.value })}
            placeholder="e.g. Retail, professional services"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Use Restrictions</label>
          <input
            type="text"
            value={formData.use_restrictions || ""}
            onChange={(e) => onFormChange({ use_restrictions: e.target.value })}
            placeholder="e.g. No food service, no hazardous materials"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Security Deposit</label>
          <input
            type="text"
            value={formData.security_deposit || ""}
            onChange={(e) => onFormChange({ security_deposit: e.target.value })}
            placeholder="e.g. 3 months rent"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-600 focus:border-teal-600 text-sm"
          />
        </div>
      </div>

      <div className="mt-5 pt-5 border-t border-gray-100">
        <TriStateToggle
          label="Sublease Allowed"
          value={subleaseVal}
          onChange={(v) => onFormChange({ sublease: v as any })}
        />
      </div>
    </div>
  );
}
