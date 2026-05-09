"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { type Session, type User } from "@supabase/supabase-js";
import { hasSupabaseEnv, supabase } from "../lib/supabase";
import {
  isMissingUserProfileColumnError,
  normalizeUserProfileRecord,
  USER_PROFILE_FALLBACK_SELECT,
  USER_PROFILE_SELECT,
  type UserProfileRecord,
} from "../../lib/userProfile";

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
  const latestProfileRef = useRef<UserProfileRecord | null>(null);

  const applyProfile = useCallback((nextProfile: UserProfileRecord | null) => {
    latestProfileRef.current = nextProfile;
    setProfile(nextProfile);
    setIsAdmin(nextProfile?.is_admin ?? false);
    setIsAccountDisabled(
      Boolean(
        nextProfile?.deleted_at || nextProfile?.account_status === "disabled",
      ),
    );
  }, []);

  const getAccessToken = useCallback(async (nextSession?: Session | null) => {
    const accessToken = nextSession?.access_token?.trim();
    if (accessToken) {
      return accessToken;
    }

    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession();

    return currentSession?.access_token?.trim() ?? "";
  }, []);

  const loadProfileRowDirect = useCallback(async (userId: string) => {
    const primaryResult = await supabase
      .from("user_profiles")
      .select(USER_PROFILE_SELECT)
      .eq("id", userId)
      .maybeSingle();

    if (!primaryResult.error) {
      return normalizeUserProfileRecord(
        primaryResult.data as UserProfileRecord | null,
      );
    }

    if (isMissingUserProfileColumnError(primaryResult.error)) {
      const fallbackResult = await supabase
        .from("user_profiles")
        .select(USER_PROFILE_FALLBACK_SELECT)
        .eq("id", userId)
        .maybeSingle();

      if (!fallbackResult.error) {
        return normalizeUserProfileRecord(
          fallbackResult.data as UserProfileRecord | null,
        );
      }
    }

    return null;
  }, []);

  const requestProfileRoute = useCallback(
    async (
      method: "GET" | "PATCH" | "POST",
      options?: {
        body?: Record<string, unknown>;
        session?: Session | null;
      },
    ) => {
      const accessToken = await getAccessToken(options?.session);
      if (!accessToken) {
        return {
          error: new Error("You need to sign in again."),
          profile: null,
        };
      }

      const response = await fetch("/api/auth/profile", {
        body: options?.body ? JSON.stringify(options.body) : undefined,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          ...(options?.body ? { "Content-Type": "application/json" } : {}),
        },
        method,
      }).catch(() => null);

      if (!response) {
        return {
          error: new Error("Could not reach the profile service."),
          profile: null,
        };
      }

      const payload = (await response.json().catch(() => null)) as
        | { message?: string; profile?: UserProfileRecord | null }
        | null;

      if (!response.ok) {
        return {
          error: new Error(payload?.message || "Could not load your profile."),
          profile: null,
        };
      }

      return {
        error: null,
        profile: normalizeUserProfileRecord(payload?.profile),
      };
    },
    [getAccessToken],
  );

  const syncUserProfile = useCallback(async (nextUser: User, nextSession?: Session | null) => {
    const profilePayload: {
      email: string;
      fullName?: string;
      phone?: string;
    } = {
      email: nextUser.email ?? "",
    };

    const fullName =
      nextUser.user_metadata?.full_name ?? nextUser.user_metadata?.name;
    if (typeof fullName === "string" && fullName.trim()) {
      profilePayload.fullName = fullName.trim();
    }

    const phoneNumber = nextUser.user_metadata?.phone;
    if (typeof phoneNumber === "string" && phoneNumber.trim()) {
      profilePayload.phone = phoneNumber.trim();
    }

    const routeResult = await requestProfileRoute("POST", {
      body: profilePayload,
      session: nextSession,
    });

    if (routeResult.profile) {
      applyProfile(routeResult.profile);
      return;
    }

    const fallbackProfile = await loadProfileRowDirect(nextUser.id);
    if (fallbackProfile) {
      applyProfile(fallbackProfile);
      return;
    }

    if (!routeResult.error && latestProfileRef.current?.id === nextUser.id) {
      applyProfile(latestProfileRef.current);
      return;
    }
  }, [applyProfile, latestProfileRef, loadProfileRowDirect, requestProfileRoute]);

  const refreshProfile = useCallback(async () => {
    if (!hasSupabaseEnv || !user) {
      applyProfile(null);
      return;
    }

    const routeResult = await requestProfileRoute("GET");
    if (routeResult.profile) {
      applyProfile(routeResult.profile);
      return;
    }

    const directProfile = await loadProfileRowDirect(user.id);
    applyProfile(directProfile);
  }, [applyProfile, loadProfileRowDirect, requestProfileRoute, user]);

  useEffect(() => {
    if (!hasSupabaseEnv) {
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await syncUserProfile(session.user, session);
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
        void syncUserProfile(session.user, session);
      } else {
        applyProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [applyProfile, syncUserProfile]);

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
      await requestProfileRoute("POST", {
        body: {
          email: normalizedEmail,
          fullName: normalizedFullName,
          phone: normalizedPhone,
        },
      });
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
      applyProfile(null);
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

    const { error, profile: updatedProfile } = await requestProfileRoute("PATCH", {
      body: data,
      session,
    });

    if (!error && updatedProfile) {
      applyProfile(updatedProfile);
    } else if (!error) {
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
