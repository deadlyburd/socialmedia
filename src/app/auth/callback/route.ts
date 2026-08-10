/**
 * GET /auth/callback — Supabase OAuth callback handler.
 *
 * THE KEY INSIGHT: In Next.js 15 Route Handlers, cookies().set() from
 * next/headers sets cookies on the implicit response. But if we return
 * NextResponse.redirect(), that creates a NEW response WITHOUT those cookies.
 *
 * Solution: Create the redirect response FIRST, build a Supabase client
 * that sets cookies directly on it, then return it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "no_code" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

    // Step 1: Exchange code for session using request cookies (for reading)
    // and a temporary response for writing cookies
    const cookieJar: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Collect cookies into our jar — we'll apply them to the final response
          for (const c of cookiesToSet) {
            cookieJar.push({
              name: c.name,
              value: c.value,
              options: {
                ...c.options,
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax" as const,
                path: "/",
              },
            });
          }
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] Exchange failed:", error.message);
      return NextResponse.redirect(new URL("/login?error=oauth", request.url));
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.redirect(new URL("/login?error=no_user", request.url));
    }

    console.log("[auth/callback] Authenticated:", user.email);

    // Step 2: Check/create user record
    const { getAdminClient } = await import("@/lib/supabase/admin");
    const adminClient = getAdminClient();

    const { data: profile } = await adminClient
      .from("users")
      .select("id, role, onboarding_complete")
      .eq("id", user.id)
      .maybeSingle();

    let redirectPath = "/onboarding"; // default for new users

    if (!profile) {
      let role: "admin" | "client" = "client";
      try {
        const { count } = await adminClient
          .from("users")
          .select("*", { count: "exact", head: true });
        if ((count ?? 0) === 0) role = "admin";
      } catch { /* default */ }

      const name =
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email.split("@")[0] ??
        "User";

      const { error: insertError } = await adminClient.from("users").insert({
        id: user.id,
        email: user.email,
        name,
        password_hash: "",
        role,
        onboarding_complete: false,
        created_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error("[auth/callback] Insert failed:", JSON.stringify(insertError));
        return NextResponse.redirect(new URL("/login?error=db", request.url));
      }

      console.log(`[auth/callback] Created ${role}: ${user.email}`);
    } else {
      redirectPath = profile.role === "admin"
        ? "/admin/dashboard"
        : profile.role === "client"
          ? "/client/calendar"
          : "/onboarding";
      console.log(`[auth/callback] Existing ${profile.role}: ${user.email} → ${redirectPath}`);
    }

    // Step 3: Build the redirect response WITH cookies
    const redirectUrl = new URL(redirectPath, request.url);
    const response = NextResponse.redirect(redirectUrl);

    // Apply all collected cookies to this response
    for (const c of cookieJar) {
      response.cookies.set(c.name, c.value, c.options as any);
    }

    console.log(`[auth/callback] Redirecting to ${redirectPath} with ${cookieJar.length} cookies`);
    return response;
  } catch (err: any) {
    console.error("[auth/callback] CRASH:", err?.message);
    return NextResponse.redirect(new URL("/login?error=crash", request.url));
  }
}
