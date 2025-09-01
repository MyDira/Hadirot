import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '../lib/analytics';

export function usePageTracking() {
  const location = useLocation();
  const previousPathname = useRef<string>('');

  useEffect(() => {
    // Track page view on route changes
    const currentPathname = location.pathname;
    
    // Only track if the pathname actually changed (not just search params or hash)
    if (currentPathname !== previousPathname.current) {
      trackPageView();
      previousPathname.current = currentPathname;
    }
  }, [location.pathname]);
}