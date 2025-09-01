import { useState, useEffect } from "react";
import { User } from "@supabase/supabase-js";
import { supabase, Profile } from "../config/supabase";
import { emailService } from "../services/email";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!session?.user) {
      setLoading(false);
      return;
    }

    console.log("🔍 refreshProfile running for:", session.user.id);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, role, phone, agency, email, is_admin, can_feature_listings, max_featured_listings_per_user, is_banned, created_at, updated_at",
        )
        .eq("id", session.user.id)
        .maybeSingle();

      if (error) {
        console.error("❌ Error fetching profile:", error);
      } else {
        setProfile(data);
        console.log("✅ Profile refreshed in useAuth:", data);
      }
    } catch (err) {
      console.error("⚠️ refreshProfile error:", err);
    } finally {
      setLoading(false);
      console.log("🎯 setLoading(false) called");
    }
  };

  useEffect(() => {
    refreshProfile();
  }, [session]);

  // Also add this timeout fallback as a safeguard
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

    // Get initial session with error handling for invalid refresh tokens
    const initializeSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error("Session initialization error:", error);
          // If it's a refresh token error, clear the session
          if (error.message?.includes('Invalid Refresh Token')) {
            await supabase.auth.signOut();
            return;
          }
        }
        
        if (isMounted) {
          setSession(session);
          setUser(session?.user ?? null);
        }
      } catch (err) {
        console.error("Failed to initialize session:", err);
        // Clear any invalid session state
        if (isMounted) {
          await supabase.auth.signOut();
        }
      }
    };

    initializeSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setSession(session);
        setUser(session?.user ?? null);
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

      // Immediately set the profile state with the new profile data
      setProfile({
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

  return {
    user: session?.user,
    session,
    profile,
    loading,
    refreshProfile,
    signUp,
    signIn,
    signOut,
  };
}
