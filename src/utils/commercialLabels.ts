/**
 * Human-friendly labels for commercial-listing enum-ish string columns.
 *
 * The DB stores these as plain `text`, but the wizard constrains them to a
 * known option list. Single source of truth so the listing detail page,
 * the wizard's Review step, and any analytics surface render the same label
 * for the same value.
 *
 * If a value is null/undefined we return null so callers can short-circuit
 * with a single `if (label)` guard.
 *
 * Adding a new option? Add the value -> label pair here AND the option in
 * the corresponding wizard step.
 */

type LabelMap = Record<string, string>;

const COMMERCIAL_SPACE_TYPE: LabelMap = {
  storefront: 'Retail / Storefront',
  restaurant: 'Restaurant',
  office: 'Office',
  warehouse: 'Warehouse',
  industrial: 'Industrial',
  mixed_use: 'Mixed Use',
  community_facility: 'Community Facility',
  basement_commercial: 'Basement Commercial',
};

const COMMERCIAL_SUBTYPE: LabelMap = {
  // storefront
  freestanding: 'Freestanding',
  strip_center: 'Strip Center',
  showroom: 'Showroom',
  // restaurant
  bar_lounge: 'Bar / Lounge',
  cafe: 'Cafe',
  // office
  general_office: 'General Office',
  medical_office: 'Medical Office',
  medical: 'Medical Office',
  creative_loft: 'Creative / Loft',
  coworking: 'Coworking',
  // warehouse
  distribution: 'Distribution',
  cold_storage: 'Cold Storage',
  // industrial
  manufacturing: 'Manufacturing',
  rd_lab: 'R&D / Lab',
  // community facility
  daycare: 'Daycare',
  religious: 'Religious',
};

const LEASE_TYPE: LabelMap = {
  nnn: 'NNN (Triple Net)',
  gross: 'Gross',
  modified_gross: 'Modified Gross',
  full_service: 'Full Service',
  percentage: 'Percentage',
  industrial_gross: 'Industrial Gross',
  absolute_net: 'Absolute Net',
  tenant_electric: 'Tenant Electric',
};

const LEASE_TYPE_SHORT: LabelMap = {
  nnn: 'NNN',
  gross: 'Gross',
  modified_gross: 'Mod. Gross',
  full_service: 'Full Service',
  percentage: '% Rent',
  industrial_gross: 'Ind. Gross',
  absolute_net: 'Absolute Net',
  tenant_electric: 'Tenant Elec.',
};

const LEASE_TYPE_DESCRIPTION: LabelMap = {
  nnn: 'Tenant pays rent + taxes + insurance + maintenance',
  gross: 'All operating expenses included in the rent',
  modified_gross: 'Shared expenses, negotiated between landlord and tenant',
  full_service: 'All operating expenses included in the rent',
  percentage: 'Base rent plus a percentage of tenant’s gross sales',
  industrial_gross: 'Landlord covers taxes & insurance; tenant covers utilities & janitorial',
  absolute_net: 'Tenant responsible for all costs including structural repairs',
  tenant_electric: 'Landlord covers all expenses except tenant’s electric',
};

const FLOOR_LEVEL: LabelMap = {
  ground: 'Ground',
  basement: 'Basement',
  mezzanine: 'Mezzanine',
  '2nd_floor': '2nd Floor',
  '3rd_floor': '3rd Floor',
  '4th_floor': '4th Floor',
  '5th_plus': '5th Floor+',
  full_building: 'Full Building',
};

const BUILD_OUT_CONDITION: LabelMap = {
  full_build_out: 'Full Build-Out',
  turnkey: 'Turnkey / Move-in Ready',
  second_generation: 'Second Generation',
  vanilla_box: 'Vanilla Box / White Box',
  shell: 'Shell',
  cold_dark_shell: 'Cold Dark Shell',
};

const BUILDING_CLASS: LabelMap = {
  a: 'Class A',
  b: 'Class B',
  c: 'Class C',
};

const LAYOUT_TYPE: LabelMap = {
  open_plan: 'Open Plan',
  private_offices: 'Private Offices',
  mixed: 'Mixed',
};

const SPRINKLER_TYPE: LabelMap = {
  wet: 'Wet',
  dry: 'Dry',
  esfr: 'ESFR',
  none: 'None',
};

const CONSTRUCTION_TYPE: LabelMap = {
  steel_frame: 'Steel Frame',
  concrete: 'Concrete',
  wood_frame: 'Wood Frame',
  masonry_brick: 'Masonry / Brick',
  pre_engineered_metal: 'Pre-engineered Metal',
};

const PARKING_TYPE: LabelMap = {
  surface_lot: 'Surface Lot',
  garage: 'Garage',
  street: 'Street',
  valet: 'Valet',
  none: 'None',
};

const HVAC_TYPE: LabelMap = {
  central: 'Central',
  split_system: 'Split System',
  rooftop_package: 'Rooftop Package',
  none: 'None',
  other: 'Other',
};

const TENANCY_TYPE: LabelMap = {
  single_tenant: 'Single Tenant',
  multi_tenant: 'Multi Tenant',
  vacant: 'Vacant',
};

function lookup(map: LabelMap, value: string | null | undefined): string | null {
  if (value == null || value === '') return null;
  return map[value] ?? value;
}

export const commercialLabels = {
  spaceType: (v: string | null | undefined) => lookup(COMMERCIAL_SPACE_TYPE, v),
  subtype: (v: string | null | undefined) => lookup(COMMERCIAL_SUBTYPE, v),
  leaseType: (v: string | null | undefined) => lookup(LEASE_TYPE, v),
  leaseTypeShort: (v: string | null | undefined) => lookup(LEASE_TYPE_SHORT, v),
  leaseTypeDescription: (v: string | null | undefined) => lookup(LEASE_TYPE_DESCRIPTION, v),
  floorLevel: (v: string | null | undefined) => lookup(FLOOR_LEVEL, v),
  buildOutCondition: (v: string | null | undefined) => lookup(BUILD_OUT_CONDITION, v),
  buildingClass: (v: string | null | undefined) => lookup(BUILDING_CLASS, v),
  layoutType: (v: string | null | undefined) => lookup(LAYOUT_TYPE, v),
  sprinklerType: (v: string | null | undefined) => lookup(SPRINKLER_TYPE, v),
  constructionType: (v: string | null | undefined) => lookup(CONSTRUCTION_TYPE, v),
  parkingType: (v: string | null | undefined) => lookup(PARKING_TYPE, v),
  hvacType: (v: string | null | undefined) => lookup(HVAC_TYPE, v),
  tenancyType: (v: string | null | undefined) => lookup(TENANCY_TYPE, v),
};

/**
 * Render a tri-state boolean (Yes / No / hide-when-null) consistently.
 * Returns null when value is null/undefined so the caller can omit the row.
 */
export function triStateLabel(value: boolean | null | undefined): 'Yes' | 'No' | null {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return null;
}
