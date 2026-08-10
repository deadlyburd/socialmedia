/**
 * Supabase Auth middleware — refreshes session + guards protected routes + role-based routing.
 */
import { updateSession } from "@/auth";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  // Refresh the Supabase session (no-op if no session cookie exists)
  const response = await updateSession(request);

  const hasSession = request.cookies.getAll().some((c) =>
    c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );

  const pathname = request.nextUrl.pathname;

  // ── Admin-only routes ──────────────────────────────────────────────
  const isAdminRoute = pathname.startsWith("/admin");

  // ── Client-only routes ─────────────────────────────────────────────
  const isClientRoute = pathname.startsWith("/client");

  // ── Legacy protected routes (redirect to new paths) ────────────────
  // NOTE: /onboarding is intentionally NOT here — new users need to access it
  const isLegacyProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/calendar") ||
    pathname.startsWith("/generate") ||
    pathname.startsWith("/queue") ||
    pathname.startsWith("/trends") ||
    pathname.startsWith("/analytics") ||
    pathname.startsWith("/users") ||
    pathname.startsWith("/settings");

  // ── Auth pages (should redirect to dashboard if already logged in) ─
  const isAuthPage = pathname === "/login" || pathname === "/";

  if (!hasSession) {
    // Not authenticated — redirect protected routes to login
    if (isAdminRoute || isClientRoute || isLegacyProtected) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  // ── Authenticated users — check role for protected routes ──────────

  // For admin/client routes, verify the user's role server-side
  if (isAdminRoute || isClientRoute) {
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
      const serviceKey = process.env.SUPABASE_SERVICE_KEY!;

      // Use service_role to read the user's role from the users table
      if (url && serviceKey) {
        const supabase = createServerClient(url, anonKey, {
          cookies: {
            getAll() { return request.cookies.getAll(); },
            setAll() {}, // read-only in middleware
          },
        });

        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          // Query the users table directly via REST API (no admin client in edge)
          const roleRes = await fetch(
            `${url}/rest/v1/users?select=role&id=eq.${user.id}&limit=1`,
            {
              headers: {
                apikey: serviceKey,
                Authorization: `Bearer ${serviceKey}`,
              },
            },
          );
          const rows = await roleRes.json();
          const role = (rows?.[0]?.role as string) ?? null;

          // If role is null (user record doesn't exist yet), send to onboarding
          if (!role) {
            return NextResponse.redirect(new URL("/onboarding", request.url));
          }

          if (isAdminRoute && role !== "admin") {
            return NextResponse.redirect(new URL("/client/calendar", request.url));
          }
          if (isClientRoute && role !== "client") {
            return NextResponse.redirect(new URL("/admin/dashboard", request.url));
          }
        }
      }
    } catch {
      // If role check fails, allow the request — client-side auth context will handle it
    }
  }

  // ── Authenticated users — redirect legacy/root ─────────────────────

  // Redirect legacy routes to admin dashboard (role check happens above)
  if (isLegacyProtected) {
    return NextResponse.redirect(new URL("/admin/dashboard", request.url));
  }

  // Redirect auth pages (login, landing) to role-based dashboard
  if (isAuthPage) {
    // Let the page handle the redirect — it has access to auth context
    return response;
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/client/:path*",
    "/dashboard/:path*",
    "/calendar",
    "/generate",
    "/queue",
    "/trends",
    "/analytics",
    "/users/:path*",
    "/settings/:path*",
    "/onboarding",
    "/login",
    "/",
  ],
};
