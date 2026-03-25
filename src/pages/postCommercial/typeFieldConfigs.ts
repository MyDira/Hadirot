import type { CommercialSpaceType, CommercialSubtype } from "../../config/supabase";

export interface SubtypeOption {
  value: CommercialSubtype | "__default__";
  label: string;
}

export const SPACE_TYPE_SUBTYPES: Partial<Record<CommercialSpaceType, SubtypeOption[]>> = {
  storefront: [
    { value: "__default__", label: "Storefront (Default)" },
    { value: "freestanding", label: "Freestanding" },
    { value: "strip_center", label: "Strip Center" },
    { value: "showroom", label: "Showroom" },
  ],
  restaurant: [
    { value: "__default__", label: "Restaurant (Default)" },
    { value: "bar_lounge", label: "Bar / Lounge" },
    { value: "cafe", label: "Cafe" },
  ],
  office: [
    { value: "__default__", label: "General Office (Default)" },
    { value: "medical_office", label: "Medical Office" },
    { value: "creative_loft", label: "Creative / Loft" },
    { value: "coworking", label: "Coworking" },
  ],
  warehouse: [
    { value: "__default__", label: "Warehouse (Default)" },
    { value: "distribution", label: "Distribution" },
    { value: "cold_storage", label: "Cold Storage" },
  ],
  industrial: [
    { value: "__default__", label: "Manufacturing (Default)" },
    { value: "rd_lab", label: "R&D / Lab" },
  ],
  community_facility: [
    { value: "__default__", label: "General (Default)" },
    { value: "daycare", label: "Daycare" },
    { value: "religious", label: "Religious" },
  ],
};

export const DESCRIPTION_PLACEHOLDERS: Record<CommercialSpaceType, string> = {
  storefront: "Describe this retail space — storefront visibility, layout, frontage, previous use...",
  restaurant: "Describe this restaurant space — kitchen setup, seating, ventilation, gas lines...",
  office: "Describe this office space — layout, finishes, natural light, conference rooms...",
  warehouse: "Describe this warehouse — clear heights, loading access, column spacing, power...",
  industrial: "Describe this industrial space — power capacity, crane access, rail access...",
  mixed_use: "Describe this mixed-use property — current use breakdown, floors, unit mix...",
  community_facility: "Describe this community facility — current use, ADA access, occupancy limits...",
  basement_commercial: "Describe this basement commercial space — access, ceiling height, ventilation...",
};

export type TypeSpecificField =
  | { type: "toggle"; key: string; label: string; recommended?: boolean }
  | { type: "number"; key: string; label: string; unit?: string; recommended?: boolean }
  | { type: "text"; key: string; label: string; recommended?: boolean }
  | { type: "textarea"; key: string; label: string; recommended?: boolean }
  | { type: "select"; key: string; label: string; options: { value: string; label: string }[]; recommended?: boolean };

export const TYPE_SPECIFIC_FIELDS: Record<CommercialSpaceType, TypeSpecificField[]> = {
  storefront: [
    { type: "number", key: "frontage_ft", label: "Frontage", unit: "ft", recommended: true },
    { type: "toggle", key: "corner_location", label: "Corner Location", recommended: true },
    { type: "number", key: "foot_traffic_vpd", label: "Foot Traffic", unit: "vehicles/day" },
    { type: "toggle", key: "signage_rights", label: "Signage Rights" },
    { type: "toggle", key: "ada_accessible", label: "ADA Accessible" },
    { type: "text", key: "previous_use", label: "Previous Use" },
  ],
  restaurant: [
    { type: "number", key: "seating_capacity", label: "Seating Capacity", recommended: true },
    { type: "toggle", key: "kitchen_exhaust", label: "Kitchen Exhaust Hood", recommended: true },
    { type: "toggle", key: "grease_trap", label: "Grease Trap", recommended: true },
    { type: "toggle", key: "gas_line", label: "Gas Line", recommended: true },
    { type: "toggle", key: "liquor_license_transferable", label: "Liquor License Transferable" },
    { type: "toggle", key: "ventilation", label: "Ventilation System" },
    { type: "text", key: "previous_use", label: "Previous Use" },
  ],
  office: [
    { type: "number", key: "private_offices", label: "Private Offices" },
    { type: "number", key: "conference_rooms", label: "Conference Rooms" },
    {
      type: "select",
      key: "building_class",
      label: "Building Class",
      options: [
        { value: "a", label: "Class A" },
        { value: "b", label: "Class B" },
        { value: "c", label: "Class C" },
      ],
    },
    {
      type: "select",
      key: "layout_type",
      label: "Layout Type",
      options: [
        { value: "open_plan", label: "Open Plan" },
        { value: "private_offices", label: "Private Offices" },
        { value: "mixed", label: "Mixed" },
      ],
    },
    { type: "toggle", key: "natural_light", label: "Natural Light" },
    { type: "toggle", key: "plumbing_wet_columns", label: "Plumbing / Wet Columns" },
    { type: "toggle", key: "ada_accessible", label: "ADA Accessible" },
  ],
  warehouse: [
    { type: "number", key: "clear_height_ft", label: "Clear Height", unit: "ft", recommended: true },
    { type: "number", key: "loading_docks", label: "Loading Docks" },
    { type: "number", key: "drive_in_doors", label: "Drive-In Doors" },
    { type: "toggle", key: "three_phase_power", label: "3-Phase Power", recommended: true },
    { type: "toggle", key: "rail_access", label: "Rail Access" },
    { type: "text", key: "column_spacing", label: "Column Spacing (e.g. 30' × 40')" },
    { type: "text", key: "office_warehouse_ratio", label: "Office/Warehouse Ratio (e.g. 10/90)" },
    { type: "text", key: "floor_load_capacity", label: "Floor Load Capacity (e.g. 2,000 lbs/SF)" },
    { type: "text", key: "truck_court_depth", label: "Truck Court Depth (e.g. 120 ft)" },
  ],
  industrial: [
    { type: "number", key: "clear_height_ft", label: "Clear Height", unit: "ft", recommended: true },
    { type: "toggle", key: "three_phase_power", label: "3-Phase Power", recommended: true },
    { type: "number", key: "electrical_amps", label: "Electrical", unit: "amps" },
    { type: "text", key: "electrical_voltage", label: "Electrical Voltage (e.g. 480V)" },
    { type: "text", key: "crane_capacity", label: "Crane Capacity (e.g. 5-ton)" },
    { type: "toggle", key: "rail_access", label: "Rail Access" },
    {
      type: "select",
      key: "sprinkler_type",
      label: "Sprinkler System",
      options: [
        { value: "wet", label: "Wet" },
        { value: "dry", label: "Dry" },
        { value: "esfr", label: "ESFR" },
        { value: "none", label: "None" },
      ],
    },
  ],
  mixed_use: [
    { type: "textarea", key: "use_breakdown", label: "Use Breakdown (e.g. 60% retail, 40% residential)", recommended: true },
    { type: "number", key: "unit_count", label: "Total Units" },
    { type: "number", key: "number_of_floors", label: "Number of Floors" },
    { type: "text", key: "permitted_uses_commercial", label: "Permitted Uses" },
  ],
  community_facility: [
    { type: "toggle", key: "ada_accessible", label: "ADA Accessible", recommended: true },
    { type: "number", key: "occupancy_limit", label: "Occupancy Limit" },
    { type: "toggle", key: "separate_entrance", label: "Separate Entrance" },
    { type: "number", key: "capacity_min", label: "Minimum Capacity" },
    { type: "number", key: "capacity_max", label: "Maximum Capacity" },
    { type: "toggle", key: "waiting_room", label: "Waiting Room" },
  ],
  basement_commercial: [
    { type: "toggle", key: "moisture_waterproofing", label: "Moisture / Waterproofing", recommended: true },
    { type: "toggle", key: "ventilation", label: "Ventilation System", recommended: true },
    { type: "toggle", key: "separate_entrance", label: "Separate Entrance", recommended: true },
    { type: "toggle", key: "natural_light", label: "Natural Light" },
    { type: "toggle", key: "ada_accessible", label: "ADA Accessible" },
  ],
};

export const TYPE_SPECIFIC_FIELD_KEYS: Record<CommercialSpaceType, string[]> = Object.fromEntries(
  Object.entries(TYPE_SPECIFIC_FIELDS).map(([type, fields]) => [
    type,
    fields.map(f => f.key),
  ])
) as Record<CommercialSpaceType, string[]>;
