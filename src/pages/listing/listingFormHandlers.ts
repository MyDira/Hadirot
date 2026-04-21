import type React from "react";
import type { ListingFormData } from "../postListing/types";

interface CreateInputChangeHandlerOptions {
  // PostListing auto-syncs utilities_included when heat changes (heat=included
  // adds 'heat' to utilities, otherwise removes it). EditListing doesn't sync
  // today — pass syncHeatUtilities=true if you want parity.
  syncHeatUtilities?: boolean;
  // Hook for draft-saving / analytics triggered on any field change.
  onInteraction?: () => void;
}

type FormChangeEvent = React.ChangeEvent<
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
>;

export function createListingInputChangeHandler(
  setFormData: React.Dispatch<React.SetStateAction<ListingFormData>>,
  options: CreateInputChangeHandlerOptions = {},
) {
  const { syncHeatUtilities = false, onInteraction } = options;

  return (e: FormChangeEvent) => {
    onInteraction?.();
    const { name, value } = e.target;
    const type = e.target.type;

    if (type === "checkbox") {
      const checked = (e.target as HTMLInputElement).checked;
      if (name === "broker_fee") {
        if (checked) {
          alert(
            "Listings with a tenant broker fee are not permitted on HaDirot. Please remove the fee to proceed.",
          );
        }
        setFormData((prev) => ({ ...prev, broker_fee: false }));
        return;
      }
      setFormData((prev) => ({ ...prev, [name]: checked }));
      return;
    }

    if (type === "number") {
      const numValue = value === "" ? undefined : parseFloat(value);
      setFormData((prev) => ({ ...prev, [name]: numValue }));
      return;
    }

    if (syncHeatUtilities && name === "heat") {
      setFormData((prev) => {
        const utilities = prev.utilities_included || [];
        const newUtilities =
          value === "included"
            ? utilities.includes("heat") ? utilities : [...utilities, "heat"]
            : utilities.filter((u) => u !== "heat");
        return { ...prev, heat: value as ListingFormData["heat"], utilities_included: newUtilities };
      });
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };
}
