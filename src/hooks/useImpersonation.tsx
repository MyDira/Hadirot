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
    const requestId = crypto.randomUUID().substring(0, 8);
    console.log(`[useImpersonation:${requestId}] ====== START IMPERSONATION REQUEST ======`);

    if (!user || !profile?.is_admin) {
      const errMsg = 'Only administrators can impersonate users';
      console.error(`[useImpersonation:${requestId}] ✗ ${errMsg}`);
      throw new Error(errMsg);
    }

    setLoading(true);
    setError(null);

    try {
      console.log(`[useImpersonation:${requestId}] Target user ID:`, userId);
      console.log(`[useImpersonation:${requestId}] Current admin:`, user.id, profile.full_name);
      console.log(`[useImpersonation:${requestId}] Admin status:`, profile.is_admin);

      // Store the current admin session before switching
      console.log(`[useImpersonation:${requestId}] Retrieving current admin session...`);
      const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error(`[useImpersonation:${requestId}] ✗ Session retrieval error:`, sessionError.message);
        throw new Error(`Failed to retrieve current session: ${sessionError.message}`);
      }

      if (!currentSession) {
        console.error(`[useImpersonation:${requestId}] ✗ No active session found`);
        throw new Error('No active admin session found. Please refresh and try again.');
      }

      console.log(`[useImpersonation:${requestId}] ✓ Current session retrieved`);

      console.log(`[useImpersonation:${requestId}] Calling start-impersonation function...`);
      const { data, error } = await supabase.functions.invoke('start-impersonation', {
        body: { impersonated_user_id: userId },
      });

      console.log(`[useImpersonation:${requestId}] Function response received`);

      if (error) {
        console.error(`[useImpersonation:${requestId}] ✗ Function error:`, error);
        console.error(`[useImpersonation:${requestId}] Error details:`, JSON.stringify(error, null, 2));
        const errorMessage = error.message || error.msg || 'Failed to start impersonation';
        throw new Error(errorMessage);
      }

      if (!data) {
        console.error(`[useImpersonation:${requestId}] ✗ No data returned from function`);
        throw new Error('No response data from server. Please try again.');
      }

      if (!data.session) {
        console.error(`[useImpersonation:${requestId}] ✗ Missing session in response:`, Object.keys(data));
        throw new Error('Invalid response: Missing session data');
      }

      if (!data.impersonated_profile) {
        console.error(`[useImpersonation:${requestId}] ✗ Missing profile in response:`, Object.keys(data));
        throw new Error('Invalid response: Missing user profile data');
      }

      console.log(`[useImpersonation:${requestId}] ✓ Session created:`, data.session.session_token.substring(0, 8) + '...');
      console.log(`[useImpersonation:${requestId}] ✓ Target user:`, data.impersonated_profile.full_name);

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
        timestamp: new Date().toISOString(),
      };

      console.log(`[useImpersonation:${requestId}] Storing session data in sessionStorage`);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
        console.log(`[useImpersonation:${requestId}] ✓ Session data stored`);
      } catch (storageError) {
        console.error(`[useImpersonation:${requestId}] ✗ Failed to store session:`, storageError);
        throw new Error('Failed to store impersonation session. Please check browser storage.');
      }

      // Create authentication session for the impersonated user
      console.log(`[useImpersonation:${requestId}] Creating auth session for impersonated user...`);

      const { data: authData, error: authError } = await supabase.functions.invoke('create-impersonation-auth-session', {
        body: {
          session_token: data.session.session_token,
          impersonated_user_id: userId,
        },
      });

      console.log(`[useImpersonation:${requestId}] Auth session response received`);

      if (authError) {
        console.error(`[useImpersonation:${requestId}] ✗ Auth session creation error:`, authError);
        const errorMessage = authError.message || authError.msg || 'Failed to create auth session';
        throw new Error(errorMessage);
      }

      if (!authData) {
        console.error(`[useImpersonation:${requestId}] ✗ No auth data returned`);
        throw new Error('No authentication data received from server');
      }

      if (!authData.access_token) {
        console.error(`[useImpersonation:${requestId}] ✗ Missing access_token:`, Object.keys(authData));
        throw new Error('Invalid authentication response: Missing access token');
      }

      console.log(`[useImpersonation:${requestId}] ✓ Auth tokens received`);
      console.log(`[useImpersonation:${requestId}] Access token length:`, authData.access_token.length);
      console.log(`[useImpersonation:${requestId}] Has refresh token:`, !!authData.refresh_token);

      // Set the new session
      console.log(`[useImpersonation:${requestId}] Setting impersonated user session...`);
      const { data: sessionSetData, error: setSessionError } = await supabase.auth.setSession({
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
      });

      if (setSessionError) {
        console.error(`[useImpersonation:${requestId}] ✗ setSession error:`, setSessionError.message);
        throw new Error(`Failed to activate impersonated session: ${setSessionError.message}`);
      }

      if (!sessionSetData?.session) {
        console.error(`[useImpersonation:${requestId}] ✗ No session returned from setSession`);
        throw new Error('Failed to activate session: No session data returned');
      }

      console.log(`[useImpersonation:${requestId}] ✓ Session activated for user:`, sessionSetData.user?.id);

      console.log(`[useImpersonation:${requestId}] Updating local state...`);
      setImpersonationSession(data.session);
      setImpersonatedProfile(data.impersonated_profile);
      setAdminProfile(profile);
      setIsImpersonating(true);

      console.log(`[useImpersonation:${requestId}] ✓✓✓ IMPERSONATION SUCCESSFUL ✓✓✓`);
      console.log(`[useImpersonation:${requestId}] Redirecting to dashboard...`);

      // Small delay to ensure state is committed
      await new Promise(resolve => setTimeout(resolve, 100));

      // Reload the page to ensure all auth state is refreshed
      window.location.href = '/dashboard';

    } catch (err: any) {
      console.error(`[useImpersonation:${requestId}] ✗✗✗ IMPERSONATION FAILED ✗✗✗`);
      console.error(`[useImpersonation:${requestId}] Error:`, err.message || err);
      console.error(`[useImpersonation:${requestId}] Stack:`, err.stack);

      const errorMessage = err.message || 'Failed to start impersonation. Please try again.';
      setError(errorMessage);

      // Clear any partial state
      sessionStorage.removeItem(STORAGE_KEY);

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
