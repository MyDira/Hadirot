import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { supabase } from '@/config/supabase';
import { initAnalytics, setUserId, track } from '@/lib/analytics';
import { useAuth } from './useAuth';

export function useAnalyticsInit(): void {
  const location = useLocation();
  const previousPathname = useRef<string | null>(null);
  const { user, profile } = useAuth();

  useEffect(() => {
    initAnalytics(supabase);
  }, []);

  useEffect(() => {
    // Set user ID for both analytics and Sentry
    setUserId(user?.id ?? null);

    if (user) {
      // Set Sentry user context with non-PII data
      Sentry.setUser({
        id: user.id,
        role: profile?.role,
      });
    } else {
      // Clear Sentry user context on logout
      Sentry.setUser(null);
    }
  }, [user?.id, profile?.role]);

  useEffect(() => {
    const pathname = location.pathname;
    if (previousPathname.current === pathname) {
      return;
    }
    previousPathname.current = pathname;
    track('page_view', { path: pathname });
  }, [location.pathname]);
}
