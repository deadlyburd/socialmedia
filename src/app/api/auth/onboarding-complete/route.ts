/**
 * POST /api/auth/onboarding-complete — Fetch user role + onboarding status.
 *
 * Used by auth-context.tsx after login to determine routing.
 * Does NOT modify any data — it just reads the user's current state.
 */
import { getUserRole, isOnboardingComplete } from "@/lib/auth/user-store";
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const { user } = await auth();
    if (!user?.id) {
      return NextResponse.json(
        { success: false, error: "Not authenticated." },
        { status: 401 },
      );
    }

    // Just read the current state — don't modify anything
    const role = await getUserRole(user.id);
    const onboardingComplete = await isOnboardingComplete(user.id);

    return NextResponse.json({
      success: true,
      data: {
        onboardingComplete,
        role: role ?? "client",
        userId: user.id,
        email: user.email,
      },
    });
  } catch (err: any) {
    console.error("[onboarding-complete] Error:", err.message);
    // Don't reference `user` here — it's not in scope in the catch block
    return NextResponse.json({
      success: true,
      data: {
        onboardingComplete: false,
        role: "client",
        userId: "",
        email: "",
      },
    });
  }
}
