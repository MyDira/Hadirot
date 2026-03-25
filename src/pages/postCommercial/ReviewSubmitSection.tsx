import React from "react";
import { AlertTriangle, CheckCircle, Image } from "lucide-react";
import type { CommercialListingFormData } from "../postListing/commercialTypes";
import type { CommercialSpaceType } from "../../config/supabase";
import type { MediaFile } from "../../components/shared/MediaUploader";

const LEASE_TYPE_LABELS: Record<string, string> = {
  nnn: "NNN (Triple Net)",
  modified_gross: "Modified Gross",
  full_service: "Full Service / Gross",
  percentage: "Percentage",
  industrial_gross: "Industrial Gross",
  absolute_net: "Absolute Net",
  tenant_electric: "Tenant Electric",
};

const BUILD_OUT_LABELS: Record<string, string> = {
  full_build_out: "Full Build-Out",
  turnkey: "Turnkey / Move-in Ready",
  second_generation: "Second Generation",
  vanilla_box: "Vanilla Box / White Box",
  shell: "Shell",
  cold_dark_shell: "Cold Dark Shell",
};

const TENANCY_LABELS: Record<string, string> = {
  single_tenant: "Single Tenant",
  multi_tenant: "Multi Tenant",
  vacant: "Vacant",
};

const SPACE_TYPE_LABELS: Record<string, string> = {
  storefront: "Retail / Storefront",
  restaurant: "Restaurant",
  office: "Office",
  warehouse: "Warehouse",
  industrial: "Industrial",
  mixed_use: "Mixed Use",
  community_facility: "Community Facility",
  basement_commercial: "Basement Commercial",
};

interface RecommendedField {
  key: keyof CommercialListingFormData;
  label: string;
  rentalOnly?: boolean;
  saleOnly?: boolean;
}

const RECOMMENDED_FIELDS: RecommendedField[] = [
  { key: "description", label: "Description" },
  { key: "total_building_sf", label: "Total Building SF" },
  { key: "year_built", label: "Year Built" },
  { key: "parking_spaces", label: "Parking Spaces" },
  { key: "hvac_type", label: "HVAC Type" },
  { key: "lease_type", label: "Lease Type", rentalOnly: true },
  { key: "lease_term_text", label: "Lease Term", rentalOnly: true },
  { key: "cap_rate", label: "Cap Rate", saleOnly: true },
  { key: "noi", label: "NOI", saleOnly: true },
];

function isEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === "string" && val.trim() === "") return true;
  if (typeof val === "boolean") return false;
  return false;
}

function formatCurrency(val: number | null): string {
  if (val == null) return "";
  return val.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatBool(val: unknown): string {
  if (val === true) return "Yes";
  if (val === false) return "No";
  return "";
}

interface ReviewSubmitSectionProps {
  formData: CommercialListingFormData;
  selectedType: CommercialSpaceType | "";
  mediaFiles: MediaFile[];
  locationMode: "address" | "cross_streets";
  crossStreetAName: string | null;
  crossStreetBName: string | null;
  errors: Partial<Record<string, string>>;
  submitError: string | null;
  loading: boolean;
  uploadingMedia: boolean;
  onFormChange: (updates: Partial<CommercialListingFormData>) => void;
}

interface ReviewRow {
  label: string;
  value: string;
}

export function ReviewSubmitSection({
  formData,
  selectedType,
  mediaFiles,
  locationMode,
  crossStreetAName,
  crossStreetBName,
  errors,
  submitError,
  loading,
  uploadingMedia,
  onFormChange,
}: ReviewSubmitSectionProps) {
  const listingBasics: ReviewRow[] = [
    { label: "Transaction Type", value: formData.listing_type === "rental" ? "For Rent" : "For Sale" },
    { label: "Space Type", value: SPACE_TYPE_LABELS[selectedType as string] || selectedType || "" },
    { label: "Title", value: formData.title || "(auto-generated)" },
    { label: "Description", value: formData.description ? `${formData.description.slice(0, 100)}${formData.description.length > 100 ? "..." : ""}` : "" },
  ].filter((r) => r.value);

  const locationDisplay =
    locationMode === "address"
      ? formData.full_address
      : [crossStreetAName, crossStreetBName].filter(Boolean).join(" & ");

  const locationRows: ReviewRow[] = [
    { label: "Address / Cross Streets", value: locationDisplay || "" },
    { label: "Neighborhood", value: formData.neighborhood || "" },
  ].filter((r) => r.value);

  const pricingRows: ReviewRow[] = [];
  if (formData.call_for_price) {
    pricingRows.push({ label: "Pricing", value: "Contact for pricing" });
  } else if (formData.listing_type === "rental") {
    if (formData.price) pricingRows.push({ label: "Monthly Rent", value: formatCurrency(formData.price) });
    if (formData.price_per_sf_year) pricingRows.push({ label: "Price/SF/Year", value: `$${formData.price_per_sf_year.toFixed(2)}` });
  } else if (formData.listing_type === "sale") {
    if (formData.asking_price) pricingRows.push({ label: "Asking Price", value: formatCurrency(formData.asking_price) });
  }

  const spaceRows: ReviewRow[] = [
    { label: "Available SF", value: formData.available_sf ? `${formData.available_sf.toLocaleString()} SF` : "" },
    { label: "Floor Level", value: formData.floor_level ? formData.floor_level.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) : "" },
    { label: "Ceiling Height", value: formData.ceiling_height_ft ? `${formData.ceiling_height_ft} ft` : "" },
    { label: "Build-Out Condition", value: BUILD_OUT_LABELS[formData.build_out_condition || ""] || "" },
    { label: "Available Date", value: formData.available_date || "" },
  ].filter((r) => r.value);

  const buildingRows: ReviewRow[] = [
    { label: "Total Building SF", value: formData.total_building_sf ? `${formData.total_building_sf.toLocaleString()} SF` : "" },
    { label: "Year Built", value: formData.year_built ? String(formData.year_built) : "" },
    { label: "Year Renovated", value: formData.year_renovated ? String(formData.year_renovated) : "" },
    { label: "Number of Floors", value: formData.number_of_floors ? String(formData.number_of_floors) : "" },
    { label: "Construction Type", value: formData.construction_type ? formData.construction_type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) : "" },
    { label: "Zoning Code", value: formData.zoning_code || "" },
    { label: "Parking Spaces", value: formData.parking_spaces != null ? String(formData.parking_spaces) : "" },
    { label: "Parking Type", value: formData.parking_type ? formData.parking_type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) : "" },
    { label: "Parking Ratio", value: formData.parking_ratio || "" },
    { label: "HVAC Type", value: formData.hvac_type ? formData.hvac_type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()) : "" },
    { label: "Elevators", value: formData.elevator_count ? String(formData.elevator_count) : "" },
    { label: "Freight Elevators", value: formData.freight_elevator_count ? String(formData.freight_elevator_count) : "" },
  ].filter((r) => r.value);

  const leaseRows: ReviewRow[] = formData.listing_type === "rental" ? [
    { label: "Lease Type", value: LEASE_TYPE_LABELS[formData.lease_type || ""] || "" },
    { label: "CAM / Operating Expenses", value: formData.cam_per_sf != null ? `$${formData.cam_per_sf}/SF/yr` : "" },
    { label: "Expense Stop", value: formData.expense_stop_per_sf != null ? `$${formData.expense_stop_per_sf}/SF/yr` : "" },
    { label: "TI Allowance", value: formData.ti_allowance_per_sf != null ? `$${formData.ti_allowance_per_sf}/SF` : "" },
    { label: "Lease Term", value: formData.lease_term_text || "" },
    { label: "Renewal Options", value: formData.renewal_options || "" },
    { label: "Escalation", value: formData.escalation || "" },
    { label: "Permitted Uses", value: formData.permitted_uses_commercial || "" },
    { label: "Use Restrictions", value: formData.use_restrictions || "" },
    { label: "Sublease Allowed", value: formatBool(formData.sublease) },
    { label: "Security Deposit", value: formData.security_deposit || "" },
  ].filter((r) => r.value) : [];

  const saleRows: ReviewRow[] = formData.listing_type === "sale" ? [
    { label: "Cap Rate", value: formData.cap_rate != null ? `${formData.cap_rate}%` : "" },
    { label: "NOI", value: formData.noi != null ? formatCurrency(formData.noi) : "" },
    { label: "Property Taxes", value: formData.property_taxes_annual != null ? `${formatCurrency(formData.property_taxes_annual)}/yr` : "" },
    { label: "Tenancy Type", value: TENANCY_LABELS[formData.tenancy_type || ""] || "" },
    { label: "Current Tenant", value: formData.current_lease_tenant || "" },
    { label: "Lease Expiration", value: formData.current_lease_expiration || "" },
    { label: "Current Rent", value: formData.current_lease_rent != null ? formatCurrency(formData.current_lease_rent) : "" },
  ].filter((r) => r.value) : [];

  const contactRows: ReviewRow[] = [
    { label: "Contact Name", value: formData.contact_name },
    { label: "Contact Phone", value: formData.contact_phone },
    { label: "Contact Type", value: (formData.admin_listing_type_display || "agent").replace(/\b\w/g, (l) => l.toUpperCase()) },
  ].filter((r) => r.value);

  const gaps = RECOMMENDED_FIELDS.filter((field) => {
    if (field.rentalOnly && formData.listing_type !== "rental") return false;
    if (field.saleOnly && formData.listing_type !== "sale") return false;
    return isEmpty(formData[field.key]);
  });

  const sections = [
    { title: "Listing Basics", rows: listingBasics },
    { title: "Location", rows: locationRows },
    { title: "Pricing", rows: pricingRows },
    { title: "Space Details", rows: spaceRows },
    { title: "Building Details", rows: buildingRows },
    ...(formData.listing_type === "rental" ? [{ title: "Lease Terms", rows: leaseRows }] : []),
    ...(formData.listing_type === "sale" ? [{ title: "Sale Financials", rows: saleRows }] : []),
    { title: "Contact", rows: contactRows },
  ];

  const photoCount = mediaFiles.filter((m) => m.type === "image").length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">Review & Submit</h2>
      <p className="text-sm text-gray-500 mb-5">Double-check your listing details before submitting</p>

      <div className="space-y-5">
        {sections.map((section) =>
          section.rows.length > 0 ? (
            <div key={section.title}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {section.title}
              </h3>
              <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
                {section.rows.map((row) => (
                  <div key={row.label} className="flex justify-between items-baseline px-4 py-2.5">
                    <span className="text-sm text-gray-600">{row.label}</span>
                    <span className="text-sm font-medium text-gray-900 text-right ml-4 max-w-[60%] truncate">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null
        )}

        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photos</h3>
          <div className="bg-gray-50 rounded-lg border border-gray-200 px-4 py-2.5 flex items-center gap-2">
            <Image className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-700">
              {photoCount > 0 ? `${photoCount} photo${photoCount !== 1 ? "s" : ""} uploaded` : "No photos uploaded"}
            </span>
            {photoCount > 0 && <CheckCircle className="w-3.5 h-3.5 text-green-500 ml-auto" />}
          </div>
        </div>

        {gaps.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Recommended Fields
            </h3>
            <div className="bg-amber-50 rounded-lg border border-amber-200 divide-y divide-amber-200">
              {gaps.map((field) => (
                <div key={field.key} className="flex items-center gap-2 px-4 py-2.5">
                  <span className="text-sm text-amber-700">
                    {field.label} is empty
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              These fields are recommended but not required. You can submit without them.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-gray-200">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={formData.terms_agreed}
            onChange={(e) => onFormChange({ terms_agreed: e.target.checked })}
            className="mt-1 h-4 w-4 text-teal-600 focus:ring-teal-500 border-gray-300 rounded"
          />
          <span className="text-sm text-gray-700">
            I agree to receive SMS messages about my listing and inquiries. Message and data
            rates may apply. See{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-teal-700 font-semibold hover:underline">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-teal-700 font-semibold hover:underline">
              Terms of Use
            </a>{" "}
            for more information.
          </span>
        </label>
        {errors.terms_agreed && (
          <p className="text-xs text-red-600 mt-2">{errors.terms_agreed}</p>
        )}

        {submitError && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {submitError}
          </div>
        )}

        <div className="flex justify-end mt-6">
          <button
            type="submit"
            disabled={loading || uploadingMedia || !formData.terms_agreed}
            className="bg-teal-600 text-white px-10 py-3 rounded-lg font-semibold hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {loading
              ? "Submitting..."
              : uploadingMedia
              ? "Uploading Photos..."
              : "Post Commercial Listing"}
          </button>
        </div>
      </div>
    </div>
  );
}
