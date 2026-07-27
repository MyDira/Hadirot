import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import {
  buildNeighborhoodOptions,
  isOptionSelected,
  normalizeNeighborhood,
  toggleArea,
  toggleOption,
  type NeighborhoodAreaGroup,
  type NeighborhoodOption,
} from "../../config/neighborhoodAreas";

interface NeighborhoodPickerProps {
  /** Raw neighborhood values present in the current listing set. */
  allNeighborhoods: string[];
  /** Raw value -> active listing count, used for the count badges. */
  neighborhoodCounts?: Record<string, number>;
  /** Currently selected raw values (`filters.neighborhoods`). */
  selected: string[];
  /** Receives the next raw values, or undefined when nothing is selected. */
  onChange: (next: string[] | undefined) => void;
  /** `dropdown` is the compact desktop popover, `panel` the modal/mobile list. */
  variant?: "dropdown" | "panel";
}

function TriStateCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !checked && indeterminate;
  }, [checked, indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="h-4 w-4 shrink-0 text-green-600 focus:ring-green-500 border-gray-300 rounded"
    />
  );
}

function CountBadge({ count }: { count: number }) {
  if (!count) return null;
  return <span className="ml-auto text-xs text-gray-400 tabular-nums">{count}</span>;
}

export function NeighborhoodPicker({
  allNeighborhoods,
  neighborhoodCounts,
  selected,
  onChange,
  variant = "panel",
}: NeighborhoodPickerProps) {
  const [query, setQuery] = useState("");
  const [expandedAreas, setExpandedAreas] = useState<string[]>([]);

  const tree = useMemo(
    () => buildNeighborhoodOptions(allNeighborhoods, neighborhoodCounts),
    [allNeighborhoods, neighborhoodCounts],
  );

  const normalizedQuery = normalizeNeighborhood(query);
  const isSearching = normalizedQuery.length > 0;

  const matchesQuery = (terms: string[]) =>
    terms.some((term) => normalizeNeighborhood(term).includes(normalizedQuery));

  // While searching, show only matching areas/neighborhoods. An area whose own
  // name matches keeps all of its neighborhoods visible. When only some of an
  // area's neighborhoods match, its checkbox and count narrow to those matches
  // so the row always describes exactly what is listed under it.
  const visibleAreas = useMemo(() => {
    if (!isSearching) return tree.areas;
    const result: NeighborhoodAreaGroup[] = [];
    for (const area of tree.areas) {
      if (matchesQuery([area.label])) {
        result.push(area);
        continue;
      }
      const options = area.options.filter((o) => matchesQuery(o.searchTerms));
      if (options.length === 0) continue;
      result.push({
        ...area,
        options,
        values: options.flatMap((o) => o.values),
        count: options.reduce((sum, o) => sum + o.count, 0),
      });
    }
    return result;
  }, [tree.areas, isSearching, normalizedQuery]);

  const visibleOthers = useMemo(() => {
    if (!isSearching) return tree.others;
    return tree.others.filter((o) => matchesQuery(o.searchTerms));
  }, [tree.others, isSearching, normalizedQuery]);

  const commit = (next: string[]) => onChange(next.length > 0 ? next : undefined);

  const toggleExpanded = (id: string) =>
    setExpandedAreas((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );

  const renderOption = (option: NeighborhoodOption, indented: boolean) => {
    const checked = isOptionSelected(option, selected);
    return (
      <label
        key={option.name}
        className={`flex items-center gap-3 py-2.5 pr-4 hover:bg-gray-50 cursor-pointer rounded-lg ${
          indented ? "pl-11" : "pl-4"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => commit(toggleOption(option, selected))}
          className="h-4 w-4 shrink-0 text-green-600 focus:ring-green-500 border-gray-300 rounded"
        />
        <span className="text-sm text-gray-700">{option.name}</span>
        <CountBadge count={option.count} />
      </label>
    );
  };

  const hasResults = visibleAreas.length > 0 || visibleOthers.length > 0;

  return (
    <div className={variant === "dropdown" ? "w-[320px]" : ""}>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search neighborhoods or areas"
          className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear neighborhood search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div
        className={`overflow-y-auto border border-gray-200 rounded-xl py-1 ${
          variant === "dropdown" ? "max-h-80" : "max-h-64"
        }`}
      >
        {!hasResults && (
          <div className="px-4 py-3 text-sm text-gray-500">
            {allNeighborhoods.length === 0
              ? "No neighborhoods available"
              : `No neighborhoods match "${query}"`}
          </div>
        )}

        {visibleAreas.map((area) => {
          const selectedCount = area.options.filter((o) =>
            isOptionSelected(o, selected),
          ).length;
          const allSelected = selectedCount === area.options.length;
          const isExpanded = isSearching || expandedAreas.includes(area.id);

          return (
            <div key={area.id}>
              <div className="flex items-center gap-3 pl-4 pr-2 py-2.5 hover:bg-gray-50 rounded-lg">
                <TriStateCheckbox
                  checked={allSelected}
                  indeterminate={selectedCount > 0}
                  onChange={() => commit(toggleArea(area, selected))}
                  label={area.label}
                />
                <button
                  type="button"
                  onClick={() => commit(toggleArea(area, selected))}
                  className="text-sm font-semibold text-gray-900 text-left"
                >
                  {area.label}
                </button>
                <CountBadge count={area.count} />
                <button
                  type="button"
                  onClick={() => toggleExpanded(area.id)}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Hide" : "Show"} neighborhoods in ${area.label}`}
                  className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-40"
                  disabled={isSearching}
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>
              </div>
              {isExpanded && area.options.map((o) => renderOption(o, true))}
            </div>
          );
        })}

        {visibleOthers.length > 0 && (
          <>
            {visibleAreas.length > 0 && (
              <div className="px-4 pt-3 pb-1 mt-1 border-t border-gray-100 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Other Neighborhoods
              </div>
            )}
            {visibleOthers.map((o) => renderOption(o, false))}
          </>
        )}
      </div>

      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="mt-3 text-sm font-medium text-green-600 hover:text-green-700"
        >
          Clear neighborhoods
        </button>
      )}
    </div>
  );
}
