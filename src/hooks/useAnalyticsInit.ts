import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { initAnalytics, setUserId, track } from '@/lib/analytics';
import { useAuth } from './useAuth';

export function useAnalyticsInit(): void {
  const location = useLocation();
  const previousPathname = useRef<string | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    initAnalytics(supabase);
  }, []);

  useEffect(() => {
    setUserId(user?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    const pathname = location.pathname;
    if (previousPathname.current === pathname) {
      return;
    }
    previousPathname.current = pathname;
    track('page_view', { path: pathname });
  }, [location.pathname]);
}
