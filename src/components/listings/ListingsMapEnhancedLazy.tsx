import { lazy, Suspense } from 'react';
import type { ListingsMapEnhancedProps } from './ListingsMapEnhanced';

// Mapbox is the heaviest dependency in the app (~1.5 MB). Loading the map
// component lazily means Browse pages render their listings + filters first,
// and the map slides in once Mapbox has downloaded. Users who never open the
// map viewport only pay for the rest of the page.
const ListingsMapEnhancedImpl = lazy(() =>
  import('./ListingsMapEnhanced').then(m => ({ default: m.ListingsMapEnhanced }))
);

function MapSkeleton() {
  return (
    <div className="w-full h-full bg-gray-100 animate-pulse flex items-center justify-center rounded-lg">
      <div className="text-gray-400 text-sm">Loading map…</div>
    </div>
  );
}

export function ListingsMapEnhanced(props: ListingsMapEnhancedProps) {
  return (
    <Suspense fallback={<MapSkeleton />}>
      <ListingsMapEnhancedImpl {...props} />
    </Suspense>
  );
}
