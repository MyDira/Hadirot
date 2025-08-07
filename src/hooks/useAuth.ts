import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, Profile } from '../config/supabase';

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
        .from('profiles')
        .select('id, full_name, role, phone, agency, email, is_admin, can_feature_listings, max_featured_listings_per_user, is_banned, created_at, updated_at')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error) {
        console.error("❌ Error fetching profile:", error);
      } else {
        setProfile(data);
        console.log("✅ Profile refreshed:", data);
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
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, profileData: {
    full_name: string;
    role: string;
    phone?: string;
    agency?: string;
  }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) throw error;

    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
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