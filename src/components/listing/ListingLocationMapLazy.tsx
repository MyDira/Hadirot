import { lazy, Suspense } from 'react';
import type { ListingLocationMapProps } from './ListingLocationMap';

// Lazy wrapper for the listing-detail-page map so Mapbox doesn't ship in the
// main bundle. ListingDetail and CommercialListingDetail are eager routes
// (linked from browse feed), so eagerly importing mapbox-gl here pulls
// ~1.5 MB into the initial download.
const ListingLocationMapImpl = lazy(() =>
  import('./ListingLocationMap').then(m => ({ default: m.ListingLocationMap }))
);

function MapSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`w-full h-full bg-gray-100 animate-pulse rounded-lg flex items-center justify-center ${className}`}>
      <div className="text-gray-400 text-xs">Loading map…</div>
    </div>
  );
}

export function ListingLocationMap(props: ListingLocationMapProps) {
  return (
    <Suspense fallback={<MapSkeleton className={props.className} />}>
      <ListingLocationMapImpl {...props} />
    </Suspense>
  );
}
