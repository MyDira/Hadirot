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
      const { data, error } = await supabase.functions.invoke('start-impersonation', {
        body: { impersonated_user_id: userId },
      });

      if (error) {
        console.error('Start impersonation error:', error);
        throw new Error(error.message || 'Failed to start impersonation');
      }

      if (!data || !data.session || !data.impersonated_profile) {
        throw new Error('Invalid response from server');
      }

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
      const { error } = await supabase.functions.invoke('end-impersonation', {
        body: { session_token: impersonationSession.session_token },
      });

      if (error) {
        console.error('Error ending impersonation:', error);
      }

      // Clear state even if there was an error (to prevent stuck state)
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
