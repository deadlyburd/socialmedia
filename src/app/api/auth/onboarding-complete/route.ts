/**
 * POST /api/auth/onboarding-complete — Mark onboarding as done.
 * Uses Supabase Auth session (no more Auth.js).
 */
import { markOnboardingComplete, getUserRole } from "@/lib/auth/user-store";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function POST() {
  const { user } = await auth();
  if (!user?.id) {
    return NextResponse.json(
      { success: false, error: "Not authenticated." },
      { status: 401 },
    );
  }

  // Fetch role (doesn't require onboarding to be complete)
  const role = await getUserRole(user.id);

  const ok = await markOnboardingComplete(user.id);
  if (!ok) {
    // Still return the role even if onboarding update fails
    return NextResponse.json({
      success: true,
      data: { onboardingComplete: false, role },
    });
  }

  return NextResponse.json({
    success: true,
    data: { onboardingComplete: true, role },
  });
}
