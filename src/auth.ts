/**
 * Supabase Auth — single auth source for the entire app.
 *
 * Replaces Auth.js v5. Uses @supabase/ssr for cookie-based session
 * management. Server and client share the same Supabase project.
 *
 * Server usage:
 *   import { auth } from "@/auth";
 *   const { user, supabase } = await auth();
 *   if (!user) return c.json({ error: "Unauthorized" }, 401);
 *
 * Middleware usage:
 *   import { updateSession } from "@/auth";
 *   // In middleware: await updateSession(request);
 *
 * Client usage:
 *   import { createBrowserClient } from "@supabase/ssr";
 *   // Use in auth-context.tsx
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

// ── Helpers ──────────────────────────────────────────────────────────

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }
  return { url, anonKey };
}

// ── Server client (Route Handlers, Server Components) ────────────────

/**
 * Create a Supabase client for use in Route Handlers and Server Components.
 * Reads cookies via next/headers.
 */
export async function createClient() {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}

// ── Auth helper (replaces old auth()) ────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthSession {
  user: AuthUser | null;
  supabase: Awaited<ReturnType<typeof createClient>>;
}

/**
 * Get the current Supabase session.
 * Replacement for the old Auth.js `auth()` call.
 *
 * Returns { user, supabase } — user is null if not authenticated.
 */
export async function auth(): Promise<AuthSession> {
  const { url, anonKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });

  const { data: { user: supabaseUser } } = await supabase.auth.getUser();

  if (!supabaseUser?.email) {
    return { user: null, supabase };
  }

  const user: AuthUser = {
    id: supabaseUser.id,
    email: supabaseUser.email,
    name: supabaseUser.user_metadata?.name ?? supabaseUser.email.split("@")[0] ?? "",
  };

  return { user, supabase };
}

// ── Middleware ────────────────────────────────────────────────────────

/**
 * Refresh the Supabase session in middleware.
 * Call this in middleware.ts to keep the auth cookie fresh.
 */
export async function updateSession(request: NextRequest) {
  const { url, anonKey } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the session — if user has a valid cookie, it gets refreshed.
  // If not, this is a no-op.
  await supabase.auth.getUser();

  return response;
}
