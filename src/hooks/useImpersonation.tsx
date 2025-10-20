import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, Profile, ImpersonationSession } from '../config/supabase';
import { useAuth } from './useAuth';

interface ImpersonationContextValue {
  isImpersonating: boolean;
  impersonationSession: ImpersonationSession | null;
  impersonatedProfile: Profile | null;
  adminProfile: Profile | null;
  timeRemainingSeconds: number | null;
  isExpired: boolean;
  loading: boolean;
  error: string | null;
  startImpersonation: (userId: string) => Promise<void>;
  endImpersonation: () => Promise<void>;
  logAction: (actionType: string, actionDetails?: Record<string, any>, pagePath?: string) => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextValue | undefined>(undefined);

const STORAGE_KEY = 'impersonation_session';
const CHECK_INTERVAL = 30000; // Check every 30 seconds

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const { user, profile, refreshProfile, setProfile } = useAuth();
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonationSession, setImpersonationSession] = useState<ImpersonationSession | null>(null);
  const [impersonatedProfile, setImpersonatedProfile] = useState<Profile | null>(null);
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate time remaining
  useEffect(() => {
    if (!impersonationSession) {
      setTimeRemainingSeconds(null);
      return;
    }

    const updateTimeRemaining = () => {
      const now = new Date();
      const expiresAt = new Date(impersonationSession.expires_at);
      const remaining = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);

      if (remaining <= 0) {
        setIsExpired(true);
        setTimeRemainingSeconds(0);
      } else {
        setTimeRemainingSeconds(remaining);
      }
    };

    updateTimeRemaining();
    const interval = setInterval(updateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [impersonationSession]);

  // Auto-end session on expiration
  useEffect(() => {
    if (isExpired && isImpersonating) {
      handleExpiration();
    }
  }, [isExpired, isImpersonating]);

  const handleExpiration = async () => {
    console.log('Impersonation session expired, ending...');
    await endImpersonation();
    alert('Impersonation session has expired. Returning to admin account.');
    window.location.href = '/admin?tab=users';
  };

  // Restore session from storage on mount
  useEffect(() => {
    const storedSession = sessionStorage.getItem(STORAGE_KEY);
    if (storedSession && user && profile?.is_admin) {
      try {
        const parsed = JSON.parse(storedSession);

        // Check if session is still valid
        const expiresAt = new Date(parsed.session.expires_at);
        if (expiresAt > new Date()) {
          setImpersonationSession(parsed.session);
          setImpersonatedProfile(parsed.impersonatedProfile);
          setAdminProfile(parsed.adminProfile);
          setIsImpersonating(true);

          // Update auth profile to impersonated user
          setProfile(parsed.impersonatedProfile);
        } else {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      } catch (err) {
        console.error('Failed to restore impersonation session:', err);
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [user, profile?.is_admin]);

  // Periodic session validity check
  useEffect(() => {
    if (!isImpersonating || !impersonationSession) return;

    const checkSessionValidity = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-impersonation-status`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ session_token: impersonationSession.session_token }),
          }
        );

        const result = await response.json();

        if (!result.valid) {
          console.log('Session no longer valid:', result);
          setIsExpired(true);
        }
      } catch (err) {
        console.error('Error checking session validity:', err);
      }
    };

    const interval = setInterval(checkSessionValidity, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [isImpersonating, impersonationSession]);

  const startImpersonation = useCallback(async (userId: string) => {
    if (!user || !profile?.is_admin) {
      throw new Error('Only admins can impersonate users');
    }

    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/start-impersonation`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ impersonated_user_id: userId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start impersonation');
      }

      const data = await response.json();

      // Store session data
      const sessionData = {
        session: data.session,
        impersonatedProfile: data.impersonated_profile,
        adminProfile: profile,
      };

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));

      setImpersonationSession(data.session);
      setImpersonatedProfile(data.impersonated_profile);
      setAdminProfile(profile);
      setIsImpersonating(true);

      // Switch the auth context to the impersonated user
      setProfile(data.impersonated_profile);

      // Log the page view
      await logAction('page_view', { page: window.location.pathname });

    } catch (err: any) {
      console.error('Error starting impersonation:', err);
      setError(err.message || 'Failed to start impersonation');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user, profile, setProfile]);

  const endImpersonation = useCallback(async () => {
    if (!impersonationSession) {
      return;
    }

    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/end-impersonation`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ session_token: impersonationSession.session_token }),
        }
      );

      // Clear state
      sessionStorage.removeItem(STORAGE_KEY);
      setImpersonationSession(null);
      setImpersonatedProfile(null);
      setIsImpersonating(false);
      setIsExpired(false);
      setTimeRemainingSeconds(null);

      // Restore admin profile
      if (adminProfile) {
        setProfile(adminProfile);
      } else {
        await refreshProfile();
      }

      setAdminProfile(null);

    } catch (err: any) {
      console.error('Error ending impersonation:', err);
      setError(err.message || 'Failed to end impersonation');
    } finally {
      setLoading(false);
    }
  }, [impersonationSession, adminProfile, refreshProfile, setProfile]);

  const logAction = useCallback(async (
    actionType: string,
    actionDetails?: Record<string, any>,
    pagePath?: string
  ) => {
    if (!isImpersonating || !impersonationSession) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/log-impersonation-action`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            session_token: impersonationSession.session_token,
            action_type: actionType,
            action_details: actionDetails || {},
            page_path: pagePath || window.location.pathname,
          }),
        }
      );
    } catch (err) {
      console.error('Error logging action:', err);
    }
  }, [isImpersonating, impersonationSession]);

  // Log page changes
  useEffect(() => {
    if (isImpersonating) {
      logAction('page_view', { page: window.location.pathname });
    }
  }, [window.location.pathname, isImpersonating, logAction]);

  const value: ImpersonationContextValue = {
    isImpersonating,
    impersonationSession,
    impersonatedProfile,
    adminProfile,
    timeRemainingSeconds,
    isExpired,
    loading,
    error,
    startImpersonation,
    endImpersonation,
    logAction,
  };

  return (
    <ImpersonationContext.Provider value={value}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const context = useContext(ImpersonationContext);
  if (!context) {
    throw new Error('useImpersonation must be used within ImpersonationProvider');
  }
  return context;
}
