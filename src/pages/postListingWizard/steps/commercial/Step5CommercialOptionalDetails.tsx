import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { StepShell, type CommercialStepProps, type StepTipsData } from './_StepShell';

const TIPS: StepTipsData = {
  heading: 'Optional Details',
  bullets: [
    'Tips will appear here.',
  ],
};
import { WizardTriStateToggle } from './_TriStateToggle';
import type { CommercialListingFormData } from '../../../postCommercial/commercialTypes';
import type { TenancyType } from '../../../../config/supabase';

const CONSTRUCTION_TYPE_OPTIONS = [
  { value: 'steel_frame',          label: 'Steel Frame' },
  { value: 'concrete',             label: 'Concrete' },
  { value: 'wood_frame',           label: 'Wood Frame' },
  { value: 'masonry_brick',        label: 'Masonry / Brick' },
  { value: 'pre_engineered_metal', label: 'Pre-engineered Metal' },
];

const PARKING_TYPE_OPTIONS = [
  { value: 'surface_lot', label: 'Surface Lot' },
  { value: 'garage',      label: 'Garage' },
  { value: 'street',      label: 'Street' },
  { value: 'valet',       label: 'Valet' },
  { value: 'none',        label: 'None' },
];

const HVAC_TYPE_OPTIONS = [
  { value: 'central',         label: 'Central' },
  { value: 'split_system',    label: 'Split System' },
  { value: 'rooftop_package', label: 'Rooftop Package' },
  { value: 'none',            label: 'None' },
  { value: 'other',           label: 'Other' },
];

const TENANCY_TYPE_OPTIONS: { value: TenancyType; label: string }[] = [
  { value: 'single_tenant', label: 'Single Tenant' },
  { value: 'multi_tenant',  label: 'Multi Tenant' },
  { value: 'vacant',        label: 'Vacant' },
];

function Section({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      >
        <div>
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>
      {open && <div className="px-5 pb-5 pt-1 border-t border-gray-100">{children}</div>}
    </div>
  );
}

function BuildingFields({
  formData,
  update,
}: {
  formData: CommercialListingFormData;
  update: (u: Partial<CommercialListingFormData>) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4 pt-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Total Building SF</label>
        <input
          type="number"
          min={0}
          value={formData.total_building_sf ?? ''}
          onChange={e => update({ total_building_sf: e.target.value ? Number(e.target.value) : null })}
          placeholder="e.g. 25000"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Year Built</label>
        <input
          type="number"
          min={1800}
          max={new Date().getFullYear()}
          value={formData.year_built ?? ''}
          onChange={e => update({ year_built: e.target.value ? Number(e.target.value) : null })}
          placeholder="e.g. 1985"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Year Renovated</label>
        <input
          type="number"
          min={1800}
          max={new Date().getFullYear()}
          value={formData.year_renovated ?? ''}
          onChange={e => update({ year_renovated: e.target.value ? Number(e.target.value) : null })}
          placeholder="e.g. 2020"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Number of Floors</label>
        <input
          type="number"
          min={0}
          value={formData.number_of_floors ?? ''}
          onChange={e => update({ number_of_floors: e.target.value ? Number(e.target.value) : null })}
          placeholder="e.g. 3"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Construction Type</label>
        <select
          value={formData.construction_type || ''}
          onChange={e => update({ construction_type: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm bg-white"
        >
          <option value="">Select…</option>
          {CONSTRUCTION_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Zoning Code</label>
        <input
          type="text"
          value={formData.zoning_code || ''}
          onChange={e => update({ zoning_code: e.target.value })}
          placeholder="e.g. C4-2A"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Parking Spaces</label>
        <input
          type="number"
          min={0}
          value={formData.parking_spaces ?? ''}
          onChange={e => update({ parking_spaces: e.target.value ? Number(e.target.value) : null })}
          placeholder="e.g. 20"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Parking Type</label>
        <select
          value={formData.parking_type || ''}
          onChange={e => update({ parking_type: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm bg-white"
        >
          <option value="">Select…</option>
          {PARKING_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Parking Ratio</label>
        <input
          type="text"
          value={formData.parking_ratio || ''}
          onChange={e => update({ parking_ratio: e.target.value })}
          placeholder="e.g. 4 per 1,000 SF"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">HVAC Type</label>
        <select
          value={formData.hvac_type || ''}
          onChange={e => update({ hvac_type: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm bg-white"
        >
          <option value="">Select…</option>
          {HVAC_TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Elevators</label>
        <input
          type="number"
          min={0}
          value={formData.elevator_count ?? ''}
          onChange={e => update({ elevator_count: e.target.value ? Number(e.target.value) : null })}
          placeholder="e.g. 2"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Freight Elevators</label>
        <input
          type="number"
          min={0}
          value={formData.freight_elevator_count ?? ''}
          onChange={e => update({ freight_elevator_count: e.target.value ? Number(e.target.value) : null })}
          placeholder="e.g. 1"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
        />
      </div>
      <div className="sm:col-span-2 pt-2 border-t border-gray-100 space-y-2">
        <WizardTriStateToggle
          label="Signage Rights"
          value={
            (formData as any).signage_rights === true ? true : (formData as any).signage_rights === false ? false : null
          }
          onChange={v => update({ signage_rights: v as any })}
        />
        <WizardTriStateToggle
          label="Private Entrance"
          value={
            (formData as any).private_entrance === true ? true : (formData as any).private_entrance === false ? false : null
          }
          onChange={v => update({ private_entrance: v as any })}
        />
      </div>
    </div>
  );
}

function LeaseTermsFields({
  formData,
  update,
}: {
  formData: CommercialListingFormData;
  update: (u: Partial<CommercialListingFormData>) => void;
}) {
  const subleaseVal: boolean | null =
    (formData as any).sublease === true ? true : (formData as any).sublease === false ? false : null;

  const showCam = formData.lease_type === 'nnn' || formData.lease_type === 'modified_gross';
  const showExpenseStop = formData.lease_type === 'full_service';

  return (
    <div className="pt-3 space-y-4">
      <p className="text-xs text-gray-500">Lease type was selected in Step 4. CAM / Expense Stop fields adapt to that choice.</p>

      {(showCam || showExpenseStop) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
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
                value={formData.cam_per_sf ?? ''}
                onChange={e => update({ cam_per_sf: e.target.value ? Number(e.target.value) : null })}
                placeholder="e.g. 8.50"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm bg-white"
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
                value={formData.expense_stop_per_sf ?? ''}
                onChange={e => update({ expense_stop_per_sf: e.target.value ? Number(e.target.value) : null })}
                placeholder="e.g. 12.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm bg-white"
              />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            TI Allowance <span className="text-xs font-normal text-gray-400">($/SF)</span>
          </label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={formData.ti_allowance_per_sf ?? ''}
            onChange={e => update({ ti_allowance_per_sf: e.target.value ? Number(e.target.value) : null })}
            placeholder="e.g. 25.00"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lease Term</label>
          <input
            type="text"
            value={formData.lease_term_text || ''}
            onChange={e => update({ lease_term_text: e.target.value })}
            placeholder="e.g. 3-5 years"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Renewal Options</label>
          <input
            type="text"
            value={formData.renewal_options || ''}
            onChange={e => update({ renewal_options: e.target.value })}
            placeholder="e.g. Two 5-year options"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Escalation</label>
          <input
            type="text"
            value={formData.escalation || ''}
            onChange={e => update({ escalation: e.target.value })}
            placeholder="e.g. 3% annually"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Permitted Uses</label>
          <input
            type="text"
            value={formData.permitted_uses_commercial || ''}
            onChange={e => update({ permitted_uses_commercial: e.target.value })}
            placeholder="e.g. Retail, professional services"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Use Restrictions</label>
          <input
            type="text"
            value={formData.use_restrictions || ''}
            onChange={e => update({ use_restrictions: e.target.value })}
            placeholder="e.g. No food service"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Security Deposit</label>
          <input
            type="text"
            value={formData.security_deposit || ''}
            onChange={e => update({ security_deposit: e.target.value })}
            placeholder="e.g. 3 months rent"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Available Date</label>
          <input
            type="date"
            value={formData.available_date || ''}
            onChange={e => update({ available_date: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
          />
        </div>
      </div>

      <div className="pt-3 border-t border-gray-100">
        <WizardTriStateToggle
          label="Sublease Allowed"
          value={subleaseVal}
          onChange={v => update({ sublease: v as any })}
        />
      </div>
    </div>
  );
}

function SaleFinancialsFields({
  formData,
  update,
}: {
  formData: CommercialListingFormData;
  update: (u: Partial<CommercialListingFormData>) => void;
}) {
  const [showLease, setShowLease] = useState(Boolean(formData.current_lease_tenant));

  const handleLeaseToggle = (show: boolean) => {
    setShowLease(show);
    if (!show) {
      update({ current_lease_tenant: '', current_lease_expiration: '', current_lease_rent: null });
    }
  };

  return (
    <div className="pt-3 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Cap Rate <span className="text-xs font-normal text-gray-400">(%)</span>
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={formData.cap_rate ?? ''}
            onChange={e => update({ cap_rate: e.target.value ? Number(e.target.value) : null })}
            placeholder="e.g. 6.5"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            NOI <span className="text-xs font-normal text-gray-400">($/year)</span>
          </label>
          <input
            type="number"
            min={0}
            value={formData.noi ?? ''}
            onChange={e => update({ noi: e.target.value ? Number(e.target.value) : null })}
            placeholder="e.g. 150000"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Property Taxes <span className="text-xs font-normal text-gray-400">($/year)</span>
          </label>
          <input
            type="number"
            min={0}
            value={formData.property_taxes_annual ?? ''}
            onChange={e => update({ property_taxes_annual: e.target.value ? Number(e.target.value) : null })}
            placeholder="e.g. 25000"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tenancy Type</label>
          <select
            value={formData.tenancy_type || ''}
            onChange={e => update({ tenancy_type: (e.target.value as TenancyType) || null })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm bg-white"
          >
            <option value="">Select…</option>
            {TENANCY_TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Current Rental Income <span className="text-xs font-normal text-gray-400">($/year)</span>
          </label>
          <input
            type="number"
            min={0}
            value={formData.current_rental_income ?? ''}
            onChange={e => update({ current_rental_income: e.target.value ? Number(e.target.value) : null })}
            placeholder="e.g. 60000"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm"
          />
        </div>
      </div>

      <div className="pt-3 border-t border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-700">Current Lease In Place?</span>
          <div className="flex rounded-md border border-gray-300 overflow-hidden flex-shrink-0">
            <button
              type="button"
              onClick={() => handleLeaseToggle(true)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-r border-gray-300 ${
                showLease ? 'bg-accent-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => handleLeaseToggle(false)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                !showLease ? 'bg-gray-200 text-gray-700' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              No
            </button>
          </div>
        </div>

        {showLease && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Tenant Name</label>
              <input
                type="text"
                value={formData.current_lease_tenant || ''}
                onChange={e => update({ current_lease_tenant: e.target.value })}
                placeholder="e.g. ABC Corp"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lease Expiration</label>
              <input
                type="date"
                value={formData.current_lease_expiration || ''}
                onChange={e => update({ current_lease_expiration: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Rent <span className="text-xs font-normal text-gray-400">($/month)</span>
              </label>
              <input
                type="number"
                min={0}
                value={formData.current_lease_rent ?? ''}
                onChange={e => update({ current_lease_rent: e.target.value ? Number(e.target.value) : null })}
                placeholder="e.g. 5000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-accent-500 focus:border-accent-500 text-sm bg-white"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Step5CommercialOptionalDetails({ formData, updateFormData, isSale, onNext, onBack }: CommercialStepProps) {
  return (
    <StepShell title="Optional Details" onBack={onBack} onNext={onNext} tips={TIPS}>
      <p className="text-sm text-gray-500 mb-4">
        Everything below is optional. Fill in what you have — you can always edit later.
      </p>
      <div className="space-y-3">
        <Section title="Building Details" subtitle="Total SF, year built, parking, elevators, HVAC, signage…">
          <BuildingFields formData={formData} update={updateFormData} />
        </Section>

        {isSale ? (
          <Section title="Sale Financials" subtitle="Cap rate, NOI, taxes, current tenancy…">
            <SaleFinancialsFields formData={formData} update={updateFormData} />
          </Section>
        ) : (
          <Section title="Lease Terms" subtitle="TI allowance, term, escalations, security deposit…">
            <LeaseTermsFields formData={formData} update={updateFormData} />
          </Section>
        )}
      </div>
    </StepShell>
  );
}
