// This hook has been replaced by useAdminSignInAsUser.
// The complex impersonation system with sessions, timers, and banners has been removed.
// This file is kept as a stub to prevent import errors during migration.
// All impersonation-related functionality should use the new useAdminSignInAsUser hook.

import { createContext, useContext } from 'react';

interface ImpersonationContextValue {
  isImpersonating: boolean;
  impersonationSession: null;
  impersonatedProfile: null;
  adminProfile: null;
  timeRemainingSeconds: null;
  isExpired: boolean;
  loading: boolean;
  error: null;
  startImpersonation: (userId: string) => Promise<void>;
  endImpersonation: () => Promise<void>;
  logAction: (actionType: string, actionDetails?: Record<string, any>, pagePath?: string) => Promise<void>;
}

const ImpersonationContext = createContext<ImpersonationContextValue | undefined>(undefined);

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useImpersonation(): ImpersonationContextValue {
  return {
    isImpersonating: false,
    impersonationSession: null,
    impersonatedProfile: null,
    adminProfile: null,
    timeRemainingSeconds: null,
    isExpired: false,
    loading: false,
    error: null,
    startImpersonation: async () => {
      throw new Error('useImpersonation has been deprecated. Use useAdminSignInAsUser instead.');
    },
    endImpersonation: async () => {},
    logAction: async () => {},
  };
}
