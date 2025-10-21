import { useState } from 'react';
import { supabase } from '../config/supabase';

/**
 * Simplified admin sign-in-as-user hook.
 *
 * This replaces the complex impersonation system with a straightforward
 * authentication gateway. When an admin signs in as a user, they become
 * that user completely - no banners, timers, or session tracking.
 *
 * The session persists until manual sign-out, which returns to a
 * logged-out state (not back to the admin account).
 */
export function useAdminSignInAsUser() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInAsUser = async (targetUserId: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      // Call the Edge Function to get authentication tokens
      const { data, error: functionError } = await supabase.functions.invoke(
        'admin-sign-in-as-user',
        {
          body: { target_user_id: targetUserId },
        }
      );

      if (functionError) {
        throw new Error(functionError.message || 'Failed to generate authentication tokens');
      }

      if (!data?.access_token || !data?.refresh_token) {
        throw new Error('Invalid response: missing authentication tokens');
      }

      // Validate JWT structure before attempting to set session
      if (data.access_token.split('.').length !== 3) {
        throw new Error('Invalid access token format received from server');
      }

      if (data.refresh_token.split('.').length !== 3) {
        throw new Error('Invalid refresh token format received from server');
      }

      // Set the session using the validated tokens
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      if (sessionError) {
        throw new Error(`Failed to set session: ${sessionError.message}`);
      }

      // Success - the admin is now signed in as the target user
      // No state tracking needed - it's a normal session

    } catch (err: any) {
      const errorMessage = err.message || 'An unexpected error occurred';
      setError(errorMessage);
      console.error('Sign in as user error:', errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    signInAsUser,
    loading,
    error,
  };
}
