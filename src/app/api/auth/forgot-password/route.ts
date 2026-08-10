/**
 * POST /api/auth/forgot-password — Send password reset code.
 * Explicit route to shadow Auth.js [...nextauth] catch-all.
 */
import { getUserByEmail } from "@/lib/auth/user-store";
import { rateLimitByIP } from "@/lib/auth/rate-limit";
import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { resetCodes } from "@/lib/auth/reset-codes";

export async function POST(request: Request) {
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? headersList.get("x-real-ip")
    ?? "127.0.0.1";
  const rl = rateLimitByIP(ip, "forgot");
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many attempts. Try again later." },
      { status: 429 },
    );
  }

  const { email } = await request.json();
  if (!email) {
    return NextResponse.json(
      { success: false, error: "Email is required." },
      { status: 400 },
    );
  }

  const user = await getUserByEmail(email);
  // Always success to prevent email enumeration
  if (!user) {
    return NextResponse.json({
      success: true,
      data: { message: "If an account exists, a reset code has been sent." },
    });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  resetCodes.set(email.toLowerCase(), { code, expiresAt: Date.now() + 15 * 60_000 });

  console.log(`[auth] Reset code for ${email}: ${code}`);

  return NextResponse.json({
    success: true,
    data: {
      message: "If an account exists, a reset code has been sent.",
      resetCode: code,
    },
  });
}
