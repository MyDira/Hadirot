// src/utils/stockImage.ts
// Deterministically map a listing to one of our stock photos for even coverage.
// We avoid random() so the same listing always shows the same stock image.

import { supabase } from '../config/supabase';

const STOCK_IMAGES = [
  "/stock/living-01.jpg",
  "/stock/living-02.jpg",
  "/stock/living-03.jpg",
  "/stock/living-04.jpg",
  "/stock/living-05.jpg",
  "/stock/living-06.jpg",
  "/stock/living-07.jpg",
  "/stock/living-08.jpg",
  "/stock/living-09.jpg",
  "/stock/living-10.jpg",
];

// Simple string hash
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getStockImageForListing(seed: {
  id?: string | null;
  addressLine?: string | null;
  city?: string | null;
  price?: number | null;
}): string {
  const base =
    (seed.id ?? "") +
    "|" +
    (seed.addressLine ?? "") +
    "|" +
    (seed.city ?? "") +
    "|" +
    (seed.price ?? "");

  const idx = hashString(base || "fallback") % STOCK_IMAGES.length;
  return STOCK_IMAGES[idx];
}

function normalizeImageUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/stock/')) return url;
  return supabase.storage.from('listing-images').getPublicUrl(url).data.publicUrl;
}

export function computePrimaryListingImage(
  images: Array<{ image_url: string }> | undefined | null,
  seed: {
    id?: string | null;
    addressLine?: string | null;
    city?: string | null;
    price?: number | null;
  },
  videoThumbnailUrl?: string | null
): { url: string; isStock: boolean } {
  const hasReal = Array.isArray(images) && images.length > 0;
  if (hasReal) {
    return { url: normalizeImageUrl(images[0].image_url), isStock: false };
  }
  if (videoThumbnailUrl) {
    return { url: normalizeImageUrl(videoThumbnailUrl), isStock: false };
  }
  return { url: getStockImageForListing(seed), isStock: true };
}