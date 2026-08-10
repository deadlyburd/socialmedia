/**
 * Auth context — Supabase Auth (single source of truth).
 *
 * Session stored in Supabase auth cookies (sb-*-auth-token).
 * Managed by @supabase/ssr createBrowserClient.
 * No more Auth.js dual-auth confusion.
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createBrowserClient } from "@supabase/ssr";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

// ── Types ────────────────────────────────────────────────────────────

export interface User {
  userId: string;
  name: string;
  email: string;
  role: "admin" | "client" | null;
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isClient: boolean;
  onboardingComplete: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  completeOnboarding: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

// ── Supabase browser client (singleton per component tree) ───────────

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createBrowserClient(url, anonKey);
}

// ── Context ──────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => getSupabase(), []);
  const router = useRouter();

  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<"admin" | "client" | null>(null);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen to auth state changes
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSupabaseUser(initialSession?.user ?? null);
      setIsLoading(false);
    });

    // Subscribe to changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSupabaseUser(newSession?.user ?? null);
        setIsLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Fetch onboarding status + role when user changes
  useEffect(() => {
    if (!supabaseUser) {
      setOnboardingComplete(false);
      setRole(null);
      return;
    }

    // Fetch role from users table
    fetch("/api/auth/onboarding-complete", { method: "POST", credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setOnboardingComplete(d.data?.onboardingComplete ?? false);
          setRole(d.data?.role ?? "client");
        }
      })
      .catch(() => {});
  }, [supabaseUser]);

  const isAuthenticated = !!supabaseUser;
  const isAdmin = role === "admin";
  const isClient = role === "client";

  const user: User | null = supabaseUser
    ? {
        userId: supabaseUser.id,
        name: supabaseUser.user_metadata?.name ?? supabaseUser.email?.split("@")[0] ?? "",
        email: supabaseUser.email ?? "",
        role,
      }
    : null;

  const clearError = useCallback(() => setError(null), []);

  // ── Email + password signup ────────────────────────────────────────

  const signup = useCallback(async (email: string, password: string, name: string) => {
    setError(null);

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      throw new Error(signUpError.message);
    }

    if (!data.user) {
      setError("Signup failed. Please try again.");
      throw new Error("Signup failed");
    }

    // Create user profile in our users table
    const res = await fetch("/api/auth/email/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password, name, supabaseId: data.user.id }),
    });
    const result = await res.json();
    if (!result.success) {
      setError(result.error ?? "Signup failed");
      throw new Error(result.error ?? "Signup failed");
    }

    router.push("/onboarding");
  }, [supabase, router]);

  // ── Email + password login ─────────────────────────────────────────

  const login = useCallback(async (email: string, password: string) => {
    setError(null);

    // Try Supabase Auth first
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // If Supabase Auth fails, fall back to legacy password check + migration
    if (signInError || !data.user) {
      const res = await fetch("/api/auth/email/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const result = await res.json();

      if (!result.success) {
        setError(result.error ?? "Invalid email or password.");
        throw new Error(result.error ?? "Invalid email or password.");
      }

      // Migration succeeded — now try Supabase Auth again
      const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (retryError || !retryData.user) {
        // Migration may have created the user but sign-in still fails
        // Fall through: reload to pick up cookies from the migration response
        setError("Account migrated. Please try logging in again.");
        throw new Error("Account migrated. Please try again.");
      }
    }

    // Small delay to ensure Supabase session cookie is fully set
    await new Promise(r => setTimeout(r, 200));

    // Fetch role to determine redirect
    const roleRes = await fetch("/api/auth/onboarding-complete", {
      method: "POST",
      credentials: "include",
    });
    const roleData = await roleRes.json();
    const userRole = roleData?.data?.role ?? "client";
    if (userRole === "admin") {
      router.push("/admin/dashboard");
    } else {
      router.push("/client/calendar");
    }
  }, [supabase, router]);

  // ── Google OAuth ───────────────────────────────────────────────────

  const loginWithGoogle = useCallback(async () => {
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      throw new Error(oauthError.message);
    }
  }, [supabase]);

  // ── Logout ─────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push("/login");
  }, [supabase, router]);

  // ── Onboarding ─────────────────────────────────────────────────────

  const completeOnboarding = useCallback(async () => {
    await fetch("/api/auth/onboarding-complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });
    setOnboardingComplete(true);
  }, []);

  // ── Refresh ────────────────────────────────────────────────────────

  const refreshSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSupabaseUser(data.session?.user ?? null);
  }, [supabase]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated,
      isAdmin,
      isClient,
      onboardingComplete,
      error,
      login,
      signup,
      loginWithGoogle,
      logout,
      clearError,
      completeOnboarding,
      refreshSession,
    }),
    [user, isLoading, isAuthenticated, isAdmin, isClient, onboardingComplete, error, login, signup, loginWithGoogle, logout, clearError, completeOnboarding, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an <AuthProvider>");
  return ctx;
}

// ── HOC ──────────────────────────────────────────────────────────────

export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
): React.FC<P> {
  return function ProtectedComponent(props: P) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
      return (
        <div style={{
          display: "flex", justifyContent: "center", alignItems: "center",
          minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#fff",
          fontFamily: "system-ui, sans-serif",
        }}>
          <p>Loading...</p>
        </div>
      );
    }

    if (!isAuthenticated) {
      if (typeof window !== "undefined") window.location.href = "/login";
      return null;
    }

    return <Component {...props} />;
  };
}
