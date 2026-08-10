/**
 * POST /api/auth/email/login — Legacy password verification + Supabase Auth migration.
 *
 * For existing users created before Supabase Auth migration.
 * Verifies against our scrypt-hashed passwords, then creates/updates
 * the Supabase Auth user so subsequent logins use Supabase directly.
 */
import { getUserByEmail, verifyUserCredentials } from "@/lib/auth/user-store";
import { rateLimitByEmail } from "@/lib/auth/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email?.includes("@") || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required." },
        { status: 400 },
      );
    }

    const rl = rateLimitByEmail(email, "login");
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, error: "Too many login attempts. Try again later." },
        { status: 429 },
      );
    }

    // Check against our users table (scrypt hashes)
    const user = await verifyUserCredentials(email, password);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password." },
        { status: 401 },
      );
    }

    // Migrate to Supabase Auth: update the user's password in Supabase
    const supabase = getAdminClient();
    try {
      // Check if Supabase Auth user exists
      const { data: authUsers } = await supabase.auth.admin.listUsers({
        filters: { email: email.toLowerCase().trim() },
      });

      if (authUsers?.users?.length === 0) {
        // Create Supabase Auth user
        await supabase.auth.admin.createUser({
          email: email.toLowerCase().trim(),
          password,
          email_confirm: true,
          user_metadata: { name: user.name },
        });
      } else {
        // Update existing Supabase Auth user's password
        const authUserId = authUsers!.users[0]!.id;
        await supabase.auth.admin.updateUserById(authUserId, { password });
      }
    } catch (migrationErr: any) {
      console.error("[login] Supabase migration error:", migrationErr.message);
      // Continue — our auth check passed, this is best-effort
    }

    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        name: user.name,
        email: user.email,
        onboardingComplete: user.onboardingComplete,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message ?? "Login failed." },
      { status: 400 },
    );
  }
}
