/**
 * POST /api/auth/reset-password — Reset password with code.
 * Explicit route to shadow Auth.js [...nextauth] catch-all.
 */
import { getUserByEmail, updateUser } from "@/lib/auth/user-store";
import { hashPassword } from "@/lib/auth/password";
import { rateLimitByIP } from "@/lib/auth/rate-limit";
import { resetCodes } from "@/lib/auth/reset-codes";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

export async function POST(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? headersList.get("x-real-ip")
    ?? "127.0.0.1";
  const rl = rateLimitByIP(ip, "reset");
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  const { email, code, newPassword } = await request.json();
  if (!email || !code || !newPassword) {
    return NextResponse.json(
      { success: false, error: "Email, code, and new password are required." },
      { status: 400 },
    );
  }
  if (newPassword.length < 8) {
    return NextResponse.json(
      { success: false, error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }
  if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
    return NextResponse.json({
      success: false,
      error: "Password must include uppercase, number, and symbol.",
    }, { status: 400 });
  }

  const stored = resetCodes.get(email.toLowerCase());
  if (!stored || stored.code !== code || Date.now() > stored.expiresAt) {
    return NextResponse.json(
      { success: false, error: "Invalid or expired reset code." },
      { status: 400 },
    );
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Account not found." },
      { status: 404 },
    );
  }

  await updateUser(email, { passwordHash: hashPassword(newPassword) });
  resetCodes.delete(email.toLowerCase());

  return NextResponse.json({
    success: true,
    data: { message: "Password updated. You can now log in." },
  });
}
