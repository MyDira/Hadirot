import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { supabase } from '@/config/supabase';
import { initAnalytics, setSuppressAnalytics, setUserId, track } from '@/lib/analytics';
import { setGADisabled } from '@/lib/ga';
import { useAuth } from './useAuth';

export function useAnalyticsInit(): void {
  const location = useLocation();
  const previousPathname = useRef<string | null>(null);
  const { user, profile, loading } = useAuth();

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
    // Resolve admin gating once auth is done loading. While loading, leave
    // suppression as `null` so events queue but do not flush — this prevents
    // leaking an admin's initial page_view / session_start before we know
    // who they are. Re-evaluates if profile.is_admin changes (login/logout).
    if (loading) {
      return;
    }
    setSuppressAnalytics(profile?.is_admin === true);
    setGADisabled(profile?.is_admin === true);
  }, [loading, profile?.is_admin]);

  useEffect(() => {
    const pathname = location.pathname;
    if (previousPathname.current === pathname) {
      return;
    }
    previousPathname.current = pathname;
    track('page_view', { path: pathname });
  }, [location.pathname]);
}
