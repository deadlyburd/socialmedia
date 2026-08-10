/**
 * POST /api/auth/email/signup — Creates user profile after Supabase Auth signup.
 *
 * Supabase Auth handles password hashing and auth token generation.
 * This endpoint creates the corresponding record in our `users` table
 * and initializes the in-memory AuthService session.
 */
import { getAdminClient } from "@/lib/supabase/admin";
import { rateLimitByIP } from "@/lib/auth/rate-limit";
import { AuthService } from "@/lib/saas-core/services/auth-service";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

const authService = new AuthService();

export async function POST(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? headersList.get("x-real-ip")
    ?? "127.0.0.1";
  const rl = rateLimitByIP(ip, "signup");
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many signup attempts. Try again later." },
      { status: 429 },
    );
  }

  try {
    const { email, name, supabaseId } = await request.json();

    if (!email?.includes("@")) {
      return NextResponse.json(
        { success: false, error: "Valid email is required." },
        { status: 400 },
      );
    }
    if (!supabaseId) {
      return NextResponse.json(
        { success: false, error: "Supabase user ID is required." },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();

    // Check if user profile already exists
    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .eq("id", supabaseId)
      .maybeSingle();

    if (!existing) {
      // Create user profile record (no password hash — Supabase handles auth)
      const { error: insertErr } = await supabase.from("users").insert({
        id: supabaseId,
        email: email.toLowerCase().trim(),
        name: name?.trim() ?? email.split("@")[0]!,
        password_hash: null, // Supabase Auth manages credentials
        onboarding_complete: false,
        created_at: new Date().toISOString(),
      });

      if (insertErr) {
        // Duplicate email
        if (insertErr.code === "23505") {
          return NextResponse.json(
            { success: false, error: "An account with this email already exists." },
            { status: 409 },
          );
        }
        throw insertErr;
      }
    }

    // Initialize in-memory session for dashboard API
    authService.ensureSession(supabaseId, email.toLowerCase().trim(), name?.trim() ?? email.split("@")[0]!);

    return NextResponse.json({
      success: true,
      data: {
        userId: supabaseId,
        name: name?.trim() ?? email.split("@")[0]!,
        email: email.toLowerCase().trim(),
        onboardingComplete: false,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? "Signup failed." },
      { status: 400 },
    );
  }
}
