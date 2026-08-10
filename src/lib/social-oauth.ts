/**
 * Social Platform OAuth Service — Real OAuth flows for Instagram, TikTok, Facebook.
 *
 * Setup per platform:
 *
 *   Instagram / Facebook (Meta Graph API):
 *     1. Go to https://developers.facebook.com
 *     2. Create App → type: "Business"
 *     3. Add products: Instagram Graph API, Facebook Login
 *     4. Configure OAuth redirect URI: https://yourdomain.com/api/oauth/callback
 *     5. Set env vars: META_APP_ID, META_APP_SECRET
 *
 *   TikTok:
 *     1. Go to https://developers.tiktok.com
 *     2. Create App → Content Publishing API
 *     3. Configure redirect URI: https://yourdomain.com/api/oauth/callback
 *     4. Set env vars: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
 *
 *   LinkedIn:
 *     1. Go to https://developer.linkedin.com
 *     2. Create App → Sign In with LinkedIn + Share on LinkedIn
 *     3. Set env vars: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
 */

import { getAdminClient } from "@/lib/supabase/admin";

// ── Types ──────────────────────────────────────────────────────────────

export type SocialPlatform = "instagram" | "facebook" | "tiktok" | "linkedin" | "youtube" | "pinterest" | "twitter";

export interface OAuthTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp in seconds
  platformUserId: string;
  handle: string;
  /** Platform-specific scopes granted */
  scopes: string[];
}

export interface PlatformPost {
  platform: SocialPlatform;
  mediaUrl: string; // URL to the video/image
  caption: string;
  hashtags?: string[];
  /** For Instagram: whether to post as Reel */
  mediaType?: "feed" | "reel" | "story";
  /** For TikTok: whether to allow comments/duet/stitch */
  privacySettings?: "public" | "private";
}

export interface PostResult {
  success: boolean;
  platformPostId?: string;
  platformPostUrl?: string;
  error?: string;
}

// ── OAuth URL Generation ──────────────────────────────────────────────

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

/**
 * Get the OAuth authorization URL for a platform.
 * Redirect the user to this URL to start the OAuth flow.
 */
export function getOAuthUrl(platform: SocialPlatform, tenantId: string): string | null {
  const state = Buffer.from(JSON.stringify({ tenantId, platform })).toString("base64url");
  const redirectUri = `${getAppUrl()}/api/oauth/callback`;
  const scopes = getScopes(platform);

  switch (platform) {
    case "instagram":
    case "facebook": {
      const appId = process.env.META_APP_ID;
      if (!appId) return null;
      const params = new URLSearchParams({
        client_id: appId,
        redirect_uri: redirectUri,
        state,
        scope: scopes,
        response_type: "code",
        // Request Instagram-specific permissions
        ...(platform === "instagram" ? {
          config_id: process.env.META_INSTAGRAM_CONFIG_ID ?? "",
        } : {}),
      });
      return `https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`;
    }

    case "tiktok": {
      const clientKey = process.env.TIKTOK_CLIENT_KEY;
      if (!clientKey) return null;
      const params = new URLSearchParams({
        client_key: clientKey,
        redirect_uri: redirectUri,
        state,
        scope: scopes,
        response_type: "code",
      });
      return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
    }

    case "linkedin": {
      const clientId = process.env.LINKEDIN_CLIENT_ID;
      if (!clientId) return null;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        state,
        scope: scopes,
        response_type: "code",
      });
      return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
    }

    default:
      return null;
  }
}

function getScopes(platform: SocialPlatform): string {
  switch (platform) {
    case "instagram":
      return [
        "instagram_basic",
        "instagram_content_publish",
        "instagram_manage_comments",
        "pages_show_list",
        "pages_read_engagement",
      ].join(",");
    case "facebook":
      return [
        "pages_manage_posts",
        "pages_read_engagement",
        "pages_show_list",
      ].join(",");
    case "tiktok":
      return [
        "user.info.basic",
        "video.publish",
        "video.upload",
      ].join(",");
    case "linkedin":
      return ["openid", "profile", "w_member_social", "email"].join(",");
    default:
      return "";
  }
}

// ── Token Exchange ────────────────────────────────────────────────────

/**
 * Exchange an OAuth authorization code for tokens.
 * Called by the OAuth callback route.
 */
export async function exchangeCode(
  platform: SocialPlatform,
  code: string,
): Promise<OAuthTokenSet | null> {
  const redirectUri = `${getAppUrl()}/api/oauth/callback`;

  try {
    switch (platform) {
      case "instagram":
      case "facebook": {
        const appId = process.env.META_APP_ID;
        const appSecret = process.env.META_APP_SECRET;
        if (!appId || !appSecret) return null;

        // Exchange code for short-lived token
        const tokenRes = await fetch(
          `https://graph.facebook.com/v21.0/oauth/access_token?` +
          new URLSearchParams({
            client_id: appId,
            client_secret: appSecret,
            redirect_uri: redirectUri,
            code,
          }),
        );
        const tokenData = await tokenRes.json();
        if (tokenData.error) {
          console.error("[social-oauth] Token exchange error:", tokenData.error);
          return null;
        }

        // Exchange for long-lived token (60 days)
        const longRes = await fetch(
          `https://graph.facebook.com/v21.0/oauth/access_token?` +
          new URLSearchParams({
            grant_type: "fb_exchange_token",
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: tokenData.access_token,
          }),
        );
        const longData = await longRes.json();

        const accessToken = longData.access_token ?? tokenData.access_token;
        const expiresIn = longData.expires_in ?? 5184000; // 60 days

        // Get Page info for Instagram
        let handle = "";
        let platformUserId = "";
        const pagesRes = await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`,
        );
        const pagesData = await pagesRes.json();
        if (pagesData.data?.length > 0) {
          handle = pagesData.data[0].name ?? "";
          platformUserId = pagesData.data[0].id ?? "";
        }

        // If Instagram, get the Instagram Business Account
        if (platform === "instagram" && pagesData.data?.length > 0) {
          const pageId = pagesData.data[0].id;
          const igRes = await fetch(
            `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account{id,username}&access_token=${accessToken}`,
          );
          const igData = await igRes.json();
          if (igData.instagram_business_account) {
            handle = igData.instagram_business_account.username ?? handle;
            platformUserId = igData.instagram_business_account.id ?? platformUserId;
          }
        }

        return {
          accessToken,
          expiresAt: Math.floor(Date.now() / 1000) + expiresIn,
          platformUserId,
          handle: handle ? `@${handle}` : "",
          scopes: tokenData.scope?.split(",") ?? [],
        };
      }

      case "tiktok": {
        const clientKey = process.env.TIKTOK_CLIENT_KEY;
        const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
        if (!clientKey || !clientSecret) return null;

        const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            code,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
          }),
        });
        const tokenData = await tokenRes.json();
        if (tokenData.error) {
          console.error("[social-oauth] TikTok token error:", tokenData.error);
          return null;
        }

        // Get user info
        const userRes = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name,username", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userRes.json();

        return {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: Math.floor(Date.now() / 1000) + (tokenData.expires_in ?? 86400),
          platformUserId: userData.data?.user?.username ?? "",
          handle: userData.data?.user?.display_name ?? "",
          scopes: tokenData.scope?.split(",") ?? [],
        };
      }

      case "linkedin": {
        const clientId = process.env.LINKEDIN_CLIENT_ID;
        const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
        if (!clientId || !clientSecret) return null;

        const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            client_id: clientId,
            client_secret: clientSecret,
          }),
        });
        const tokenData = await tokenRes.json();
        if (tokenData.error) {
          console.error("[social-oauth] LinkedIn token error:", tokenData.error);
          return null;
        }

        return {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: Math.floor(Date.now() / 1000) + (tokenData.expires_in ?? 5184000),
          platformUserId: tokenData.id_token ? "linkedin_user" : "",
          handle: "",
          scopes: tokenData.scope?.split(",") ?? [],
        };
      }

      default:
        return null;
    }
  } catch (err: any) {
    console.error(`[social-oauth] ${platform} exchange error:`, err.message);
    return null;
  }
}

// ── Token Refresh ─────────────────────────────────────────────────────

/**
 * Refresh an expired access token.
 * Returns a new token set or null if refresh fails.
 */
export async function refreshToken(
  platform: SocialPlatform,
  refreshTokenValue: string,
): Promise<OAuthTokenSet | null> {
  try {
    switch (platform) {
      case "tiktok": {
        const clientKey = process.env.TIKTOK_CLIENT_KEY;
        const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
        if (!clientKey || !clientSecret) return null;

        const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_key: clientKey,
            client_secret: clientSecret,
            grant_type: "refresh_token",
            refresh_token: refreshTokenValue,
          }),
        });
        const data = await res.json();
        if (data.error) return null;

        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Math.floor(Date.now() / 1000) + (data.expires_in ?? 86400),
          platformUserId: "",
          handle: "",
          scopes: data.scope?.split(",") ?? [],
        };
      }
      // Meta tokens are long-lived (60 days) — re-auth needed, not refreshable
      default:
        return null;
    }
  } catch {
    return null;
  }
}

// ── Token Storage ─────────────────────────────────────────────────────

/**
 * Store OAuth tokens for a tenant's platform connection.
 */
export async function storeTokens(
  tenantId: string,
  platform: SocialPlatform,
  tokens: OAuthTokenSet,
): Promise<void> {
  const supabase = getAdminClient();
  const id = `pc_${tenantId}_${platform}`;

  await supabase.from("platform_connections").upsert({
    id,
    tenant_id: tenantId,
    platform,
    connected: true,
    handle: tokens.handle,
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken ?? null,
    token_expires_at: new Date(tokens.expiresAt * 1000).toISOString(),
    platform_user_id: tokens.platformUserId,
    connected_at: new Date().toISOString(),
  });
}

/**
 * Get stored OAuth tokens for a tenant's platform connection.
 */
export async function getStoredTokens(
  tenantId: string,
  platform: SocialPlatform,
): Promise<OAuthTokenSet | null> {
  const supabase = getAdminClient();
  const id = `pc_${tenantId}_${platform}`;

  const { data } = await supabase
    .from("platform_connections")
    .select("access_token, refresh_token, token_expires_at, platform_user_id, handle")
    .eq("id", id)
    .maybeSingle();

  if (!data?.access_token) return null;

  // Check if token is expired and try refresh
  const expiresAt = data.token_expires_at
    ? new Date(data.token_expires_at).getTime() / 1000
    : Math.floor(Date.now() / 1000) + 3600;

  if (Date.now() / 1000 > expiresAt - 300) {
    // Token expired or about to expire — try refresh
    if (data.refresh_token) {
      const refreshed = await refreshToken(platform, data.refresh_token);
      if (refreshed) {
        await storeTokens(tenantId, platform, refreshed);
        return refreshed;
      }
    }
    console.warn(`[social-oauth] Token expired for ${platform}/${tenantId} — re-auth required`);
    return null;
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? undefined,
    expiresAt,
    platformUserId: data.platform_user_id ?? "",
    handle: data.handle ?? "",
    scopes: [],
  };
}

// ── Content Posting ───────────────────────────────────────────────────

/**
 * Post content to a connected social platform.
 * This actually publishes to the platform API.
 */
export async function postToPlatform(
  tenantId: string,
  platform: SocialPlatform,
  post: PlatformPost,
): Promise<PostResult> {
  const tokens = await getStoredTokens(tenantId, platform);
  if (!tokens) {
    return { success: false, error: "Platform not connected or token expired. Re-authenticate." };
  }

  try {
    switch (platform) {
      case "instagram": {
        return await postToInstagram(tokens.accessToken, tokens.platformUserId, post);
      }
      case "facebook": {
        return await postToFacebook(tokens.accessToken, tokens.platformUserId, post);
      }
      case "tiktok": {
        return await postToTikTok(tokens.accessToken, post);
      }
      default:
        return { success: false, error: `Posting to ${platform} is not yet supported.` };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function postToInstagram(
  accessToken: string,
  igUserId: string,
  post: PlatformPost,
): Promise<PostResult> {
  const caption = `${post.caption}\n\n${(post.hashtags ?? []).map(h => `#${h.replace(/^#/, "")}`).join(" ")}`;

  try {
    if (post.mediaType === "reel" || post.mediaUrl.match(/\.(mp4|mov)$/i)) {
      // Step 1: Create media container for Reel
      const createRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media?` +
        new URLSearchParams({
          media_type: "REELS",
          video_url: post.mediaUrl,
          caption,
          access_token: accessToken,
        }),
        { method: "POST" },
      );
      const createData = await createRes.json();
      if (createData.error) throw new Error(createData.error.message);

      // Step 2: Wait for processing and publish
      const mediaId = createData.id;
      await waitForMediaReady(accessToken, mediaId);

      const publishRes = await fetch(
        `https://graph.facebook.com/v21.0/${igUserId}/media_publish?` +
        new URLSearchParams({ creation_id: mediaId, access_token: accessToken }),
        { method: "POST" },
      );
      const publishData = await publishRes.json();
      if (publishData.error) throw new Error(publishData.error.message);

      return {
        success: true,
        platformPostId: publishData.id,
        platformPostUrl: `https://instagram.com/p/${publishData.id?.split("_")[0] ?? ""}`,
      };
    }

    // Image/Feed post
    const createRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}/media?` +
      new URLSearchParams({
        image_url: post.mediaUrl,
        caption,
        access_token: accessToken,
      }),
      { method: "POST" },
    );
    const createData = await createRes.json();
    if (createData.error) throw new Error(createData.error.message);

    const publishRes = await fetch(
      `https://graph.facebook.com/v21.0/${igUserId}/media_publish?` +
      new URLSearchParams({ creation_id: createData.id, access_token: accessToken }),
      { method: "POST" },
    );
    const publishData = await publishRes.json();
    if (publishData.error) throw new Error(publishData.error.message);

    return {
      success: true,
      platformPostId: publishData.id,
      platformPostUrl: `https://instagram.com/p/${publishData.id?.split("_")[0] ?? ""}`,
    };
  } catch (err: any) {
    return { success: false, error: `Instagram: ${err.message}` };
  }
}

async function postToFacebook(
  accessToken: string,
  pageId: string,
  post: PlatformPost,
): Promise<PostResult> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/feed`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `${post.caption}\n\n${(post.hashtags ?? []).join(" ")}`,
          link: post.mediaUrl,
          access_token: accessToken,
        }),
      },
    );
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);

    return {
      success: true,
      platformPostId: data.id,
      platformPostUrl: `https://facebook.com/${data.id}`,
    };
  } catch (err: any) {
    return { success: false, error: `Facebook: ${err.message}` };
  }
}

async function postToTikTok(
  accessToken: string,
  post: PlatformPost,
): Promise<PostResult> {
  try {
    // Step 1: Initialize upload
    const initRes = await fetch("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        post_info: {
          title: post.caption.slice(0, 2200),
          privacy_level: post.privacySettings === "private" ? "SELF_ONLY" : "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: post.mediaUrl,
        },
      }),
    });
    const initData = await initRes.json();
    if (initData.error) throw new Error(initData.error.message);

    // Step 2: Wait for processing (TikTok uploads are async)
    let attempts = 0;
    while (attempts < 30) {
      const statusRes = await fetch("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ publish_id: initData.data.publish_id }),
      });
      const statusData = await statusRes.json();

      if (statusData.data?.status === "PUBLISH_COMPLETE") {
        return {
          success: true,
          platformPostId: statusData.data.publically_available_post_id?.[0],
          platformPostUrl: `https://tiktok.com/@user/video/${statusData.data.publically_available_post_id?.[0] ?? ""}`,
        };
      }
      if (statusData.data?.status === "FAILED") {
        return { success: false, error: statusData.data.fail_reason ?? "TikTok upload failed" };
      }

      await new Promise(r => setTimeout(r, 2000));
      attempts++;
    }

    return { success: false, error: "TikTok upload timed out" };
  } catch (err: any) {
    return { success: false, error: `TikTok: ${err.message}` };
  }
}

/** Wait for Instagram media to be ready for publishing. */
async function waitForMediaReady(accessToken: string, mediaId: string): Promise<void> {
  let attempts = 0;
  while (attempts < 30) {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}?fields=status_code&access_token=${accessToken}`,
    );
    const data = await res.json();
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") throw new Error("Media processing failed");
    await new Promise(r => setTimeout(r, 2000));
    attempts++;
  }
  throw new Error("Media processing timed out");
}

// ── Utility ───────────────────────────────────────────────────────────

/**
 * Check which platforms are available for OAuth (have API credentials configured).
 */
export function getAvailablePlatforms(): SocialPlatform[] {
  const available: SocialPlatform[] = [];
  if (process.env.META_APP_ID && process.env.META_APP_SECRET) {
    available.push("instagram", "facebook");
  }
  if (process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET) {
    available.push("tiktok");
  }
  if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
    available.push("linkedin");
  }
  return available;
}
