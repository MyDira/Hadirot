/**
 * Neighborhood "areas" for the browse filters.
 *
 * Listings store a single free-text `neighborhood` string, which means the raw
 * filter list ends up long, full of tiny neighborhoods, and occasionally holds
 * two spellings of the same place ("Boro Park" / "Borough Park"). These helpers
 * layer two conveniences on top of that raw list without changing how filtering
 * works — `filters.neighborhoods` still holds the raw DB strings:
 *
 *   1. Aliases collapse spelling variants into one canonical option.
 *   2. Areas group nearby neighborhoods people think of together, so picking
 *      "Flatbush Area" searches everything associated with Flatbush.
 *
 * Anything that does not belong to a known area still shows up on its own under
 * "Other Neighborhoods", so new neighborhoods appear automatically as the site
 * grows past these areas.
 */

export interface NeighborhoodArea {
  id: string;
  /** Shown in the picker and as the filter pill label. */
  label: string;
  /** Canonical neighborhood names that belong to this area. */
  members: string[];
}

/**
 * Canonical display name -> alternate spellings seen in listing data.
 * Matching ignores case and punctuation, so only genuinely different wordings
 * belong here ("GEORGETOWN" and "George Town" already collapse on their own).
 */
const NEIGHBORHOOD_ALIASES: Record<string, string[]> = {
  "Boro Park": ["Borough Park", "BoroPark", "B.P."],
  Midwood: ["Mid Wood"],
  "Ditmas Park": ["Ditmas"],
  "East Flatbush": ["E Flatbush", "E. Flatbush"],
  "Prospect Park South": ["Prospect Pk South", "PPS"],
  "Marine Park": ["Marine Pk"],
  "Bergen Beach": ["Bergen Bch"],
  "Gerritsen Beach": ["Gerritsen Bch"],
  "Sheepshead Bay": ["Sheepshead"],
  "Dyker Heights": ["Dyker Hts"],
  "Fiske Terrace": ["Fiske Terr"],
  "Manhattan Beach": ["Man Beach"],
  "Brighton Beach": ["Brighton"],
  // Misspellings seen in posted listings.
  Kensington: ["Kengsinton", "Kensingtn"],
};

/**
 * Areas MUST NOT overlap. A neighborhood in two areas makes selecting one area
 * silently drop listings out of the other when it is cleared, and lights up an
 * area the user never touched — so each neighborhood belongs to exactly one.
 */
export const NEIGHBORHOOD_AREAS: NeighborhoodArea[] = [
  {
    id: "boro-park",
    label: "Boro Park Area",
    members: [
      "Boro Park",
      "Mapleton",
      "Kensington",
      "Bensonhurst",
      "Sunset Park",
      "Dyker Heights",
      "Windsor Terrace",
    ],
  },
  {
    id: "flatbush",
    label: "Flatbush Area",
    members: [
      "Flatbush",
      "Midwood",
      "Ditmas Park",
      "Madison",
      "Homecrest",
      "Gravesend",
      "Sheepshead Bay",
      "East Flatbush",
      "Prospect Park South",
      "Fiske Terrace",
    ],
  },
  {
    id: "marine-park",
    label: "Marine Park / Mill Basin Area",
    members: [
      "Marine Park",
      "Mill Basin",
      "Bergen Beach",
      "Georgetown",
      "Flatlands",
      "Gerritsen Beach",
      "Farragut",
    ],
  },
];

/** Lowercased, punctuation-free key used for all neighborhood comparisons. */
export function normalizeNeighborhood(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const CANONICAL_BY_KEY = new Map<string, string>();
// Every area member is a canonical name in its own right, so a listing saved as
// "GEORGETOWN" still resolves to the "Georgetown" that the area references.
for (const area of NEIGHBORHOOD_AREAS) {
  for (const member of area.members) {
    CANONICAL_BY_KEY.set(normalizeNeighborhood(member), member);
  }
}
for (const [canonical, aliases] of Object.entries(NEIGHBORHOOD_ALIASES)) {
  CANONICAL_BY_KEY.set(normalizeNeighborhood(canonical), canonical);
  for (const alias of aliases) {
    CANONICAL_BY_KEY.set(normalizeNeighborhood(alias), canonical);
  }
}

/** Resolve a raw listing value to the name we display for it. */
export function canonicalNeighborhoodName(raw: string): string {
  const trimmed = raw.trim();
  return CANONICAL_BY_KEY.get(normalizeNeighborhood(trimmed)) || trimmed;
}

/** Every search term that should match a canonical neighborhood. */
function searchTermsFor(canonical: string, rawValues: string[]): string[] {
  return [canonical, ...(NEIGHBORHOOD_ALIASES[canonical] || []), ...rawValues];
}

export interface NeighborhoodOption {
  /** Canonical display name. */
  name: string;
  /** Raw listing values this option filters on — selected/cleared together. */
  values: string[];
  /** Active listings in this neighborhood, or 0 when counts are unavailable. */
  count: number;
  searchTerms: string[];
}

export interface NeighborhoodAreaGroup {
  id: string;
  label: string;
  /** Only the area members that actually have listings right now. */
  options: NeighborhoodOption[];
  values: string[];
  count: number;
}

export interface NeighborhoodOptionTree {
  areas: NeighborhoodAreaGroup[];
  /** Neighborhoods that belong to no area, alphabetical. */
  others: NeighborhoodOption[];
  /** Flat list of every option, for lookups. */
  allOptions: NeighborhoodOption[];
}

const EMPTY_TREE: NeighborhoodOptionTree = {
  areas: [],
  others: [],
  allOptions: [],
};

/**
 * Turn the raw neighborhood strings on the page into the grouped, de-duplicated
 * option tree the picker renders.
 */
export function buildNeighborhoodOptions(
  rawNeighborhoods: string[],
  counts: Record<string, number> = {},
): NeighborhoodOptionTree {
  if (!rawNeighborhoods || rawNeighborhoods.length === 0) return EMPTY_TREE;

  // Collapse spelling variants into one option per canonical name. Grouping on
  // the normalized key (rather than the resolved name) means casing variants of
  // an unknown neighborhood merge too, instead of listing twice.
  const byCanonical = new Map<
    string,
    { name: string; values: string[]; count: number }
  >();
  for (const raw of rawNeighborhoods) {
    const trimmed = (raw || "").trim();
    if (!trimmed) continue;
    const canonical = canonicalNeighborhoodName(trimmed);
    const key = normalizeNeighborhood(canonical);
    const entry = byCanonical.get(key) || {
      name: canonical,
      values: [],
      count: 0,
    };
    if (!entry.values.includes(trimmed)) {
      entry.values.push(trimmed);
      entry.count += counts[trimmed] ?? 0;
    }
    byCanonical.set(key, entry);
  }

  const optionByKey = new Map<string, NeighborhoodOption>();
  for (const [key, { name, values, count }] of byCanonical) {
    optionByKey.set(key, {
      name,
      values,
      count,
      searchTerms: searchTermsFor(name, values),
    });
  }

  const grouped = new Set<string>();
  const areas: NeighborhoodAreaGroup[] = [];

  for (const area of NEIGHBORHOOD_AREAS) {
    const options: NeighborhoodOption[] = [];
    for (const member of area.members) {
      const option = optionByKey.get(normalizeNeighborhood(member));
      if (option) options.push(option);
    }
    if (options.length === 0) continue;

    options.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    options.forEach((o) => grouped.add(o.name));

    areas.push({
      id: area.id,
      label: area.label,
      options,
      values: options.flatMap((o) => o.values),
      count: options.reduce((sum, o) => sum + o.count, 0),
    });
  }

  areas.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const others = [...optionByKey.values()]
    .filter((o) => !grouped.has(o.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    areas,
    others,
    allOptions: [...optionByKey.values()],
  };
}

/** True when every raw value behind `option` is currently selected. */
export function isOptionSelected(
  option: NeighborhoodOption,
  selected: string[],
): boolean {
  return option.values.every((v) => selected.includes(v));
}

export function toggleOption(
  option: NeighborhoodOption,
  selected: string[],
): string[] {
  return isOptionSelected(option, selected)
    ? selected.filter((v) => !option.values.includes(v))
    : [...selected, ...option.values.filter((v) => !selected.includes(v))];
}

export function toggleArea(
  area: NeighborhoodAreaGroup,
  selected: string[],
): string[] {
  const allSelected = area.options.every((o) => isOptionSelected(o, selected));
  return allSelected
    ? selected.filter((v) => !area.values.includes(v))
    : [...selected, ...area.values.filter((v) => !selected.includes(v))];
}

/**
 * Label for the "Neighborhood" pill: prefers the friendly area name when a
 * whole area is selected, and falls back to a count.
 */
export function neighborhoodFilterLabel(
  selected: string[] | undefined,
  tree: NeighborhoodOptionTree,
  fallback = "Neighborhood",
): string {
  if (!selected || selected.length === 0) return fallback;

  const fullAreas = tree.areas.filter(
    (a) => a.options.length > 0 && a.options.every((o) => isOptionSelected(o, selected)),
  );
  const coveredByAreas = new Set(fullAreas.flatMap((a) => a.values));
  const extras = tree.allOptions.filter(
    (o) =>
      isOptionSelected(o, selected) &&
      !o.values.every((v) => coveredByAreas.has(v)),
  );

  if (fullAreas.length === 1 && extras.length === 0) return fullAreas[0].label;
  if (fullAreas.length === 0 && extras.length === 1) return extras[0].name;

  const total = fullAreas.length + extras.length;
  // Selected values we could not map back to a known option (e.g. an old link).
  if (total === 0) {
    return selected.length === 1 ? selected[0] : `${selected.length} Neighborhoods`;
  }
  if (extras.length === 0) return `${total} Areas`;
  if (fullAreas.length === 0) return `${total} Neighborhoods`;
  return `${total} Selected`;
}
