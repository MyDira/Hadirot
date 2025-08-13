import { useEffect } from "react";
import { gaEvent, gaListing } from "@/lib/ga";

function fireAll() {
  const listingId = "TEST-123";

  // Browse page batch
  gaEvent("listing_impression_batch", {
    page: 1,
    result_count: 3,
    items: [
      { listing_id: "TEST-1", price: 2400, bedrooms: 2, neighborhood: "Midwood", is_featured: true, position: 1 },
      { listing_id: "TEST-2", price: 3200, bedrooms: 3, neighborhood: "Boro Park", is_featured: false, position: 2 },
      { listing_id: "TEST-3", price: 1800, bedrooms: 1, neighborhood: "Flatbush", is_featured: false, position: 3 },
    ],
  });

  // Card click
  gaListing("listing_click", listingId, {
    title: "Test Listing",
    price: 2400,
    bedrooms: 2,
    neighborhood: "Midwood",
    is_featured: true,
    position: 1,
  });

  // Detail view + scrolls
  gaListing("listing_view", listingId, {
    price: 2400, bedrooms: 2, bathrooms: 1, neighborhood: "Midwood", is_featured: true,
  });
  gaListing("listing_scroll", listingId, { depth: 25 });
  gaListing("listing_scroll", listingId, { depth: 50 });
  gaListing("listing_scroll", listingId, { depth: 75 });
  gaListing("listing_scroll", listingId, { depth: 100 });

  // Gallery (optional)
  gaEvent("image_view", { listing_id: listingId, index: 0 });
  gaEvent("image_expand", { listing_id: listingId, index: 0 });

  // Contact + favorite
  gaListing("listing_contact_click", listingId, { contact_method: "phone" });
  gaListing("listing_favorite", listingId);
  gaListing("listing_unfavorite", listingId);

  // Filters
  gaEvent("filter_apply", {
    price_min: 1800, price_max: 3000, bedrooms: 2, neighborhood: "Midwood", no_fee_only: true, sort: "newest",
  });

  // Posting funnel
  gaEvent("post_start", { role: "landlord" });
  gaEvent("post_submit", { role: "landlord" });
  gaEvent("post_submit_success", { role: "landlord", listing_id: "TEST-NEW-1" });
}

export default function GASmokeTest() {
  useEffect(() => {
    // Expose manual trigger in console
    (window as any).gaSmokeTest = fireAll;
    // Auto-fire when URL flag present
    const params = new URLSearchParams(window.location.search);
    const shouldRun = params.get("ga_test") === "1";
    if (shouldRun) fireAll();
    return () => { delete (window as any).gaSmokeTest; };
  }, []);
  return null;
}
