/**
 * GET /api/oauth/callback — Social platform OAuth callback handler.
 *
 * Handles callbacks from Meta (Instagram/Facebook), TikTok, LinkedIn.
 * Exchanges the authorization code for tokens and stores them.
 */
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, storeTokens, type SocialPlatform } from "@/lib/social-oauth";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle user-denied authorization
  if (error) {
    console.warn(`[oauth/callback] OAuth error: ${error} — ${errorDescription}`);
    return NextResponse.redirect(
      `${origin}/client/accounts?error=${encodeURIComponent(errorDescription ?? error)}`,
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(`${origin}/client/accounts?error=missing_params`);
  }

  // Decode state to get tenantId and platform
  let tenantId: string;
  let platform: SocialPlatform;
  try {
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
    tenantId = decoded.tenantId;
    platform = decoded.platform;
  } catch {
    return NextResponse.redirect(`${origin}/client/accounts?error=invalid_state`);
  }

  // Exchange code for tokens
  const tokens = await exchangeCode(platform, code);
  if (!tokens) {
    return NextResponse.redirect(
      `${origin}/client/accounts?error=token_exchange_failed`,
    );
  }

  // Store tokens
  await storeTokens(tenantId, platform, tokens);

  console.log(
    `[oauth/callback] ${platform} connected for tenant ${tenantId} (${tokens.handle})`,
  );

  // Redirect back to accounts page with success
  return NextResponse.redirect(
    `${origin}/client/accounts?success=true&platform=${platform}`,
  );
}
