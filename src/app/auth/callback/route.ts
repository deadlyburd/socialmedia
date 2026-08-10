/**
 * GET /auth/callback — Supabase OAuth callback handler.
 *
 * Supabase redirects here after Google OAuth. We exchange the code
 * for a session, ensure a user record exists in our users table,
 * then redirect based on role and onboarding status.
 */
import { createClient } from "@/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=no_code`);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("[auth/callback] Code exchange failed:", error.message);
      return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.redirect(`${origin}/login?error=no_user`);
    }

    const adminClient = getAdminClient();

    // Check if user record exists in our users table
    const { data: profile } = await adminClient
      .from("users")
      .select("id, role, onboarding_complete")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      // New Google sign-in — create a user record
      // Check if this is the very first user (they become admin)
      const { count } = await adminClient
        .from("users")
        .select("*", { count: "exact", head: true });

      const role = (count ?? 0) === 0 ? "admin" : "client";

      const { error: insertError } = await adminClient
        .from("users")
        .insert({
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email.split("@")[0],
          password_hash: "", // OAuth users have no password
          role,
          auth_provider: "google",
          onboarding_complete: false,
          created_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error("[auth/callback] Failed to create user record:", insertError.message);
        return NextResponse.redirect(`${origin}/login?error=user_creation_failed`);
      }

      console.log(`[auth/callback] Created new ${role} user via Google OAuth: ${user.email}`);

      // New users go to onboarding
      return NextResponse.redirect(`${origin}/onboarding`);
    }

    // Existing user — redirect by role
    if (profile.role === "admin") {
      return NextResponse.redirect(`${origin}/admin/dashboard`);
    }
    if (profile.role === "client") {
      return NextResponse.redirect(`${origin}/client/calendar`);
    }

    // Incomplete onboarding
    if (!profile.onboarding_complete) {
      return NextResponse.redirect(`${origin}/onboarding`);
    }

    // Fallback redirect
    return NextResponse.redirect(`${origin}/admin/dashboard`);
  } catch (err: any) {
    console.error("[auth/callback] Unexpected error:", err.message);
    return NextResponse.redirect(`${origin}/login?error=unexpected`);
  }
}
