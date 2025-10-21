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

  // Restore session from storage on mount (only run once when user is loaded)
  useEffect(() => {
    if (!user || isImpersonating) return;

    const storedSession = sessionStorage.getItem(STORAGE_KEY);
    if (storedSession) {
      try {
        const parsed = JSON.parse(storedSession);

        // Check if session is still valid
        const expiresAt = new Date(parsed.session.expires_at);
        if (expiresAt > new Date() && user.id === parsed.impersonatedUserId) {
          // We're already logged in as the impersonated user
          setImpersonationSession(parsed.session);
          setImpersonatedProfile(parsed.impersonatedProfile);
          setAdminProfile(parsed.adminProfile);
          setIsImpersonating(true);
        } else {
          // Session expired or we're not the impersonated user, clear it
          sessionStorage.removeItem(STORAGE_KEY);
        }
      } catch (err) {
        console.error('Failed to restore impersonation session:', err);
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [user?.id, isImpersonating]);

  // Periodic session validity check (simplified - just check expiration time)
  useEffect(() => {
    if (!isImpersonating || !impersonationSession) return;

    const checkSessionValidity = () => {
      try {
        const expiresAt = new Date(impersonationSession.expires_at);
        const now = new Date();

        if (now >= expiresAt) {
          console.log('Session expired based on expires_at');
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
      console.log('[useImpersonation] Starting impersonation for user:', userId);
      console.log('[useImpersonation] Current user:', user?.id);
      console.log('[useImpersonation] Profile is_admin:', profile?.is_admin);

      // Store the current admin session before switching
      const { data: { session: currentSession } } = await supabase.auth.getSession();

      if (!currentSession) {
        throw new Error('No active session found');
      }

      const { data, error } = await supabase.functions.invoke('start-impersonation', {
        body: { impersonated_user_id: userId },
      });

      console.log('[useImpersonation] Function response:', { data, error });

      if (error) {
        console.error('[useImpersonation] Error object:', JSON.stringify(error, null, 2));
        throw new Error(error.message || 'Failed to start impersonation');
      }

      if (!data || !data.session || !data.impersonated_profile) {
        console.error('[useImpersonation] Invalid data structure:', data);
        throw new Error('Invalid response from server');
      }

      console.log('[useImpersonation] Session created successfully:', data.session.session_token);

      // Store admin session and impersonation data
      const sessionData = {
        adminSession: {
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        },
        session: data.session,
        impersonatedProfile: data.impersonated_profile,
        adminProfile: profile,
        adminUserId: user.id,
        impersonatedUserId: userId,
      };

      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));

      // Now sign out the admin and sign in as the impersonated user
      // We'll use the service role to create a session for the impersonated user
      console.log('[useImpersonation] Switching to impersonated user session...');

      // Call a new edge function that creates an auth session for the impersonated user
      const { data: authData, error: authError } = await supabase.functions.invoke('create-impersonation-auth-session', {
        body: {
          session_token: data.session.session_token,
          impersonated_user_id: userId,
        },
      });

      if (authError || !authData?.access_token) {
        throw new Error('Failed to create auth session for impersonated user');
      }

      // Set the new session
      const { error: setSessionError } = await supabase.auth.setSession({
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
      });

      if (setSessionError) {
        throw new Error('Failed to switch to impersonated user session');
      }

      setImpersonationSession(data.session);
      setImpersonatedProfile(data.impersonated_profile);
      setAdminProfile(profile);
      setIsImpersonating(true);

      // Reload the page to ensure all auth state is refreshed
      window.location.href = '/dashboard';

    } catch (err: any) {
      console.error('Error starting impersonation:', err);
      setError(err.message || 'Failed to start impersonation');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  const endImpersonation = useCallback(async () => {
    if (!impersonationSession) {
      return;
    }

    setLoading(true);

    try {
      // Get the stored admin session
      const storedData = sessionStorage.getItem(STORAGE_KEY);
      let adminSession = null;

      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          adminSession = parsed.adminSession;
        } catch (e) {
          console.error('Failed to parse stored session data:', e);
        }
      }

      const { error } = await supabase.functions.invoke('end-impersonation', {
        body: { session_token: impersonationSession.session_token },
      });

      if (error) {
        console.error('Error ending impersonation:', error);
      }

      // Clear state
      sessionStorage.removeItem(STORAGE_KEY);
      setImpersonationSession(null);
      setImpersonatedProfile(null);
      setIsImpersonating(false);
      setIsExpired(false);
      setTimeRemainingSeconds(null);
      setAdminProfile(null);

      // Restore the admin session
      if (adminSession?.access_token && adminSession?.refresh_token) {
        console.log('[useImpersonation] Restoring admin session');
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: adminSession.access_token,
          refresh_token: adminSession.refresh_token,
        });

        if (setSessionError) {
          console.error('Failed to restore admin session:', setSessionError);
          // Force a full page reload to sign in page if session restore fails
          window.location.href = '/';
          return;
        }

        // Reload to refresh all state
        window.location.href = '/admin?tab=users';
      } else {
        // No admin session stored, redirect to home
        window.location.href = '/';
      }

    } catch (err: any) {
      console.error('Error ending impersonation:', err);
      setError(err.message || 'Failed to end impersonation');
      // Force reload on error
      window.location.href = '/';
    } finally {
      setLoading(false);
    }
  }, [impersonationSession]);

  const logAction = useCallback(async (
    actionType: string,
    actionDetails?: Record<string, any>,
    pagePath?: string
  ) => {
    if (!isImpersonating || !impersonationSession) {
      return;
    }

    try {
      await supabase.functions.invoke('log-impersonation-action', {
        body: {
          session_token: impersonationSession.session_token,
          action_type: actionType,
          action_details: actionDetails || {},
          page_path: pagePath || window.location.pathname,
        },
      });
    } catch (err) {
      console.error('Error logging action:', err);
    }
  }, [isImpersonating, impersonationSession]);

  // Page tracking is handled by usePageTracking hook in Layout component

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
