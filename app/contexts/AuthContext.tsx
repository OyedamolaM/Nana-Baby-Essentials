"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { hasSupabaseEnv, supabase } from "../lib/supabase";
import { type Session, type User } from "@supabase/supabase-js";
import { type UserProfileRecord } from "../../lib/userProfile";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfileRecord | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone: string,
  ) => Promise<{ error: Error | null }>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updateProfile: (data: Record<string, unknown>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
  isAccountDisabled: boolean;
  requiresProfileCompletion: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfileRecord | null>(null);
  const [loading, setLoading] = useState(hasSupabaseEnv);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAccountDisabled, setIsAccountDisabled] = useState(false);

  const syncUserProfile = useCallback(async (nextUser: User) => {
    const profilePayload: {
      id: string;
      email: string;
      full_name?: string;
      phone?: string;
    } = {
      id: nextUser.id,
      email: nextUser.email ?? "",
    };

    const fullName =
      nextUser.user_metadata?.full_name ?? nextUser.user_metadata?.name;
    if (typeof fullName === "string" && fullName.trim()) {
      profilePayload.full_name = fullName.trim();
    }

    const phoneNumber = nextUser.user_metadata?.phone;
    if (typeof phoneNumber === "string" && phoneNumber.trim()) {
      profilePayload.phone = phoneNumber.trim();
    }

    const { data, error } = await supabase
      .from("user_profiles")
      .upsert(profilePayload, { onConflict: "id" })
      .select(
        "id, email, full_name, phone, is_admin, shipping_address, account_status, deleted_at, created_at",
      )
      .maybeSingle();

    if (!error) {
      const nextProfile = (data as UserProfileRecord | null) ?? null;
      setProfile(nextProfile);
      setIsAdmin(nextProfile?.is_admin ?? false);
      setIsAccountDisabled(
        Boolean(
          nextProfile?.deleted_at ||
            nextProfile?.account_status === "disabled",
        ),
      );
      return;
    }

    const { data: fallbackData } = await supabase
      .from("user_profiles")
      .select(
        "id, email, full_name, phone, is_admin, shipping_address, account_status, deleted_at, created_at",
      )
      .eq("id", nextUser.id)
      .maybeSingle();

    const nextProfile = (fallbackData as UserProfileRecord | null) ?? null;
    setProfile(nextProfile);
    setIsAdmin(nextProfile?.is_admin ?? false);
    setIsAccountDisabled(
      Boolean(
        nextProfile?.deleted_at || nextProfile?.account_status === "disabled",
      ),
    );
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!hasSupabaseEnv || !user) {
      setProfile(null);
      setIsAdmin(false);
      setIsAccountDisabled(false);
      return;
    }

    await syncUserProfile(user);
  }, [syncUserProfile, user]);

  useEffect(() => {
    if (!hasSupabaseEnv) {
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await syncUserProfile(session.user);
      }
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        void syncUserProfile(session.user);
      } else {
        setProfile(null);
        setIsAdmin(false);
        setIsAccountDisabled(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [syncUserProfile]);

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    phone: string,
  ) => {
    if (!hasSupabaseEnv) {
      return { error: new Error("Supabase environment variables are not configured.") };
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFullName = fullName.trim();
    const normalizedPhone = phone.trim();

    if (!normalizedFullName) {
      return { error: new Error("Full name is required for signup.") };
    }

    if (!normalizedEmail) {
      return { error: new Error("Email is required for signup.") };
    }

    if (!password.trim()) {
      return { error: new Error("Password is required for signup.") };
    }

    if (!normalizedPhone) {
      return { error: new Error("Phone number is required for signup.") };
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: {
          full_name: normalizedFullName,
          phone: normalizedPhone,
        },
      },
    });

    if (!error && data.user?.id) {
      await supabase.from("user_profiles").upsert(
        {
          id: data.user.id,
          email: normalizedEmail,
          full_name: normalizedFullName,
          phone: normalizedPhone,
        },
        { onConflict: "id" },
      );
    }
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    if (!hasSupabaseEnv) {
      return { error: new Error("Supabase environment variables are not configured.") };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signInWithGoogle = async () => {
    if (!hasSupabaseEnv) {
      return { error: new Error("Supabase environment variables are not configured.") };
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    return { error };
  };

  const signOut = async () => {
    if (!hasSupabaseEnv) {
      setSession(null);
      setUser(null);
      setProfile(null);
      setIsAdmin(false);
      setIsAccountDisabled(false);
      return;
    }

    await supabase.auth.signOut();
  };

  const resetPassword = async (email: string) => {
    if (!hasSupabaseEnv) {
      return { error: new Error("Supabase environment variables are not configured.") };
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error };
  };

  const updateProfile = async (data: Record<string, unknown>) => {
    if (!hasSupabaseEnv) {
      return { error: new Error("Supabase environment variables are not configured.") };
    }

    if (!user) return { error: new Error('No user logged in') };

    const { error } = await supabase
      .from('user_profiles')
      .update(data)
      .eq('id', user.id);

    if (!error) {
      await refreshProfile();
    }

    return { error };
  };

  const value = {
    user,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    resetPassword,
    updateProfile,
    refreshProfile,
    isAdmin,
    isAccountDisabled,
    requiresProfileCompletion: false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
