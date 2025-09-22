import React, { createContext, useContext, useEffect, useState } from "react";
import { User } from "@supabase/supabase-js";
import { supabase, Profile } from "../config/supabase";
import { emailService } from "../services/email";
import { queryClient, queryKeys, shareProfileAcrossCaches } from "@/services/queryClient";

export const AUTH_CONTEXT_ID = "auth/v1";

interface AuthContextValue {
  user: User | null;
  session: any;
  profile: Profile | null | undefined;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  setProfile: React.Dispatch<React.SetStateAction<Profile | null | undefined>>;
  signUp: (
    email: string,
    password: string,
    profileData: {
      full_name: string;
      role: string;
      phone?: string;
      agency?: string;
    },
  ) => Promise<any>;
  signIn: (email: string, password: string) => Promise<any>;
  signOut: () => Promise<void>;
  authContextId: string;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  const applyProfileUpdate: React.Dispatch<
    React.SetStateAction<Profile | null | undefined>
  > = (updater) => {
    setProfile((previous) => {
      const nextValue =
        typeof updater === "function"
          ? (updater as (value: Profile | null | undefined) => Profile | null | undefined)(
              previous,
            )
          : updater;

      const userId = session?.user?.id;
      if (userId) {
        if (nextValue === undefined) {
          queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
        } else {
          queryClient.setQueryData(
            queryKeys.profile(userId),
            nextValue ?? null,
          );
          if (nextValue) {
            shareProfileAcrossCaches(nextValue);
          }
        }
      }

      return nextValue;
    });
  };

  const refreshProfile = async () => {
    if (!session?.user) {
      applyProfileUpdate(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, role, phone, agency, email, is_admin, can_feature_listings, max_featured_listings_per_user, can_manage_agency, is_banned, created_at, updated_at",
        )
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error("❌ Error fetching profile:", error);
        applyProfileUpdate(null);
      } else {
        applyProfileUpdate(data ?? null);
      }
    } catch (err) {
      console.error("⚠️ refreshProfile error:", err);
      applyProfileUpdate(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshProfile();
  }, [session]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn("⏱ Forced loading = false after timeout");
        setLoading(false);
      }
    }, 5000);
    return () => clearTimeout(timeout);
  }, [loading]);

  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("Session initialization error:", error);
          if (error.message?.includes("Invalid Refresh Token")) {
            await supabase.auth.signOut();
            return;
          }
        }

        if (isMounted) {
          setSession(session);
          setUser(session?.user ?? null);
          if (!session?.user) {
            applyProfileUpdate(null);
          }
        }
      } catch (err) {
        console.error("Failed to initialize session:", err);
        if (isMounted) {
          await supabase.auth.signOut();
        }
      }
    };

    initializeSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setSession(session);
        setUser(session?.user ?? null);
        if (!session?.user) {
          applyProfileUpdate(null);
        }
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (
    email: string,
    password: string,
    profileData: {
      full_name: string;
      role: string;
      phone?: string;
      agency?: string;
    },
  ) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        email: email,
        ...profileData,
      });

      if (profileError) throw profileError;

      applyProfileUpdate({
        id: data.user.id,
        email: email,
        ...profileData,
        is_admin: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      try {
        await emailService.sendWelcomeEmail({
          to: email,
          fullName: profileData.full_name || "",
        });
      } catch (err) {
        console.warn("Failed to send welcome email", err);
      }
    }

    return data;
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const value: AuthContextValue = {
    user: session?.user ?? null,
    session,
    profile,
    loading,
    refreshProfile,
    setProfile: applyProfileUpdate,
    signUp,
    signIn,
    signOut,
    authContextId: AUTH_CONTEXT_ID,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    if (import.meta.env.DEV) {
      console.warn(
        "useAuth called outside of AuthProvider or hook imported from different path",
      );
    }
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

