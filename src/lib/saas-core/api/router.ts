/**
 * SaaS Core API — Hono router for the multi-tenant dashboard.
 *
 * AUTH (delegated to Auth.js v5 — next-auth@beta):
 *   Auth.js handles: /api/auth/* (sign-in, callback, session, sign-out)
 *   Remaining custom endpoints below:
 *     POST   /api/auth/email/signup        — Email + password signup (user creation)
 *     POST   /api/auth/forgot-password    — Send reset code
 *     POST   /api/auth/reset-password     — Reset password with code
 *
 * PROTECTED (require auth session via Auth.js):
 *   POST   /api/onboarding/niche         — Select niche
 *   POST   /api/onboarding/website       — Submit website URL
 *   POST   /api/auth/onboarding-complete — Mark onboarding done
 *   GET    /api/dashboard               — Full dashboard state
 *   ...all content/tenant/platform routes...
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  requireAuth,
  requireAdmin,
  requireClient,
  requireAgencyAccess,
  resolveAgencyOwnerId,
  getClientIP,
} from "../../auth/hono-adapter";
import { hashPassword } from "../../auth/password";
import { rateLimitByIP, rateLimitByEmail } from "../../auth/rate-limit";
import { createUser as storeCreateUser, getUserByEmail, getUserById, markOnboardingComplete as storeMarkOnboardingComplete, updateUser, getClientsByAdmin } from "../../auth/user-store";
import { getAdminClient } from "../../supabase/admin";
import { AuthService } from "../services/auth-service";
import { tenantService } from "../services/tenant-service";
import { getTenantFromDB, getEntitlements, assertFeature, assertQuota } from "../services/entitlements";
import { listTeam, createMember, updateMemberRole, removeMember } from "../services/team-service";
import { validate, honoErrorHandler, ValidationError, ApiError, logger, schemas } from "../../api-utils";
import type { ApiResponse } from "../types";

const app = new Hono();

// ── Global middleware ────────────────────────────────────────────────

app.use("*", cors({
  origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));

app.onError(honoErrorHandler);

app.notFound((c) => {
  return c.json({ success: false, error: `Route not found: ${c.req.method} ${c.req.path}` }, 404);
});

// ── Shared services ──────────────────────────────────────────────────

const authService = new AuthService();

// ── Reset codes (in-memory — use Redis/DB in production) ───────────

const resetCodes = new Map<string, { code: string; expiresAt: number }>();

// ── Health ───────────────────────────────────────────────────────────

app.get("/api/health", (c) => {
  return c.json({
    success: true,
    data: { status: "healthy", version: "2.0.0", activeTenants: tenantService.getActiveTenantCount() },
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AUTH ENDPOINTS — complementary to Auth.js
// Auth.js handles: sign-in, callback, session, sign-out at /api/auth/*
// These endpoints handle signup + password reset (not provided by Auth.js)
// ═══════════════════════════════════════════════════════════════════════

// ── Email signup (user creation — Auth.js credentials provider handles login) ──

app.post("/api/auth/email/signup", async (c) => {
  const ip = getClientIP(c);
  const rl = rateLimitByIP(ip, "signup");
  if (!rl.allowed) {
    return c.json({ success: false, error: "Too many signup attempts. Try again later." }, 429);
  }

  const body = await validate(c, schemas.signup);
  const { email, password, name } = body;

  const existing = await getUserByEmail(email);
  if (existing) {
    return c.json({ success: false, error: "An account with this email already exists." }, 409);
  }

  const user = await storeCreateUser({ email, password, name });

  // Also create AuthService session for tenant/onboarding tracking
  authService.ensureSession(user.id, user.email, user.name);

  return c.json({
    success: true,
    data: {
      userId: user.id,
      name: user.name,
      email: user.email,
      onboardingComplete: false,
    },
  });
});

// ── Forgot password ──────────────────────────────────────────────────

app.post("/api/auth/forgot-password", async (c) => {
  const ip = getClientIP(c);
  const rl = rateLimitByIP(ip, "forgot");
  if (!rl.allowed) {
    return c.json({ success: false, error: "Too many attempts. Try again later." }, 429);
  }

  const body = await validate(c, schemas.forgotPassword);
  const { email } = body;

  const user = await getUserByEmail(email);
  // Always return success to prevent email enumeration
  if (!user) {
    return c.json({ success: true, data: { message: "If an account exists, a reset code has been sent." } });
  }

  // Use crypto.randomInt for secure random codes
  const crypto = await import("node:crypto");
  const code = String(crypto.randomInt(100000, 999999));
  resetCodes.set(email.toLowerCase(), { code, expiresAt: Date.now() + 15 * 60_000 });

  // Send email notification (or log in dev)
  try {
    const { sendPasswordResetCode } = await import("../../notifications");
    await sendPasswordResetCode({ email, code });
  } catch {
    // Non-blocking — don't fail the request if email fails
  }

  const isDev = !process.env.NODE_ENV?.startsWith("prod");
  if (isDev) {
    console.log(`[auth] Reset code for ${email}: ${code}`);
  }

  return c.json({
    success: true,
    data: {
      message: "If an account exists, a reset code has been sent.",
      resetCode: isDev ? code : undefined,
    },
  });
});

// ── Reset password ───────────────────────────────────────────────────

app.post("/api/auth/reset-password", async (c) => {
  const ip = getClientIP(c);
  const rl = rateLimitByIP(ip, "reset");
  if (!rl.allowed) {
    return c.json({ success: false, error: "Too many attempts. Try again later." }, 429);
  }

  const body = await validate(c, schemas.resetPassword);
  const { email, code, newPassword } = body;

  const stored = resetCodes.get(email.toLowerCase());
  if (!stored || stored.code !== code || Date.now() > stored.expiresAt) {
    return c.json({ success: false, error: "Invalid or expired reset code." }, 400);
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return c.json({ success: false, error: "Account not found." }, 404);
  }

  await updateUser(email, { passwordHash: hashPassword(newPassword) });
  resetCodes.delete(email.toLowerCase());

  return c.json({ success: true, data: { message: "Password updated. You can now log in." } });
});

// ═══════════════════════════════════════════════════════════════════════
// PROTECTED ENDPOINTS — require auth cookie
// ═══════════════════════════════════════════════════════════════════════

// ── Onboarding: complete (self-signup) ───────────────────────────────

app.post("/api/onboarding/complete", requireAuth, async (c) => {
  const session = c.get("session");
  const body = await validate(c, schemas.onboardingComplete);
  const { niche, businessName, websiteUrl } = body;

  const supabase = getAdminClient();

  try {
    // Save niche + website to onboarding state (in-memory)
    const state = authService.setNiche(session.sub, niche, niche, businessName);

    // Save website URL without analysis
    if (websiteUrl) {
      authService.setWebsiteUrlOnly(session.sub, websiteUrl);
    }

    // Update users table with business name
    const { error: updateErr } = await supabase
      .from("users")
      .update({
        name: businessName ?? session.name,
        onboarding_complete: true,
      })
      .eq("id", session.sub);

    if (updateErr) {
      console.error("[onboarding/complete] Failed to update user:", updateErr.message);
    }

    // Mark onboarding complete
    authService.markOnboardingComplete(session.sub);

    // Create tenant for this user
    const slug = (businessName ?? session.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const tenant = tenantService.createTenant({
      name: businessName ?? session.name,
      slug,
      email: session.email,
    });
    authService.linkTenant(session.sub, tenant.id);

    // Persist tenant to Supabase
    await supabase.from("tenants").upsert({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      email: session.email,
      owner_id: session.sub,
      status: "active",
      created_at: new Date().toISOString(),
    });

    // Persist onboarding to Supabase
    await supabase.from("onboarding").upsert({
      user_id: session.sub,
      step: "done",
      selected_niche: niche,
      business_description: businessName ?? null,
      website_url: websiteUrl ?? null,
      updated_at: new Date().toISOString(),
    });

    return c.json({
      success: true,
      data: {
        niche,
        businessName: businessName ?? session.name,
        websiteUrl: websiteUrl ?? null,
        tenantId: tenant.id,
        onboardingComplete: true,
      },
    });
  } catch (err: any) {
    console.error("[onboarding/complete] Error:", err.message);
    return c.json({ success: false, error: "Failed to save onboarding data." }, 500);
  }
});

// ── Tenants ──────────────────────────────────────────────────────────

app.get("/api/tenants", requireAuth, async (c) => {
  const session = c.get("session");
  let tenantIds = authService.getUserTenants(session.sub);
  if (!tenantIds || tenantIds.length === 0) tenantIds = authService.getUserTenants(session.email);
  const tenants = tenantIds.map(id => tenantService.getTenant(id)).filter(Boolean);
  return c.json({ success: true, data: tenants });
});

app.post("/api/tenants", requireAuth, async (c) => {
  const session = c.get("session");
  const body = await c.req.json();
  const tenant = tenantService.createTenant(body);
  authService.linkTenant(session.sub, tenant.id);
  return c.json({ success: true, data: tenant }, 201);
});

// ═══════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

// ── List all clients for admin ───────────────────────────────────────

app.get("/api/admin/clients", requireAuth, requireAdmin, async (c) => {
  const session = c.get("session");
  const supabase = getAdminClient();

  // Resolve the effective agency owner — team members act on behalf of their owner.
  const ownerId = await resolveAgencyOwnerId(session.sub);

  // Get all tenants owned by this agency
  const { data: tenants } = await supabase
    .from("tenants")
    .select("*")
    .eq("agency_id", ownerId);

  if (!tenants?.length) {
    return c.json({ success: true, data: [] });
  }

  // Get client users + content counts
  const result = [];
  for (const t of tenants) {
    const { count } = await supabase
      .from("content_assets")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", t.id);

    // Find the user linked to this tenant via client_user_id (fallback to email).
    const { data: users } = t.client_user_id
      ? await supabase.from("users").select("id, email, name").eq("id", t.client_user_id).limit(1)
      : await supabase.from("users").select("id, email, name").eq("email", t.email).limit(1);

    result.push({
      userId: users?.[0]?.id ?? t.client_user_id ?? "",
      tenantId: t.id,
      name: users?.[0]?.name ?? t.name,
      email: users?.[0]?.email ?? t.email,
      businessName: t.name,
      status: t.status,
      createdAt: t.created_at,
      contentCount: count ?? 0,
    });
  }

  return c.json({ success: true, data: result });
});

// ── Create client ─────────────────────────────────────────────────────

app.post("/api/admin/clients", requireAuth, requireAdmin, async (c) => {
  const session = c.get("session");
  const ip = getClientIP(c);
  const rl = rateLimitByIP(ip, "admin-create-client");
  if (!rl.allowed) {
    return c.json({ success: false, error: "Too many requests. Try again later." }, 429);
  }

  const body = await validate(c, schemas.createClient);
  const { name, email, businessName, password } = body;

  if (!name || !email || !businessName || !password) {
    return c.json({ success: false, error: "All fields are required." }, 400);
  }

  try {
    const supabase = getAdminClient();

    // Create user in Supabase Auth
    const emailLower = email.toLowerCase().trim();
    const now = new Date().toISOString();
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: emailLower,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (authError) {
      return c.json({ success: false, error: authError.message }, 400);
    }

    // Key the `users` row by the Supabase Auth UUID (NOT a custom id), so that
    // requireAuth → getUserRole(auth user.id) resolves the role when they log in.
    const userId = authUser.user.id;
    const { error: userErr } = await supabase.from("users").upsert({
      id: userId,
      email: emailLower,
      name,
      password_hash: hashPassword(password),
      role: "client",
      onboarding_complete: true,
      created_at: now,
    }, { onConflict: "id" });
    if (userErr) {
      return c.json({ success: false, error: `Failed to create client account: ${userErr.message}` }, 500);
    }

    // Create tenant (in-memory cache) and persist directly to Supabase with the
    // agency + client links (tenant-service's REST adapter is unreliable on Vercel).
    const slugBase = businessName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const slug = `${slugBase || "client"}-${Date.now().toString(36).slice(-4)}`;
    const tenant = tenantService.createTenant({ name: businessName, slug, email: emailLower });

    const agencyOwnerId = await resolveAgencyOwnerId(session.sub);
    const { error: tenantErr } = await supabase.from("tenants").upsert({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      email: emailLower,
      tier: "free",
      status: "trial",
      trial_ends_at: null,
      features_json: {},
      metadata_json: { ownerName: name },
      agency_id: agencyOwnerId,
      client_user_id: userId,
      created_at: now,
      updated_at: now,
    }, { onConflict: "id" });
    if (tenantErr) {
      return c.json({ success: false, error: `Failed to create client tenant: ${tenantErr.message}` }, 500);
    }

    authService.linkTenant(userId, tenant.id);
    authService.ensureSession(userId, emailLower, name);

    return c.json({
      success: true,
      data: {
        userId,
        tenantId: tenant.id,
        name,
        email: emailLower,
        businessName: tenant.name,
        temporaryPassword: password,
      },
    }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ── Delete client ─────────────────────────────────────────────────────

app.delete("/api/admin/clients/:id", requireAuth, requireAdmin, requireAgencyAccess, async (c) => {
  const tenantId = c.req.param("id");
  tenantService.deleteTenant(tenantId);

  const supabase = getAdminClient();
  await supabase.from("content_assets").delete().eq("tenant_id", tenantId);
  await supabase.from("tenants").delete().eq("id", tenantId);

  return c.json({ success: true });
});

// ── Admin content list (all clients) ──────────────────────────────────

app.get("/api/admin/content", requireAuth, requireAdmin, async (c) => {
  const session = c.get("session");
  const supabase = getAdminClient();

  // Get all tenants for this admin
  const { data: tenants } = await supabase
    .from("tenants")
    .select("id")
    .eq("agency_id", session.sub);

  if (!tenants?.length) {
    return c.json({ success: true, data: [] });
  }

  const tenantIds = tenants.map(t => t.id);
  const { data: assets } = await supabase
    .from("content_assets")
    .select("*")
    .in("tenant_id", tenantIds)
    .order("created_at", { ascending: false })
    .limit(50);

  return c.json({ success: true, data: assets ?? [] });
});

// ── Admin calendar for specific client ────────────────────────────────

app.get("/api/admin/calendar/:clientId", requireAuth, requireAdmin, requireAgencyAccess, async (c) => {
  const clientId = c.req.param("clientId");
  const supabase = getAdminClient();

  const { data: assets } = await supabase
    .from("content_assets")
    .select("*")
    .eq("tenant_id", clientId)
    .order("scheduled_date", { ascending: true });

  return c.json({ success: true, data: assets ?? [] });
});

// ── Admin update content status (review / approve / deliver / reject) ─

const CONTENT_STATUS_FLOW: Record<string, string[]> = {
  planned: ["draft"],
  draft: ["in_review", "rejected"],
  in_review: ["revision_requested", "approved", "rejected"],
  revision_requested: ["draft", "in_review"],
  approved: ["delivered", "rejected"],
  delivered: ["downloaded"],
  downloaded: ["posted"],
  posted: [],
  rejected: ["draft"],
};

app.post("/api/admin/content/:id/status", requireAuth, requireAdmin, async (c) => {
  const assetId = c.req.param("id");
  const body = await validate(c, schemas.contentStatus);
  const { status, note } = body;
  const session = c.get("session");
  const supabase = getAdminClient();

  const { data: asset } = await supabase
    .from("content_assets")
    .select("tenant_id, status")
    .eq("id", assetId)
    .maybeSingle();

  if (!asset) {
    return c.json({ success: false, error: "Content not found." }, 404);
  }

  // Verify the admin owns this client's tenant
  const { data: tenant } = await supabase
    .from("tenants")
    .select("agency_id")
    .eq("id", (asset as any).tenant_id)
    .maybeSingle();

  const ownerId = await resolveAgencyOwnerId(session.sub);
  if (!tenant || (tenant as any).agency_id !== ownerId) {
    return c.json({ success: false, error: "Access denied." }, 403);
  }

  // Enforce the allowed transition
  const current = (asset as any).status as string;
  const allowed = CONTENT_STATUS_FLOW[current] ?? [];
  if (!allowed.includes(status)) {
    return c.json(
      { success: false, error: `Cannot move content from "${current}" to "${status}".` },
      400,
    );
  }

  const patch: Record<string, any> = {
    status,
    reviewed_by: session.sub,
    reviewed_at: new Date().toISOString(),
  };
  if (note) patch.review_note = note;

  const { error } = await supabase
    .from("content_assets")
    .update(patch)
    .eq("id", assetId);

  if (error) {
    return c.json({ success: false, error: "Failed to update status." }, 500);
  }

  return c.json({ success: true, data: { id: assetId, status } });
});

// ── Admin upload content ──────────────────────────────────────────────

app.post("/api/admin/upload", requireAuth, requireAdmin, async (c) => {
  const session = c.get("session");
  const ip = getClientIP(c);
  const rl = rateLimitByIP(ip, "admin-upload");
  if (!rl.allowed) {
    return c.json({ success: false, error: "Too many uploads. Try again later." }, 429);
  }

  const contentType = c.req.header("content-type") ?? "";

  if (!contentType.includes("multipart/form-data")) {
    return c.json({ success: false, error: "Multipart form data required." }, 400);
  }

  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;
    const tenantId = formData.get("tenantId") as string;
    const title = formData.get("title") as string;
    const description = (formData.get("description") as string) ?? "";
    const contentAssetType = (formData.get("contentType") as string) ?? "video";
    const platform = (formData.get("platform") as string) ?? "all";
    const scheduledDate = (formData.get("scheduledDate") as string) ?? new Date().toISOString().split("T")[0];

    if (!file || !tenantId || !title) {
      return c.json({ success: false, error: "file, tenantId, and title are required." }, 400);
    }

    // Verify tenant belongs to this admin's agency
    const supabase = getAdminClient();
    const ownerId = await resolveAgencyOwnerId(session.sub);
    const { data: tenant } = await supabase
      .from("tenants")
      .select("agency_id")
      .eq("id", tenantId)
      .maybeSingle();

    if (!tenant || tenant.agency_id !== ownerId) {
      return c.json({ success: false, error: "Access denied." }, 403);
    }

    // Paywall: enforce monthly post quota + trial/status gate.
    await assertQuota(c, tenantId, "posts");

    // Upload file to storage (Vercel Blob → R2 → Base64 fallback)
    const { uploadFile } = await import("../../storage");
    const arrayBuffer = await file.arrayBuffer();
    const mimeType = file.type || "application/octet-stream";
    const ext = file.name.split(".").pop() ?? "bin";
    const storageResult = await uploadFile({
      data: Buffer.from(arrayBuffer),
      filename: `${title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50)}.${ext}`,
      contentType: mimeType,
      tenantId,
    });

    const assetId = `asset_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const asset = {
      id: assetId,
      tenant_id: tenantId,
      title,
      description,
      file_url: storageResult.url,
      thumbnail_url: null,
      content_type: contentAssetType,
      file_size: storageResult.size,
      mime_type: mimeType,
      duration_seconds: null,
      platform,
      scheduled_date: scheduledDate,
      status: "draft",
      created_at: now,
      created_by: session.sub,
    };

    const { error } = await supabase.from("content_assets").insert(asset);
    if (error) {
      console.error("[api] Failed to insert content asset:", error.message);
      return c.json({ success: false, error: "Failed to save asset." }, 500);
    }

    return c.json({
      success: true,
      data: {
        id: assetId,
        title,
        contentType: contentAssetType,
        scheduledDate,
        fileSize: file.size,
      },
    }, 201);
  } catch (err: any) {
    // Let plan/validation errors propagate to the Hono error handler (402/403/404).
    if (err instanceof ApiError) throw err;
    console.error("[api] Upload error:", err.message);
    return c.json({ success: false, error: "Upload failed." }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// CLIENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

async function getClientTenantId(c: any): Promise<string | null> {
  const session = c.get("session");
  if (!session?.email) return null;
  // Resolve tenant from in-memory session first
  const tenantIds = authService.getUserTenants(session.sub);
  if (tenantIds?.length) return tenantIds[0]!;
  const emailIds = authService.getUserTenants(session.email);
  if (emailIds?.length) return emailIds[0]!;
  // Cold start / ID mismatch: fall back to the persisted client↔tenant link
  return authService.getClientTenantIdFromDB(session.email);
}

// ── Client calendar ───────────────────────────────────────────────────

app.get("/api/client/calendar", requireAuth, async (c) => {
  const tenantId = await getClientTenantId(c);
  if (!tenantId) {
    return c.json({ success: true, data: [] });
  }

  const supabase = getAdminClient();
  const { data: assets } = await supabase
    .from("content_assets")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("status", ["approved", "delivered", "downloaded", "posted", "revision_requested"])
    .order("scheduled_date", { ascending: true });

  return c.json({ success: true, data: assets ?? [] });
});

// ── Client content download (mark as downloaded) ──────────────────────

app.post("/api/client/content/:id/download", requireAuth, async (c) => {
  const assetId = c.req.param("id");
  const supabase = getAdminClient();

  const { error } = await supabase
    .from("content_assets")
    .update({ status: "downloaded", downloaded_at: new Date().toISOString() })
    .eq("id", assetId);

  if (error) {
    return c.json({ success: false, error: "Update failed." }, 500);
  }

  return c.json({ success: true });
});

// ── Client post to platform (actual social media posting) ────────────

app.post("/api/client/content/:id/post", requireAuth, async (c) => {
  const assetId = c.req.param("id");
  const body = await validate(c, schemas.postContent);
  const { platform } = body;
  const tenantId = await getClientTenantId(c);

  if (!tenantId) {
    return c.json({ success: false, error: "No account found." }, 400);
  }

  const supabase = getAdminClient();

  // Get the content asset
  const { data: asset } = await supabase
    .from("content_assets")
    .select("*")
    .eq("id", assetId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!asset) {
    return c.json({ success: false, error: "Content not found." }, 404);
  }

  // Try to post to the actual platform
  const { postToPlatform } = await import("../../social-oauth");
  const result = await postToPlatform(tenantId, platform as any, {
    platform: platform as any,
    mediaUrl: asset.file_url,
    caption: `${asset.title}\n\n${asset.description}`,
    mediaType: asset.content_type === "reel" ? "reel" : "feed",
  });

  if (result.success) {
    // Mark as posted — keep the platform URL in posted_url, not appended to description
    await supabase
      .from("content_assets")
      .update({
        status: "posted",
        posted_at: new Date().toISOString(),
        posted_url: result.platformPostUrl ?? null,
      })
      .eq("id", assetId);

    return c.json({
      success: true,
      data: {
        posted: true,
        assetId,
        platformPostId: result.platformPostId,
        platformPostUrl: result.platformPostUrl,
      },
    });
  }

  // If real posting fails (token expired, not connected, etc.),
  // mark as downloaded so client can post manually
  if (result.error?.includes("not connected") || result.error?.includes("token expired")) {
    return c.json({
      success: false,
      error: result.error,
      needsReauth: true,
    }, 400);
  }

  // Generic posting failure — still mark as ready for manual posting
  return c.json({
    success: false,
    error: result.error ?? "Post failed. Try downloading and posting manually.",
  }, 500);
});

// ── Client accounts list ──────────────────────────────────────────────

app.get("/api/client/accounts", requireAuth, async (c) => {
  const tenantId = await getClientTenantId(c);
  if (!tenantId) {
    return c.json({ success: true, data: [] });
  }

  const supabase = getAdminClient();
  const { data: connections } = await supabase
    .from("platform_connections")
    .select("*")
    .eq("tenant_id", tenantId);

  return c.json({
    success: true,
    data: (connections ?? []).map((conn: any) => ({
      platform: conn.platform,
      connected: conn.connected,
      handle: conn.handle,
    })),
  });
});

// ── Client connect platform (initiates real OAuth flow) ──────────────

app.post("/api/client/accounts/connect", requireAuth, async (c) => {
  const body = await validate(c, schemas.connectPlatform);
  const { platform } = body;
  const tenantId = await getClientTenantId(c);

  if (!tenantId) {
    return c.json({ success: false, error: "No tenant found." }, 400);
  }

  // Paywall: enforce max connected platforms.
  await assertQuota(c, tenantId, "platforms");

  // Get OAuth URL for real platform authentication
  const { getOAuthUrl, getAvailablePlatforms } = await import("../../social-oauth");
  const availablePlatforms = getAvailablePlatforms();

  if (availablePlatforms.includes(platform)) {
    const authUrl = getOAuthUrl(platform, tenantId);
    if (authUrl) {
      return c.json({
        success: true,
        data: { platform, authUrl, needsOAuth: true },
      });
    }
  }

  // Fallback: if no OAuth credentials are configured, mark as pending
  // The platform will work once credentials are set up
  const supabase = getAdminClient();
  const id = `pc_${tenantId}_${platform}`;

  await supabase.from("platform_connections").upsert({
    id,
    tenant_id: tenantId,
    platform,
    connected: false,
    handle: null,
    connected_at: null,
  });

  return c.json({
    success: true,
    data: {
      platform,
      connected: false,
      needsSetup: true,
      message: `OAuth credentials not yet configured for ${platform}. Contact your agency admin to set up ${platform} integration.`,
    },
  });
});

// ── Check platform connection status ────────────────────────────────

app.get("/api/client/accounts/:platform/status", requireAuth, async (c) => {
  const platform = c.req.param("platform");
  const tenantId = await getClientTenantId(c);

  if (!tenantId) {
    return c.json({ success: false, error: "No tenant found." }, 400);
  }

  const { getStoredTokens } = await import("../../social-oauth");
  const tokens = await getStoredTokens(tenantId, platform as any);

  return c.json({
    success: true,
    data: {
      platform,
      connected: !!tokens,
      handle: tokens?.handle ?? null,
      expiresAt: tokens?.expiresAt ? new Date(tokens.expiresAt * 1000).toISOString() : null,
    },
  });
});

// ── Client disconnect platform ───────────────────────────────────────

app.delete("/api/client/accounts/:platform", requireAuth, async (c) => {
  const platform = c.req.param("platform");
  const tenantId = await getClientTenantId(c);

  if (!tenantId) {
    return c.json({ success: false, error: "No tenant found." }, 400);
  }

  const supabase = getAdminClient();
  await supabase
    .from("platform_connections")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("platform", platform);

  return c.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════
// AI VIDEO GENERATION — Seedance 2.0
// ═══════════════════════════════════════════════════════════════════════

app.post("/api/admin/generate-video", requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json();
  const { prompt, model, duration, quality, aspectRatio, generateAudio, tenantId } = body;

  if (!prompt || !tenantId) {
    return c.json({ success: false, error: "prompt and tenantId are required." }, 400);
  }

  // Paywall: AI video generation requires the videoGeneration feature.
  await assertFeature(c, tenantId, "videoGeneration");

  const { submitVideoGeneration } = await import("@/lib/services/seedance-service");
  const result = await submitVideoGeneration({
    prompt,
    model: model ?? "seedance-2.0-text-to-video",
    duration: duration ?? 5,
    quality: quality ?? "720p",
    aspectRatio: aspectRatio ?? "16:9",
    generateAudio,
  });

  if ("error" in result) {
    return c.json({ success: false, error: result.error }, 500);
  }

  return c.json({ success: true, data: { taskId: result.taskId } });
});

app.get("/api/admin/generate-video", requireAuth, requireAdmin, async (c) => {
  const taskId = c.req.query("taskId");
  if (!taskId) {
    return c.json({ success: false, error: "taskId query param is required." }, 400);
  }

  const { pollTaskStatus } = await import("@/lib/services/seedance-service");
  const task = await pollTaskStatus(taskId);

  return c.json({ success: true, data: task });
});

app.post("/api/admin/generate-video/push", requireAuth, requireAdmin, async (c) => {
  const { videoUrl, tenantId, title, prompt } = await c.req.json();

  if (!videoUrl || !tenantId) {
    return c.json({ success: false, error: "videoUrl and tenantId are required." }, 400);
  }

  try {
    // Step 1: Download the video from Seedance
    const { downloadVideo } = await import("@/lib/services/seedance-service");
    const result = await downloadVideo(videoUrl);
    if ("error" in result) {
      return c.json({ success: false, error: result.error }, 500);
    }

    // Step 2: Upload the video via the canonical storage service (R2 SigV4 / Blob)
    const supabase = getAdminClient();
    const assetId = `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const today = new Date().toISOString().split("T")[0]!;

    const { uploadFile } = await import("../../storage");
    const storageResult = await uploadFile({
      data: result.buffer,
      filename: `${assetId}.mp4`,
      contentType: result.contentType,
      tenantId,
    });

    // Step 3: Store in content_assets → appears on client calendar
    const { error } = await supabase.from("content_assets").insert({
      id: assetId,
      tenant_id: tenantId,
      title: title ?? "AI Generated Video",
      description: prompt ?? "",
      file_url: storageResult.url,
      content_type: "video",
      file_size: storageResult.size,
      mime_type: result.contentType,
      platform: "all",
      scheduled_date: today,
      status: "draft",
      created_at: new Date().toISOString(),
      created_by: c.get("session").sub,
    });

    if (error) {
      return c.json({ success: false, error: `Database error: ${error.message}` }, 500);
    }

    // Get client name for response
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .maybeSingle();

    return c.json({
      success: true,
      data: {
        assetId,
        clientName: tenant?.name ?? "Client",
        fileUrl: storageResult.url,
      },
    });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// CRON ENDPOINTS (called by Vercel Cron Jobs)
// ═══════════════════════════════════════════════════════════════════════

app.get("/api/cron/daily-blogs", async (c) => {
  // Verify cron secret to prevent abuse
  const cronSecret = c.req.header("x-cron-secret") ?? c.req.query("secret");
  if (cronSecret !== process.env.CRON_SECRET) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }

  try {
    const { runDailyBlogAutomation } = await import("../services/blog-automation");
    const result = await runDailyBlogAutomation();
    return c.json({ success: true, data: result });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// ── Blog automation config per client ───────────────────────────────

app.post("/api/admin/clients/:id/blog-automation", requireAuth, requireAdmin, requireAgencyAccess, async (c) => {
  const tenantId = c.req.param("id");
  const config = await c.req.json();

  const supabase = getAdminClient();
  const { error } = await supabase
    .from("tenants")
    .update({ automation_config: config })
    .eq("id", tenantId);

  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }

  return c.json({ success: true, data: config });
});

app.get("/api/admin/clients/:id/blog-automation", requireAuth, requireAdmin, requireAgencyAccess, async (c) => {
  const tenantId = c.req.param("id");

  const supabase = getAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("automation_config")
    .eq("id", tenantId)
    .maybeSingle();

  return c.json({ success: true, data: data?.automation_config ?? {} });
});

// ── On-demand blog generation (admin triggers for a client) ─────────

app.post("/api/admin/clients/:id/generate-blog", requireAuth, requireAdmin, requireAgencyAccess, async (c) => {
  const tenantId = c.req.param("id");
  const { topic } = await c.req.json();

  // Paywall: enforce monthly blog quota + trial/status gate.
  await assertQuota(c, tenantId, "blogs");

  const { getClientBlogConfig, generateSingleBlog } = await import("../services/blog-automation");
  const config = await getClientBlogConfig(tenantId);

  if (!config) {
    return c.json({ success: false, error: "Blog automation not configured for this client." }, 400);
  }

  const result = await generateSingleBlog(
    topic ?? `${config.niche} best practices ${new Date().getFullYear()}`,
    config,
  );

  if (result.error || !result.blog) {
    return c.json({ success: false, error: result.error ?? "Generation failed" }, 500);
  }

  return c.json({
    success: true,
    data: {
      title: result.blog.title,
      excerpt: result.blog.excerpt,
      qualityScore: result.qualityScore,
      competitorCount: result.competitorCount,
      pushed: result.pushed,
      topic: result.topic,
    },
  });
});

// ── Client-side: generate blog for own account ──────────────────────

app.post("/api/client/generate-blog", requireAuth, async (c) => {
  const session = c.get("session");
  const { topic } = await c.req.json();

  // Resolve tenant from session
  const tenantId = await getClientTenantId(c);
  if (!tenantId) {
    return c.json({ success: false, error: "No account found." }, 400);
  }

  // Paywall: enforce monthly blog quota + trial/status gate.
  await assertQuota(c, tenantId, "blogs");

  const { getClientBlogConfig, generateSingleBlog } = await import("../services/blog-automation");
  const config = await getClientBlogConfig(tenantId);

  if (!config) {
    return c.json({ success: false, error: "Blog automation not configured for your account. Contact your agency." }, 400);
  }

  const result = await generateSingleBlog(
    topic ?? `${config.niche} trends and insights ${new Date().getFullYear()}`,
    config,
  );

  if (result.error || !result.blog) {
    return c.json({ success: false, error: result.error ?? "Generation failed" }, 500);
  }

  return c.json({
    success: true,
    data: {
      title: result.blog.title,
      excerpt: result.blog.excerpt,
      body: result.blog.body,
      qualityScore: result.qualityScore,
      competitorCount: result.competitorCount,
      pushed: result.pushed,
      topic: result.topic,
    },
  });
});

// ── Client: blog auto-generation toggle ───────────────────────────

app.get("/api/client/blog-auto-status", requireAuth, async (c) => {
  const tenantId = await getClientTenantId(c);
  if (!tenantId) return c.json({ success: true, data: { dailyAutoEnabled: false } });

  const supabase = getAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("automation_config")
    .eq("id", tenantId)
    .maybeSingle();

  const cfg = (data?.automation_config as Record<string, any>) ?? {};
  return c.json({ success: true, data: { dailyAutoEnabled: cfg.dailyAutoEnabled ?? false } });
});

app.post("/api/client/blog-auto-toggle", requireAuth, async (c) => {
  const tenantId = await getClientTenantId(c);
  if (!tenantId) return c.json({ success: false, error: "No account found." }, 400);

  const { enabled } = await c.req.json();

  const supabase = getAdminClient();
  const { data } = await supabase
    .from("tenants")
    .select("automation_config")
    .eq("id", tenantId)
    .maybeSingle();

  const cfg = (data?.automation_config as Record<string, any>) ?? {};
  cfg.dailyAutoEnabled = enabled;

  await supabase
    .from("tenants")
    .update({ automation_config: cfg })
    .eq("id", tenantId);

  return c.json({ success: true, data: { dailyAutoEnabled: enabled } });
});

// ═══════════════════════════════════════════════════════════════════════
// PUBLIC BLOG API (for client developers)
// ═══════════════════════════════════════════════════════════════════════

app.get("/api/v1/blogs/:tenantId", async (c) => {
  const tenantId = c.req.param("tenantId");
  const apiKey = c.req.query("apiKey") ?? c.req.header("x-api-key") ?? "";
  const limit = Math.min(parseInt(c.req.query("limit") ?? "10"), 50);

  if (!apiKey) {
    return c.json(
      { success: false, error: "API key required. Get yours from your agency dashboard." },
      401,
    );
  }

  const { validateApiKey, getPublicBlogPosts, checkRateLimit } =
    await import("../services/blog-api-service");

  // Rate limit check
  const rateLimit = checkRateLimit(apiKey);
  if (!rateLimit.allowed) {
    return c.json(
      { success: false, error: "Rate limit exceeded. Try again later." },
      429,
    );
  }

  const valid = await validateApiKey(tenantId, apiKey);
  if (!valid) {
    return c.json(
      { success: false, error: "Invalid API key." },
      403,
    );
  }

  // Add rate limit header
  c.header("X-RateLimit-Remaining", String(rateLimit.remaining));
  c.header("X-RateLimit-Reset", String(rateLimit.resetAt));

  const posts = await getPublicBlogPosts(tenantId, limit);
  const { data: tenant } = await getAdminClient()
    .from("tenants")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();

  return c.json({
    success: true,
    tenant: tenant?.name ?? tenantId,
    posts,
    meta: {
      total: posts.length,
      limit,
      apiDocs: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/v1/docs`,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════
// BILLING ENDPOINTS — Stripe Checkout + Customer Portal
// ═══════════════════════════════════════════════════════════════════════

app.post("/api/billing/checkout", requireAuth, requireAdmin, async (c) => {
  const body = await validate(c, schemas.billingCheckout);
  const { priceId, tenantId, successUrl, cancelUrl } = body;

  const session = c.get("session");
  const tenant = await getTenantFromDB(tenantId);

  if (!tenant) {
    return c.json({ success: false, error: "Tenant not found." }, 404);
  }

  const { billingService } = await import("../services/billing-service");
  const result = await billingService.createCheckoutSession({
    priceId,
    customerEmail: tenant.email ?? "",
    tenantId,
    customerId: tenant.stripe_customer_id ?? undefined,
    successUrl: successUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin/settings/billing?checkout=success`,
    cancelUrl: cancelUrl ?? `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin/settings/billing?checkout=cancelled`,
  });

  if (result.error) {
    return c.json({ success: false, error: result.error }, 500);
  }

  return c.json({ success: true, data: { url: result.url } });
});

app.get("/api/billing/portal", requireAuth, requireAdmin, async (c) => {
  const tenantId = c.req.query("tenantId");
  if (!tenantId) {
    return c.json({ success: false, error: "tenantId query param is required." }, 400);
  }

  const tenant = await getTenantFromDB(tenantId);
  if (!tenant?.stripe_customer_id) {
    return c.json({ success: false, error: "No Stripe customer found. Subscribe first." }, 400);
  }

  const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin/settings/billing`;
  const { billingService } = await import("../services/billing-service");
  const result = await billingService.createPortalSession(tenant.stripe_customer_id, returnUrl);

  if (result.error) {
    return c.json({ success: false, error: result.error }, 500);
  }

  return c.json({ success: true, data: { url: result.url } });
});

app.get("/api/billing/subscription", requireAuth, requireAdmin, async (c) => {
  const tenantId = c.req.query("tenantId");
  if (!tenantId) {
    return c.json({ success: false, error: "tenantId query param is required." }, 400);
  }

  const ent = await getEntitlements(tenantId);
  if (!ent) {
    return c.json({ success: false, error: "Tenant not found." }, 404);
  }

  const { billingService } = await import("../services/billing-service");
  const subInfo = await billingService.getTenantSubscription(tenantId);

  return c.json({
    success: true,
    data: {
      tier: ent.tier,
      status: ent.tenant.status ?? "active",
      trialEndsAt: ent.tenant.trial_ends_at ?? null,
      trialExpired: ent.trialExpired,
      blocked: ent.blocked,
      blockedReason: ent.blockedReason,
      features: ent.features,
      subscription: subInfo,
    },
  });
});

// ── API key management (admin only) ──────────────────────────────────

app.post("/api/admin/clients/:id/api-key", requireAuth, requireAdmin, requireAgencyAccess, async (c) => {
  const tenantId = c.req.param("id");
  const { generateApiKey } = await import("../services/blog-api-service");
  const key = await generateApiKey(tenantId);
  return c.json({ success: true, data: { apiKey: key } });
});

app.get("/api/admin/clients/:id/api-key", requireAuth, requireAdmin, requireAgencyAccess, async (c) => {
  const tenantId = c.req.param("id");
  const { getApiKey } = await import("../services/blog-api-service");
  const key = await getApiKey(tenantId);
  return c.json({ success: true, data: { apiKey: key } });
});

// ═══════════════════════════════════════════════════════════════════════
// TEAM MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════

app.get("/api/admin/team", requireAuth, requireAdmin, async (c) => {
  const session = c.get("session");
  const ownerId = await resolveAgencyOwnerId(session.sub);
  const team = await listTeam(ownerId);
  return c.json({ success: true, data: team });
});

app.post("/api/admin/team", requireAuth, requireAdmin, async (c) => {
  const session = c.get("session");
  const body = await validate(c, schemas.teamInvite);

  if (body.role === "owner") {
    return c.json({ success: false, error: "There can only be one agency owner." }, 400);
  }

  const ownerId = await resolveAgencyOwnerId(session.sub);
  try {
    const member = await createMember({
      ownerId,
      name: body.name,
      email: body.email,
      role: body.role,
      password: body.password,
    });
    return c.json({ success: true, data: member }, 201);
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 400);
  }
});

app.patch("/api/admin/team/:userId", requireAuth, requireAdmin, async (c) => {
  const session = c.get("session");
  const userId = c.req.param("userId");
  const body = await validate(c, schemas.teamUpdate);

  if (body.role === "owner") {
    return c.json({ success: false, error: "Cannot assign owner role." }, 400);
  }

  const ownerId = await resolveAgencyOwnerId(session.sub);
  const supabase = getAdminClient();
  const { data: member } = await supabase
    .from("users")
    .select("agency_id")
    .eq("id", userId)
    .maybeSingle();
  if (!member || member.agency_id !== ownerId) {
    return c.json({ success: false, error: "Team member not found." }, 404);
  }

  const ok = await updateMemberRole(userId, body.role);
  return ok
    ? c.json({ success: true })
    : c.json({ success: false, error: "Update failed." }, 500);
});

app.delete("/api/admin/team/:userId", requireAuth, requireAdmin, async (c) => {
  const session = c.get("session");
  const userId = c.req.param("userId");
  const ownerId = await resolveAgencyOwnerId(session.sub);

  const supabase = getAdminClient();
  const { data: member } = await supabase
    .from("users")
    .select("agency_id")
    .eq("id", userId)
    .maybeSingle();
  if (!member || member.agency_id !== ownerId) {
    return c.json({ success: false, error: "Team member not found." }, 404);
  }

  const ok = await removeMember(userId);
  return ok
    ? c.json({ success: true })
    : c.json({ success: false, error: "Remove failed." }, 500);
});

// ── Content assignment (team member → content asset) ────────────────

app.post("/api/admin/content/:id/assign", requireAuth, requireAdmin, async (c) => {
  const assetId = c.req.param("id");
  const body = await validate(c, schemas.assignContent);
  const { assigneeId } = body;
  const session = c.get("session");
  const supabase = getAdminClient();

  const { data: asset } = await supabase
    .from("content_assets")
    .select("tenant_id")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) {
    return c.json({ success: false, error: "Content not found." }, 404);
  }

  const ownerId = await resolveAgencyOwnerId(session.sub);
  const { data: tenant } = await supabase
    .from("tenants")
    .select("agency_id")
    .eq("id", asset.tenant_id)
    .maybeSingle();
  if (!tenant || tenant.agency_id !== ownerId) {
    return c.json({ success: false, error: "Access denied." }, 403);
  }

  const { error } = await supabase
    .from("content_assets")
    .update({ assignee_id: assigneeId })
    .eq("id", assetId);
  if (error) {
    return c.json({ success: false, error: "Update failed." }, 500);
  }
  return c.json({ success: true, data: { id: assetId, assigneeId } });
});

// ═══════════════════════════════════════════════════════════════════════
// CLIENT BRIEF (requirements) + CONTENT STRATEGY
// ═══════════════════════════════════════════════════════════════════════

app.get("/api/admin/clients/:id/brief", requireAuth, requireAdmin, requireAgencyAccess, async (c) => {
  const tenantId = c.req.param("id");
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("client_briefs")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return c.json({ success: true, data: data ?? null });
});

app.put("/api/admin/clients/:id/brief", requireAuth, requireAdmin, requireAgencyAccess, async (c) => {
  const tenantId = c.req.param("id");
  const body = await validate(c, schemas.brief);
  const supabase = getAdminClient();
  const now = new Date().toISOString();

  const payload = {
    tenant_id: tenantId,
    brand_voice: body.brandVoice ?? null,
    target_audience: body.targetAudience ?? null,
    goals: body.goals ?? null,
    content_pillars: body.contentPillars ?? [],
    platforms: body.platforms ?? [],
    style_guidelines: body.styleGuidelines ?? {},
    notes: body.notes ?? null,
    status: body.status ?? "active",
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("client_briefs")
    .upsert(payload, { onConflict: "tenant_id" })
    .select()
    .maybeSingle();

  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
  return c.json({ success: true, data: data ?? payload });
});

app.get("/api/admin/clients/:id/strategies", requireAuth, requireAdmin, requireAgencyAccess, async (c) => {
  const tenantId = c.req.param("id");
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("content_strategies")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  return c.json({ success: true, data: data ?? [] });
});

app.post("/api/admin/clients/:id/strategies", requireAuth, requireAdmin, requireAgencyAccess, async (c) => {
  const tenantId = c.req.param("id");
  const body = await validate(c, schemas.strategy);
  const supabase = getAdminClient();
  const now = new Date().toISOString();
  const id = `strategy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const payload = {
    id,
    tenant_id: tenantId,
    name: body.name,
    pillars_json: body.pillars ?? [],
    format_mix_json: body.formatMix ?? {},
    cadence_json: body.cadence ?? {},
    timeline_start: body.timelineStart ?? null,
    timeline_end: body.timelineEnd ?? null,
    status: body.status ?? "active",
    created_at: now,
    updated_at: now,
  };

  const { error } = await supabase.from("content_strategies").insert(payload);
  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
  return c.json({ success: true, data: payload }, 201);
});

app.patch("/api/admin/strategies/:id", requireAuth, requireAdmin, async (c) => {
  const strategyId = c.req.param("id");
  const body = await validate(c, schemas.strategy);
  const supabase = getAdminClient();

  const { data: existing } = await supabase
    .from("content_strategies")
    .select("tenant_id")
    .eq("id", strategyId)
    .maybeSingle();
  if (!existing) {
    return c.json({ success: false, error: "Strategy not found." }, 404);
  }

  const session = c.get("session");
  const ownerId = await resolveAgencyOwnerId(session.sub);
  const { data: tenant } = await supabase
    .from("tenants")
    .select("agency_id")
    .eq("id", existing.tenant_id)
    .maybeSingle();
  if (!tenant || tenant.agency_id !== ownerId) {
    return c.json({ success: false, error: "Access denied." }, 403);
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.pillars !== undefined) updates.pillars_json = body.pillars;
  if (body.formatMix !== undefined) updates.format_mix_json = body.formatMix;
  if (body.cadence !== undefined) updates.cadence_json = body.cadence;
  if (body.timelineStart !== undefined) updates.timeline_start = body.timelineStart;
  if (body.timelineEnd !== undefined) updates.timeline_end = body.timelineEnd;
  if (body.status !== undefined) updates.status = body.status;

  const { error } = await supabase
    .from("content_strategies")
    .update(updates)
    .eq("id", strategyId);
  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
  return c.json({ success: true });
});

app.delete("/api/admin/strategies/:id", requireAuth, requireAdmin, async (c) => {
  const strategyId = c.req.param("id");
  const supabase = getAdminClient();

  const { data: existing } = await supabase
    .from("content_strategies")
    .select("tenant_id")
    .eq("id", strategyId)
    .maybeSingle();
  if (!existing) {
    return c.json({ success: false, error: "Strategy not found." }, 404);
  }

  const session = c.get("session");
  const ownerId = await resolveAgencyOwnerId(session.sub);
  const { data: tenant } = await supabase
    .from("tenants")
    .select("agency_id")
    .eq("id", existing.tenant_id)
    .maybeSingle();
  if (!tenant || tenant.agency_id !== ownerId) {
    return c.json({ success: false, error: "Access denied." }, 403);
  }

  await supabase.from("content_strategies").delete().eq("id", strategyId);
  return c.json({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════
// CLIENT APPROVAL LOOP
// ═══════════════════════════════════════════════════════════════════════

app.get("/api/client/content/:id", requireAuth, async (c) => {
  const assetId = c.req.param("id");
  const tenantId = await getClientTenantId(c);
  if (!tenantId) {
    return c.json({ success: false, error: "No account found." }, 400);
  }

  const supabase = getAdminClient();
  const { data } = await supabase
    .from("content_assets")
    .select("*")
    .eq("id", assetId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) {
    return c.json({ success: false, error: "Content not found." }, 404);
  }
  return c.json({ success: true, data });
});

app.post("/api/client/content/:id/approve", requireAuth, async (c) => {
  const assetId = c.req.param("id");
  const tenantId = await getClientTenantId(c);
  if (!tenantId) {
    return c.json({ success: false, error: "No account found." }, 400);
  }

  const supabase = getAdminClient();
  const { data: asset } = await supabase
    .from("content_assets")
    .select("status")
    .eq("id", assetId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!asset) {
    return c.json({ success: false, error: "Content not found." }, 404);
  }
  if (asset.status !== "approved") {
    return c.json({ success: false, error: "This content is not awaiting your approval." }, 400);
  }

  const { error } = await supabase
    .from("content_assets")
    .update({ status: "delivered", reviewed_at: new Date().toISOString() })
    .eq("id", assetId);
  if (error) {
    return c.json({ success: false, error: "Update failed." }, 500);
  }
  return c.json({ success: true, data: { id: assetId, status: "delivered" } });
});

app.post("/api/client/content/:id/request-changes", requireAuth, async (c) => {
  const assetId = c.req.param("id");
  const tenantId = await getClientTenantId(c);
  if (!tenantId) {
    return c.json({ success: false, error: "No account found." }, 400);
  }

  const body = await validate(c, schemas.requestChanges);
  const session = c.get("session");
  const supabase = getAdminClient();

  const { data: asset } = await supabase
    .from("content_assets")
    .select("status")
    .eq("id", assetId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!asset) {
    return c.json({ success: false, error: "Content not found." }, 404);
  }
  if (asset.status !== "approved" && asset.status !== "delivered") {
    return c.json({ success: false, error: "This content is not awaiting your approval." }, 400);
  }

  const now = new Date().toISOString();
  const commentId = `comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await supabase
    .from("content_assets")
    .update({ status: "revision_requested", review_note: body.comment, reviewed_at: now })
    .eq("id", assetId);

  // Persist the comment (best-effort — requires migration-003 asset_comments table).
  try {
    await supabase.from("asset_comments").insert({
      id: commentId,
      asset_id: assetId,
      tenant_id: tenantId,
      author_id: session.sub,
      author_role: "client",
      body: body.comment,
      created_at: now,
    });
  } catch (err: any) {
    console.error("[api] Failed to store approval comment:", err?.message ?? err);
  }

  return c.json({ success: true, data: { id: assetId, status: "revision_requested" } });
});

app.get("/api/client/content/:id/comments", requireAuth, async (c) => {
  const assetId = c.req.param("id");
  const tenantId = await getClientTenantId(c);
  if (!tenantId) {
    return c.json({ success: false, error: "No account found." }, 400);
  }

  const supabase = getAdminClient();
  const { data } = await supabase
    .from("asset_comments")
    .select("*")
    .eq("asset_id", assetId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  return c.json({ success: true, data: data ?? [] });
});

app.post("/api/client/content/:id/comments", requireAuth, async (c) => {
  const assetId = c.req.param("id");
  const tenantId = await getClientTenantId(c);
  if (!tenantId) {
    return c.json({ success: false, error: "No account found." }, 400);
  }

  const body = await validate(c, schemas.comment);
  const session = c.get("session");
  const supabase = getAdminClient();
  const now = new Date().toISOString();
  const id = `comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const { error } = await supabase.from("asset_comments").insert({
    id,
    asset_id: assetId,
    tenant_id: tenantId,
    author_id: session.sub,
    author_role: "client",
    body: body.body,
    created_at: now,
  });
  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
  return c.json({
    success: true,
    data: { id, assetId, tenantId, authorRole: "client", body: body.body, createdAt: now },
  }, 201);
});

// ── Admin view of the approval thread ───────────────────────────────

app.get("/api/admin/content/:id/comments", requireAuth, requireAdmin, async (c) => {
  const assetId = c.req.param("id");
  const session = c.get("session");
  const supabase = getAdminClient();

  const { data: asset } = await supabase
    .from("content_assets")
    .select("tenant_id")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) {
    return c.json({ success: false, error: "Content not found." }, 404);
  }

  const ownerId = await resolveAgencyOwnerId(session.sub);
  const { data: tenant } = await supabase
    .from("tenants")
    .select("agency_id")
    .eq("id", asset.tenant_id)
    .maybeSingle();
  if (!tenant || tenant.agency_id !== ownerId) {
    return c.json({ success: false, error: "Access denied." }, 403);
  }

  const { data } = await supabase
    .from("asset_comments")
    .select("*")
    .eq("asset_id", assetId)
    .order("created_at", { ascending: true });
  return c.json({ success: true, data: data ?? [] });
});

app.post("/api/admin/content/:id/comments", requireAuth, requireAdmin, async (c) => {
  const assetId = c.req.param("id");
  const body = await validate(c, schemas.comment);
  const session = c.get("session");
  const supabase = getAdminClient();

  const { data: asset } = await supabase
    .from("content_assets")
    .select("tenant_id")
    .eq("id", assetId)
    .maybeSingle();
  if (!asset) {
    return c.json({ success: false, error: "Content not found." }, 404);
  }

  const ownerId = await resolveAgencyOwnerId(session.sub);
  const { data: tenant } = await supabase
    .from("tenants")
    .select("agency_id")
    .eq("id", asset.tenant_id)
    .maybeSingle();
  if (!tenant || tenant.agency_id !== ownerId) {
    return c.json({ success: false, error: "Access denied." }, 403);
  }

  const now = new Date().toISOString();
  const id = `comment_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const { error } = await supabase.from("asset_comments").insert({
    id,
    asset_id: assetId,
    tenant_id: asset.tenant_id,
    author_id: session.sub,
    author_role: "admin",
    body: body.body,
    created_at: now,
  });
  if (error) {
    return c.json({ success: false, error: error.message }, 500);
  }
  return c.json({
    success: true,
    data: { id, assetId, tenantId: asset.tenant_id, authorRole: "admin", body: body.body, createdAt: now },
  }, 201);
});

// ── Export ───────────────────────────────────────────────────────────

export default app;
export { app as saasRouter };

/**
 * Initialize ALL in-memory stores from Supabase on cold start.
 * Vercel serverless functions lose all in-memory state on cold start.
 * This restores sessions, onboarding states, tenants, and content so the
 * dashboard and calendar have data on the very first request.
 */
export async function initUserStore(): Promise<void> {
  const supabase = getAdminClient();
  try {
    // Load all users and create sessions keyed by both ID and email
    // (Supabase Auth UUIDs differ from old custom IDs; email is the bridge)
    const { data: users } = await supabase.from("users").select("id, email, name");
    if (users) {
      for (const u of users) {
        const name = (u.name as string) ?? (u.email as string)?.split("@")[0] ?? "User";
        const email = u.email as string;
        const id = u.id as string;
        // Store by both ID and email so lookups work regardless of auth provider
        authService.ensureSession(id, email, name);
        authService.ensureSession(email, email, name);
      }
      console.log(`[initUserStore] Restored ${users.length} user sessions`);
    }

    // Load tenants and link to users (needed for analytics/dashboard APIs)
    const { data: tenants } = await supabase.from("tenants").select("*");
    if (tenants) {
      for (const t of tenants) {
        if (t.owner_id) {
          authService.linkTenant(t.owner_id, t.id);
        }
      }
      console.log(`[initUserStore] Restored ${tenants.length} tenant links`);
    }

    // Load completed onboarding records and restore state
    const { data: onboardings } = await supabase
      .from("onboarding")
      .select("*")
      .eq("step", "done");
    if (onboardings) {
      for (const o of onboardings) {
        const session = authService.getSession(o.user_id);
        if (!session) continue;
        // Restore onboarding state as done
        const state = authService.getOnboardingState(o.user_id);
        if (state) {
          state.step = "done";
          state.selectedNiche = o.selected_niche ?? null;
          state.packSlug = o.pack_slug ?? null;
          state.businessDescription = o.business_description ?? null;
          state.websiteUrl = o.website_url ?? null;
          state.websiteAnalysis = o.website_analysis ?? null;
        }
      }
      console.log(`[initUserStore] Restored ${onboardings.length} onboarding states`);
    }

    // Restore tenant objects into TenantService (needed for getDashboard).
    // Seed directly from Supabase JS client data (already loaded above),
    // so we don't depend on the REST adapter which may fail on Vercel.
    if (tenants) {
      const { tenantService } = await import("../services/tenant-service");
      for (const t of tenants) {
        tenantService.seedTenant({
          id: t.id as string,
          name: (t.name as string) ?? "Unknown",
          ownerId: (t.owner_id as string) ?? null,
          createdAt: (t.created_at as string) ?? new Date().toISOString(),
        });
      }
    }

  } catch (err: any) {
    console.error("[initUserStore] Failed to load from Supabase:", err.message);
  }
}
