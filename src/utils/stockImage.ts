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

// Supabase Storage supports server-side image transforms via the `transform`
// option on getPublicUrl. Hadirot uploads photos at camera resolution
// (3–12 MP); without transforms the browser downloads the full file even when
// displaying a small thumbnail. Applying a size-appropriate transform per
// variant cuts image payload by 80–95%.
//
// Variants are sized for their display context:
//   - card:    browse grid thumbnails (~800x533 @ 2x for retina)
//   - popup:   map pin popups (~400x267 @ 2x)
//   - hero:    listing detail primary image (~1400x933 @ 2x)
//   - full:    no transform (used for lightbox / download flows)
export type ListingImageVariant = 'card' | 'popup' | 'hero' | 'full';

const VARIANT_TRANSFORMS: Record<Exclude<ListingImageVariant, 'full'>, { width: number; height: number; quality: number }> = {
  card:  { width: 800,  height: 533, quality: 75 },
  popup: { width: 400,  height: 267, quality: 70 },
  hero:  { width: 1400, height: 933, quality: 80 },
};

export function normalizeImageUrl(url: string, variant: ListingImageVariant = 'card'): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/stock/')) return url;

  const transform = variant === 'full' ? undefined : {
    ...VARIANT_TRANSFORMS[variant],
    resize: 'cover' as const,
  };

  return supabase.storage
    .from('listing-images')
    .getPublicUrl(url, transform ? { transform } : undefined)
    .data.publicUrl;
}

export function computePrimaryListingImage(
  images: Array<{ image_url: string }> | undefined | null,
  seed: {
    id?: string | null;
    addressLine?: string | null;
    city?: string | null;
    price?: number | null;
  },
  videoThumbnailUrl?: string | null,
  variant: ListingImageVariant = 'card'
): { url: string; isStock: boolean } {
  const hasReal = Array.isArray(images) && images.length > 0;
  if (hasReal) {
    return { url: normalizeImageUrl(images[0].image_url, variant), isStock: false };
  }
  if (videoThumbnailUrl) {
    return { url: normalizeImageUrl(videoThumbnailUrl, variant), isStock: false };
  }
  return { url: getStockImageForListing(seed), isStock: true };
}